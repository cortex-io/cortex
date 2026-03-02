# K3s LXC to VM Data Migration Strategy

## Executive Summary

This document outlines the comprehensive data migration strategy for moving k3s from LXC containers (10.88.145.170-172) to VMs (10.88.145.180-182).

**Current State Analysis:**
- **Prometheus**: 685.9MB data, 7-day retention, using Longhorn storage (15Gi PVC via emptyDir)
- **Grafana**: Using emptyDir (ephemeral), dashboards managed via sidecar ConfigMaps
- **Alertmanager**: Using Longhorn storage, minimal data
- **Wazuh Agents**: Active on all 3 nodes (IDs: 001-k3s-worker-1, 002-k3s-worker-2, 003-k3s-master)
- **NFS**: Available at 10.88.145.173 (CTID 303), accessible via 10.88.140.164 proxy
- **Storage Classes**: local-path (default), longhorn, longhorn-static, nfs-client

---

## 1. Data Backup Commands

### 1.1 Prometheus Metrics Data

**Location**: `/prometheus` in pod prometheus-kube-prometheus-stack-prometheus-0
**Size**: 685.9MB
**Retention**: 7 days
**Storage**: Longhorn emptyDir (ephemeral but backed by Longhorn)

```bash
# Backup Prometheus data
BACKUP_DIR="/tmp/k3s-migration-backup/prometheus"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)

ssh root@10.88.140.164 << 'EOF'
# Create backup directory on Proxmox host
mkdir -p /tmp/k3s-migration-backup/prometheus

# Copy Prometheus data from pod
pct exec 300 -- /usr/local/bin/k3s kubectl exec -n monitoring \
  prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
  tar czf /tmp/prometheus-backup.tar.gz -C /prometheus .

# Copy to Proxmox host
pct exec 300 -- cat /tmp/prometheus-backup.tar.gz > \
  /tmp/k3s-migration-backup/prometheus/prometheus-data-$(date +%Y%m%d-%H%M%S).tar.gz

# Verify backup
ls -lh /tmp/k3s-migration-backup/prometheus/
EOF

# Optional: Copy to local machine for safety
scp root@10.88.140.164:/tmp/k3s-migration-backup/prometheus/prometheus-data-*.tar.gz \
  ~/backups/k3s-migration/
```

### 1.2 Prometheus Configuration and Rules

```bash
# Backup Prometheus CRD configurations
ssh root@10.88.140.164 << 'EOF'
mkdir -p /tmp/k3s-migration-backup/prometheus-config

cd /tmp/k3s-migration-backup/prometheus-config

# Export Prometheus CRD
pct exec 300 -- /usr/local/bin/k3s kubectl get prometheus -n monitoring \
  kube-prometheus-stack-prometheus -o yaml > prometheus-crd.yaml

# Export PrometheusRules
pct exec 300 -- /usr/local/bin/k3s kubectl get prometheusrules -n monitoring -o yaml \
  > prometheus-rules.yaml

# Export ServiceMonitors
pct exec 300 -- /usr/local/bin/k3s kubectl get servicemonitors -n monitoring -o yaml \
  > service-monitors.yaml

# Export PodMonitors
pct exec 300 -- /usr/local/bin/k3s kubectl get podmonitors -n monitoring -o yaml \
  > pod-monitors.yaml

# Export Secrets
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  prometheus-kube-prometheus-stack-prometheus -o yaml > prometheus-secret.yaml

pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  prometheus-kube-prometheus-stack-prometheus-web-config -o yaml > prometheus-web-config.yaml

# List all files
ls -lh
EOF
```

### 1.3 Alertmanager Configuration

```bash
# Backup Alertmanager data and config
ssh root@10.88.140.164 << 'EOF'
mkdir -p /tmp/k3s-migration-backup/alertmanager

# Export Alertmanager CRD
pct exec 300 -- /usr/local/bin/k3s kubectl get alertmanager -n monitoring \
  kube-prometheus-stack-alertmanager -o yaml \
  > /tmp/k3s-migration-backup/alertmanager/alertmanager-crd.yaml

# Export Alertmanager Secret (contains alertmanager.yaml)
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  alertmanager-kube-prometheus-stack-alertmanager-generated -o yaml \
  > /tmp/k3s-migration-backup/alertmanager/alertmanager-secret.yaml

# Backup Alertmanager data from pod
pct exec 300 -- /usr/local/bin/k3s kubectl exec -n monitoring \
  alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager -- \
  tar czf /tmp/alertmanager-backup.tar.gz -C /alertmanager .

pct exec 300 -- cat /tmp/alertmanager-backup.tar.gz > \
  /tmp/k3s-migration-backup/alertmanager/alertmanager-data-$(date +%Y%m%d-%H%M%S).tar.gz

ls -lh /tmp/k3s-migration-backup/alertmanager/
EOF
```

