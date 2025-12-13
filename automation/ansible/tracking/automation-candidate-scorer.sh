#!/usr/bin/env bash
# automation-candidate-scorer.sh
# Analyzes task frequency data to score and rank automation candidates
# Generates recommendations for playbook development

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FREQUENCY_LOG="${AUTOMATION_ROOT}/tracking/frequency/task-frequency.jsonl"
CANDIDATES_FILE="${AUTOMATION_ROOT}/tracking/candidates/automation-candidates.json"
PLAYBOOK_TRIGGERS="${AUTOMATION_ROOT}/tracking/candidates/playbook-triggers.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$(dirname "${CANDIDATES_FILE}")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Automation Candidate Scorer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if frequency log exists
if [[ ! -f "${FREQUENCY_LOG}" ]]; then
    echo -e "${RED}No frequency log found${NC}"
    echo "Start logging tasks with: ${AUTOMATION_ROOT}/tracking/task-frequency-logger.sh"
    exit 1
fi

# Count total tasks
TOTAL_TASKS=$(wc -l < "${FREQUENCY_LOG}" | tr -d ' ')
echo -e "${BLUE}Total tasks logged:${NC} ${TOTAL_TASKS}"

if [[ "${TOTAL_TASKS}" -lt 5 ]]; then
    echo -e "${YELLOW}Insufficient data for analysis (need at least 5 tasks)${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Analyzing task patterns...${NC}"

# Analyze task types and calculate scores
jq -s '
# Group by task type
group_by(.task_type) |
map({
  task_type: .[0].task_type,
  occurrences: length,
  total_time_minutes: (map(.duration_minutes) | add),
  avg_time_minutes: ((map(.duration_minutes) | add) / length | floor),
  manual_count: (map(select(.execution_type == "manual")) | length),
  automated_count: (map(select(.execution_type == "automated")) | length),
  task_names: (map(.task_name) | unique),
  recent_tasks: (sort_by(.timestamp) | reverse | .[0:3] | map(.task_name))
}) |

# Calculate automation scores
map(. + {
  # Score formula: (occurrences * avg_time * 0.8) + (occurrences > 5 ? 20 : 0) + (avg_time > 30 ? 15 : 0)
  automation_score: (
    (.occurrences * .avg_time_minutes * 0.8) +
    (if .occurrences > 5 then 20 else 0 end) +
    (if .avg_time_minutes > 30 then 15 else 0 end)
  ),
  time_savings_potential_hours_per_year: (
    (.occurrences * 26 * (.avg_time_minutes * 0.75) / 60) | floor
  ),
  automation_efficiency: (
    if .manual_count > 0 then
      ((.automated_count / (.manual_count + .automated_count)) * 100 | floor)
    else 0 end
  )
}) |

# Sort by automation score descending
sort_by(-.automation_score) |

# Add rank
to_entries | map(.value + {rank: (.key + 1)})
' "${FREQUENCY_LOG}" > "${CANDIDATES_FILE}"

# Display top candidates
echo ""
echo -e "${GREEN}Top Automation Candidates:${NC}"
echo ""

jq -r '.[] | select(.rank <= 5) |
"Rank \(.rank): \(.task_type)
  Occurrences: \(.occurrences) times
  Total Time: \(.total_time_minutes) minutes (\(.total_time_minutes / 60 | floor)h \(.total_time_minutes % 60)m)
  Avg Time: \(.avg_time_minutes) minutes
  Automation Score: \(.automation_score | floor)
  Time Savings Potential: ~\(.time_savings_potential_hours_per_year)h/year
  Automation Efficiency: \(.automation_efficiency)%
  Recent Tasks: \(.recent_tasks | join(", "))
  ----------------------------------------"
' "${CANDIDATES_FILE}"

# Generate playbook triggers
echo ""
echo -e "${BLUE}Generating playbook development triggers...${NC}"

jq '
# Filter candidates with high automation potential
map(select(.automation_score > 50 and .manual_count > 3)) |

# Generate playbook triggers
map({
  task_type: .task_type,
  priority: (
    if .automation_score > 200 then "critical"
    elif .automation_score > 100 then "high"
    elif .automation_score > 50 then "medium"
    else "low" end
  ),
  recommended_action: (
    if .automated_count == 0 then "create_playbook"
    else "improve_existing_playbook" end
  ),
  estimated_development_hours: (
    if .avg_time_minutes > 60 then 4
    elif .avg_time_minutes > 30 then 3
    else 2 end
  ),
  estimated_roi_weeks: (
    (.occurrences * 4 * .avg_time_minutes / 60) /
    (if .avg_time_minutes > 60 then 4 elif .avg_time_minutes > 30 then 3 else 2 end) |
    ceil
  ),
  task_examples: .task_names[0:3]
}) |
sort_by(.priority) |
reverse
' "${CANDIDATES_FILE}" > "${PLAYBOOK_TRIGGERS}"

# Display playbook triggers
TRIGGER_COUNT=$(jq length "${PLAYBOOK_TRIGGERS}")

if [[ "${TRIGGER_COUNT}" -gt 0 ]]; then
    echo -e "${GREEN}${TRIGGER_COUNT} playbook development triggers identified${NC}"
    echo ""

    jq -r '.[] |
    "Task Type: \(.task_type)
  Priority: \(.priority | ascii_upcase)
  Recommended Action: \(.recommended_action)
  Development Time: ~\(.estimated_development_hours) hours
  ROI Payback: ~\(.estimated_roi_weeks) weeks
  Example Tasks: \(.task_examples | join(", "))
  ========================================
  "
    ' "${PLAYBOOK_TRIGGERS}"

    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Review candidates: cat ${CANDIDATES_FILE} | jq"
    echo "2. Review triggers: cat ${PLAYBOOK_TRIGGERS} | jq"
    echo "3. Create playbooks: ${AUTOMATION_ROOT}/playbooks/"

else
    echo -e "${YELLOW}No high-value automation candidates found yet${NC}"
    echo "Continue logging tasks to build analysis data"
fi

echo ""
echo -e "${GREEN}Analysis complete${NC}"
echo -e "${BLUE}Results saved to:${NC} ${CANDIDATES_FILE}"
echo -e "${BLUE}Triggers saved to:${NC} ${PLAYBOOK_TRIGGERS}"

exit 0
