#!/bin/bash
# Parallel IP fix for K3s VMs - Instructions and verification

echo "================================================================"
echo "K3s VM IP Fix - Parallel Console Guide"
echo "================================================================"
echo ""
echo "You need to fix 4 VMs simultaneously using Proxmox console."
echo ""
echo "Open Proxmox UI: https://10.88.140.164:8006"
echo ""
echo "Open 4 console windows (one for each VM) and run commands in parallel:"
echo ""
echo "================================================================"
echo "VM 303 (k3s-master02) -> 10.88.145.193"
echo "================================================================"
cat << 'EOF'
sudo sed -i 's/- 10\.88\.145\.190/- 10.88.145.193/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master02
sudo netplan apply && sudo reboot
EOF

echo ""
echo "================================================================"
echo "VM 304 (k3s-worker03) -> 10.88.145.194"
echo "================================================================"
cat << 'EOF'
sudo sed -i 's/- 10\.88\.145\.191/- 10.88.145.194/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker03
sudo netplan apply && sudo reboot
EOF

echo ""
echo "================================================================"
echo "VM 305 (k3s-worker04) -> 10.88.145.195"
echo "================================================================"
cat << 'EOF'
sudo sed -i 's/- 10\.88\.145\.191/- 10.88.145.195/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-worker04
sudo netplan apply && sudo reboot
EOF

echo ""
echo "================================================================"
echo "VM 306 (k3s-master03) -> 10.88.145.196"
echo "================================================================"
cat << 'EOF'
sudo sed -i 's/- 10\.88\.145\.190/- 10.88.145.196/g' /etc/netplan/00-installer-config.yaml
sudo hostnamectl set-hostname k3s-master03
sudo netplan apply && sudo reboot
EOF

echo ""
echo "================================================================"
echo "After all VMs reboot, run this script again with 'verify' arg"
echo "================================================================"
echo ""

if [ "$1" == "verify" ]; then
    echo "Verifying SSH connectivity..."
    echo ""

    declare -A VMS
    VMS[303]="k3s-master02:10.88.145.193"
    VMS[304]="k3s-worker03:10.88.145.194"
    VMS[305]="k3s-worker04:10.88.145.195"
    VMS[306]="k3s-master03:10.88.145.196"

    ALL_OK=true

    for vmid in "${!VMS[@]}"; do
        IFS=':' read -r name ip <<< "${VMS[$vmid]}"
        echo -n "Testing $name ($ip)... "

        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no k3s@${ip} "hostname" 2>/dev/null | grep -q "$name"; then
            echo "SUCCESS"
        else
            echo "FAILED"
            ALL_OK=false
        fi
    done

    echo ""

    if $ALL_OK; then
        echo "All VMs accessible! Ready to join cluster."
        exit 0
    else
        echo "Some VMs still have issues. Check manually."
        exit 1
    fi
fi