### 1.4 Grafana Dashboards and Datasources

**Note**: Grafana uses emptyDir storage, so dashboards are managed via ConfigMaps and sidecar containers.

```bash
# Backup Grafana configuration
ssh root@10.88.140.164 << 'EOF'
mkdir -p /tmp/k3s-migration-backup/grafana

cd /tmp/k3s-migration-backup/grafana

# Export Grafana deployment
pct exec 300 -- /usr/local/bin/k3s kubectl get deployment -n monitoring \
  kube-prometheus-stack-grafana -o yaml > grafana-deployment.yaml

# Export Grafana ConfigMaps (contain dashboards)
pct exec 300 -- /usr/local/bin/k3s kubectl get cm -n monitoring \
  kube-prometheus-stack-grafana -o yaml > grafana-config.yaml

pct exec 300 -- /usr/local/bin/k3s kubectl get cm -n monitoring \
  kube-prometheus-stack-grafana-datasource -o yaml > grafana-datasource.yaml

pct exec 300 -- /usr/local/bin/k3s kubectl get cm -n monitoring \
  kube-prometheus-stack-grafana-config-dashboards -o yaml > grafana-dashboards-config.yaml

# Export all dashboard ConfigMaps
pct exec 300 -- /usr/local/bin/k3s kubectl get cm -n monitoring -l grafana_dashboard=1 -o yaml \
  > grafana-dashboards.yaml

# Export Grafana secret (admin credentials)
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  kube-prometheus-stack-grafana -o yaml > grafana-secret.yaml

# Get admin password for reference
echo "Grafana Admin Password:"
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' | base64 -d
echo ""

ls -lh
EOF
```

### 1.5 NFS Provisioner Configuration

```bash
# Backup NFS provisioner configuration
ssh root@10.88.140.164 << 'EOF'
mkdir -p /tmp/k3s-migration-backup/nfs-provisioner

# Export NFS provisioner deployment
pct exec 300 -- /usr/local/bin/k3s kubectl get deployment nfs-provisioner-nfs-subdir-external-provisioner -o yaml \
  > /tmp/k3s-migration-backup/nfs-provisioner/nfs-provisioner-deployment.yaml 2>/dev/null || echo "NFS provisioner not found as deployment"

# Try as StatefulSet or DaemonSet
pct exec 300 -- /usr/local/bin/k3s kubectl get statefulset,daemonset -A -o yaml \
  | grep -A50 "nfs-provisioner" > /tmp/k3s-migration-backup/nfs-provisioner/nfs-provisioner-all.yaml

# Export StorageClass
pct exec 300 -- /usr/local/bin/k3s kubectl get storageclass nfs-client -o yaml \
  > /tmp/k3s-migration-backup/nfs-provisioner/nfs-storageclass.yaml

# Check if any PVCs exist on NFS
pct exec 300 -- /usr/local/bin/k3s kubectl get pvc -A \
  > /tmp/k3s-migration-backup/nfs-provisioner/pvc-list.txt

ls -lh /tmp/k3s-migration-backup/nfs-provisioner/
EOF
```

### 1.6 Helm Values and FluxCD Configuration

```bash
# Backup Helm release configurations
ssh root@10.88.140.164 << 'EOF'
mkdir -p /tmp/k3s-migration-backup/helm-values

# Get HelmRelease from FluxCD
pct exec 300 -- /usr/local/bin/k3s kubectl get helmrelease -n monitoring \
  kube-prometheus-stack -o yaml > /tmp/k3s-migration-backup/helm-values/prometheus-helmrelease.yaml

# Get Helm values
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  sh.helm.release.v1.kube-prometheus-stack.v1 -o yaml \
  > /tmp/k3s-migration-backup/helm-values/prometheus-helm-secret.yaml 2>/dev/null || echo "Helm secret not found"

ls -lh /tmp/k3s-migration-backup/helm-values/
EOF
```

