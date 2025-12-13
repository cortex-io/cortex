# 🚀 EXECUTE CORTEX DEPLOYMENT - SINGLE COMMAND

## Prerequisites (30 seconds)

```bash
# 1. Set your API keys
export ANTHROPIC_API_KEY="sk-ant-..."  # Your Claude API key
export GITHUB_TOKEN="ghp_..."          # Your GitHub token

# 2. Ensure SSH key is set up for K3s master
ssh-copy-id cortex@10.88.145.180  # Only if you haven't already
```

---

## Deploy Cortex (ONE COMMAND)

```bash
cd /Users/ryandahlberg/Projects/cortex && ./scripts/deploy-cortex-remote.sh
```

**That's it!**

---

## What This Does

The script will:
1. ✅ Verify prerequisites (API keys, SSH access)
2. ✅ Sync all Cortex files to K3s master
3. ✅ Configure NFS on CT 105 (via Proxmox)
4. ✅ Create cortex-system namespace
5. ✅ Deploy all secrets and configs
6. ✅ Deploy NFS StorageClass + PVC
7. ✅ Deploy 4 Cortex masters
8. ✅ Deploy Wazuh DaemonSet (3 agents)
9. ✅ Deploy Dashboard + LoadBalancer
10. ✅ Show live status

**Time:** 3-5 minutes

---

## After Deployment

### Access Dashboard
The script will show you the dashboard URL. Access it in your browser.

### Verify Wazuh Integration
```bash
# SSH to K3s master
ssh cortex@10.88.145.180

# Check Wazuh agents
sudo kubectl get pods -n cortex-system -l app=wazuh-agent

# Should see 3 pods (one per K3s node)
```

### Check Wazuh Dashboard
- URL: https://10.88.140.202
- Login: admin / *B96Y7a0t8Ep9cw+z0RSevdRHwLnsiay
- Go to **Agents** → Should see 3 agents connected

### Submit Test Task
```bash
ssh cortex@10.88.145.180

DASHBOARD_IP=$(sudo kubectl get svc cortex-dashboard -n cortex-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

curl -X POST http://$DASHBOARD_IP/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"security_scan","repository":"ry-ops/cortex","priority":"high"}'

# Watch worker spawn
sudo kubectl get jobs -n cortex-system -w
```

---

## Troubleshooting

### SSH Connection Fails
```bash
# Test SSH
ssh cortex@10.88.145.180

# If fails, copy SSH key
ssh-copy-id cortex@10.88.145.180
```

### Deployment Fails
```bash
# SSH to K3s master
ssh cortex@10.88.145.180

# Check logs
cd ~/cortex
cat deploy-local.log

# Check K3s status
sudo kubectl get pods -n cortex-system
sudo kubectl get events -n cortex-system --sort-by='.lastTimestamp'
```

### NFS Issues
```bash
# Check NFS server
ssh root@10.88.140.164 "pct exec 105 -- systemctl status nfs-server"

# Test NFS mount from K3s
ssh cortex@10.88.145.180
showmount -e 10.88.140.164
```

---

## Manual Deployment (If Needed)

If the automated script fails, see: [DEPLOY-NOW.md](DEPLOY-NOW.md)

---

**Ready? Run this:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GITHUB_TOKEN="ghp_..."
cd /Users/ryandahlberg/Projects/cortex && ./scripts/deploy-cortex-remote.sh
```

🚀 **LET'S GO!**
