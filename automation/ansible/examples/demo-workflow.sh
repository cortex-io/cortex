#!/usr/bin/env bash
# demo-workflow.sh
# Demonstrates the complete automation workflow
# Run this to see the full cycle in action

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CORTEX_ROOT="$(cd "${AUTOMATION_ROOT}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Cortex Automation Framework Demo${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Phase 1: Simulate manual tasks
echo -e "${BLUE}Phase 1: Logging Manual Tasks${NC}"
echo "Simulating 5 manual MCP integrations..."
echo ""

for i in {1..5}; do
    repo_name="demo-mcp-server-${i}"
    echo -e "${YELLOW}Logging manual task ${i}/5: ${repo_name}${NC}"

    "${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh" \
      -t mcp-integration \
      -n "${repo_name}" \
      -d 45 \
      --manual

    echo ""
done

echo -e "${GREEN}✓ 5 manual tasks logged (225 minutes total)${NC}"
echo ""
sleep 2

# Phase 2: Log some other task types
echo -e "${BLUE}Phase 2: Logging Additional Task Types${NC}"
echo ""

echo -e "${YELLOW}Logging health check creations...${NC}"
for i in {1..3}; do
    "${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh" \
      -t health-check-creation \
      -n "demo-health-check-${i}" \
      -d 30 \
      --manual
done

echo ""
echo -e "${YELLOW}Logging dashboard events...${NC}"
for i in {1..5}; do
    "${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh" \
      -t dashboard-event-logging \
      -n "demo-event-${i}" \
      -d 3 \
      --manual
done

echo ""
echo -e "${GREEN}✓ Additional tasks logged${NC}"
echo ""
sleep 2

# Phase 3: Analyze patterns
echo -e "${BLUE}Phase 3: Analyzing Automation Opportunities${NC}"
echo ""

"${AUTOMATION_ROOT}/tracking/automation-candidate-scorer.sh"

echo ""
sleep 3

# Phase 4: Simulate automated tasks
echo -e "${BLUE}Phase 4: Simulating Automated Executions${NC}"
echo "Using playbooks for new MCP integrations..."
echo ""

for i in {6..8}; do
    repo_name="demo-mcp-server-${i}"
    echo -e "${YELLOW}Automated task ${i}/8: ${repo_name} (via playbook)${NC}"

    "${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh" \
      -t mcp-integration \
      -n "${repo_name}" \
      -d 5 \
      --automated

    echo ""
done

echo -e "${GREEN}✓ 3 automated tasks logged (15 minutes vs 135 manual)${NC}"
echo -e "${GREEN}✓ Time saved: 120 minutes (2 hours)${NC}"
echo ""
sleep 2

# Phase 5: Run self-improvement loop
echo -e "${BLUE}Phase 5: Running Self-Improvement Loop${NC}"
echo ""

"${AUTOMATION_ROOT}/self-improvement/automation-feedback-loop.sh"

echo ""
sleep 2

# Phase 6: Display summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Demo Complete - Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${BLUE}Tasks Logged:${NC}"
jq -s '
  group_by(.execution_type) |
  map({
    execution_type: .[0].execution_type,
    count: length,
    total_time_minutes: (map(.duration_minutes) | add)
  })
' "${AUTOMATION_ROOT}/tracking/frequency/task-frequency.jsonl"

echo ""
echo -e "${BLUE}Top Automation Candidates:${NC}"
jq -r '.[] | select(.rank <= 3) |
"Rank \(.rank): \(.task_type)
  Occurrences: \(.occurrences)
  Time Savings Potential: \(.time_savings_potential_hours_per_year)h/year
  Automation Score: \(.automation_score | floor)"
' "${AUTOMATION_ROOT}/tracking/candidates/automation-candidates.json"

echo ""
echo -e "${BLUE}ROI Summary:${NC}"
jq -r '.roi_tracking |
"Time Saved: \(.total_time_saved_hours) hours
Automation Efficiency: \(.automation_efficiency)%
Total Executions: \(.total_executions)"
' "${AUTOMATION_ROOT}/self-improvement/roi-tracker.json"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}Demo workflow completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review automation candidates: cat ${AUTOMATION_ROOT}/tracking/candidates/automation-candidates.json | jq"
echo "2. Try a playbook: ansible-playbook ${AUTOMATION_ROOT}/playbooks/log-dashboard-event.yml"
echo "3. Track real tasks: ${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh -h"
echo "4. Schedule daily loop: ${AUTOMATION_ROOT}/self-improvement/schedule-improvement-loop.sh"
echo ""
echo -e "${YELLOW}Note: This demo used simulated data. For real ROI, log actual tasks!${NC}"
echo ""

exit 0
