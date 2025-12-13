#!/bin/bash

#############################################################################
# Simple Cortex Deployment Monitor
# Real-time tracking of GitHub Actions and K3s deployment
#############################################################################

REPO="ry-ops/cortex"
BRANCH="docker-container"
K3S_IP="10.88.145.180"
DASHBOARD_URL="http://10.88.145.201/"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

timestamp() { date '+[%H:%M:%S]'; }

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_info() { echo -e "${BLUE}•${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

# State tracking
BUILD_DONE=false
IMAGES_PUSHED=false
PODS_READY=false
DASHBOARD_OK=false

main() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Cortex K3s Deployment Monitor${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""

    local iteration=0
    while true; do
        iteration=$((iteration + 1))
        echo ""
        echo "$(timestamp) Cycle $iteration ────────────────────────────────────"

        # Check GitHub Actions
        echo ""
        log_info "GitHub Actions Build"
        local build_status=$(gh run list -w "Build and Push Cortex Images" -b $BRANCH --limit 1 -q '.[0].status' 2>/dev/null)
        local build_conclusion=$(gh run list -w "Build and Push Cortex Images" -b $BRANCH --limit 1 -q '.[0].conclusion' 2>/dev/null)
        local build_id=$(gh run list -w "Build and Push Cortex Images" -b $BRANCH --limit 1 -q '.[0].databaseId' 2>/dev/null)

        if [ -z "$build_status" ]; then
            log_warning "No builds found"
        else
            echo "  Status: $build_status | Conclusion: $build_conclusion"

            if [ "$build_status" = "completed" ]; then
                if [ "$build_conclusion" = "success" ]; then
                    log_success "Build completed successfully!"
                    BUILD_DONE=true
                else
                    log_error "Build failed ($build_conclusion)"
                    if [ "$iteration" -gt 1 ]; then
                        gh run view $build_id --log 2>&1 | tail -50
                    fi
                fi
            else
                log_info "Build in progress..."
            fi
        fi

        # Check GHCR images if build is done
        if [ "$BUILD_DONE" = true ] && [ "$IMAGES_PUSHED" = false ]; then
            echo ""
            log_info "Docker Images in GHCR"
            if curl -s -H "Authorization: Bearer $(gh auth token)" \
                "https://ghcr.io/v2/ry-ops/cortex/manifests/latest" -o /dev/null -w "%{http_code}\n" 2>/dev/null | grep -q "200"; then
                log_success "Images pushed to GHCR"
                IMAGES_PUSHED=true
            else
                log_warning "Images not yet pushed"
            fi
        fi

        # Check K3s pods
        if [ "$BUILD_DONE" = true ]; then
            echo ""
            log_info "K3s Cluster Pods"
            if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                -i ~/.ssh/id_rsa root@$K3S_IP \
                "kubectl get pods -n cortex-system --no-headers 2>/dev/null" 2>/dev/null > /tmp/pods.txt; then

                local total=$(wc -l < /tmp/pods.txt)
                local ready=$(grep -c "Running" /tmp/pods.txt || true)

                echo "  Pods: $ready/$total ready"
                grep "Running" /tmp/pods.txt | while read pod rest; do
                    log_success "$pod Running"
                done
                grep -v "Running" /tmp/pods.txt | while read pod rest; do
                    log_warning "$pod (pending)"
                done

                if [ "$ready" -eq "$total" ] && [ "$total" -gt 0 ]; then
                    log_success "All pods running!"
                    PODS_READY=true
                fi
            else
                log_warning "Cannot reach K3s cluster"
            fi
        fi

        # Check dashboard
        if [ "$PODS_READY" = true ] && [ "$DASHBOARD_OK" = false ]; then
            echo ""
            log_info "Dashboard Accessibility"
            if timeout 5 curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" 2>/dev/null | grep -q "200"; then
                log_success "Dashboard is accessible!"
                DASHBOARD_OK=true
            else
                log_warning "Dashboard not yet accessible"
            fi
        fi

        # Final status
        echo ""
        echo -e "${CYAN}Status:${NC}"
        [ "$BUILD_DONE" = true ] && log_success "Build: Complete" || log_warning "Build: In Progress"
        [ "$IMAGES_PUSHED" = true ] && log_success "Images: Pushed" || log_warning "Images: Pending"
        [ "$PODS_READY" = true ] && log_success "Pods: All Running" || log_warning "Pods: Not Ready"
        [ "$DASHBOARD_OK" = true ] && log_success "Dashboard: Accessible" || log_warning "Dashboard: Pending"

        # Success condition
        if [ "$BUILD_DONE" = true ] && [ "$IMAGES_PUSHED" = true ] && [ "$PODS_READY" = true ] && [ "$DASHBOARD_OK" = true ]; then
            echo ""
            echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
            echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
            echo -e "${GREEN}  Dashboard: $DASHBOARD_URL${NC}"
            echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
            return 0
        fi

        # Wait for next cycle
        log_info "Checking again in 30 seconds..."
        sleep 30
    done
}

main "$@"
