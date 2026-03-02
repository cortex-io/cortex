#!/bin/bash
# Update SMS relay with latest code changes
set -e

echo "Updating ConfigMaps with latest source code..."

# Update main source ConfigMap
kubectl create configmap sms-relay-src \
  --from-file=main.py=src/main.py \
  --from-file=config.py=src/config.py \
  --from-file=state.py=src/state.py \
  --from-file=sms.py=src/sms.py \
  --from-file=formatters.py=src/formatters.py \
  --from-file=__init__.py=src/__init__.py \
  --dry-run=client -o yaml | kubectl apply -f -

# Update integrations ConfigMap (removed claude.py, added cortex.py)
kubectl create configmap sms-relay-integrations \
  --from-file=unifi.py=src/integrations/unifi.py \
  --from-file=proxmox.py=src/integrations/proxmox.py \
  --from-file=k8s.py=src/integrations/k8s.py \
  --from-file=security.py=src/integrations/security.py \
  --from-file=cortex.py=src/integrations/cortex.py \
  --from-file=__init__.py=src/integrations/__init__.py \
  --dry-run=client -o yaml | kubectl apply -f -

# Update menus ConfigMap
kubectl create configmap sms-relay-menus \
  --from-file=home.py=src/menus/home.py \
  --from-file=network.py=src/menus/network.py \
  --from-file=proxmox.py=src/menus/proxmox.py \
  --from-file=k8s.py=src/menus/k8s.py \
  --from-file=security.py=src/menus/security.py \
  --from-file=__init__.py=src/menus/__init__.py \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Restarting SMS relay deployment..."
kubectl rollout restart deployment/sms-relay

echo "Waiting for rollout to complete..."
kubectl rollout status deployment/sms-relay --timeout=60s

echo ""
echo "Deployment updated successfully!"
echo "Check logs: kubectl logs -f deployment/sms-relay"
