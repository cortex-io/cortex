# Network Diagnosis - chat.ry-ops.dev Access Issue

## Problem Summary

**Symptom:** http://chat.ry-ops.dev returns 502 Bad Gateway
**Root Cause:** Double NAT/Proxy issue with Tailscale + k3s Traefik ingress

---

## Current Network Topology

```
Internet/Tailscale Network (100.x.x.x)
           │
           ├─> chat.ry-ops.dev → 100.81.79.19 (Tailscale Node)
           │                          │
           │                          ├─> nginx proxy (on Tailscale node?)
           │                          │        │
           │                          │        └─> ??? (502 Bad Gateway)
           │
           └─> k3s Cluster Network (10.88.145.x)
                    │
                    └─> 10.88.145.200 (Traefik LoadBalancer)
                             │
                             └─> Traefik Ingress ✓ WORKS
                                      │
                                      └─> cortex-chat pod (10.42.3.249)
                                               ├─> nginx-proxy :80
                                               ├─> frontend :3000
                                               └─> backend :8080
```

---

## Test Results

### ✓ Direct Access to Traefik LoadBalancer (WORKS)
```bash
$ curl -I http://10.88.145.200 -H "Host: chat.ry-ops.dev"
HTTP/1.1 200 OK
Server: nginx/1.29.4
Content-Type: text/html
Content-Length: 66288
```

### ✗ Access via chat.ry-ops.dev (FAILS)
```bash
$ curl -I http://chat.ry-ops.dev
HTTP/1.1 502 Bad Gateway
Server: nginx/1.29.4
```

### DNS Resolution
```bash
$ dig +short chat.ry-ops.dev
100.81.79.19  ← Tailscale IP, NOT the k3s LoadBalancer
```

---

## Issues Identified

### 1. DNS Misconfiguration
- **Current:** `chat.ry-ops.dev` → `100.81.79.19` (Tailscale node)
- **Should be:** `chat.ry-ops.dev` → `10.88.145.200` (Traefik LoadBalancer)

### 2. Double Proxy Layer
- Request hits Tailscale node's nginx first
- That nginx tries to proxy to backend (fails with 502)
- Should go directly to Traefik ingress

### 3. Redundant Storage Issues (Side Problem)
- Redis pod stuck: `FailedAttachVolume` (CSI/Longhorn issue)
- Docker registry pod stuck: Same CSI attachment issue
- These are likely related to Longhorn having issues on one of the k3s nodes

---

## Solution Options

### Option 1: Remove Tailscale from k3s Nodes (RECOMMENDED)
**Pros:**
- Simplifies network topology
- Eliminates double NAT/proxy
- k3s cluster handles ingress natively via Traefik
- Only use Tailscale for accessing the cluster externally (k3s-cluster-ingress)

**Cons:**
- Individual nodes not directly accessible via Tailscale

**Implementation:**
1. Remove Tailscale from each k3s node
2. Keep only `k3s-cluster-ingress` Tailscale node
3. Update DNS: `chat.ry-ops.dev` → `10.88.145.200` (or k3s-cluster-ingress Tailscale IP)
4. Ensure `k3s-cluster-ingress` properly forwards to Traefik

### Option 2: Fix Tailscale Node Routing
**Pros:**
- Keep Tailscale on all nodes
- Maintain direct node access

**Cons:**
- More complex routing
- Requires proper proxy configuration on each Tailscale node
- Higher chance of conflicts

**Implementation:**
1. Configure nginx on Tailscale node (100.81.79.19) to properly proxy to Traefik
2. OR: Update DNS to point to k3s-cluster-ingress instead
3. Ensure Tailscale subnet router properly forwards traffic

### Option 3: Use k3s-cluster-ingress as Primary Entry Point
**Pros:**
- Centralized ingress point
- Tailscale still provides VPN access
- Traefik handles all HTTP routing

**Cons:**
- Single point of entry (can be HA later)

**Implementation:**
1. Identify k3s-cluster-ingress Tailscale IP
2. Update DNS: `chat.ry-ops.dev` → k3s-cluster-ingress IP
3. Configure k3s-cluster-ingress to forward port 80/443 to Traefik (10.88.145.200)

---

## Recommended Approach: Option 1 + Option 3

**Step 1: Identify Current Tailscale Setup**
```bash
# On each k3s node
systemctl status tailscaled
tailscale status
```

**Step 2: Remove Tailscale from k3s Worker/Master Nodes**
```bash
# On each k3s node (NOT k3s-cluster-ingress)
sudo systemctl stop tailscaled
sudo systemctl disable tailscaled
sudo apt remove tailscale  # or yum remove on RHEL
```

**Step 3: Configure k3s-cluster-ingress as Subnet Router**
```bash
# On k3s-cluster-ingress node
tailscale up --advertise-routes=10.88.145.0/24,10.42.0.0/16,10.43.0.0/16 --accept-routes
```

**Step 4: Update DNS**
```bash
# Find k3s-cluster-ingress Tailscale IP
tailscale status | grep k3s-cluster-ingress

# Update DNS:
# chat.ry-ops.dev → <k3s-cluster-ingress-tailscale-ip>
# OR configure iptables forwarding on k3s-cluster-ingress:
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 10.88.145.200:80
sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 10.88.145.200:443
sudo iptables -t nat -A POSTROUTING -j MASQUERADE
```

**Step 5: Test Access**
```bash
curl -I http://chat.ry-ops.dev
# Should return 200 OK
```

---

## Alternative Quick Fix: Update DNS Only

If you want to keep current setup but just fix access:

```bash
# Option A: Point DNS to Traefik LoadBalancer directly
# Update DNS: chat.ry-ops.dev → 10.88.145.200
# (Only works if 10.88.145.200 is routable from your network)

# Option B: Point DNS to k3s-cluster-ingress
# Find the Tailscale IP of your k3s-cluster-ingress node
# Update DNS: chat.ry-ops.dev → <that IP>
# Configure forwarding on that node
```

---

## Additional Issue: Longhorn CSI Volume Attachment

While fixing the network, also address the volume attachment failures:

```bash
# Check Longhorn status
kubectl get pods -n longhorn-system

# Check which node has issues
kubectl get nodes -o wide

# The failing volumes are trying to attach to k3s-master03
# Check Longhorn health on that node
kubectl logs -n longhorn-system -l app=longhorn-manager --tail=50 | grep k3s-master03
```

---

## Summary

**Your suspicion is CORRECT**: You have a double NAT issue with Tailscale on nodes + k3s-cluster-ingress.

**Best Solution:**
1. Remove Tailscale from individual k3s nodes
2. Use ONLY k3s-cluster-ingress as the entry point
3. Configure it as a Tailscale subnet router
4. Update DNS to point to k3s-cluster-ingress OR configure port forwarding

This gives you:
- Simple network topology
- Tailscale VPN access to cluster
- Native k3s Traefik ingress handling
- No double proxy/NAT issues
