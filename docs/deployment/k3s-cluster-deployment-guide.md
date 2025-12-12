# Cortex K3s Cluster Deployment Guide

## Overview

This guide covers the complete automated deployment of a production-ready K3s Kubernetes cluster on Proxmox for the Cortex autoscaling platform.

## Architecture

### Infrastructure Components

- **Proxmox Host**: 10.88.140.151
- **Network**: 10.88.140.144/27 subnet
- **VMs**: 3 nodes (1 control plane, 2 workers)
- **Container Runtime**: containerd (via K3s)
- **CNI**: Flannel (VXLAN)
- **Load Balancer**: MetalLB (Layer 2)
- **Storage**: local-path-provisioner

### VM Specifications

| VM ID | Hostname | IP | CPU | RAM | Disk | Role |
|-------|----------|-----|-----|-----|------|------|
| 110 | cortex-k3s-control | 10.88.140.152 | 4 | 8GB | 40GB | Control Plane |
| 111 | cortex-k3s-worker-01 | 10.88.140.153 | 4 | 8GB | 40GB | Worker |
| 112 | cortex-k3s-worker-02 | 10.88.140.154 | 4 | 8GB | 40GB | Worker |

### Network Configuration

- **Gateway**: 10.88.140.144
- **Pod CIDR**: 10.42.0.0/16
- **Service CIDR**: 10.43.0.0/16
- **LoadBalancer Range**: 10.88.140.155-10.88.140.158
- **DNS**: 8.8.8.8, 1.1.1.1

## Prerequisites

### Local Machine

1. **Required Tools**:
   ```bash
   # macOS
   brew install curl jq netcat

   # Linux
   apt-get install curl jq netcat-openbsd
   ```

2. **SSH Keys**: Ensure you have SSH keys in `~/.ssh/`
   ```bash
   # Generate if needed
   ssh-keygen -t ed25519 -C "cortex-deployment"
   ```

3. **Network Access**: Ensure connectivity to Proxmox host
   ```bash
   ping 10.88.140.151
   ```

### Proxmox Setup

1. **Ubuntu Cloud Image**: Download to Proxmox
   ```bash
   ssh root@10.88.140.151
   cd /var/lib/vz/template/iso
   wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
   ```

2. **API Token**: Already configured
   - Token ID: `root@pam!n8n`
   - Token Secret: `b8cc165f-0153-43bb-a48a-5d7459587ca7`

## Deployment Options

### Option 1: One-Command Deployment (Recommended)

Complete automated deployment from start to finish:

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy/bootstrap-k3s-cluster.sh
```

This script will:
1. Validate prerequisites
2. Create 3 VMs on Proxmox
3. Wait for cloud-init completion
4. Install K3s control plane
5. Join worker nodes
6. Verify cluster health
7. Configure storage
8. Install MetalLB
9. Generate access credentials

**Duration**: ~15-20 minutes

### Option 2: Step-by-Step Deployment

For manual control or troubleshooting:

#### Step 1: Validate Network Configuration
```bash
./scripts/proxmox/configure-network.sh
```

#### Step 2: Create VMs
```bash
# Control Plane
./scripts/proxmox/create-vm.sh 110 cortex-k3s-control \
  10.88.140.152 255.255.255.224 10.88.140.144 4 8192 40G

# Worker 01
./scripts/proxmox/create-vm.sh 111 cortex-k3s-worker-01 \
  10.88.140.153 255.255.255.224 10.88.140.144 4 8192 40G

# Worker 02
./scripts/proxmox/create-vm.sh 112 cortex-k3s-worker-02 \
  10.88.140.154 255.255.255.224 10.88.140.144 4 8192 40G
```

#### Step 3: Install K3s Control Plane
```bash
# SSH to control plane
ssh cortex@10.88.140.152

# Copy and run installation script
# (Script should be copied from local machine)
sudo bash install-control-plane.sh
```

#### Step 4: Join Workers
```bash
# Get K3s token from control plane
K3S_TOKEN=$(ssh cortex@10.88.140.152 "sudo cat /tmp/k3s-token.txt")

# Join Worker 01
ssh cortex@10.88.140.153
K3S_TOKEN="$K3S_TOKEN" \
CONTROL_PLANE_IP="10.88.140.152" \
WORKER_NAME="cortex-k3s-worker-01" \
sudo -E bash join-worker.sh

# Join Worker 02
ssh cortex@10.88.140.154
K3S_TOKEN="$K3S_TOKEN" \
CONTROL_PLANE_IP="10.88.140.152" \
WORKER_NAME="cortex-k3s-worker-02" \
sudo -E bash join-worker.sh
```

#### Step 5: Verify Cluster
```bash
ssh cortex@10.88.140.152
sudo bash verify-cluster.sh
```

#### Step 6: Configure Storage
```bash
ssh cortex@10.88.140.152
sudo bash setup-storage.sh
```

#### Step 7: Install MetalLB
```bash
ssh cortex@10.88.140.152
sudo bash setup-metallb.sh
```

## Post-Deployment Verification

### 1. Get Kubeconfig

```bash
# Download kubeconfig from control plane
scp cortex@10.88.140.152:/tmp/k3s-kubeconfig.yaml ~/.kube/cortex-k3s-config

