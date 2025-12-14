#!/bin/bash

PROXMOX_TOKEN="root@pam!cortex-k3s-display=7e74841c-0eb1-4181-8926-aaa9f0103c58"

echo "=== Testing cortex-k3s-display Token ==="
echo ""

echo "Test 1: VM Status (basic permission)"
curl -k -s -X GET \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/status/current" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" | jq '{status: .data.status}'

echo ""
echo "Test 2: Guest Agent Info"
curl -k -s -X GET \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/info" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" | jq .

echo ""
echo "Test 3: Guest Agent Exec"
curl -k -s -X POST \
  "https://10.88.140.164:8006/api2/json/nodes/pve01/qemu/310/agent/exec" \
  -H "Authorization: PVEAPIToken=$PROXMOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":["echo","hello from guest agent"]}' | jq .
