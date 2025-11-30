#!/usr/bin/env bash
# Weekly ML Validation - Run this via cron every Monday

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
VALIDATOR="$CORTEX_HOME/llm-mesh/validation/ml-validator.sh"
LOG_FILE="$CORTEX_HOME/logs/ml-validation-$(date +%Y%m%d).log"

echo "Running weekly ML validation at $(date)" | tee "$LOG_FILE"
echo "================================================" | tee -a "$LOG_FILE"

bash "$VALIDATOR" 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Validation complete. Results logged to: $LOG_FILE" | tee -a "$LOG_FILE"

# Optional: Send notification (uncomment if you want email/Slack alerts)
# curl -X POST YOUR_SLACK_WEBHOOK_URL -d "Weekly ML validation complete. Check $LOG_FILE"