### 1.7 Complete Backup Script

```bash
# Complete backup script - Run all at once
ssh root@10.88.140.164 'bash -s' << 'BACKUP_SCRIPT'
#!/bin/bash
set -e

BACKUP_BASE="/tmp/k3s-migration-backup"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_BASE}/${BACKUP_DATE}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"/{prometheus,alertmanager,grafana,nfs-provisioner,helm-values,wazuh}

# Prometheus
echo "Backing up Prometheus..."
pct exec 300 -- /usr/local/bin/k3s kubectl exec -n monitoring \
  prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
  tar czf /tmp/prometheus-backup.tar.gz -C /prometheus .
pct exec 300 -- cat /tmp/prometheus-backup.tar.gz > "${BACKUP_DIR}/prometheus/data.tar.gz"
pct exec 300 -- /usr/local/bin/k3s kubectl get prometheus -n monitoring -o yaml \
  > "${BACKUP_DIR}/prometheus/prometheus-crd.yaml"
pct exec 300 -- /usr/local/bin/k3s kubectl get prometheusrules,servicemonitors,podmonitors -n monitoring -o yaml \
  > "${BACKUP_DIR}/prometheus/monitoring-config.yaml"

# Alertmanager
echo "Backing up Alertmanager..."
pct exec 300 -- /usr/local/bin/k3s kubectl get alertmanager -n monitoring -o yaml \
  > "${BACKUP_DIR}/alertmanager/alertmanager-crd.yaml"
pct exec 300 -- /usr/local/bin/k3s kubectl get secret -n monitoring \
  -l app.kubernetes.io/name=alertmanager -o yaml \
  > "${BACKUP_DIR}/alertmanager/secrets.yaml"

# Grafana
echo "Backing up Grafana..."
pct exec 300 -- /usr/local/bin/k3s kubectl get deployment,cm,secret -n monitoring \
  -l app.kubernetes.io/name=grafana -o yaml > "${BACKUP_DIR}/grafana/grafana-resources.yaml"
pct exec 300 -- /usr/local/bin/k3s kubectl get cm -n monitoring -l grafana_dashboard=1 -o yaml \
  > "${BACKUP_DIR}/grafana/dashboards.yaml"

# NFS/Storage
echo "Backing up storage configuration..."
pct exec 300 -- /usr/local/bin/k3s kubectl get storageclass -o yaml \
  > "${BACKUP_DIR}/nfs-provisioner/storageclasses.yaml"
pct exec 300 -- /usr/local/bin/k3s kubectl get pvc,pv -A -o yaml \
  > "${BACKUP_DIR}/nfs-provisioner/volumes.yaml"

# Wazuh agent configs
echo "Backing up Wazuh agent configurations..."
for CTID in 300 301 302; do
  echo "  Container ${CTID}..."
  pct exec ${CTID} -- cat /var/ossec/etc/ossec.conf > "${BACKUP_DIR}/wazuh/ossec-${CTID}.conf" || true
  pct exec ${CTID} -- cat /var/ossec/etc/client.keys > "${BACKUP_DIR}/wazuh/client-keys-${CTID}.txt" || true
done

# Create manifest
echo "Creating backup manifest..."
cat > "${BACKUP_DIR}/MANIFEST.txt" << EOF
K3s LXC to VM Migration Backup
Generated: ${BACKUP_DATE}
Source: k3s-master (10.88.145.170), k3s-worker-1 (10.88.145.171), k3s-worker-2 (10.88.145.172)
Target: VMs at 10.88.145.180-182

Contents:
$(tree -L 2 "${BACKUP_DIR}" 2>/dev/null || find "${BACKUP_DIR}" -type f | sed 's|'"${BACKUP_DIR}"'||')

Sizes:
$(du -sh "${BACKUP_DIR}"/* | sort -h)
EOF

cat "${BACKUP_DIR}/MANIFEST.txt"

echo ""
echo "Backup complete: ${BACKUP_DIR}"
echo "Total size: $(du -sh ${BACKUP_DIR} | cut -f1)"

# Create tarball
echo "Creating backup tarball..."
cd "${BACKUP_BASE}"
tar czf "k3s-migration-backup-${BACKUP_DATE}.tar.gz" "${BACKUP_DATE}"
echo "Backup tarball: ${BACKUP_BASE}/k3s-migration-backup-${BACKUP_DATE}.tar.gz"

BACKUP_SCRIPT
```

