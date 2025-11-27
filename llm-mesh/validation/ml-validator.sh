#!/bin/bash
# ML Validation Framework for Cortex
# Validates PyTorch routing, RAG, and semantic routing effectiveness

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/ml-validation-config.json"
RESULTS_DIR="$SCRIPT_DIR/results"
REPORTS_DIR="$SCRIPT_DIR/reports"
CORTEX_HOME="${CORTEX_HOME:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Routing components
MOE_ROUTER="$CORTEX_HOME/coordination/masters/coordinator/lib/moe-router.sh"
ROUTING_LOG="$CORTEX_HOME/coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl"

# Ensure directories exist
mkdir -p "$RESULTS_DIR" "$REPORTS_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# print_header: Print formatted section header
##############################################################################
print_header() {
    local title="$1"
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $title${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

##############################################################################
# print_result: Print test result
##############################################################################
print_result() {
    local status="$1"
    local message="$2"
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗${NC} $message"
    else
        echo -e "${YELLOW}⚠${NC} $message"
    fi
}

##############################################################################
# load_config: Load validation configuration
##############################################################################
load_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "Error: Configuration file not found: $CONFIG_FILE"
        exit 1
    fi
    
    cat "$CONFIG_FILE"
}

##############################################################################
# test_routing_accuracy: Test routing against expected expert
##############################################################################
test_routing_accuracy() {
    local task_id="$1"
    local task_description="$2"
    local expected_expert="$3"
    local expected_confidence_min="$4"
    local method="${5:-keyword}"  # keyword or semantic
    
    # Temporarily override semantic routing based on test method
    local original_semantic="${SEMANTIC_ROUTING_ENABLED:-true}"
    if [ "$method" = "keyword" ]; then
        export SEMANTIC_ROUTING_ENABLED="false"
    else
        export SEMANTIC_ROUTING_ENABLED="true"
    fi
    
    # Run routing
    local routing_result
    if ! routing_result=$(GOVERNANCE_BYPASS=true bash "$MOE_ROUTER" "$task_id" "$task_description" 2>/dev/null); then
        export SEMANTIC_ROUTING_ENABLED="$original_semantic"
        echo "{\"error\": \"Routing failed\", \"method\": \"$method\"}"
        return 1
    fi
    
    # Restore original semantic routing setting
    export SEMANTIC_ROUTING_ENABLED="$original_semantic"
    
    # Extract decision
    local actual_expert=$(echo "$routing_result" | jq -r '.decision.primary_expert')
    local actual_confidence=$(echo "$routing_result" | jq -r '.decision.primary_confidence')
    local routing_method=$(echo "$routing_result" | jq -r '.routing_method // "keyword"')
    
    # Check accuracy
    local expert_match="false"
    local confidence_ok="false"
    
    if [ "$actual_expert" = "$expected_expert" ]; then
        expert_match="true"
    fi
    
    if (( $(echo "$actual_confidence >= $expected_confidence_min" | bc -l) )); then
        confidence_ok="true"
    fi
    
    # Build result JSON
    jq -n \
        --arg task_id "$task_id" \
        --arg method "$method" \
        --arg routing_method "$routing_method" \
        --arg expected "$expected_expert" \
        --arg actual "$actual_expert" \
        --argjson expected_conf "$expected_confidence_min" \
        --argjson actual_conf "$actual_confidence" \
        --arg expert_match "$expert_match" \
        --arg conf_ok "$confidence_ok" \
        '{
            task_id: $task_id,
            test_method: $method,
            actual_routing_method: $routing_method,
            expected_expert: $expected,
            actual_expert: $actual,
            expected_confidence_min: $expected_conf,
            actual_confidence: $actual_conf,
            expert_match: $expert_match,
            confidence_ok: $conf_ok,
            success: ($expert_match == "true" and $conf_ok == "true")
        }'
}

