#!/usr/bin/env bash
# automation-feedback-loop.sh
# Self-improvement loop for identifying automation opportunities
# Continuously monitors task patterns and recommends new playbooks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FREQUENCY_LOG="${AUTOMATION_ROOT}/tracking/frequency/task-frequency.jsonl"
CANDIDATES_FILE="${AUTOMATION_ROOT}/tracking/candidates/automation-candidates.json"
PLAYBOOK_TRIGGERS="${AUTOMATION_ROOT}/tracking/candidates/playbook-triggers.json"
FEEDBACK_LOG="${AUTOMATION_ROOT}/self-improvement/feedback-log.jsonl"
ROI_TRACKER="${AUTOMATION_ROOT}/self-improvement/roi-tracker.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Automation Self-Improvement Loop${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Initialize ROI tracker if it doesn't exist
if [[ ! -f "${ROI_TRACKER}" ]]; then
    cat > "${ROI_TRACKER}" <<EOF
{
  "roi_tracking": {
    "analysis_started": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "playbooks_created": 0,
    "total_time_saved_hours": 0,
    "total_executions": 0,
    "automation_efficiency": 0,
    "playbook_performance": []
  }
}
EOF
fi

# Function to log feedback
log_feedback() {
    local feedback_type="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local feedback_entry=$(cat <<EOF
{"timestamp":"${timestamp}","feedback_type":"${feedback_type}","message":"${message}","logged_by":"self-improvement-loop"}
EOF
)
    echo "${feedback_entry}" >> "${FEEDBACK_LOG}"
}

# Step 1: Analyze current automation state
echo -e "${BLUE}[Step 1/6] Analyzing current automation state...${NC}"

if [[ ! -f "${FREQUENCY_LOG}" ]]; then
    echo -e "${YELLOW}No task frequency data yet${NC}"
    echo "Start logging tasks with: ${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh"
    log_feedback "initialization" "No task data available - starting fresh"
    exit 0
fi

TOTAL_TASKS=$(wc -l < "${FREQUENCY_LOG}" | tr -d ' ')
MANUAL_TASKS=$(jq -s 'map(select(.execution_type == "manual")) | length' "${FREQUENCY_LOG}")
AUTOMATED_TASKS=$(jq -s 'map(select(.execution_type == "automated")) | length' "${FREQUENCY_LOG}")

echo -e "${GREEN}Total tasks logged: ${TOTAL_TASKS}${NC}"
echo -e "  Manual: ${MANUAL_TASKS}"
echo -e "  Automated: ${AUTOMATED_TASKS}"

if [[ "${TOTAL_TASKS}" -lt 10 ]]; then
    echo -e "${YELLOW}Insufficient data for meaningful analysis (need 10+ tasks)${NC}"
    log_feedback "data_insufficient" "Only ${TOTAL_TASKS} tasks logged, need 10+ for analysis"
    exit 0
fi

# Step 2: Run automation candidate scoring
echo ""
echo -e "${BLUE}[Step 2/6] Scoring automation candidates...${NC}"
"${AUTOMATION_ROOT}/tracking/automation-candidate-scorer.sh"

# Step 3: Identify new automation opportunities
echo ""
echo -e "${BLUE}[Step 3/6] Identifying new automation opportunities...${NC}"

if [[ ! -f "${PLAYBOOK_TRIGGERS}" ]]; then
    echo -e "${YELLOW}No playbook triggers generated${NC}"
    log_feedback "no_triggers" "No automation candidates met threshold"
    exit 0
fi

TRIGGER_COUNT=$(jq length "${PLAYBOOK_TRIGGERS}")
echo -e "${GREEN}Found ${TRIGGER_COUNT} automation opportunities${NC}"

# Display top opportunity
if [[ "${TRIGGER_COUNT}" -gt 0 ]]; then
    echo ""
    echo -e "${CYAN}Top Automation Opportunity:${NC}"
    jq -r '.[0] |
    "Task Type: \(.task_type)
Priority: \(.priority | ascii_upcase)
Action: \(.recommended_action)
Development Time: \(.estimated_development_hours) hours
ROI Payback: \(.estimated_roi_weeks) weeks"
    ' "${PLAYBOOK_TRIGGERS}"
fi

# Step 4: Calculate automation ROI
echo ""
echo -e "${BLUE}[Step 4/6] Calculating automation ROI...${NC}"