---

## 2. Migration Order and Dependencies

### Phase 1: Pre-Migration (Day 0 - Preparation)
**Duration**: 2-4 hours
**Downtime**: None

1. **Run complete backup** (see section 1.7)
2. **Verify backups** - Check all tarballs and YAML files
3. **Prepare VM infrastructure** - Ensure VMs at 10.88.145.180-182 are ready
4. **Install k3s on VMs** - Bootstrap new cluster
5. **Configure NFS access** - Ensure VMs can reach 10.88.145.173
6. **Install Wazuh agents on VMs** - Pre-register with Wazuh server

### Phase 2: Storage Layer Migration (Day 0 - Evening)
**Duration**: 1 hour
**Downtime**: None (parallel cluster)

1. **Deploy NFS provisioner on new VMs**
   ```bash
   # Apply StorageClass from backup
   kubectl apply -f /tmp/k3s-migration-backup/latest/nfs-provisioner/storageclasses.yaml
   ```

2. **Deploy Longhorn** (if needed for persistent storage)
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.5.3/deploy/longhorn.yaml
   ```

3. **Verify storage classes**
   ```bash
   kubectl get storageclass
   ```

### Phase 3: Monitoring Stack Migration (Day 1 - Maintenance Window)
**Duration**: 3-4 hours
**Downtime**: Monitoring only (production apps unaffected)

#### 3.1 Deploy kube-prometheus-stack on new VMs

```bash
# Option A: Re-deploy via FluxCD/Helm (recommended)
kubectl apply -f /tmp/k3s-migration-backup/latest/helm-values/prometheus-helmrelease.yaml

# Option B: Direct Helm installation
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Extract values from backup (if needed)
# Then install with same configuration
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f prometheus-values.yaml
```

#### 3.2 Restore Prometheus Data (Optional - if historical data needed)

**Decision Point**: Do you need 7 days of historical metrics?
- **NO**: Skip restoration, Prometheus will start fresh (RECOMMENDED)
- **YES**: Follow restoration below (adds 1-2 hours, higher risk)

```bash
# Only if historical data is required
# Wait for StatefulSet to create PVC
kubectl wait --for=condition=ready pod -n monitoring -l app.kubernetes.io/name=prometheus --timeout=300s

# Scale down Prometheus
kubectl scale statefulset -n monitoring prometheus-kube-prometheus-stack-prometheus --replicas=0

# Copy backup to new pod
kubectl run -n monitoring restore-helper --image=busybox --restart=Never -- sleep 3600
kubectl cp /tmp/k3s-migration-backup/latest/prometheus/data.tar.gz \
  monitoring/restore-helper:/tmp/prometheus-backup.tar.gz

# Restore data
kubectl exec -n monitoring prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
  sh -c 'cd /prometheus && tar xzf /tmp/prometheus-backup.tar.gz'

# Scale back up
kubectl scale statefulset -n monitoring prometheus-kube-prometheus-stack-prometheus --replicas=1

# Cleanup
kubectl delete pod -n monitoring restore-helper
```

#### 3.3 Restore Grafana Dashboards

**Note**: If using FluxCD with dashboard ConfigMaps, dashboards should auto-deploy. Otherwise:

```bash
# Apply dashboard ConfigMaps from backup
kubectl apply -f /tmp/k3s-migration-backup/latest/grafana/dashboards.yaml

# Verify Grafana datasource points to new Prometheus
kubectl get cm -n monitoring kube-prometheus-stack-grafana-datasource -o yaml
```

#### 3.4 Restore Alertmanager Configuration

```bash
# Apply Alertmanager CRD from backup (if custom configuration exists)
kubectl apply -f /tmp/k3s-migration-backup/latest/alertmanager/alertmanager-crd.yaml

# Verify Alertmanager secret
kubectl get secret -n monitoring -l app.kubernetes.io/name=alertmanager
```

### Phase 4: Wazuh Agent Migration (Day 1 - After Monitoring)
**Duration**: 30 minutes
**Downtime**: Security monitoring only

#### 4.1 Register New VM Agents

```bash
# On Wazuh server (10.88.140.202), remove old agents
ssh root@10.88.140.202 << 'EOF'
/var/ossec/bin/manage_agents -r 001  # k3s-worker-1 (old LXC)
/var/ossec/bin/manage_agents -r 002  # k3s-worker-2 (old LXC)
/var/ossec/bin/manage_agents -r 003  # k3s-master (old LXC)
EOF
```

#### 4.2 Add New VM Agents

```bash
# On each new VM (10.88.145.180-182)
# VM 180 (new master)
ssh root@10.88.145.180 << 'EOF'
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-master-vm
systemctl restart wazuh-agent
EOF

