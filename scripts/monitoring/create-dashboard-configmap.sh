#!/bin/bash
# Create Grafana Dashboard ConfigMap from JSON files

NAMESPACE="monitoring"
CONFIGMAP_NAME="grafana-dashboards"
DASHBOARD_DIR="/Users/ryandahlberg/Projects/cortex/k8s/monitoring/dashboards"

echo "Creating ConfigMap $CONFIGMAP_NAME in namespace $NAMESPACE..."

kubectl create configmap $CONFIGMAP_NAME \
  --from-file=$DASHBOARD_DIR/cortex-autoscaling.json \
  --from-file=$DASHBOARD_DIR/cortex-masters.json \
  --from-file=$DASHBOARD_DIR/cortex-workers.json \
  --namespace=$NAMESPACE \
  --dry-run=client -o yaml > /Users/ryandahlberg/Projects/cortex/k8s/monitoring/grafana-dashboards-configmap.yaml

# Add labels
sed -i '' 's/metadata:/metadata:\n  labels:\n    app: grafana\n    grafana_dashboard: "1"/' /Users/ryandahlberg/Projects/cortex/k8s/monitoring/grafana-dashboards-configmap.yaml

echo "ConfigMap manifest created at k8s/monitoring/grafana-dashboards-configmap.yaml"
echo "Apply with: kubectl apply -f k8s/monitoring/grafana-dashboards-configmap.yaml"
