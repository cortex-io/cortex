#!/usr/bin/env bash
# install.sh
# Verifies dependencies and sets up the Ansible automation framework

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Cortex Ansible Automation Framework${NC}"
echo -e "${CYAN}Installation and Verification${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

MISSING_DEPS=0

# Check Ansible
echo -e "${BLUE}[1/6] Checking Ansible...${NC}"
if command -v ansible-playbook &> /dev/null; then
    ANSIBLE_VERSION=$(ansible-playbook --version | head -1)
    echo -e "${GREEN}✓ ${ANSIBLE_VERSION}${NC}"
else
    echo -e "${RED}✗ Ansible not found${NC}"
    echo -e "  Install: brew install ansible (macOS) or apt-get install ansible (Linux)"
    ((MISSING_DEPS++))
fi

# Check jq
echo -e "${BLUE}[2/6] Checking jq...${NC}"
if command -v jq &> /dev/null; then
    JQ_VERSION=$(jq --version)
    echo -e "${GREEN}✓ ${JQ_VERSION}${NC}"
else
    echo -e "${RED}✗ jq not found${NC}"
    echo -e "  Install: brew install jq (macOS) or apt-get install jq (Linux)"
    ((MISSING_DEPS++))
fi

# Check bash version
echo -e "${BLUE}[3/6] Checking bash version...${NC}"
BASH_VERSION=${BASH_VERSION:-"unknown"}
if [[ "${BASH_VERSION}" == "unknown" ]]; then
    echo -e "${YELLOW}⚠ Bash version unknown${NC}"
else
    echo -e "${GREEN}✓ Bash ${BASH_VERSION}${NC}"
fi

# Check git
echo -e "${BLUE}[4/6] Checking git...${NC}"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo -e "${GREEN}✓ ${GIT_VERSION}${NC}"
else
    echo -e "${YELLOW}⚠ git not found (optional)${NC}"
fi

# Check Python
echo -e "${BLUE}[5/6] Checking Python...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓ ${PYTHON_VERSION}${NC}"
else
    echo -e "${RED}✗ Python 3 not found${NC}"
    echo -e "  Install: brew install python3 (macOS) or apt-get install python3 (Linux)"
    ((MISSING_DEPS++))
fi

# Verify file structure
echo -e "${BLUE}[6/6] Verifying file structure...${NC}"

REQUIRED_FILES=(
    "README.md"
    "QUICK-START.md"
    "ansible.cfg"
    "tracking/task-frequency-logger.sh"
    "tracking/automation-candidate-scorer.sh"
    "self-improvement/automation-feedback-loop.sh"
    "playbooks/mcp-server-integration.yml"
    "playbooks/log-dashboard-event.yml"
    "playbooks/create-security-scan.yml"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "${SCRIPT_DIR}/${file}" ]]; then
        echo -e "${RED}✗ Missing: ${file}${NC}"
        ((MISSING_FILES++))
    fi
done

if [[ "${MISSING_FILES}" -eq 0 ]]; then
    echo -e "${GREEN}✓ All required files present${NC}"
else
    echo -e "${RED}✗ ${MISSING_FILES} files missing${NC}"
fi

# Make scripts executable
echo ""
echo -e "${BLUE}Setting executable permissions...${NC}"
chmod +x "${SCRIPT_DIR}/tracking/task-frequency-logger.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/tracking/automation-candidate-scorer.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/self-improvement/automation-feedback-loop.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/self-improvement/schedule-improvement-loop.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/examples/demo-workflow.sh" 2>/dev/null || true
echo -e "${GREEN}✓ Executable permissions set${NC}"

# Summary
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Installation Summary${NC}"
echo -e "${CYAN}========================================${NC}"

if [[ "${MISSING_DEPS}" -eq 0 && "${MISSING_FILES}" -eq 0 ]]; then
    echo -e "${GREEN}✓ Installation complete!${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Read the documentation:"
    echo "   cat ${SCRIPT_DIR}/README.md"
    echo ""
    echo "2. Try the quick start:"
    echo "   cat ${SCRIPT_DIR}/QUICK-START.md"
    echo ""
    echo "3. Run the demo:"
    echo "   ${SCRIPT_DIR}/examples/demo-workflow.sh"
    echo ""
    echo "4. Try your first playbook:"
    echo "   ansible-playbook ${SCRIPT_DIR}/playbooks/log-dashboard-event.yml"
    echo ""
    echo -e "${YELLOW}Ready to automate! 🚀${NC}"
else
    echo -e "${RED}✗ Installation incomplete${NC}"
    echo ""
    if [[ "${MISSING_DEPS}" -gt 0 ]]; then
        echo -e "${YELLOW}Missing dependencies: ${MISSING_DEPS}${NC}"
        echo "Install missing dependencies and re-run this script"
    fi
    if [[ "${MISSING_FILES}" -gt 0 ]]; then
        echo -e "${YELLOW}Missing files: ${MISSING_FILES}${NC}"
        echo "Ensure all framework files are present"
    fi
    exit 1
fi

exit 0
