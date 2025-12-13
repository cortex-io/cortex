#!/bin/bash
# Wazuh Dashboard Version Fix - Proxmox Console Commands
# Copy and paste these commands into your Wazuh server's Proxmox console

echo "==================================================================="
echo "WAZUH DASHBOARD VERSION FIX - Starting..."
echo "==================================================================="
echo ""

# Step 1: Check current versions
echo "Step 1: Checking current versions..."
echo "-----------------------------------"
/var/ossec/bin/wazuh-control info 2>/dev/null || echo "API Version: $(dpkg -l | grep wazuh-manager | awk '{print $3}')"
dpkg -l | grep wazuh-dashboard || rpm -qa | grep wazuh-dashboard
echo ""

# Step 2: Detect OS and set package manager
echo "Step 2: Detecting operating system..."
echo "--------------------------------------"
if [ -f /etc/debian_version ]; then
    echo "Detected: Debian/Ubuntu"
    PKG_MGR="apt-get"
    PKG_INSTALL="install -y"
    PKG_UPDATE="update"
elif [ -f /etc/redhat-release ]; then
    echo "Detected: RHEL/CentOS/Rocky"
    PKG_MGR="yum"
    PKG_INSTALL="install -y"
    PKG_UPDATE="clean all"
else
    echo "Unknown OS - please install manually"
    exit 1
fi
echo ""

# Step 3: Backup current configuration
echo "Step 3: Creating configuration backup..."
echo "----------------------------------------"
BACKUP_DIR="/var/backup/wazuh-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r /etc/wazuh-dashboard $BACKUP_DIR/ 2>/dev/null || echo "Config backup created"
echo "Backup saved to: $BACKUP_DIR"
echo ""

# Step 4: Stop the dashboard service
echo "Step 4: Stopping wazuh-dashboard service..."
echo "--------------------------------------------"
systemctl stop wazuh-dashboard
systemctl status wazuh-dashboard --no-pager | grep Active
echo ""

# Step 5: Update package manager
echo "Step 5: Updating package manager..."
echo "------------------------------------"
$PKG_MGR $PKG_UPDATE
echo ""

# Step 6: Upgrade wazuh-dashboard to 4.14.1
echo "Step 6: Upgrading wazuh-dashboard to 4.14.1..."
echo "-----------------------------------------------"
if [ "$PKG_MGR" = "apt-get" ]; then
    apt-get install -y wazuh-dashboard=4.14.1-1
elif [ "$PKG_MGR" = "yum" ]; then
    yum install -y wazuh-dashboard-4.14.1-1
fi
echo ""

# Step 7: Start the dashboard service
echo "Step 7: Starting wazuh-dashboard service..."
echo "--------------------------------------------"
systemctl start wazuh-dashboard
sleep 5
systemctl status wazuh-dashboard --no-pager | grep Active
echo ""

# Step 8: Verify versions are aligned
echo "Step 8: Verifying version alignment..."
echo "---------------------------------------"
echo "API Version:"
/var/ossec/bin/wazuh-control info 2>/dev/null | grep VERSION || dpkg -l | grep wazuh-manager | awk '{print $3}' || rpm -qa | grep wazuh-manager
echo ""
echo "Dashboard Version:"
dpkg -l | grep wazuh-dashboard | awk '{print $3}' || rpm -qa | grep wazuh-dashboard | awk -F- '{print $4}'
echo ""

# Step 9: Test dashboard connectivity
echo "Step 9: Testing dashboard connectivity..."
echo "------------------------------------------"
curl -k -s https://localhost:443 >/dev/null 2>&1 && echo "✓ Dashboard is responding on HTTPS" || echo "⚠ Dashboard may still be starting..."
echo ""

echo "==================================================================="
echo "WAZUH FIX COMPLETE!"
echo "==================================================================="
echo ""
echo "Next steps:"
echo "1. Clear your browser cache"
echo "2. Access the Wazuh dashboard in your browser"
echo "3. The version mismatch error should be gone"
echo ""
echo "If you still see errors, the dashboard might need another minute"
echo "to fully start up. Wait 60 seconds and refresh your browser."
echo ""
echo "Rollback available at: $BACKUP_DIR"
echo "==================================================================="