# VM 181 (new worker-1)
ssh root@10.88.145.181 << 'EOF'
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-worker-1-vm
systemctl restart wazuh-agent
EOF

# VM 182 (new worker-2)
ssh root@10.88.145.182 << 'EOF'
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-worker-2-vm
systemctl restart wazuh-agent
EOF
```

#### 4.3 Preserve Custom Rules (if any)

```bash
# Check old LXC containers for custom rules
ssh root@10.88.140.164 << 'EOF'
for CTID in 300 301 302; do
  echo "=== Container ${CTID} ==="
  pct exec ${CTID} -- ls -la /var/ossec/etc/rules/local_rules.xml 2>/dev/null || echo "No custom rules"
  pct exec ${CTID} -- cat /var/ossec/etc/rules/local_rules.xml 2>/dev/null || true
done
EOF

# If custom rules found, copy to new VMs
# scp custom rules to new VMs and restart agents
```

### Phase 5: Verification and Cutover (Day 1 - Final)
**Duration**: 1 hour
**Downtime**: 5-10 minutes (DNS/traffic switch)

1. **Verify monitoring stack on new VMs**
2. **Update DNS/load balancer** to point to new VMs
3. **Monitor for 24 hours** before decommissioning old LXC
4. **Decommission old LXC containers** (Day 2+)

---

## 3. Validation Checklist Post-Migration

### 3.1 Storage Validation

```bash
# Check StorageClasses
kubectl get storageclass
# Expected: local-path, longhorn, nfs-client

# Check PVCs (should be empty initially unless data restored)
kubectl get pvc -A

# Check NFS mount
kubectl run nfs-test --image=busybox --restart=Never -- \
  sh -c 'mount | grep nfs && ls -la /mnt'
```

### 3.2 Prometheus Validation

```bash
# Check Prometheus pod
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus
# Expected: Running

# Check Prometheus targets
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Then access http://localhost:9090/targets
# All targets should be UP

# Check metrics ingestion
kubectl exec -n monitoring prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
  wget -qO- 'http://localhost:9090/api/v1/query?query=up' | jq '.data.result | length'
# Should return number > 0

# Check retention settings
kubectl get prometheus -n monitoring kube-prometheus-stack-prometheus -o yaml | grep retention
# Expected: 7d
```

### 3.3 Grafana Validation

```bash
# Check Grafana pod
kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana
# Expected: Running

# Port-forward to Grafana
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80

# Access http://localhost:3000
# Login with admin credentials from backup
# Verify:
# - Datasources exist (Prometheus, Alertmanager)
# - Dashboards loaded
# - Queries return data
```

### 3.4 Alertmanager Validation

```bash
# Check Alertmanager pod
kubectl get pods -n monitoring -l app.kubernetes.io/name=alertmanager
# Expected: Running

# Check Alertmanager status
kubectl port-forward -n monitoring svc/kube-prometheus-stack-alertmanager 9093:9093
# Access http://localhost:9093/#/status
# Verify cluster status and configuration
```

### 3.5 Wazuh Agent Validation

```bash
# On Wazuh server
ssh root@10.88.140.202 '/var/ossec/bin/agent_control -l'
# Expected: 3 new agents (k3s-master-vm, k3s-worker-1-vm, k3s-worker-2-vm)
# Status: Active

# Check agent connectivity
ssh root@10.88.140.202 << 'EOF'
for AGENT in k3s-master-vm k3s-worker-1-vm k3s-worker-2-vm; do
  echo "=== ${AGENT} ==="
  /var/ossec/bin/agent_control -i ${AGENT}
done
EOF
```

### 3.6 Complete Validation Script

```bash
#!/bin/bash
# Comprehensive validation script for new VMs

echo "=== K8s Cluster Validation ==="
kubectl cluster-info
kubectl get nodes -o wide

echo ""
echo "=== Storage Validation ==="
kubectl get storageclass
kubectl get pv,pvc -A

echo ""
echo "=== Monitoring Stack Validation ==="
kubectl get pods -n monitoring -o wide
kubectl get svc -n monitoring