##############################################################################
# run_ab_test: Run A/B test comparing keyword vs semantic routing
##############################################################################
run_ab_test() {
    print_header "A/B Testing: Keyword vs Semantic Routing"
    
    local config=$(load_config)
    local test_cases=$(echo "$config" | jq -c '.test_cases[]')
    local timestamp=$(date +"%Y-%m-%dT%H:%M:%S%z")
    local results_file="$RESULTS_DIR/ab-test-$timestamp.jsonl"
    
    local keyword_correct=0
    local keyword_total=0
    local semantic_correct=0
    local semantic_total=0
    
    echo "Running test cases with both keyword and semantic routing..."
    echo ""
    
    while IFS= read -r test_case; do
        local test_id=$(echo "$test_case" | jq -r '.id')
        local description=$(echo "$test_case" | jq -r '.description')
        local expected_expert=$(echo "$test_case" | jq -r '.expected_expert')
        local expected_conf=$(echo "$test_case" | jq -r '.expected_confidence_min')
        
        echo "Test: $test_id"
        echo "Description: $description"
        
        # Test with keyword routing
        echo -n "  Testing keyword routing... "
        local keyword_result=$(test_routing_accuracy "$test_id-keyword" "$description" "$expected_expert" "$expected_conf" "keyword")
        local keyword_success=$(echo "$keyword_result" | jq -r '.success')
        
        if [ "$keyword_success" = "true" ]; then
            keyword_correct=$((keyword_correct + 1))
            print_result "pass" "Keyword: $(echo "$keyword_result" | jq -r '.actual_expert') ($(echo "$keyword_result" | jq -r '.actual_confidence'))"
        else
            print_result "fail" "Keyword: $(echo "$keyword_result" | jq -r '.actual_expert') (expected: $expected_expert)"
        fi
        keyword_total=$((keyword_total + 1))
        
        # Test with semantic routing
        echo -n "  Testing semantic routing... "
        local semantic_result=$(test_routing_accuracy "$test_id-semantic" "$description" "$expected_expert" "$expected_conf" "semantic")
        local semantic_success=$(echo "$semantic_result" | jq -r '.success')
        
        if [ "$semantic_success" = "true" ]; then
            semantic_correct=$((semantic_correct + 1))
            print_result "pass" "Semantic: $(echo "$semantic_result" | jq -r '.actual_expert') ($(echo "$semantic_result" | jq -r '.actual_confidence'))"
        else
            print_result "fail" "Semantic: $(echo "$semantic_result" | jq -r '.actual_expert') (expected: $expected_expert)"
        fi
        semantic_total=$((semantic_total + 1))
        
        # Log results
        echo "$keyword_result" >> "$results_file"
        echo "$semantic_result" >> "$results_file"
        
        echo ""
    done <<< "$test_cases"
    
    # Calculate accuracy
    local keyword_accuracy=$(echo "scale=4; $keyword_correct / $keyword_total" | bc)
    local semantic_accuracy=$(echo "scale=4; $semantic_correct / $semantic_total" | bc)
    
    # Print summary
    print_header "A/B Test Results Summary"
    
    echo "Keyword Routing:"
    echo "  Correct: $keyword_correct / $keyword_total"
    echo "  Accuracy: $(echo "scale=2; $keyword_accuracy * 100" | bc)%"
    echo ""
    
    echo "Semantic Routing:"
    echo "  Correct: $semantic_correct / $semantic_total"
    echo "  Accuracy: $(echo "scale=2; $semantic_accuracy * 100" | bc)%"
    echo ""
    
    # Determine winner
    if (( $(echo "$semantic_accuracy > $keyword_accuracy" | bc -l) )); then
        local improvement=$(echo "scale=2; ($semantic_accuracy - $keyword_accuracy) * 100" | bc)
        print_result "pass" "Semantic routing is ${improvement}% more accurate"
    elif (( $(echo "$keyword_accuracy > $semantic_accuracy" | bc -l) )); then
        local degradation=$(echo "scale=2; ($keyword_accuracy - $semantic_accuracy) * 100" | bc)
        print_result "fail" "Semantic routing is ${degradation}% LESS accurate - consider disabling"
    else
        print_result "warn" "No significant difference between methods"
    fi
    
    # Save summary
    local summary_file="$REPORTS_DIR/ab-test-summary-$(date +%Y%m%d).json"
    jq -n \
        --arg timestamp "$timestamp" \
        --argjson kw_correct "$keyword_correct" \
        --argjson kw_total "$keyword_total" \
        --argjson kw_accuracy "$keyword_accuracy" \
        --argjson sem_correct "$semantic_correct" \
        --argjson sem_total "$semantic_total" \
        --argjson sem_accuracy "$semantic_accuracy" \
        --arg results_file "$results_file" \
        '{
            timestamp: $timestamp,
            keyword_routing: {
                correct: $kw_correct,
                total: $kw_total,
                accuracy: $kw_accuracy
            },
            semantic_routing: {
                correct: $sem_correct,
                total: $sem_total,
                accuracy: $sem_accuracy
            },
            winner: (if $sem_accuracy > $kw_accuracy then "semantic" elif $kw_accuracy > $sem_accuracy then "keyword" else "tie" end),
            improvement: ($sem_accuracy - $kw_accuracy),
            results_file: $results_file
        }' > "$summary_file"
    
    echo ""
    echo "Results saved to: $results_file"
    echo "Summary saved to: $summary_file"
}

