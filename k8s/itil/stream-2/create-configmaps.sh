#!/bin/bash
set -e

NAMESPACE="cortex-itil-stream2"

# Create namespace first
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap for SLA Predictor
kubectl create configmap sla-predictor-code \
  --from-file=/Users/ryandahlberg/Projects/cortex/k8s/itil/stream-2/sla-management/sla-predictor.py \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap for Business Metrics
kubectl create configmap business-metrics-code \
  --from-file=/Users/ryandahlberg/Projects/cortex/k8s/itil/stream-2/business-metrics/business-metrics-collector.py \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap for Availability Risk
kubectl create configmap availability-risk-code \
  --from-file=/Users/ryandahlberg/Projects/cortex/k8s/itil/stream-2/availability-risk/availability-risk-engine.py \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

echo "ConfigMaps created successfully"
