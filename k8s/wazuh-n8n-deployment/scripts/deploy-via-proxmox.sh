#!/bin/bash
set -euo pipefail

# Deploy Wazuh + n8n + MCP via Proxmox API
# Uses qemu-agent-exec to run commands on VMs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment
source /Users/ryandahlberg/Projects/cortex/.env

# Extract token components
TOKEN_ID=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f1)
TOKEN_SECRET=$(echo "$PROXMOX_TOKEN" | cut -d'=' -f2)

PROXMOX_API="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"

echo "=========================================="
echo "Wazuh + n8n + MCP Deployment via Proxmox"
echo "=========================================="
echo "Proxmox: $PROXMOX_HOST"
echo "K3s Master: $K3S_MASTER_IP (VM $K3S_MASTER_VMID)"
echo ""

# Function to execute command on VM
pve_exec() {
    local vmid=$1
    local cmd=$2

    echo "[VM $vmid] Running: ${cmd:0:80}..."

    # Encode command in base64
    local encoded_cmd=$(echo -n "$cmd" | base64)

    # Execute via qemu-agent
    local response=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
        -H "Content-Type: application/json" \
        -X POST \
        "${PROXMOX_API}/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec" \
        -d "{\"command\":[\"bash\",\"-c\",\"echo '$encoded_cmd' | base64 -d | bash\"]}")

    local pid=$(echo "$response" | jq -r '.data.pid // empty')

    if [ -z "$pid" ]; then
        echo "Error: Failed to execute command"
        echo "Response: $response"
        return 1
    fi

    # Wait for completion
    sleep 5

    # Get output
    local output=$(curl -k -s \
        -H "Authorization: PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}" \
        "${PROXMOX_API}/nodes/${PROXMOX_NODE}/qemu/${vmid}/agent/exec-status?pid=${pid}")

    echo "$output" | jq -r '.data["out-data"] // empty' | base64 -d 2>/dev/null || echo "(no output)"
}

# Step 1: Build images on master
echo "Step 1: Building Docker images..."

BUILD_CMD='
cd /tmp
rm -rf wazuh-mcp-server n8n-mcp-server

# Build wazuh-mcp-server
git clone https://github.com/ry-ops/wazuh-mcp-server.git
cd wazuh-mcp-server
docker build -t wazuh-mcp-server:latest . 2>&1 | tail -5
cd /tmp

# Build n8n-mcp-server
git clone https://github.com/ry-ops/n8n-mcp-server.git
cd n8n-mcp-server
docker build -t n8n-mcp-server:latest . 2>&1 | tail -5

# Save and load to containerd
cd /tmp
docker save wazuh-mcp-server:latest -o wazuh-mcp.tar
docker save n8n-mcp-server:latest -o n8n-mcp.tar
ctr -n k8s.io image import wazuh-mcp.tar
ctr -n k8s.io image import n8n-mcp.tar

echo "Images built and loaded successfully"
'

pve_exec "$K3S_MASTER_VMID" "$BUILD_CMD"

echo ""
echo "Step 2: Deploying manifests..."

# Create deployment script on master
DEPLOY_SCRIPT=$(cat <<'EOFSCRIPT'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Deploy Wazuh namespace
kubectl create namespace wazuh --dry-run=client -o yaml | kubectl apply -f -

# Deploy Wazuh secrets
kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Secret
metadata:
  name: wazuh-credentials
  namespace: wazuh
type: Opaque
stringData:
  wazuh-api-user: "wazuh-api"
  wazuh-api-password: "MyS3cr3tP@ssw0rd!"
  indexer-admin-user: "admin"
  indexer-admin-password: "SecureP@ssw0rd123"
  dashboard-user: "kibanaserver"
  dashboard-password: "KibanaP@ss2024"
EOFYAML

echo "Wazuh namespace and secrets created"

# Deploy n8n namespace
kubectl create namespace n8n --dry-run=client -o yaml | kubectl apply -f -

# Deploy n8n secrets
kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Secret
metadata:
  name: n8n-credentials
  namespace: n8n
type: Opaque
stringData:
  postgres-user: "n8n"
  postgres-password: "n8nP@ssw0rd2024!"
  postgres-db: "n8n"
  n8n-encryption-key: "g8KAcPnZm9XjYfR3QwE5tVbN7uHsLdMp"
EOFYAML

echo "n8n namespace and secrets created"

# Deploy MCP namespace
kubectl create namespace mcp --dry-run=client -o yaml | kubectl apply -f -

echo "All namespaces created"

# Show status
kubectl get namespaces | grep -E 'wazuh|n8n|mcp'
EOFSCRIPT
)