# Calculate time savings from automated tasks
TIME_SAVED_MINUTES=$(jq -s '
  map(select(.execution_type == "automated")) |
  map(.duration_minutes) |
  add // 0
' "${FREQUENCY_LOG}")

TIME_SAVED_HOURS=$(echo "scale=2; ${TIME_SAVED_MINUTES} / 60" | bc)

# Calculate time that would have been spent manually
MANUAL_EQUIVALENT_MINUTES=$(jq -s '
  map(select(.execution_type == "automated")) |
  length * 30
' "${FREQUENCY_LOG}")

MANUAL_EQUIVALENT_HOURS=$(echo "scale=2; ${MANUAL_EQUIVALENT_MINUTES} / 60" | bc)

ACTUAL_TIME_SAVED=$(echo "scale=2; ${MANUAL_EQUIVALENT_HOURS} - ${TIME_SAVED_HOURS}" | bc)

if [[ $(echo "${MANUAL_EQUIVALENT_HOURS} > 0" | bc) -eq 1 ]]; then
    AUTOMATION_EFFICIENCY=$(echo "scale=2; (${ACTUAL_TIME_SAVED} / ${MANUAL_EQUIVALENT_HOURS}) * 100" | bc)
else
    AUTOMATION_EFFICIENCY=0
fi

echo -e "${GREEN}Automation ROI:${NC}"
echo -e "  Time saved: ${ACTUAL_TIME_SAVED} hours"
echo -e "  Automation efficiency: ${AUTOMATION_EFFICIENCY}%"
echo -e "  Automated executions: ${AUTOMATED_TASKS}"

# Update ROI tracker
jq --arg saved "${ACTUAL_TIME_SAVED}" \
   --arg efficiency "${AUTOMATION_EFFICIENCY}" \
   --argjson executions "${AUTOMATED_TASKS}" \
   '.roi_tracking.total_time_saved_hours = ($saved | tonumber) |
    .roi_tracking.automation_efficiency = ($efficiency | tonumber) |
    .roi_tracking.total_executions = $executions |
    .roi_tracking.last_updated = (now | strftime("%Y-%m-%dT%H:%M:%SZ"))' \
   "${ROI_TRACKER}" > /tmp/roi.json
mv /tmp/roi.json "${ROI_TRACKER}"

log_feedback "roi_calculated" "Time saved: ${ACTUAL_TIME_SAVED}h, Efficiency: ${AUTOMATION_EFFICIENCY}%"

# Step 5: Generate playbook recommendations
echo ""
echo -e "${BLUE}[Step 5/6] Generating playbook recommendations...${NC}"

RECOMMENDATIONS=$(jq -r '
  map(select(.priority == "critical" or .priority == "high")) |
  length
' "${PLAYBOOK_TRIGGERS}")

if [[ "${RECOMMENDATIONS}" -gt 0 ]]; then
    echo -e "${GREEN}${RECOMMENDATIONS} high-priority playbook(s) recommended${NC}"
    echo ""

    jq -r '
      map(select(.priority == "critical" or .priority == "high")) |
      .[] |
      "Recommendation: Create playbook for \(.task_type)
  Estimated Development: \(.estimated_development_hours) hours
  Expected Payback: \(.estimated_roi_weeks) weeks
  Examples: \(.task_examples | join(", "))
  ----------------------------------------"
    ' "${PLAYBOOK_TRIGGERS}"

    log_feedback "recommendations_generated" "${RECOMMENDATIONS} high-priority playbooks recommended"
else
    echo -e "${YELLOW}No high-priority recommendations at this time${NC}"
fi

# Step 6: Monitor playbook effectiveness
echo ""
echo -e "${BLUE}[Step 6/6] Monitoring playbook effectiveness...${NC}"

# Check if playbooks are being used
PLAYBOOKS_DIR="${AUTOMATION_ROOT}/playbooks"
PLAYBOOK_COUNT=$(find "${PLAYBOOKS_DIR}" -name "*.yml" -type f 2>/dev/null | wc -l | tr -d ' ')

echo -e "Active playbooks: ${PLAYBOOK_COUNT}"

if [[ "${PLAYBOOK_COUNT}" -gt 0 ]]; then
    echo ""
    echo -e "${CYAN}Existing Playbooks:${NC}"
    find "${PLAYBOOKS_DIR}" -name "*.yml" -type f -exec basename {} \; | while read playbook; do
        echo "  - ${playbook}"
    done
fi

# Calculate adoption rate
if [[ "${TOTAL_TASKS}" -gt 0 ]]; then
    ADOPTION_RATE=$(echo "scale=2; (${AUTOMATED_TASKS} / ${TOTAL_TASKS}) * 100" | bc)
    echo ""
    echo -e "${GREEN}Automation adoption rate: ${ADOPTION_RATE}%${NC}"

    if [[ $(echo "${ADOPTION_RATE} < 30" | bc) -eq 1 ]]; then
        echo -e "${YELLOW}Low adoption - consider promoting playbook usage${NC}"
        log_feedback "low_adoption" "Adoption rate ${ADOPTION_RATE}% - increase playbook awareness"
    elif [[ $(echo "${ADOPTION_RATE} > 70" | bc) -eq 1 ]]; then
        echo -e "${GREEN}Excellent adoption rate!${NC}"
        log_feedback "high_adoption" "Adoption rate ${ADOPTION_RATE}% - automation working well"
    fi
fi

# Summary
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Self-Improvement Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "Total Tasks: ${TOTAL_TASKS}"
echo -e "Automated: ${AUTOMATED_TASKS} (${ADOPTION_RATE}%)"
echo -e "Time Saved: ${ACTUAL_TIME_SAVED} hours"
echo -e "Efficiency: ${AUTOMATION_EFFICIENCY}%"
echo -e "Active Playbooks: ${PLAYBOOK_COUNT}"
echo -e "New Recommendations: ${RECOMMENDATIONS}"
echo ""

if [[ "${RECOMMENDATIONS}" -gt 0 ]]; then
    echo -e "${YELLOW}Action Required:${NC}"
    echo "Review recommendations and consider creating new playbooks"
    echo "Run: cat ${PLAYBOOK_TRIGGERS} | jq"
else
    echo -e "${GREEN}Status: Healthy${NC}"
    echo "Continue logging tasks to identify new patterns"
fi

echo ""
echo -e "${CYAN}========================================${NC}"

log_feedback "loop_completed" "Analysis complete: ${TOTAL_TASKS} tasks, ${AUTOMATED_TASKS} automated, ${ACTUAL_TIME_SAVED}h saved"

exit 0