echo ""
echo "=== Prometheus Validation ==="
kubectl exec -n monitoring prometheus-kube-prometheus-stack-prometheus-0 -c prometheus -- \
  wget -qO- 'http://localhost:9090/-/healthy'

echo ""
echo "=== Grafana Validation ==="
kubectl exec -n monitoring -l app.kubernetes.io/name=grafana -- \
  curl -s http://localhost:3000/api/health | jq

echo ""
echo "=== Alertmanager Validation ==="
kubectl exec -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager -- \
  wget -qO- 'http://localhost:9093/-/healthy'

echo ""
echo "=== Wazuh Agents Validation ==="
for VM_IP in 10.88.145.180 10.88.145.181 10.88.145.182; do
  echo "Checking Wazuh on ${VM_IP}..."
  ssh root@${VM_IP} '/var/ossec/bin/wazuh-control status' 2>/dev/null || echo "Agent not responding"
done
```

---

## 4. Estimated Downtime for Each Component

| Component | Downtime | Notes |
|-----------|----------|-------|
| **Prometheus** | 0 minutes (parallel) or 5-10 minutes (data restore) | New cluster runs in parallel; only downtime if restoring data |
| **Grafana** | 0 minutes (parallel) | Dashboards redeploy automatically via ConfigMaps |
| **Alertmanager** | 0 minutes (parallel) | Alert routing may have 2-3 minute gap during cutover |
| **Wazuh Agents** | 5-10 minutes | Agent registration and restart on new VMs |
| **NFS Storage** | 0 minutes | NFS server (10.88.145.173) remains available throughout |
| **Application Workloads** | 0 minutes | Apps migrate separately, monitoring migration is independent |

**Total Estimated Downtime**: 0 minutes (if parallel migration)
**Total Migration Time**: 4-6 hours (including verification)

**Maintenance Window Recommendation**: 4-hour window during off-peak hours

---

## 5. Wazuh Agent Commands Reference

### 5.1 Deregister Old LXC Agents

```bash
# On Wazuh server (10.88.140.202)
ssh root@10.88.140.202 << 'EOF'
# List current agents
/var/ossec/bin/agent_control -l

# Remove old agents (use actual agent IDs)
/var/ossec/bin/manage_agents -r 001  # k3s-worker-1 (LXC 301)
/var/ossec/bin/manage_agents -r 002  # k3s-worker-2 (LXC 302)
/var/ossec/bin/manage_agents -r 003  # k3s-master (LXC 300)

# Restart Wazuh manager to apply changes
systemctl restart wazuh-manager

# Verify removal
/var/ossec/bin/agent_control -l
EOF
```

### 5.2 Register New VM Agents

**Method 1: Using agent-auth (Automatic)**

```bash
# On each new VM, install Wazuh agent first, then:

# VM 180 (k3s-master-vm)
ssh root@10.88.145.180 << 'EOF'
# Configure server address
echo 'WAZUH_MANAGER="10.88.140.202"' > /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf
echo 'WAZUH_AGENT_NAME="k3s-master-vm"' >> /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf

# Auto-register with server
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-master-vm

# Start agent
systemctl enable wazuh-agent
systemctl start wazuh-agent
systemctl status wazuh-agent
EOF

# VM 181 (k3s-worker-1-vm)
ssh root@10.88.145.181 << 'EOF'
echo 'WAZUH_MANAGER="10.88.140.202"' > /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf
echo 'WAZUH_AGENT_NAME="k3s-worker-1-vm"' >> /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-worker-1-vm
systemctl enable wazuh-agent
systemctl start wazuh-agent
EOF

# VM 182 (k3s-worker-2-vm)
ssh root@10.88.145.182 << 'EOF'
echo 'WAZUH_MANAGER="10.88.140.202"' > /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf
echo 'WAZUH_AGENT_NAME="k3s-worker-2-vm"' >> /etc/wazuh-agent/wazuh-agent.conf.d/wazuh_manager.conf
/var/ossec/bin/agent-auth -m 10.88.140.202 -A k3s-worker-2-vm
systemctl enable wazuh-agent
systemctl start wazuh-agent
EOF
```

**Method 2: Manual Registration (if agent-auth fails)**

```bash
# On Wazuh server
ssh root@10.88.140.202 << 'EOF'
# Add agents manually
/var/ossec/bin/manage_agents

