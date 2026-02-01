#!/bin/bash
#
# Wazuh Integration Deployment Script for Cortex
# Deploys all Wazuh security monitoring components
#
# Usage: ./deploy-wazuh-integration.sh [options]
#
# Options:
#   --wazuh-ip IP          Wazuh manager IP (default: 10.88.140.202)
#   --namespace NS         Kubernetes namespace (default: cortex-monitoring)
#   --skip-manager         Skip deploying rules to Wazuh manager
#   --skip-agents          Skip deploying Wazuh agents
#   --skip-exporter        Skip deploying Prometheus exporter
#   --skip-webhook         Skip deploying Alertmanager webhook
#   --dry-run              Show what would be deployed without deploying
#   --help                 Show this help message
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
WAZUH_IP="${WAZUH_IP:-10.88.140.202}"
NAMESPACE="${NAMESPACE:-cortex-monitoring}"
SKIP_MANAGER=false
SKIP_AGENTS=false
SKIP_EXPORTER=false
SKIP_WEBHOOK=false
DRY_RUN=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -n 20 "$0" | tail -n +2 | sed 's/^# //'
    exit 0
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster."
        exit 1
    fi

    # Check ssh access to Wazuh manager (if not skipping)
    if [ "$SKIP_MANAGER" = false ]; then
        if ! ssh -q -o BatchMode=yes -o ConnectTimeout=5 root@"$WAZUH_IP" exit 2>/dev/null; then
            log_warning "Cannot SSH to Wazuh manager at $WAZUH_IP. Use --skip-manager to skip."
            log_warning "You will need to manually deploy rules and decoders."
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            SKIP_MANAGER=true
        fi
    fi

    log_success "Prerequisites check passed"
}

create_namespace() {
    log_info "Creating namespace: $NAMESPACE"

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would create namespace: $NAMESPACE"
        return
    fi

    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace "$NAMESPACE"
        kubectl label namespace "$NAMESPACE" monitoring=wazuh
        log_success "Namespace $NAMESPACE created"
    fi
}

deploy_wazuh_manager_config() {
    if [ "$SKIP_MANAGER" = true ]; then
        log_warning "Skipping Wazuh manager configuration"
        return
    fi

    log_info "Deploying custom rules and decoders to Wazuh manager..."

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would deploy rules and decoders to $WAZUH_IP"
        return
    fi

    # Backup existing rules if they exist
    log_info "Creating backup of existing Cortex rules (if any)..."
    ssh root@"$WAZUH_IP" '
        if [ -f /var/ossec/etc/rules/cortex-rules.xml ]; then
            cp /var/ossec/etc/rules/cortex-rules.xml \
               /var/ossec/etc/rules/cortex-rules.xml.backup.$(date +%Y%m%d-%H%M%S)
        fi
    ' || true

    # Copy rules
    log_info "Copying custom rules..."
    scp "$SCRIPT_DIR/wazuh-cortex-rules.xml" \
        root@"$WAZUH_IP":/var/ossec/etc/rules/cortex-rules.xml

    # Copy decoders
    log_info "Copying custom decoders..."
    scp "$SCRIPT_DIR/wazuh-cortex-decoders.xml" \
        root@"$WAZUH_IP":/var/ossec/etc/decoders/cortex-decoders.xml

    # Set permissions
    log_info "Setting permissions..."
    ssh root@"$WAZUH_IP" '
        chown wazuh:wazuh /var/ossec/etc/rules/cortex-rules.xml
        chown wazuh:wazuh /var/ossec/etc/decoders/cortex-decoders.xml
        chmod 640 /var/ossec/etc/rules/cortex-rules.xml
        chmod 640 /var/ossec/etc/decoders/cortex-decoders.xml
    '

    # Restart Wazuh manager
    log_info "Restarting Wazuh manager to load new rules..."
    ssh root@"$WAZUH_IP" 'systemctl restart wazuh-manager'

    # Wait for manager to be ready
    log_info "Waiting for Wazuh manager to be ready..."
    sleep 10

    # Verify rules loaded
    log_info "Verifying rules loaded..."
    if ssh root@"$WAZUH_IP" 'grep -q "100100" /var/ossec/logs/ossec.log'; then
        log_success "Custom rules and decoders deployed successfully"
    else
        log_warning "Rules may not have loaded correctly. Check Wazuh manager logs."
    fi
}