# Set environment variable
export KUBECONFIG=~/.kube/cortex-k3s-config
```

### 2. Verify Nodes

```bash
kubectl get nodes -o wide

# Expected output:
# NAME                   STATUS   ROLES                  AGE   VERSION
# cortex-k3s-control     Ready    control-plane,master   10m   v1.28.x
# cortex-k3s-worker-01   Ready    <none>                 5m    v1.28.x
# cortex-k3s-worker-02   Ready    <none>                 5m    v1.28.x
```

### 3. Check System Pods

```bash
kubectl get pods -n kube-system

# All pods should be Running
```

### 4. Test Storage

```bash
# Create test PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 1Gi
EOF

# Check status
kubectl get pvc test-pvc
# Should show "Bound"

# Cleanup
kubectl delete pvc test-pvc
```

### 5. Test LoadBalancer

```bash
# Create test service
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --type=LoadBalancer --port=80

# Wait for external IP
kubectl get svc nginx
# EXTERNAL-IP should be in range 10.88.140.155-158

# Test connectivity
EXTERNAL_IP=$(kubectl get svc nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl http://$EXTERNAL_IP

# Cleanup
kubectl delete svc nginx
kubectl delete deployment nginx
```

## Cluster Management

### Access Control Plane

```bash
ssh cortex@10.88.140.152
```

### View Logs

```bash
# K3s service logs
ssh cortex@10.88.140.152
sudo journalctl -u k3s -f

# Worker agent logs
ssh cortex@10.88.140.153
sudo journalctl -u k3s-agent -f
```

### Health Checks

```bash
# From control plane
ssh cortex@10.88.140.152
sudo /usr/local/bin/k3s-health-check.sh

# From workers
ssh cortex@10.88.140.153
sudo /usr/local/bin/k3s-worker-health-check.sh
```

### Restart Services

```bash
# Restart K3s on control plane
ssh cortex@10.88.140.152
sudo systemctl restart k3s

# Restart agent on workers
ssh cortex@10.88.140.153
sudo systemctl restart k3s-agent
```

## Troubleshooting

### VMs Not Starting

1. Check Proxmox console:
   ```bash
   ssh root@10.88.140.151
   qm list
   qm status <vmid>
   ```

2. View VM console via Proxmox web UI

3. Check cloud-init logs:
   ```bash
   ssh cortex@<vm-ip>
   cat /var/log/cloud-init.log
   ```

### Workers Not Joining

1. Verify K3s token:
   ```bash
   ssh cortex@10.88.140.152
   sudo cat /var/lib/rancher/k3s/server/node-token
   ```

2. Check connectivity:
   ```bash
   ssh cortex@10.88.140.153
   nc -zv 10.88.140.152 6443
   ```

3. Check worker logs:
   ```bash
   ssh cortex@10.88.140.153
   sudo journalctl -u k3s-agent -f
   ```

### Storage Issues

1. Check storage class:
   ```bash
   kubectl get storageclass
   kubectl describe storageclass local-path
   ```

2. Check provisioner pods:
   ```bash
   kubectl get pods -n local-path-storage
   kubectl logs -n local-path-storage <pod-name>
   ```

### MetalLB Not Assigning IPs

1. Check MetalLB pods:
   ```bash
   kubectl get pods -n metallb-system
   kubectl logs -n metallb-system <controller-pod>
   ```

2. Verify IP pool:
   ```bash
   kubectl get ipaddresspool -n metallb-system
   kubectl describe ipaddresspool cortex-pool -n metallb-system
   ```

3. Check L2 advertisement:
   ```bash
   kubectl get l2advertisement -n metallb-system
   ```

## Cleanup

### Delete Cluster (Keep VMs)

```bash
# Uninstall K3s from control plane
ssh cortex@10.88.140.152
sudo /usr/local/bin/k3s-uninstall.sh

# Uninstall from workers
ssh cortex@10.88.140.153
sudo /usr/local/bin/k3s-agent-uninstall.sh

ssh cortex@10.88.140.154
sudo /usr/local/bin/k3s-agent-uninstall.sh
```

### Delete VMs

```bash
# Via Proxmox API
for vmid in 110 111 112; do
  curl -k -X DELETE \
    -H "Authorization: PVEAPIToken=root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7" \
    https://10.88.140.151:8006/api2/json/nodes/pve/qemu/${vmid}
done
```

## Next Steps

After successful deployment:

1. **Deploy Cortex Application**:
   - Create Cortex namespace
   - Deploy coordination daemon
   - Deploy dashboard
   - Configure ingress

2. **Configure Monitoring**:
   - Install Prometheus
   - Install Grafana
   - Configure alerting

3. **Set Up CI/CD**:
   - Configure GitHub Actions
   - Set up automated deployments
   - Configure staging environment

4. **Security Hardening**:
   - Configure network policies
   - Set up RBAC
   - Enable pod security policies
   - Configure TLS certificates

## Support

For issues or questions:
- Check deployment logs: `/tmp/cortex-k3s-bootstrap-*.log`
- Review state file: `/tmp/cortex-k3s-bootstrap-state.json`
- Consult individual script documentation in `/scripts/` directories

## References

- [K3s Documentation](https://docs.k3s.io/)
- [Proxmox API Documentation](https://pve.proxmox.com/pve-docs/api-viewer/)
- [MetalLB Documentation](https://metallb.universe.tf/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
