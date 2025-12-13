# 🚀 DEPLOY CORTEX TO K3S - QUICK START

**3 commands to get Cortex running autonomously in your K3s cluster**

## Option 1: Deploy from K3s Master (RECOMMENDED)

### Step 1: Copy files to K3s master
```bash
# From your local machine
cd /Users/ryandahlberg/Projects/cortex

# Copy entire project to K3s master
rsync -avz --exclude='.git' --exclude='node_modules' \
    . cortex@10.88.145.180:~/cortex/
```

### Step 2: SSH to K3s master and set credentials
```bash
ssh cortex@10.88.145.180

# Set your API keys
export ANTHROPIC_API_KEY="sk-ant-..."  # Your Claude API key
export GITHUB_TOKEN="ghp_..."          # Your GitHub PAT
```

### Step 3: Run deployment
```bash
cd ~/cortex
./scripts/deploy-cortex-on-k3s-master.sh
```

**That's it!** Script will:
- ✅ Configure NFS on CT 105
- ✅ Create cortex-system namespace
- ✅ Deploy all 4 masters
- ✅ Deploy Wazuh agents
- ✅ Deploy dashboard
- ✅ Show you the dashboard URL

**Estimated time:** 3-5 minutes

---

## Option 2: Manual Deployment (If rsync not available)

### Step 1: SCP the manifests
```bash
# From local machine
scp -r k8s/cortex-k3s cortex@10.88.145.180:~/
```

### Step 2: SSH and deploy manually
```bash
ssh cortex@10.88.145.180

export ANTHROPIC_API_KEY="your-key"
export GITHUB_TOKEN="your-token"
export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"

cd ~/cortex-k3s

# Apply manifests in order
sudo kubectl apply -f 00-namespace.yaml

# Create secrets
sudo kubectl create secret generic cortex-credentials \
    --namespace=cortex-system \
    --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY" \
    --from-literal=github-token="$GITHUB_TOKEN" \
    --from-literal=github-user="ry-ops" \
    --from-literal=wazuh-url="https://10.88.140.202:55000" \
    --from-literal=wazuh-user="admin" \
    --from-literal=wazuh-password='*B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay' \
    --from-literal=proxmox-host="10.88.140.164" \
    --from-literal=proxmox-token='root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7' \
    --dry-run=client -o yaml | sudo kubectl apply -f -

# Deploy storage and masters
sudo kubectl apply -f 02-storage.yaml
sudo kubectl apply -f 03-coordinator-master.yaml
sudo kubectl apply -f 04-security-master.yaml
sudo kubectl apply -f 05-development-master.yaml
sudo kubectl apply -f 06-cicd-master.yaml
sudo kubectl apply -f 07-wazuh-integration.yaml
sudo kubectl apply -f 09-dashboard-ingress.yaml

# Wait for pods
sudo kubectl get pods -n cortex-system -w
```

---

## Option 3: From Local Machine (Requires VPN/Routing to VLAN 145)

If you have network access to VLAN 145:

```bash
# Get kubeconfig
scp cortex@10.88.145.180:/etc/rancher/k3s/k3s.yaml ~/.kube/cortex-k3s-config
sed -i '' 's/127.0.0.1/10.88.145.180/g' ~/.kube/cortex-k3s-config

export KUBECONFIG=~/.kube/cortex-k3s-config
export ANTHROPIC_API_KEY="your-key"
export GITHUB_TOKEN="your-token"

# Run deployment
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-to-k3s.sh
```

---

## After Deployment

### Verify Everything is Running
```bash
# On K3s master
sudo kubectl get pods -n cortex-system

# Should see:
# - coordinator-master-xxx
# - security-master-xxx
# - development-master-xxx
# - cicd-master-xxx
# - wazuh-agent-xxx (3 pods, one per node)
# - cortex-dashboard-xxx
```

### Access Dashboard
```bash
# Get dashboard URL
sudo kubectl get svc cortex-dashboard -n cortex-system

# Open in browser:
# http://<EXTERNAL-IP>  (if LoadBalancer)
# OR
# http://10.88.145.180:<NODE-PORT>  (if NodePort)
```

### Check Wazuh Integration
```bash
# Wazuh agents should appear in Wazuh dashboard
# Go to: https://10.88.140.202
# Login: admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
# Navigate to: Agents
# Should see 3 agents (one per K3s node)
```

### Test Autonomous Loop
```bash
# Submit a test task via API
DASHBOARD_IP=$(sudo kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

curl -X POST http://$DASHBOARD_IP/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "security_scan",
    "repository": "ry-ops/cortex",
    "priority": "high"
  }'

# Watch worker spawn
sudo kubectl get jobs -n cortex-system -w
```

---

## Troubleshooting

### NFS PVC stuck in Pending
```bash
# Check NFS server (CT 105)
ssh root@10.88.140.164 "pct exec 105 -- systemctl status nfs-server"

# Check mount from K3s node
showmount -e 10.88.140.164
```

### Pods not starting
```bash
# Check events
sudo kubectl get events -n cortex-system --sort-by='.lastTimestamp'

# Check specific pod
sudo kubectl describe pod -n cortex-system <pod-name>
```

### Wazuh agents not connecting
```bash
# Check agent logs
sudo kubectl logs -n cortex-system daemonset/wazuh-agent

# Verify connectivity to Wazuh manager
sudo kubectl exec -n cortex-system <wazuh-agent-pod> -- curl -k https://10.88.140.202:55000
```

---

## Quick Reference

| What | Where | How |
|------|-------|-----|
| **Dashboard** | K3s LoadBalancer | `kubectl get svc cortex-dashboard -n cortex-system` |
| **Wazuh** | https://10.88.140.202 | admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay |
| **Logs** | K8s pods | `kubectl logs -n cortex-system deployment/coordinator-master -f` |
| **Status** | K8s | `kubectl get all -n cortex-system` |
| **Workers** | K8s Jobs | `kubectl get jobs -n cortex-system` |

---

**Ready to deploy? Pick Option 1 above and let's go!** 🚀
