# Cortex Self-Deployment to Proxmox

## 🤯 The Concept

**Cortex can deploy itself to Proxmox!**

Instead of manually running scripts, Cortex uses its own orchestration capabilities to:
1. Copy the deployment script to Proxmox
2. Execute the deployment
3. Monitor progress in real-time
4. Verify the deployment
5. Start the services
6. Report success

**This is meta-automation at its finest:** Cortex deploying and monitoring itself! 🔄

---

## 🚀 Run Self-Deployment

### One Simple Command:

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-self-to-proxmox.sh
```

That's it! Cortex handles everything else.

---

## 📊 What Happens

```
┌─────────────────────────────────────────┐
│  Your Mac                                │
│  /Projects/cortex                       │
│                                          │
│  Running: deploy-self-to-proxmox.sh    │
│  ↓                                       │
│  Cortex orchestrates its own deployment │
└──────────────┬──────────────────────────┘
               │
               │ SSH + SCP
               ↓
┌─────────────────────────────────────────┐
│  Proxmox (10.88.140.151)                │
│                                          │
│  1. Receives deployment script          │
│  2. Creates LXC 101                     │
│  3. Installs Cortex                     │
│  4. Starts services                     │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  LXC 101: cortex                   │ │
│  │  • Cortex Dashboard :3000          │ │
│  │  • All Masters ready               │ │
│  │  • Monitoring Proxmox              │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## ✨ Features

### Real-time Monitoring
- See deployment progress as it happens
- All output logged to file
- Progress indicators for each step

### Error Handling
- Validates prerequisites before starting
- Tests connectivity
- Verifies each step
- Provides detailed error messages

### Automated Verification
- Checks container status
- Verifies dashboard accessibility
- Confirms all services are running

### Comprehensive Logging
- Full deployment log saved
- Deployment info JSON file
- Easy troubleshooting

---

## 📋 Prerequisites

1. **SSH access to Proxmox:**
   ```bash
   # Test this first
   ssh root@10.88.140.151 "echo 'Connected!'"
   ```

2. **Proxmox API token configured:**
   - You already have this! (cortex-automation)

3. **Deployment script exists:**
   - Located at: `/Users/ryandahlberg/Projects/proxmox-mcp-server/deploy-cortex-lxc.sh`
   - ✓ Already created!

---

## 🎯 Step-by-Step

### 1. Start Deployment
```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-self-to-proxmox.sh
```

### 2. Review Plan
You'll see:
```
Cortex will deploy itself to Proxmox:

Source:
  • Local Cortex: /Users/ryandahlberg/Projects/cortex
  • Deployment Script: /Users/.../deploy-cortex-lxc.sh

Target:
  • Proxmox Host: 10.88.140.151
  • Container ID: 101
  • IP: 10.88.140.159

Continue with deployment? [y/N]:
```

### 3. Confirm
Press `y` and Enter

### 4. Watch Progress
```
[Step 1/6] Copying deployment script to Proxmox
✓ Deployment script copied

[Step 2/6] Making script executable
✓ Script is now executable

[Step 3/6] Executing deployment on Proxmox
Running deployment script (this will take 5-10 minutes)...
╔══════════════════════════════════════════════════╗
║     Cortex Deployment Script for Proxmox        ║
╚══════════════════════════════════════════════════╝
...
```

### 5. Completion
```
╔══════════════════════════════════════════════════╗
║  Cortex Successfully Deployed Itself! 🎉        ║
╚══════════════════════════════════════════════════╝

Deployment Details:
  Container ID: 101
  IP Address: 10.88.140.159
  Dashboard: http://10.88.140.159:3000

Next Steps:
  1. Open dashboard
  2. Configure monitoring
  3. Watch Cortex monitor itself!
```

---

## 🎮 After Deployment

### Access the Dashboard
```bash
# Open in browser
open http://10.88.140.159:3000

# Or from command line
curl http://10.88.140.159:3000
```

### Enter the Container
```bash
# Via Proxmox
ssh root@10.88.140.151 "pct enter 101"

# Or directly (if SSH is configured)
ssh root@10.88.140.159
```

### Check Status
```bash
# Container status
ssh root@10.88.140.151 "pct status 101"

# Dashboard service
ssh root@10.88.140.151 "pct exec 101 -- systemctl status cortex-dashboard"

# View logs
ssh root@10.88.140.151 "pct exec 101 -- journalctl -u cortex-dashboard -f"
```

### Manage via Proxmox MCP Server
```bash
cd /Users/ryandahlberg/Projects/proxmox-mcp-server
uv run proxmox-mcp-server

# Then:
# "Show me container 101 status"
# "Start container 101"
# "What's the IP of the cortex container?"
```

---

## 🔄 The Meta Loop

Once deployed, you have:

```
Cortex (on your Mac)
    ↓ deploys
Cortex (in Proxmox LXC 101)
    ↓ monitors
Proxmox Infrastructure
    ↓ manages
Cortex Container (LXC 101)
    ↓ runs
Cortex Dashboard
    ↓ displays
Everything (including itself!)
```

**Cortex monitoring and managing itself through Proxmox!** 🤯

---

## 📁 Files Created

### During Deployment
- `coordination/tasks/deploy-cortex-to-proxmox/deployment-TIMESTAMP.log`
- `coordination/tasks/deploy-cortex-to-proxmox/deployment-info.json`

### Deployment Task
- `coordination/tasks/deploy-cortex-to-proxmox.json` - Task definition

### Scripts
- `scripts/deploy-self-to-proxmox.sh` - Self-deployment orchestrator

---

## 🐛 Troubleshooting

### "Cannot reach Proxmox server"
```bash
# Test connectivity
ping 10.88.140.151

# Test SSH
ssh root@10.88.140.151 "echo OK"
```

### "Deployment script not found"
```bash
# Check if script exists
ls -la /Users/ryandahlberg/Projects/proxmox-mcp-server/deploy-cortex-lxc.sh
```

### "Container 101 already exists"
```bash
# Remove old container
ssh root@10.88.140.151 "pct stop 101 && pct destroy 101"

# Then run deployment again
./scripts/deploy-self-to-proxmox.sh
```

### "Dashboard not accessible"
```bash
# Check service status
ssh root@10.88.140.151 "pct exec 101 -- systemctl status cortex-dashboard"

# Check if port is listening
ssh root@10.88.140.151 "pct exec 101 -- ss -tulpn | grep 3000"

# Restart service
ssh root@10.88.140.151 "pct exec 101 -- systemctl restart cortex-dashboard"
```

---

## 🎯 Benefits of Self-Deployment

1. **Automated** - No manual steps
2. **Monitored** - See progress in real-time
3. **Logged** - Full audit trail
4. **Verified** - Checks at each step
5. **Repeatable** - Run it again anytime
6. **Self-documenting** - Generates deployment info

---

## 🚀 Ready to Deploy?

Run this now:

```bash
cd /Users/ryandahlberg/Projects/cortex
./scripts/deploy-self-to-proxmox.sh
```

**Cortex will handle the rest!** 🎉

---

## 💡 Advanced: Extend the Automation

Want to add more automation? Edit:
- `scripts/deploy-self-to-proxmox.sh` - Deployment orchestration
- `coordination/tasks/deploy-cortex-to-proxmox.json` - Task definition

You could add:
- Pre-deployment snapshots
- Post-deployment configuration
- Automatic monitoring setup
- Integration with other systems
- Slack/email notifications
- Rollback on failure

**The sky's the limit!** ☁️
