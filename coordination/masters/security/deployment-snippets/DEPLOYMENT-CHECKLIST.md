# Wazuh Agent Deployment Checklist

## Deployment Status

| VM ID | Name | IP | Status | Notes |
|-------|------|----|----|-------|
| 310 | k3s-master-vm | 10.88.145.180 | ⬜ Pending | K3s Master Node |
| 311 | k3s-worker-1-vm | 10.88.145.181 | ⬜ Pending | K3s Worker 1 |
| 312 | k3s-worker-2-vm | 10.88.145.182 | ⬜ Pending | K3s Worker 2 |
| 900 | red-kali-server | 10.88.150.2 | ⬜ Pending | Red Team |
| 901 | blue-kali-server | 10.88.150.3 | ⬜ Pending | Blue Team |
| 902 | purple-kali-server | 10.88.150.4 | ⬜ Pending | Purple Team |
| 903 | green-kali-server | 10.88.150.5 | ⬜ Pending | Green Team |
| 200 | claude-code-agent | 10.88.140.200 | ⬜ Pending | Infrastructure |

## Deployment Methods

### Method 1: SSH (if configured)
```bash
ssh root@<VM_IP> 'bash -s' < install-wazuh-<VMID>.sh
```

### Method 2: Manual Execution
1. SSH or console into the VM
2. Copy the content of `install-wazuh-<VMID>.sh`
3. Execute as root

### Method 3: HTTP Download
```bash
curl -sSL <URL_TO_SCRIPT> | bash
```

### Method 4: Base64 Inline
Use the one-liner from `deploy-<VMID>-oneliner.txt`

## Verification

After deployment, verify agent registration:
```bash
# On Wazuh Manager
curl -k -u admin:SecurePass -X GET \
    "https://10.88.145.181:55000/agents?pretty=true"
```

## Post-Deployment

- [ ] All 8 agents registered
- [ ] All agents showing as active
- [ ] Security events flowing to manager
- [ ] Dashboard updated with new agents
- [ ] Security metrics updated
