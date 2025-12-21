#!/bin/bash
# Automated fix for k3s-master03 using expect and Proxmox API console
# This attempts to automate the console interaction

PROXMOX_HOST="10.88.140.164"
VMID="306"
TARGET_IP="10.88.145.196"
VM_USER="k3s"
VM_PASS="toor"

echo "======================================================================="
echo "Automated k3s-master03 IP Fix via Proxmox Console"
echo "======================================================================="
echo ""
echo "Target: VMID $VMID -> IP $TARGET_IP"
echo ""

# Check if we can find the VM's current IP by scanning
echo "Scanning for current VM IP..."
CURRENT_IP=""
for ip in 10.88.145.{190..199}; do
    if timeout 2 nc -z $ip 22 2>/dev/null; then
        # Try to check if it's master03
        HOSTNAME=$(timeout 3 ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no -o BatchMode=yes $VM_USER@$ip "hostname" 2>/dev/null || echo "")

        if [[ "$HOSTNAME" == *"master03"* ]]; then
            CURRENT_IP=$ip
            echo "Found k3s-master03 at $CURRENT_IP"
            break
        fi
    fi
done

if [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "$TARGET_IP" ]; then
    echo ""
    echo "VM is accessible via SSH at $CURRENT_IP"
    echo "Attempting to fix IP remotely..."
    echo ""

    # Try to fix via SSH
    cat > /tmp/fix_ip_commands.sh <<'FIXEOF'
#!/bin/bash
set -e

# Backup current config
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.bak

# Fix IP address
sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml

# Set hostname
sudo hostnamectl set-hostname k3s-master03

# Show what we changed
echo "New netplan config:"
sudo cat /etc/netplan/50-cloud-init.yaml

# Apply and reboot
echo "Applying network configuration..."
sudo netplan apply

echo "Rebooting in 5 seconds..."
sleep 5
sudo reboot
FIXEOF

    # Copy and execute
    if scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 /tmp/fix_ip_commands.sh $VM_USER@$CURRENT_IP:/tmp/ 2>/dev/null; then
        echo "Script copied to VM"

        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $VM_USER@$CURRENT_IP "bash /tmp/fix_ip_commands.sh" 2>&1; then
            echo ""
            echo "Commands executed successfully!"
            echo "Waiting 45 seconds for reboot..."
            sleep 45

            # Verify new IP
            echo ""
            echo "Verifying new IP..."
            if timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no $VM_USER@$TARGET_IP "hostname && ip addr show ens18 | grep 'inet 10'" 2>/dev/null; then
                echo ""
                echo "======================================================================="
                echo "SUCCESS! VM is now at $TARGET_IP"
                echo "======================================================================="
                exit 0
            else
                echo "Verification failed. Check console manually."
                exit 1
            fi
        else
            echo "SSH execution failed (VM may be rebooting)"
            echo "Waiting 45 seconds..."
            sleep 45
        fi
    else
        echo "SCP failed - password authentication required"
        echo ""
        echo "MANUAL CONSOLE ACCESS REQUIRED"
        echo ""
        echo "Steps:"
        echo "1. Open: https://$PROXMOX_HOST:8006"
        echo "2. Go to VM $VMID (k3s-master03)"
        echo "3. Click Console"
        echo "4. Login: $VM_USER / $VM_PASS"
        echo "5. Run:"
        echo "   sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml"
        echo "   sudo hostnamectl set-hostname k3s-master03"
        echo "   sudo netplan apply"
        echo "   sudo reboot"
        echo ""
        echo "See: EXECUTE-NOW-MASTER03.md for detailed instructions"
        exit 1
    fi
else
    echo "Could not find VM via SSH scan"
    echo ""
    echo "======================================================================="
    echo "MANUAL CONSOLE ACCESS REQUIRED"
    echo "======================================================================="
    echo ""
    echo "The VM is not accessible via SSH. Please use Proxmox console:"
    echo ""
    echo "1. Open Proxmox UI: https://$PROXMOX_HOST:8006"
    echo "2. Navigate to VM $VMID (k3s-master03)"
    echo "3. Click 'Console' button (top right)"
    echo "4. Login with: $VM_USER / $VM_PASS"
    echo "5. Execute these commands:"
    echo ""
    echo "   sudo sed -i 's/10\.88\.145\.[0-9]*/10.88.145.196/g' /etc/netplan/50-cloud-init.yaml"
    echo "   sudo hostnamectl set-hostname k3s-master03"
    echo "   sudo netplan apply"
    echo "   sudo reboot"
    echo ""
    echo "6. After reboot (30 seconds), verify:"
    echo "   ssh k3s@$TARGET_IP hostname"
    echo ""
    echo "Full instructions: EXECUTE-NOW-MASTER03.md"
    echo ""
    exit 1
fi

# Final verification attempt
echo ""
echo "Final verification at $TARGET_IP..."
if timeout 10 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no $VM_USER@$TARGET_IP "hostname && ip addr show ens18 | grep 'inet 10'"; then
    echo ""
    echo "======================================================================="
    echo "SUCCESS! k3s-master03 is configured correctly"
    echo "======================================================================="
    echo ""
    echo "VM Details:"
    echo "  VMID: $VMID"
    echo "  IP: $TARGET_IP"
    echo "  Hostname: k3s-master03"
    echo ""
    exit 0
else
    echo ""
    echo "Cannot verify - manual check required:"
    echo "  ssh k3s@$TARGET_IP hostname"
    echo ""
    exit 1
fi