pve_exec "$K3S_MASTER_VMID" "$DEPLOY_SCRIPT"

echo ""
echo "Step 3: Deploying Wazuh Indexer..."

INDEXER_DEPLOY=$(cat <<'EOFINDEXER'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Service
metadata:
  name: wazuh-indexer
  namespace: wazuh
spec:
  type: ClusterIP
  clusterIP: None
  ports:
  - name: http
    port: 9200
  - name: transport
    port: 9300
  selector:
    app: wazuh-indexer
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: wazuh-indexer
  namespace: wazuh
spec:
  serviceName: wazuh-indexer
  replicas: 1
  selector:
    matchLabels:
      app: wazuh-indexer
  template:
    metadata:
      labels:
        app: wazuh-indexer
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker1
      initContainers:
      - name: sysctl
        image: busybox:1.36
        command: ["sh", "-c", "sysctl -w vm.max_map_count=262144"]
        securityContext:
          privileged: true
      containers:
      - name: indexer
        image: wazuh/wazuh-indexer:4.7.1
        env:
        - name: OPENSEARCH_JAVA_OPTS
          value: "-Xms2g -Xmx2g"
        - name: discovery.type
          value: "single-node"
        - name: DISABLE_SECURITY_PLUGIN
          value: "true"
        ports:
        - containerPort: 9200
        - containerPort: 9300
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "1000m"
        volumeMounts:
        - name: data
          mountPath: /var/lib/wazuh-indexer
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 50Gi
EOFYAML

echo "Wazuh Indexer deployed"
kubectl get pods -n wazuh
EOFINDEXER
)

pve_exec "$K3S_MASTER_VMID" "$INDEXER_DEPLOY"

echo ""
echo "Step 4: Deploying Wazuh Manager..."

MANAGER_DEPLOY=$(cat <<'EOFMANAGER'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Service
metadata:
  name: wazuh-manager
  namespace: wazuh
spec:
  type: NodePort
  ports:
  - name: agents
    port: 1514
    targetPort: 1514
    nodePort: 31514
  - name: registration
    port: 1515
    targetPort: 1515
    nodePort: 31515
  - name: api
    port: 55000
    targetPort: 55000
  selector:
    app: wazuh-manager
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wazuh-manager
  namespace: wazuh
spec:
  replicas: 1
  selector:
    matchLabels:
      app: wazuh-manager
  template:
    metadata:
      labels:
        app: wazuh-manager
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker1
      containers:
      - name: manager
        image: wazuh/wazuh-manager:4.7.1
        env:
        - name: INDEXER_URL
          value: "http://wazuh-indexer:9200"
        - name: FILEBEAT_SSL_VERIFICATION_MODE
          value: "none"
        ports:
        - containerPort: 1514
        - containerPort: 1515
        - containerPort: 55000
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
EOFYAML

echo "Wazuh Manager deployed"
kubectl get pods -n wazuh
EOFMANAGER
)

pve_exec "$K3S_MASTER_VMID" "$MANAGER_DEPLOY"

echo ""
echo "Step 5: Deploying n8n PostgreSQL..."

POSTGRES_DEPLOY=$(cat <<'EOFPOSTGRES'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Service
metadata:
  name: n8n-postgres
  namespace: n8n
spec:
  clusterIP: None
  ports:
  - port: 5432
  selector:
    app: n8n-postgres
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: n8n-postgres
  namespace: n8n
spec:
  serviceName: n8n-postgres
  replicas: 1
  selector:
    matchLabels:
      app: n8n-postgres
  template:
    metadata:
      labels:
        app: n8n-postgres
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker2
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-password
        - name: POSTGRES_DB
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-db
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 5Gi
EOFYAML

echo "n8n PostgreSQL deployed"
kubectl get pods -n n8n
EOFPOSTGRES
)

pve_exec "$K3S_MASTER_VMID" "$POSTGRES_DEPLOY"

echo ""
echo "Step 6: Deploying n8n application..."