# Follow interactive prompts:
# A) Add an agent
# Agent name: k3s-master-vm
# Agent IP: 10.88.145.180
# Agent ID: (auto-assigned or specify)
# Confirm

# Repeat for other VMs
# Extract keys after adding all agents
/var/ossec/bin/manage_agents

# E) Extract key for an agent
# Agent ID: (ID of k3s-master-vm)
# Copy the key

EOF

# On each VM, import the key:
ssh root@10.88.145.180 << 'EOF'
echo "PASTE_KEY_HERE" > /tmp/agent.key
/var/ossec/bin/manage_agents -i /tmp/agent.key
systemctl restart wazuh-agent
rm /tmp/agent.key
EOF
```

### 5.3 Preserve Custom Wazuh Configurations

```bash
# Check for custom rules on old LXC containers
ssh root@10.88.140.164 << 'EOF'
for CTID in 300 301 302; do
  echo "=== Checking CTID ${CTID} ==="

  # Local rules
  pct exec ${CTID} -- cat /var/ossec/etc/rules/local_rules.xml 2>/dev/null || echo "No local rules"

  # Local decoders
  pct exec ${CTID} -- cat /var/ossec/etc/decoders/local_decoder.xml 2>/dev/null || echo "No local decoders"

  # Custom ossec.conf sections
  pct exec ${CTID} -- grep -A20 "<!-- Local Configuration -->" /var/ossec/etc/ossec.conf 2>/dev/null || echo "No local config"
done
EOF

# If custom configs found, copy to new VMs
# Example:
scp root@10.88.140.164:/tmp/k3s-migration-backup/latest/wazuh/ossec-300.conf /tmp/
scp /tmp/ossec-300.conf root@10.88.145.180:/var/ossec/etc/ossec.conf
ssh root@10.88.145.180 'systemctl restart wazuh-agent'
```

### 5.4 Verify Agent Status

```bash
# On Wazuh server
ssh root@10.88.140.202 << 'EOF'
# List all agents
/var/ossec/bin/agent_control -l

# Detailed info for specific agent
/var/ossec/bin/agent_control -i k3s-master-vm

# Check agent statistics
/var/ossec/bin/agent_control -s
EOF

# On each VM
for VM_IP in 10.88.145.180 10.88.145.181 10.88.145.182; do
  echo "=== Checking ${VM_IP} ==="
  ssh root@${VM_IP} << 'EOF'
    # Agent status
    /var/ossec/bin/wazuh-control status

    # Check connection to manager
    grep "Connected to the server" /var/ossec/logs/ossec.log | tail -5

    # Check for errors
    grep -i error /var/ossec/logs/ossec.log | tail -10
EOF
done
```

---

## 6. Risk Mitigation and Rollback Plan

### 6.1 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Prometheus data corruption | Low | Medium | Full backup, test restore before production |
| Grafana dashboards lost | Low | Low | ConfigMaps backed up, easy to redeploy |
| Wazuh agent registration fails | Medium | Low | Manual registration fallback |
| NFS connectivity issues | Low | High | Test NFS before migration, verify firewall rules |
| Longhorn storage issues in VMs | Medium | High | Use emptyDir or NFS instead, test before data migration |

### 6.2 Rollback Plan

**If migration fails at any point:**

1. **Keep old LXC cluster running** during migration (parallel deployment)
2. **DNS/Traffic**: Simply don't switch traffic to new VMs
3. **Wazuh**: Re-add old agents if removed
4. **Timeline**: Full rollback possible in <15 minutes

```bash
# Rollback: Re-add old Wazuh agents
ssh root@10.88.140.202 << 'EOF'
# Using backed up client keys
# Re-import keys from backup
/var/ossec/bin/manage_agents -i /tmp/k3s-migration-backup/latest/wazuh/client-keys-300.txt
systemctl restart wazuh-manager
EOF

# Rollback: Point monitoring to old cluster
# Just don't update DNS or ingress controllers
```

---

## 7. Post-Migration Cleanup (Day 7+)

**After 1 week of successful operation on new VMs:**

```bash
# Stop old LXC containers
ssh root@10.88.140.164 << 'EOF'
pct stop 300  # k3s-master
pct stop 301  # k3s-worker-1
pct stop 302  # k3s-worker-2
EOF

# Wait 24 hours, verify production stability

