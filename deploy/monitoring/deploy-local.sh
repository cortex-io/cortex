#!/usr/bin/env bash
set -euo pipefail

# Cortex Monitoring Stack - Local Docker Compose Deployment
# Deploys Prometheus, Grafana, and AlertManager for local testing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "docker not found. Please install Docker."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose not found. Please install Docker Compose."
        exit 1
    fi
}

# Deploy stack
deploy_stack() {
    log_info "Deploying monitoring stack..."

    cd "$SCRIPT_DIR"
    docker-compose up -d

    log_info "Stack deployed successfully"
}

# Wait for services
wait_for_services() {
    log_info "Waiting for services to be ready..."

    # Wait for Prometheus
    log_info "Waiting for Prometheus..."
    for i in {1..30}; do
        if curl -s http://localhost:9090/-/ready > /dev/null 2>&1; then
            log_info "Prometheus is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Prometheus failed to start"
            exit 1
        fi
        sleep 2
    done

    # Wait for Grafana
    log_info "Waiting for Grafana..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            log_info "Grafana is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Grafana failed to start"
            exit 1
        fi
        sleep 2
    done

    # Wait for AlertManager
    log_info "Waiting for AlertManager..."
    for i in {1..30}; do
        if curl -s http://localhost:9093/-/ready > /dev/null 2>&1; then
            log_info "AlertManager is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "AlertManager failed to start"
            exit 1
        fi
        sleep 2
    done
}

# Display access information
display_info() {
    log_info "Deployment complete!"
    echo ""
    echo "Access information:"
    echo "  Prometheus:   http://localhost:9090"
    echo "  AlertManager: http://localhost:9093"
    echo "  Grafana:      http://localhost:3000 (admin/admin)"
    echo "  Node Exporter: http://localhost:9100"
    echo "  cAdvisor:     http://localhost:8080"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose -f $SCRIPT_DIR/docker-compose.yaml logs -f [service]"
    echo "  Stop stack:   docker-compose -f $SCRIPT_DIR/docker-compose.yaml down"
    echo "  Restart:      docker-compose -f $SCRIPT_DIR/docker-compose.yaml restart [service]"
    echo ""
}

# Show status
show_status() {
    log_info "Service status:"
    cd "$SCRIPT_DIR"
    docker-compose ps
}

# Main deployment
main() {
    log_info "Starting local cortex monitoring stack deployment..."

    check_prerequisites
    deploy_stack
    wait_for_services
    show_status
    display_info
}

# Handle arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    stop)
        log_info "Stopping monitoring stack..."
        cd "$SCRIPT_DIR"
        docker-compose down
        log_info "Stack stopped"
        ;;
    restart)
        log_info "Restarting monitoring stack..."
        cd "$SCRIPT_DIR"
        docker-compose restart
        log_info "Stack restarted"
        ;;
    logs)
        cd "$SCRIPT_DIR"
        docker-compose logs -f "${2:-}"
        ;;
    status)
        cd "$SCRIPT_DIR"
        docker-compose ps
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|logs|status} [service]"
        exit 1
        ;;
esac
