#!/usr/bin/env bash
set -euo pipefail

# Cortex Monitoring Stack - Kubernetes Deployment Script
# Deploys Prometheus, Grafana, and AlertManager with cortex-specific configuration

NAMESPACE="${CORTEX_NAMESPACE:-cortex}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_warn "jq not found. Install jq for better output formatting."
    fi

    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    fi

    # Check if Prometheus Operator is installed
    if ! kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
        log_warn "Prometheus Operator CRDs not found. ServiceMonitors and PodMonitors may not work."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Create ConfigMaps
create_configmaps() {
    log_info "Creating ConfigMaps..."

    # Prometheus configuration
    kubectl create configmap prometheus-config \
        --from-file="${SCRIPT_DIR}/prometheus/prometheus-config.yaml" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Prometheus rules
    kubectl create configmap prometheus-rules \
        --from-file="${SCRIPT_DIR}/prometheus/alerting-rules.yaml" \
        --from-file="${SCRIPT_DIR}/prometheus/recording-rules.yaml" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # AlertManager configuration
    kubectl create configmap alertmanager-config \
        --from-file="${SCRIPT_DIR}/alertmanager-config.yaml" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Grafana datasources
    kubectl create configmap grafana-datasources \
        --from-file="${SCRIPT_DIR}/grafana/datasources.yaml" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Grafana dashboard provider
    kubectl create configmap grafana-dashboard-provider \
        --from-file="${SCRIPT_DIR}/grafana/dashboard-provider.yaml" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Grafana dashboards
    kubectl create configmap grafana-dashboards \
        --from-file="${SCRIPT_DIR}/grafana/dashboards/" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -

    log_info "ConfigMaps created successfully"
}

# Deploy ServiceMonitors and PodMonitors
deploy_monitors() {
    log_info "Deploying ServiceMonitors and PodMonitors..."

    kubectl apply -f "${SCRIPT_DIR}/servicemonitor.yaml" -n "$NAMESPACE"
    kubectl apply -f "${SCRIPT_DIR}/podmonitor.yaml" -n "$NAMESPACE"

    log_info "Monitors deployed successfully"
}

# Deploy Prometheus
deploy_prometheus() {
    log_info "Deploying Prometheus..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: ${NAMESPACE}
  labels:
    app: prometheus
spec:
  type: ClusterIP
  ports:
    - port: 9090
      targetPort: 9090
      name: web
  selector:
    app: prometheus
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: prometheus
  namespace: ${NAMESPACE}
spec:
  serviceName: prometheus
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
        - name: prometheus
          image: prom/prometheus:v2.48.0
          args:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus'
            - '--storage.tsdb.retention.time=15d'
            - '--web.enable-lifecycle'
            - '--web.enable-admin-api'
          ports:
            - containerPort: 9090
              name: web
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
              readOnly: true
            - name: rules
              mountPath: /etc/prometheus/rules
              readOnly: true
            - name: storage
              mountPath: /prometheus
          resources:
            requests:
              cpu: 500m
              memory: 2Gi
            limits:
              cpu: 2000m
              memory: 4Gi
      volumes:
        - name: config
          configMap:
            name: prometheus-config
        - name: rules
          configMap:
            name: prometheus-rules
  volumeClaimTemplates:
    - metadata:
        name: storage
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 50Gi
EOF

    log_info "Prometheus deployed successfully"
}

# Deploy AlertManager
deploy_alertmanager() {
    log_info "Deploying AlertManager..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: ${NAMESPACE}
  labels:
    app: alertmanager
spec:
  type: ClusterIP
  ports:
    - port: 9093
      targetPort: 9093
      name: web
  selector:
    app: alertmanager
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
  namespace: ${NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
        - name: alertmanager
          image: prom/alertmanager:v0.26.0
          args:
            - '--config.file=/etc/alertmanager/config.yml'
            - '--storage.path=/alertmanager'
          ports:
            - containerPort: 9093
              name: web
          volumeMounts:
            - name: config
              mountPath: /etc/alertmanager
              readOnly: true
            - name: storage
              mountPath: /alertmanager
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
      volumes:
        - name: config
          configMap:
            name: alertmanager-config
        - name: storage
          emptyDir: {}
EOF

    log_info "AlertManager deployed successfully"
}

# Deploy Grafana
deploy_grafana() {
    log_info "Deploying Grafana..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: ${NAMESPACE}
  labels:
    app: grafana
spec:
  type: LoadBalancer
  ports:
    - port: 3000
      targetPort: 3000
      name: web
  selector:
    app: grafana
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: ${NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
        - name: grafana
          image: grafana/grafana:10.2.2
          env:
            - name: GF_SECURITY_ADMIN_USER
              value: "admin"
            - name: GF_SECURITY_ADMIN_PASSWORD
              value: "admin"
            - name: GF_USERS_ALLOW_SIGN_UP
              value: "false"
          ports:
            - containerPort: 3000
              name: web
          volumeMounts:
            - name: datasources
              mountPath: /etc/grafana/provisioning/datasources
              readOnly: true
            - name: dashboard-provider
              mountPath: /etc/grafana/provisioning/dashboards
              readOnly: true
            - name: dashboards
              mountPath: /var/lib/grafana/dashboards
              readOnly: true
            - name: storage
              mountPath: /var/lib/grafana
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 500m
              memory: 1Gi
      volumes:
        - name: datasources
          configMap:
            name: grafana-datasources
        - name: dashboard-provider
          configMap:
            name: grafana-dashboard-provider
        - name: dashboards
          configMap:
            name: grafana-dashboards
        - name: storage
          emptyDir: {}
EOF

    log_info "Grafana deployed successfully"
}

# Create ServiceAccount and RBAC
create_rbac() {
    log_info "Creating RBAC resources..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: ${NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/proxy
      - services
      - endpoints
      - pods
    verbs: ["get", "list", "watch"]
  - apiGroups: ["extensions"]
    resources:
      - ingresses
    verbs: ["get", "list", "watch"]
  - nonResourceURLs: ["/metrics"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
  - kind: ServiceAccount
    name: prometheus
    namespace: ${NAMESPACE}
EOF

    log_info "RBAC resources created successfully"
}

# Wait for deployments
wait_for_deployments() {
    log_info "Waiting for deployments to be ready..."

    kubectl wait --for=condition=ready pod -l app=prometheus -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=ready pod -l app=alertmanager -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=ready pod -l app=grafana -n "$NAMESPACE" --timeout=300s

    log_info "All deployments are ready"
}

# Display access information
display_info() {
    log_info "Deployment complete!"
    echo ""
    echo "Access information:"
    echo "  Prometheus: kubectl port-forward -n $NAMESPACE svc/prometheus 9090:9090"
    echo "             Then visit: http://localhost:9090"
    echo ""
    echo "  AlertManager: kubectl port-forward -n $NAMESPACE svc/alertmanager 9093:9093"
    echo "                Then visit: http://localhost:9093"
    echo ""
    echo "  Grafana: kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000"
    echo "           Then visit: http://localhost:3000 (admin/admin)"
    echo ""

    # Check if LoadBalancer IP is available
    GRAFANA_IP=$(kubectl get svc grafana -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
    if [ -n "$GRAFANA_IP" ]; then
        echo "  Grafana LoadBalancer IP: http://$GRAFANA_IP:3000"
        echo ""
    fi
}

# Main deployment
main() {
    log_info "Starting cortex monitoring stack deployment..."

    check_prerequisites
    create_rbac
    create_configmaps
    deploy_monitors
    deploy_prometheus
    deploy_alertmanager
    deploy_grafana
    wait_for_deployments
    display_info
}

main "$@"