##############################################################################
# validate_rag_effectiveness: Check if RAG is providing value
##############################################################################
validate_rag_effectiveness() {
    print_header "RAG Effectiveness Validation"
    
    echo "Analyzing RAG usage from recent tasks..."
    
    # This is a placeholder - actual implementation would:
    # 1. Check if RAG context was retrieved for tasks
    # 2. Measure relevance scores of retrieved context
    # 3. Compare task outcomes with/without RAG
    # 4. Calculate hit rate and effectiveness
    
    print_result "warn" "RAG validation requires integration with vector DB metrics"
    print_result "warn" "Recommendation: Add RAG usage tracking to task execution"
    
    echo ""
    echo "To enable RAG validation:"
    echo "  1. Log RAG retrieval attempts in task execution"
    echo "  2. Track relevance scores of retrieved context"
    echo "  3. Record task outcomes (success/failure)"
    echo "  4. Compare tasks with RAG vs without RAG"
}

##############################################################################
# validate_pytorch_routing: Validate PyTorch neural routing
##############################################################################
validate_pytorch_routing() {
    print_header "PyTorch Neural Routing Validation"
    
    echo "Checking PyTorch routing availability..."
    
    # Check if PyTorch routing is enabled
    local pytorch_enabled="${PYTORCH_ROUTING_ENABLED:-false}"
    
    if [ "$pytorch_enabled" = "false" ]; then
        print_result "warn" "PyTorch routing is currently disabled"
        echo "  Set PYTORCH_ROUTING_ENABLED=true to enable"
        return 0
    fi
    
    # Placeholder for actual PyTorch validation
    print_result "warn" "PyTorch validation requires model performance metrics"
    print_result "warn" "Recommendation: Compare PyTorch predictions vs actual routing outcomes"
}

##############################################################################
# generate_validation_report: Generate comprehensive validation report
##############################################################################
generate_validation_report() {
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    local report_file="$REPORTS_DIR/ml-validation-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << REPORT_EOF
# ML Validation Report

**Generated**: $timestamp

## Summary

This report validates the effectiveness of Cortex's ML features:
- Semantic routing (embedding-based)
- PyTorch neural routing
- RAG (Retrieval Augmented Generation)

## A/B Test Results

See latest summary in: $REPORTS_DIR/ab-test-summary-$(date +%Y%m%d).json

## Recommendations

Based on validation results:

1. **Semantic Routing**: $(cat "$REPORTS_DIR/ab-test-summary-$(date +%Y%m%d).json" 2>/dev/null | jq -r 'if .winner == "semantic" then "✓ Keep enabled - shows improvement" elif .winner == "keyword" then "✗ Consider disabling - degrades performance" else "⚠ No clear benefit - consider disabling to reduce complexity" end' || echo "Run A/B test to determine")

2. **PyTorch Routing**: Requires additional validation metrics

3. **RAG System**: Requires usage tracking integration

## Next Steps

- [ ] Enable RAG usage tracking in task execution
- [ ] Add PyTorch prediction logging
- [ ] Run validation weekly to track trends
- [ ] Set up automated alerts for degradation

REPORT_EOF

    echo "Validation report generated: $report_file"
}

##############################################################################
# Main execution
##############################################################################
main() {
    echo "═══════════════════════════════════════════════════════════"
    echo "  Cortex ML Validation Framework"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Validating ML features to determine if they provide value..."
    echo ""
    
    # Run A/B tests
    run_ab_test
    
    # Validate RAG
    validate_rag_effectiveness
    
    # Validate PyTorch
    validate_pytorch_routing
    
    # Generate report
    echo ""
    generate_validation_report
    
    print_header "Validation Complete"
    echo "Check $REPORTS_DIR for detailed results"
}

# Run if called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