# Destroy old LXC containers
ssh root@10.88.140.164 << 'EOF'
pct destroy 300
pct destroy 301
pct destroy 302
EOF

# Archive backups to long-term storage
tar czf k3s-lxc-final-backup-$(date +%Y%m%d).tar.gz \
  /tmp/k3s-migration-backup/

# Move to long-term storage location
mv k3s-lxc-final-backup-*.tar.gz /mnt/long-term-backups/
```

---

## 8. Additional Considerations

### 8.1 Monitoring Stack Performance Tuning

**Prometheus on VMs** may perform better than on LXC due to:
- Better kernel resource isolation
- Improved I/O performance
- Native systemd integration

**Recommended VM specs per node:**
- CPU: 2-4 cores
- RAM: 4-8 GB
- Disk: 50-100 GB SSD (for Prometheus data)

### 8.2 Network Considerations

**Verify network connectivity before migration:**

```bash
# From new VMs, test connectivity
# NFS server
ping -c 3 10.88.145.173

# Wazuh server
ping -c 3 10.88.140.202

# Old k3s cluster
ping -c 3 10.88.145.170
```

**Firewall rules**: Ensure 10.88.145.180-182 can access:
- NFS: Port 2049 to 10.88.145.173
- Wazuh: Port 1514 to 10.88.140.202

### 8.3 Longhorn Considerations

**Issue**: Longhorn had problems in LXC containers
**Recommendation**:
- Test Longhorn on VMs before migration
- If issues persist, use **NFS or local-path** storage instead
- Prometheus can use emptyDir with 7-day retention (acceptable data loss)

```bash
# If Longhorn fails, update Prometheus to use emptyDir
kubectl patch prometheus -n monitoring kube-prometheus-stack-prometheus \
  --type='json' \
  -p='[{"op": "replace", "path": "/spec/storage", "value": {"emptyDir": {"sizeLimit": "10Gi"}}}]'
```

---

## 9. Summary and Quick Reference

### Quick Migration Commands (For Experienced Operators)

```bash
# 1. Backup (30 min)
ssh root@10.88.140.164 'bash /path/to/backup-script.sh'

# 2. Deploy k3s on VMs (1 hr)
# (Use your standard k3s installation process)

# 3. Deploy monitoring stack (1 hr)
kubectl apply -f /tmp/k3s-migration-backup/latest/helm-values/prometheus-helmrelease.yaml

# 4. Migrate Wazuh agents (30 min)
# Deregister old: ssh root@10.88.140.202 '/var/ossec/bin/manage_agents -r 001-003'
# Register new: ssh root@10.88.145.180-182 '/var/ossec/bin/agent-auth -m 10.88.140.202'

# 5. Validate (30 min)
kubectl get pods -n monitoring
/var/ossec/bin/agent_control -l

# 6. Cutover (10 min)
# Update DNS/LB to point to 10.88.145.180-182
```

### Key Files and Locations

| Item | Location (Backup) | Location (New VMs) |
|------|-------------------|---------------------|
| Prometheus Data | `/tmp/k3s-migration-backup/latest/prometheus/data.tar.gz` | `/prometheus` in pod |
| Grafana Dashboards | `/tmp/k3s-migration-backup/latest/grafana/dashboards.yaml` | ConfigMaps in monitoring namespace |
| Wazuh Configs | `/tmp/k3s-migration-backup/latest/wazuh/ossec-*.conf` | `/var/ossec/etc/ossec.conf` on VMs |
| Helm Values | `/tmp/k3s-migration-backup/latest/helm-values/` | Applied via kubectl/FluxCD |

### Support Contacts

- **Wazuh Server**: 10.88.140.202 (root)
- **NFS Server**: 10.88.145.173 (CTID 303, via 10.88.140.164)
- **Old k3s Master**: 10.88.145.170 (CTID 300)
- **New k3s Master VM**: 10.88.145.180

---

## Conclusion

This migration strategy provides a comprehensive, low-risk approach to moving your k3s cluster from LXC containers to VMs. By following the phased approach with parallel deployment, you minimize downtime and maintain rollback options throughout the process.

**Critical Success Factors:**
1. Complete backups before starting
2. Parallel deployment (no rushing to decommission old cluster)
3. Thorough validation at each phase
4. 1-week observation period before cleanup

**Estimated Total Time**: 4-6 hours active work + 1 week observation
**Estimated Downtime**: 0-10 minutes (depending on data restoration choice)