deploy_wazuh_agents() {
    if [ "$SKIP_AGENTS" = true ]; then
        log_warning "Skipping Wazuh agent deployment"
        return
    fi

    log_info "Deploying Wazuh agents as DaemonSet..."

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would deploy Wazuh agents DaemonSet"
        return
    fi

    # Create ConfigMap from agent config
    log_info "Creating agent ConfigMap..."
    kubectl create configmap wazuh-agent-config \
        -n "$NAMESPACE" \
        --from-file=ossec.conf="$SCRIPT_DIR/wazuh-agent-config.yaml" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Create DaemonSet
    log_info "Creating Wazuh agent DaemonSet..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: wazuh-agent
  namespace: $NAMESPACE
  labels:
    app: wazuh-agent
    component: security-monitoring
spec:
  selector:
    matchLabels:
      app: wazuh-agent
  template:
    metadata:
      labels:
        app: wazuh-agent
        component: security-monitoring
    spec:
      hostNetwork: true
      hostPID: true
      containers:
      - name: wazuh-agent
        image: wazuh/wazuh-agent:4.7.0
        env:
        - name: WAZUH_MANAGER
          value: "$WAZUH_IP"
        - name: WAZUH_AGENT_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: WAZUH_AGENT_GROUP
          value: "cortex,kubernetes,k3s"
        volumeMounts:
        - name: cortex-logs
          mountPath: /var/log/cortex
          readOnly: true
        - name: k8s-audit
          mountPath: /var/log/kubernetes
          readOnly: true
        - name: host-root
          mountPath: /host
          readOnly: true
        - name: etc-cortex
          mountPath: /etc/cortex
          readOnly: true
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        securityContext:
          privileged: true
      volumes:
      - name: cortex-logs
        hostPath:
          path: /var/log/cortex
          type: DirectoryOrCreate
      - name: k8s-audit
        hostPath:
          path: /var/log/kubernetes
          type: DirectoryOrCreate
      - name: host-root
        hostPath:
          path: /
      - name: etc-cortex
        hostPath:
          path: /etc/cortex
          type: DirectoryOrCreate
EOF

    log_success "Wazuh agents deployed"

    # Wait for agents to start
    log_info "Waiting for agents to start..."
    kubectl rollout status daemonset/wazuh-agent -n "$NAMESPACE" --timeout=120s

    # Show agent status
    log_info "Agent pods status:"
    kubectl get pods -n "$NAMESPACE" -l app=wazuh-agent
}

deploy_prometheus_exporter() {
    if [ "$SKIP_EXPORTER" = true ]; then
        log_warning "Skipping Prometheus exporter deployment"
        return
    fi

    log_info "Deploying Prometheus Wazuh exporter..."

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would deploy Prometheus Wazuh exporter"
        return
    fi

    # Prompt for Wazuh API credentials
    if [ ! -f "$HOME/.wazuh-credentials" ]; then
        log_warning "Wazuh API credentials not found"
        read -p "Enter Wazuh API username (default: cortex-prometheus): " WAZUH_USER
        WAZUH_USER=${WAZUH_USER:-cortex-prometheus}
        read -s -p "Enter Wazuh API password: " WAZUH_PASS
        echo

        # Save credentials (optional)
        read -p "Save credentials to ~/.wazuh-credentials? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "WAZUH_USER=$WAZUH_USER" > "$HOME/.wazuh-credentials"
            echo "WAZUH_PASS=$WAZUH_PASS" >> "$HOME/.wazuh-credentials"
            chmod 600 "$HOME/.wazuh-credentials"
        fi
    else
        source "$HOME/.wazuh-credentials"
    fi

    # Create API credentials secret
    log_info "Creating Wazuh API credentials secret..."
    kubectl create secret generic wazuh-api-credentials \
        -n "$NAMESPACE" \
        --from-literal=username="$WAZUH_USER" \
        --from-literal=password="$WAZUH_PASS" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Deploy exporter
    log_info "Deploying Wazuh exporter..."
    kubectl apply -f "$SCRIPT_DIR/prometheus-wazuh-exporter.yaml"

    log_success "Prometheus Wazuh exporter deployed"

    # Wait for deployment
    log_info "Waiting for exporter to be ready..."
    kubectl rollout status deployment/wazuh-exporter -n "$NAMESPACE" --timeout=120s

    # Show exporter status
    log_info "Exporter pods status:"
    kubectl get pods -n "$NAMESPACE" -l app=wazuh-exporter
}