N8N_DEPLOY=$(cat <<'EOFN8N'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Wait for PostgreSQL
sleep 30

kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Service
metadata:
  name: n8n
  namespace: n8n
spec:
  type: ClusterIP
  ports:
  - port: 5678
  selector:
    app: n8n
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n
  namespace: n8n
spec:
  replicas: 1
  selector:
    matchLabels:
      app: n8n
  template:
    metadata:
      labels:
        app: n8n
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker2
      containers:
      - name: n8n
        image: n8nio/n8n:latest
        env:
        - name: DB_TYPE
          value: "postgresdb"
        - name: DB_POSTGRESDB_HOST
          value: "n8n-postgres"
        - name: DB_POSTGRESDB_USER
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-user
        - name: DB_POSTGRESDB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-password
        - name: DB_POSTGRESDB_DATABASE
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: postgres-db
        - name: N8N_ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: n8n-credentials
              key: n8n-encryption-key
        - name: GENERIC_TIMEZONE
          value: "America/Chicago"
        - name: WEBHOOK_URL
          value: "http://n8n.n8n.svc.cluster.local:5678/"
        ports:
        - containerPort: 5678
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
EOFYAML

echo "n8n deployed"
kubectl get pods -n n8n
EOFN8N
)

pve_exec "$K3S_MASTER_VMID" "$N8N_DEPLOY"

echo ""
echo "Step 7: Deploying MCP servers..."

MCP_DEPLOY=$(cat <<'EOFMCP'
#!/bin/bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Deploy Wazuh MCP
kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: ConfigMap
metadata:
  name: wazuh-mcp-config
  namespace: mcp
data:
  WAZUH_API_URL: "http://wazuh-manager.wazuh.svc.cluster.local:55000"
  PORT: "3000"
---
apiVersion: v1
kind: Secret
metadata:
  name: wazuh-mcp-credentials
  namespace: mcp
stringData:
  WAZUH_API_USER: "wazuh-api"
  WAZUH_API_PASSWORD: "MyS3cr3tP@ssw0rd!"
---
apiVersion: v1
kind: Service
metadata:
  name: wazuh-mcp-server
  namespace: mcp
spec:
  ports:
  - port: 3000
  selector:
    app: wazuh-mcp-server
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wazuh-mcp-server
  namespace: mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: wazuh-mcp-server
  template:
    metadata:
      labels:
        app: wazuh-mcp-server
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker2
      containers:
      - name: wazuh-mcp
        image: wazuh-mcp-server:latest
        imagePullPolicy: Never
        envFrom:
        - configMapRef:
            name: wazuh-mcp-config
        - secretRef:
            name: wazuh-mcp-credentials
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
EOFYAML

# Deploy n8n MCP
kubectl apply -f - <<EOFYAML
apiVersion: v1
kind: Service
metadata:
  name: n8n-mcp-server
  namespace: mcp
spec:
  ports:
  - port: 3001
  selector:
    app: n8n-mcp-server
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n-mcp-server
  namespace: mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: n8n-mcp-server
  template:
    metadata:
      labels:
        app: n8n-mcp-server
    spec:
      nodeSelector:
        kubernetes.io/hostname: k3s-worker2
      containers:
      - name: n8n-mcp
        image: n8n-mcp-server:latest
        imagePullPolicy: Never
        env:
        - name: N8N_API_URL
          value: "http://n8n.n8n.svc.cluster.local:5678"
        - name: PORT
          value: "3001"
        ports:
        - containerPort: 3001
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
EOFYAML

echo "MCP servers deployed"
kubectl get pods -n mcp
EOFMCP
)

pve_exec "$K3S_MASTER_VMID" "$MCP_DEPLOY"

echo ""
echo "Step 8: Final status check..."

STATUS_CMD='
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "=== All Pods ==="
kubectl get pods --all-namespaces | grep -E "NAMESPACE|wazuh|n8n|mcp"

echo ""
echo "=== Services ==="
kubectl get svc -n wazuh
kubectl get svc -n n8n
kubectl get svc -n mcp
'

pve_exec "$K3S_MASTER_VMID" "$STATUS_CMD"

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Access:"
echo "  Wazuh Manager: http://${K3S_WORKER1_IP}:55000"
echo "  Wazuh Agents: ${K3S_WORKER1_IP}:31514"
echo ""
echo "Port-forward for ClusterIP services:"
echo "  kubectl port-forward -n n8n svc/n8n 5678:5678"
echo "  kubectl port-forward -n mcp svc/wazuh-mcp-server 3000:3000"
echo ""
