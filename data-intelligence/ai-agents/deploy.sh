#!/bin/bash
# Cortex AI Agents System - Deployment Script
#
# Safely deploys AI agents enhancements with validation and rollback capability

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🤖 Cortex AI Agents System - Deployment${NC}"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "data-intelligence/ai-agents/cortex_ai_agents.py" ]; then
    echo -e "${RED}❌ Error: Must run from cortex root directory${NC}"
    exit 1
fi

# Parse command line arguments
PHASE=${1:-"check"}  # check, deploy, rollback
DRY_RUN=${2:-"false"}

# ========== Pre-deployment Checks ==========

check_dependencies() {
    echo -e "\n${YELLOW}📋 Checking dependencies...${NC}"

    # Check Python version
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
    echo "Python version: $PYTHON_VERSION"

    # Check required packages
    REQUIRED_PACKAGES=("anthropic" "chromadb" "pyyaml" "pytest")

    for package in "${REQUIRED_PACKAGES[@]}"; do
        if python3 -c "import $package" 2>/dev/null; then
            echo -e "  ✅ $package installed"
        else
            echo -e "  ${RED}❌ $package not installed${NC}"
            echo "     Install with: pip install $package"
            exit 1
        fi
    done

    echo -e "${GREEN}✅ All dependencies satisfied${NC}"
}

check_configuration() {
    echo -e "\n${YELLOW}📋 Checking configuration...${NC}"

    # Check feature flags file exists
    if [ ! -f "data-intelligence/ai-agents/config/features.yaml" ]; then
        echo -e "${RED}❌ Error: features.yaml not found${NC}"
        exit 1
    fi

    # Check autonomous agents config
    if [ ! -f "data-intelligence/ai-agents/config/autonomous-agents.yaml" ]; then
        echo -e "${YELLOW}⚠️  Warning: autonomous-agents.yaml not found${NC}"
        echo "   Autonomous features will be disabled"
    fi

    # Check governance policies
    if [ ! -f "data-intelligence/ai-agents/governance/policies/default-policies.yaml" ]; then
        echo -e "${YELLOW}⚠️  Warning: default-policies.yaml not found${NC}"
        echo "   Will be created on first run"
    fi

    echo -e "${GREEN}✅ Configuration check passed${NC}"
}

run_tests() {
    echo -e "\n${YELLOW}🧪 Running integration tests...${NC}"

    cd data-intelligence/ai-agents

    if python3 -m pytest tests/test_ai_agents.py -v --tb=short; then
        echo -e "${GREEN}✅ All tests passed${NC}"
        cd ../..
        return 0
    else
        echo -e "${RED}❌ Tests failed${NC}"
        cd ../..
        return 1
    fi
}

backup_config() {
    echo -e "\n${YELLOW}💾 Backing up configuration...${NC}"

    BACKUP_DIR="data-intelligence/ai-agents/config/backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)

    if [ -f "data-intelligence/ai-agents/config/features.yaml" ]; then
        cp "data-intelligence/ai-agents/config/features.yaml" \
           "$BACKUP_DIR/features_$TIMESTAMP.yaml"
        echo "  ✅ Backed up features.yaml"
    fi

    if [ -f "data-intelligence/ai-agents/config/autonomous-agents.yaml" ]; then
        cp "data-intelligence/ai-agents/config/autonomous-agents.yaml" \
           "$BACKUP_DIR/autonomous-agents_$TIMESTAMP.yaml"
        echo "  ✅ Backed up autonomous-agents.yaml"
    fi

    echo -e "${GREEN}✅ Configuration backed up to $BACKUP_DIR${NC}"
}

# ========== Deployment Phases ==========

deploy_phase_1() {
    echo -e "\n${GREEN}🚀 Phase 1: Foundation (Observability + Governance)${NC}"
    echo "This phase enables monitoring and validation without execution"

    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: false
  advanced_reasoning_enabled: false
  multi_agent_enabled: false
  aiq_training_enabled: false
  consumer_agents_enabled: false
EOF

    echo -e "${GREEN}✅ Phase 1 deployed${NC}"
    echo "   - Observability: ENABLED"
    echo "   - Governance: ENABLED"
    echo "   - All other features: DISABLED"
}

deploy_phase_2() {
    echo -e "\n${GREEN}🚀 Phase 2: Intelligence (Reasoning + Orchestration)${NC}"
    echo "This phase enables advanced reasoning and multi-agent coordination"

    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: false
  advanced_reasoning_enabled: true
  multi_agent_enabled: true
  aiq_training_enabled: false
  consumer_agents_enabled: false
EOF

    echo -e "${GREEN}✅ Phase 2 deployed${NC}"
    echo "   - Observability: ENABLED"
    echo "   - Governance: ENABLED"
    echo "   - Advanced Reasoning: ENABLED"
    echo "   - Multi-Agent: ENABLED"
}