deploy_alertmanager_webhook() {
    if [ "$SKIP_WEBHOOK" = true ]; then
        log_warning "Skipping Alertmanager webhook deployment"
        return
    fi

    log_info "Deploying Alertmanager webhook receiver..."

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would deploy Alertmanager webhook receiver"
        return
    fi

    # Generate webhook password
    WEBHOOK_PASS=$(openssl rand -base64 32)

    # Create webhook credentials secret
    log_info "Creating webhook credentials secret..."
    kubectl create secret generic wazuh-webhook-credentials \
        -n "$NAMESPACE" \
        --from-literal=password="$WEBHOOK_PASS" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Deploy webhook forwarder
    log_info "Deploying webhook forwarder..."
    kubectl apply -f "$SCRIPT_DIR/alertmanager-wazuh-receiver.yaml"

    log_success "Alertmanager webhook receiver deployed"

    # Wait for deployment
    log_info "Waiting for webhook forwarder to be ready..."
    kubectl rollout status deployment/wazuh-webhook-forwarder -n "$NAMESPACE" --timeout=120s || true

    # Show webhook status
    log_info "Webhook forwarder pods status:"
    kubectl get pods -n "$NAMESPACE" -l app=wazuh-webhook-forwarder

    log_warning "Remember to update Alertmanager configuration with Wazuh receiver"
    log_info "See alertmanager-wazuh-receiver.yaml for configuration example"
}

verify_deployment() {
    log_info "Verifying deployment..."

    echo ""
    log_info "=== Deployment Summary ==="
    echo ""

    # Check agents
    if [ "$SKIP_AGENTS" = false ]; then
        log_info "Wazuh Agents:"
        kubectl get daemonset wazuh-agent -n "$NAMESPACE" || log_warning "Agents not deployed"
    fi

    # Check exporter
    if [ "$SKIP_EXPORTER" = false ]; then
        log_info "Prometheus Exporter:"
        kubectl get deployment wazuh-exporter -n "$NAMESPACE" || log_warning "Exporter not deployed"
    fi

    # Check webhook
    if [ "$SKIP_WEBHOOK" = false ]; then
        log_info "Webhook Forwarder:"
        kubectl get deployment wazuh-webhook-forwarder -n "$NAMESPACE" || log_warning "Webhook not deployed"
    fi

    echo ""
    log_info "=== Next Steps ==="
    echo ""
    echo "1. Verify agents connected to Wazuh manager:"
    echo "   ssh root@$WAZUH_IP '/var/ossec/bin/agent_control -l'"
    echo ""
    echo "2. Check Prometheus metrics:"
    echo "   kubectl port-forward -n $NAMESPACE svc/wazuh-exporter 9140:9140"
    echo "   curl http://localhost:9140/metrics | grep wazuh_"
    echo ""
    echo "3. View Wazuh dashboard:"
    echo "   https://$WAZUH_IP:5601"
    echo ""
    echo "4. Update Alertmanager configuration with Wazuh receiver"
    echo "   See: alertmanager-wazuh-receiver.yaml"
    echo ""
    echo "5. Review README.md for configuration and tuning guidance"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --wazuh-ip)
            WAZUH_IP="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --skip-manager)
            SKIP_MANAGER=true
            shift
            ;;
        --skip-agents)
            SKIP_AGENTS=true
            shift
            ;;
        --skip-exporter)
            SKIP_EXPORTER=true
            shift
            ;;
        --skip-webhook)
            SKIP_WEBHOOK=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# Main execution
main() {
    log_info "Starting Wazuh integration deployment for Cortex"
    log_info "Wazuh Manager: $WAZUH_IP"
    log_info "Namespace: $NAMESPACE"

    if $DRY_RUN; then
        log_warning "DRY-RUN MODE: No changes will be made"
    fi

    check_prerequisites
    create_namespace
    deploy_wazuh_manager_config
    deploy_wazuh_agents
    deploy_prometheus_exporter
    deploy_alertmanager_webhook
    verify_deployment

    log_success "Wazuh integration deployment completed!"
}

# Run main
main
