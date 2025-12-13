#!/bin/bash
# List VMs on Proxmox

PROXMOX_HOST="10.88.140.151"
PROXMOX_PORT="8006"
PROXMOX_NODE="pve"
PROXMOX_TOKEN="root@pam!n8n=b8cc165f-0153-43bb-a48a-5d7459587ca7"

curl -k -s -X GET \
  -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN}" \
  "https://${PROXMOX_HOST}:${PROXMOX_PORT}/api2/json/nodes/${PROXMOX_NODE}/qemu"
