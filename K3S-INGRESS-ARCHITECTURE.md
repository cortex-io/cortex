# K3s Cluster Ingress Architecture

## Overview
Dedicated Tailscale subnet router providing secure external access to k3s cluster services.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tailscale Network                          │
│                      (100.x.x.x range)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ k3s-cluster-ingress  │
                  │  VM 350              │
                  │                      │
                  │  Local: 10.88.145.199│
                  │  Tailscale: 100.109. │
                  │            106.65    │
                  │                      │
                  │  iptables NAT:       │
                  │  80 → 10.88.145.200  │
                  │  443 → 10.88.145.200 │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Traefik Ingress     │
                  │  LoadBalancer        │
                  │  10.88.145.200       │
                  │  (MetalLB)           │
                  └──────────┬───────────┘
                             │
                             ▼
              ┌──────────────┴──────────────┐
              │                             │
         ┌────▼────┐                  ┌─────▼─────┐
         │ cortex- │                  │   Other   │
         │  chat   │                  │  Services │
         │ Service │                  │           │
         └─────────┘                  └───────────┘
```

## Components

### 1. k3s-cluster-ingress VM
**VMID:** 350
**Name:** k3s-cluster-ingress
**IP Address:** 10.88.145.199
**Tailscale IP:** 100.109.106.65
**OS:** Ubuntu 24.04 LTS
**Credentials:** k3s / toor

**Installed Software:**
- Tailscale 1.92.3
- iptables-persistent
- netfilter-persistent

**Configuration:**
- IP forwarding enabled (`net.ipv4.ip_forward=1`)
- Tailscale subnet router advertising:
  - 10.88.145.0/24 (k3s cluster network)
  - 10.42.0.0/16 (k3s pod network)
  - 10.43.0.0/16 (k3s service network)

**Port Forwarding Rules:**
```bash
# PREROUTING (DNAT)
iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443

# POSTROUTING (MASQUERADE)
iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 80 -j MASQUERADE
iptables -t nat -A POSTROUTING -d 10.88.145.200 -p tcp --dport 443 -j MASQUERADE
```

### 2. Traefik Ingress Controller
**IP Address:** 10.88.145.200 (MetalLB LoadBalancer)
**Ports:** 80 (HTTP), 443 (HTTPS)
**Purpose:** Kubernetes ingress controller routing traffic to services

### 3. K3s Cluster
**Master Nodes:**
- k3s-master01: 10.88.145.190
- k3s-master02: 10.88.145.193
- k3s-master03: 10.88.145.196

**Worker Nodes:**
- k3s-worker01-04: Various IPs in 10.88.145.0/24 range

**Network Ranges:**
- Cluster Network: 10.88.145.0/24
- Pod Network: 10.42.0.0/16
- Service Network: 10.43.0.0/16

## Traffic Flow

### Inbound Request (e.g., http://chat.ry-ops.dev)

1. **DNS Resolution:**
   - chat.ry-ops.dev → 100.109.106.65 (Tailscale IP)

2. **Tailscale Routing:**
   - Client on Tailscale network connects to 100.109.106.65
   - Traffic arrives on tailscale0 interface

3. **iptables DNAT:**
   - Request hits PREROUTING chain
   - Port 80/443 traffic is DNAT'd to 10.88.145.200
   - Destination IP rewritten to Traefik LoadBalancer

4. **Traefik Routing:**
   - Traefik receives request with Host header
   - Matches IngressRoute for chat.ry-ops.dev
   - Forwards to cortex-chat service

5. **Service Response:**
   - cortex-chat service responds
   - Traefik forwards response back
   - iptables MASQUERADE ensures return traffic routes correctly
   - Response sent back through Tailscale to client

## DNS Configuration

**Required DNS Record:**
```
chat.ry-ops.dev  A  100.109.106.65
```

## Security Considerations

### Separation of Concerns
- Ingress VM is separate from k3s cluster nodes
- No Tailscale running on k3s nodes (eliminated double NAT)
- Single point of entry for all external traffic

### Network Isolation
- Ingress VM only forwards ports 80 and 443
- All other traffic blocked by default
- k3s cluster remains isolated on private network

### Benefits
- Clean architecture with clear traffic flow
- Easy to monitor and troubleshoot
- Can easily disable external access by stopping ingress VM
- No performance impact on k3s cluster nodes

## Maintenance

### Restart Services
```bash
# Restart Tailscale
ssh k3s@10.88.145.199
sudo systemctl restart tailscaled

# Reload iptables rules
sudo netfilter-persistent reload
```

### Verify Configuration
```bash
# Check Tailscale status
ssh k3s@10.88.145.199 'tailscale status'

# Check IP forwarding
ssh k3s@10.88.145.199 'cat /proc/sys/net/ipv4/ip_forward'

# Check iptables rules
ssh k3s@10.88.145.199 'sudo iptables -t nat -L -n -v'

# Test Traefik connectivity
curl -I http://10.88.145.200 -H "Host: chat.ry-ops.dev"
```

### Troubleshooting

**502 Bad Gateway:**
- Check Traefik is running: `kubectl get svc -n kube-system traefik`
- Verify LoadBalancer IP: Should be 10.88.145.200
- Check iptables rules are active
- Verify IP forwarding is enabled

**Can't reach chat.ry-ops.dev:**
- Verify DNS record points to 100.109.106.65
- Check Tailscale subnet routes are approved
- Ensure ingress VM is running
- Verify Tailscale is connected: `tailscale status`

**Traffic not routing:**
- Check iptables NAT rules: `sudo iptables -t nat -L -n -v`
- Verify counters are incrementing (pkts/bytes columns)
- Check IP forwarding: `cat /proc/sys/net/ipv4/ip_forward`

## Cleanup: Old Configuration

The old k3s-cluster-ingress (100.81.79.19) should be removed:
1. Go to https://login.tailscale.com/admin/machines
2. Find "k3s-cluster-ingress" (100.81.79.19)
3. Delete it

This was actually one of the k3s nodes running Tailscale, causing double NAT issues.

## Summary

This architecture provides:
- ✅ Clean separation between external access and k3s cluster
- ✅ Single point of entry for security and monitoring
- ✅ No performance impact on k3s nodes
- ✅ Easy to manage and troubleshoot
- ✅ Scalable (can add more services without changing ingress)

**Status:** Fully operational as of 2025-12-25
