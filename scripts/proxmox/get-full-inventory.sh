#!/bin/bash
# Get full Proxmox inventory

PROXMOX_HOST="10.88.140.164"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve"
PROXMOX_TOKEN="root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7"

API_BASE="https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json"
AUTH_HEADER="Authorization: PVEAPIToken=${PROXMOX_TOKEN}"

echo "=========================================="
echo "PROXMOX INFRASTRUCTURE INVENTORY"
echo "Host: ${PROXMOX_HOST}:${PROXMOX_PORT}"
echo "Node: ${PROXMOX_NODE}"
echo "=========================================="
echo ""

# Get Proxmox version
echo "=== PROXMOX VERSION ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/version" | jq -r '.data | "Version: \(.version)\nRelease: \(.release)"'
echo ""

# Get node status
echo "=== NODE STATUS ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/status" | jq '.data'
echo ""

# Get all VMs (QEMU)
echo "=== VIRTUAL MACHINES (QEMU) ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/qemu" | jq -r '.data[] | "VMID: \(.vmid) | Name: \(.name) | Status: \(.status) | CPU: \(.cpus) | RAM: \(.maxmem/1024/1024/1024)GB | Disk: \(.maxdisk/1024/1024/1024)GB"'
echo ""

# Get all containers (LXC)
echo "=== CONTAINERS (LXC) ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/lxc" | jq -r '.data[] | "CTID: \(.vmid) | Name: \(.name) | Status: \(.status) | CPU: \(.cpus) | RAM: \(.maxmem/1024/1024/1024)GB | Disk: \(.maxdisk/1024/1024/1024)GB"'
echo ""

# Get storage info
echo "=== STORAGE ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/storage" | jq -r '.data[] | "Storage: \(.storage) | Type: \(.type) | Status: \(.status) | Avail: \(.avail/1024/1024/1024)GB / \(.total/1024/1024/1024)GB"'
echo ""

# Get network interfaces
echo "=== NETWORK INTERFACES ==="
curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/network" | jq -r '.data[] | select(.type != null) | "Interface: \(.iface) | Type: \(.type) | Active: \(.active // "N/A") | Address: \(.address // "N/A")"'
echo ""

# Get detailed VM info
echo "=== DETAILED VM/CONTAINER INFO ==="
VMLIST=$(curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/qemu" | jq -r '.data[].vmid')
for vmid in $VMLIST; do
    echo "--- VM ${vmid} ---"
    curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/qemu/${vmid}/config" | jq '.data'
done

CTLIST=$(curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/lxc" | jq -r '.data[].vmid')
for ctid in $CTLIST; do
    echo "--- Container ${ctid} ---"
    curl -k -s -H "${AUTH_HEADER}" "${API_BASE}/nodes/${PROXMOX_NODE}/lxc/${ctid}/config" | jq '.data'
done

echo ""
echo "=========================================="
echo "INVENTORY COMPLETE"
echo "=========================================="
