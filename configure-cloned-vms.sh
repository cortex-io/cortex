#!/bin/bash
#
# Configure Cloned K3s VMs
# Since the VMs are clones, they need new network configuration
#

echo "=============================================================================="
echo "  K3s Cloned VMs Network Configuration"
echo "=============================================================================="
echo ""
echo "The new VMs have been cloned and started. They need network reconfiguration."
echo ""
echo "OPTION 1: Use Proxmox Console (Manual)"
echo "----------------------------------------"
echo "For each new VM, open the Proxmox console and run:"
echo ""
echo "VM 303 (k3s-master02 -> 10.88.145.193):"
echo "  sudo hostnamectl set-hostname k3s-master02"
echo "  sudo nano /etc/netplan/50-cloud-init.yaml"
echo "  # Change IP to: 10.88.145.193/24"
echo "  sudo netplan apply"
echo ""
echo "VM 304 (k3s-worker03 -> 10.88.145.194):"
echo "  sudo hostnamectl set-hostname k3s-worker03"
echo "  sudo nano /etc/netplan/50-cloud-init.yaml"
echo "  # Change IP to: 10.88.145.194/24"
echo "  sudo netplan apply"
echo ""
echo "VM 305 (k3s-worker04 -> 10.88.145.195):"
echo "  sudo hostnamectl set-hostname k3s-worker04"
echo "  sudo nano /etc/netplan/50-cloud-init.yaml"
echo "  # Change IP to: 10.88.145.195/24"
echo "  sudo netplan apply"
echo ""
echo "VM 306 (k3s-master03 -> 10.88.145.196):"
echo "  sudo hostnamectl set-hostname k3s-master03"
echo "  sudo nano /etc/netplan/50-cloud-init.yaml"
echo "  # Change IP to: 10.88.145.196/24"
echo "  sudo netplan apply"
echo ""
echo ""
echo "OPTION 2: Auto-configure (if you know the current IPs)"
echo "--------------------------------------------------------"
echo ""

read -p "Do you want to auto-configure? (requires knowing current IPs) [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please configure manually via Proxmox console."
    exit 0
fi

echo ""
echo "Enter the current IP addresses for each VM:"
echo "(Press Enter to skip a VM)"

# VM 303
read -p "k3s-master02 (VMID 303) current IP: " IP303
if [ -n "$IP303" ]; then
    echo "Configuring k3s-master02..."
    ssh -o StrictHostKeyChecking=no k3s@$IP303 "sudo hostnamectl set-hostname k3s-master02"
    ssh -o StrictHostKeyChecking=no k3s@$IP303 "echo 'network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.193/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    echo "k3s-master02 configured with IP 10.88.145.193"
fi

# VM 304
read -p "k3s-worker03 (VMID 304) current IP: " IP304
if [ -n "$IP304" ]; then
    echo "Configuring k3s-worker03..."
    ssh -o StrictHostKeyChecking=no k3s@$IP304 "sudo hostnamectl set-hostname k3s-worker03"
    ssh -o StrictHostKeyChecking=no k3s@$IP304 "echo 'network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.194/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    echo "k3s-worker03 configured with IP 10.88.145.194"
fi

# VM 305
read -p "k3s-worker04 (VMID 305) current IP: " IP305
if [ -n "$IP305" ]; then
    echo "Configuring k3s-worker04..."
    ssh -o StrictHostKeyChecking=no k3s@$IP305 "sudo hostnamectl set-hostname k3s-worker04"
    ssh -o StrictHostKeyChecking=no k3s@$IP305 "echo 'network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.195/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    echo "k3s-worker04 configured with IP 10.88.145.195"
fi

# VM 306
read -p "k3s-master03 (VMID 306) current IP: " IP306
if [ -n "$IP306" ]; then
    echo "Configuring k3s-master03..."
    ssh -o StrictHostKeyChecking=no k3s@$IP306 "sudo hostnamectl set-hostname k3s-master03"
    ssh -o StrictHostKeyChecking=no k3s@$IP306 "echo 'network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 10.88.145.196/24
      routes:
        - to: default
          via: 10.88.145.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
' | sudo tee /etc/netplan/50-cloud-init.yaml && sudo netplan apply"
    echo "k3s-master03 configured with IP 10.88.145.196"
fi

echo ""
echo "Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Verify connectivity to all new IPs"
echo "2. Run the finalize-k3s-cluster.py script to join nodes to cluster"