deploy_phase_3() {
    echo -e "\n${GREEN}🚀 Phase 3: Training (AIQ Assessment)${NC}"
    echo "This phase enables team training and assessment"

    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: false
  advanced_reasoning_enabled: true
  multi_agent_enabled: true
  aiq_training_enabled: true
  consumer_agents_enabled: false
EOF

    echo -e "${GREEN}✅ Phase 3 deployed${NC}"
    echo "   - All Phase 2 features: ENABLED"
    echo "   - AIQ Training: ENABLED"
}

deploy_phase_4() {
    echo -e "\n${GREEN}🚀 Phase 4: Autonomy (Autonomous Execution)${NC}"
    echo -e "${RED}⚠️  WARNING: This enables autonomous agent execution${NC}"
    echo "   Agents can now act without human initiation"
    echo "   Monitor closely for first 24 hours"

    if [ "$DRY_RUN" != "true" ]; then
        read -p "Are you sure you want to enable autonomous execution? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Deployment cancelled"
            return 1
        fi
    fi

    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: true
  advanced_reasoning_enabled: true
  multi_agent_enabled: true
  aiq_training_enabled: true
  consumer_agents_enabled: false
EOF

    echo -e "${GREEN}✅ Phase 4 deployed${NC}"
    echo "   - All Phase 3 features: ENABLED"
    echo "   - Autonomous Execution: ENABLED"
    echo -e "${YELLOW}   ⚠️  MONITOR CLOSELY FOR NEXT 24 HOURS${NC}"
}

deploy_full() {
    echo -e "\n${GREEN}🚀 Full Deployment (All Features)${NC}"
    echo -e "${RED}⚠️  WARNING: This is the most aggressive deployment${NC}"

    if [ "$DRY_RUN" != "true" ]; then
        read -p "Deploy all features including consumer-facing? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Deployment cancelled"
            return 1
        fi
    fi

    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: true
  advanced_reasoning_enabled: true
  multi_agent_enabled: true
  aiq_training_enabled: true
  consumer_agents_enabled: true
EOF

    echo -e "${GREEN}✅ Full deployment complete${NC}"
    echo "   - ALL FEATURES ENABLED"
}

rollback() {
    echo -e "\n${RED}🔄 Rolling back to safe configuration...${NC}"

    # Disable all risky features
    cat > data-intelligence/ai-agents/config/features.yaml << 'EOF'
features:
  observability_enabled: true
  governance_enabled: true
  autonomous_enabled: false
  advanced_reasoning_enabled: false
  multi_agent_enabled: false
  aiq_training_enabled: false
  consumer_agents_enabled: false
EOF

    echo -e "${GREEN}✅ Rolled back to Phase 1 (safe mode)${NC}"
    echo "   - Only observability and governance enabled"
}

# ========== Main Deployment Logic ==========

case $PHASE in
    check)
        echo -e "\n${YELLOW}Running pre-deployment checks...${NC}"
        check_dependencies
        check_configuration
        run_tests
        echo -e "\n${GREEN}✅ All checks passed - ready to deploy${NC}"
        echo ""
        echo "Next steps:"
        echo "  ./data-intelligence/ai-agents/deploy.sh phase1  # Deploy Phase 1"
        echo "  ./data-intelligence/ai-agents/deploy.sh phase2  # Deploy Phase 2"
        echo "  ./data-intelligence/ai-agents/deploy.sh phase3  # Deploy Phase 3"
        echo "  ./data-intelligence/ai-agents/deploy.sh phase4  # Deploy Phase 4"
        echo "  ./data-intelligence/ai-agents/deploy.sh full    # Deploy all features"
        ;;

    phase1)
        check_dependencies
        check_configuration
        backup_config
        deploy_phase_1
        echo -e "\n${GREEN}✅ Phase 1 deployment complete${NC}"
        echo "Monitor for 1 week before proceeding to Phase 2"
        ;;

    phase2)
        check_dependencies
        check_configuration
        backup_config
        deploy_phase_2
        echo -e "\n${GREEN}✅ Phase 2 deployment complete${NC}"
        echo "Monitor for 1 week before proceeding to Phase 3"
        ;;

    phase3)
        check_dependencies
        check_configuration
        backup_config
        deploy_phase_3
        echo -e "\n${GREEN}✅ Phase 3 deployment complete${NC}"
        echo "Begin team AIQ assessments"
        echo "Monitor for 1 week before proceeding to Phase 4"
        ;;

    phase4)
        check_dependencies
        check_configuration
        backup_config
        deploy_phase_4
        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}✅ Phase 4 deployment complete${NC}"
            echo -e "${YELLOW}⚠️  CRITICAL: Monitor autonomous actions closely${NC}"
            echo "Check logs at: data-intelligence/lakehouse/logs/"
        fi
        ;;

    full)
        check_dependencies
        check_configuration
        backup_config
        deploy_full
        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}✅ Full deployment complete${NC}"
        fi
        ;;

    rollback)
        backup_config
        rollback
        ;;

    *)
        echo -e "${RED}Unknown phase: $PHASE${NC}"
        echo "Usage: $0 [check|phase1|phase2|phase3|phase4|full|rollback]"
        exit 1
        ;;
esac

echo ""
echo "=================================================="
echo -e "${GREEN}Deployment complete${NC}"
echo ""
