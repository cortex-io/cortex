#!/bin/bash
# Auto-Deployment System
# Automatically deploys fine-tuned models with A/B testing

set -euo pipefail

source scripts/lib/ab-testing.sh

MODELS_DIR="llm-mesh/auto-learning/models"

# ==============================================================================
# AUTO-DEPLOYMENT FUNCTIONS
# ==============================================================================

# Deploy fine-tuned model as challenger
# Args: $1=model_id, $2=master_name
deploy_as_challenger() {
    local model_id="$1"
    local master_name="$2"

    echo "Deploying $model_id as challenger for $master_name..."

    # Get current champion version
    local champion=$(jq -r '.champion' "coordination/masters/$master_name/aliases.json")

    echo "Current champion: $champion"

    # Create new version directory for fine-tuned model
    local new_version="ft-${model_id}"
    mkdir -p "coordination/masters/$master_name/$new_version"

    # Copy champion configuration
    cp -r "coordination/masters/$master_name/$champion/"* \
          "coordination/masters/$master_name/$new_version/" || true

    # Update model reference
    echo "$model_id" > "coordination/masters/$master_name/$new_version/model_id.txt"

    # Set as challenger
    jq ".challenger = \"$new_version\"" \
        "coordination/masters/$master_name/aliases.json" \
        > "/tmp/aliases.json.tmp"
    mv "/tmp/aliases.json.tmp" "coordination/masters/$master_name/aliases.json"

    echo "Deployed $new_version as challenger"
}

# Start A/B test for fine-tuned model
# Args: $1=model_id, $2=master_name, $3=traffic_split (default: 10)
start_ab_test() {
    local model_id="$1"
    local master_name="$2"
    local traffic_split="${3:-10}"  # Default 10% for challenger

    echo "Starting A/B test for $model_id..."

    # Get versions
    local champion=$(jq -r '.champion' "coordination/masters/$master_name/aliases.json")
    local challenger=$(jq -r '.challenger' "coordination/masters/$master_name/aliases.json")

    # Create A/B test
    local test_name="${master_name}-${model_id}"

    create_ab_test "$test_name" \
        "$master_name" \
        "$champion" \
        "$challenger" \
        $((100 - traffic_split))  # Champion gets remaining traffic

    echo "A/B test started: $test_name"
    echo "  Champion ($champion): $((100 - traffic_split))%"
    echo "  Challenger ($challenger): ${traffic_split}%"
}

# Check if fine-tuned model is better than baseline
# Args: $1=test_name, $2=min_tasks (default: 100)
# Returns: 0 if better, 1 if not
is_model_better() {
    local test_name="$1"
    local min_tasks="${2:-100}"

    # Get test summary
    local summary=$(get_ab_summary "$test_name")

    # Extract metrics
    local tasks_a=$(echo "$summary" | jq '.variants.a.tasks_completed')
    local tasks_b=$(echo "$summary" | jq '.variants.b.tasks_completed')

    # Need enough data
    if [[ $tasks_a -lt $min_tasks ]] || [[ $tasks_b -lt $min_tasks ]]; then
        echo "Not enough data yet (need $min_tasks tasks per variant)"
        return 2  # Insufficient data
    fi

    # Compare quality scores
    local quality_a=$(echo "$summary" | jq '.variants.a.avg_quality')
    local quality_b=$(echo "$summary" | jq '.variants.b.avg_quality')

    # Compare completion rates
    local completion_a=$(echo "$summary" | jq '.variants.a.completion_rate')
    local completion_b=$(echo "$summary" | jq '.variants.b.completion_rate')

    # Challenger must be significantly better (>5% improvement)
    local quality_improvement=$(echo "$quality_b - $quality_a" | bc -l)
    local completion_improvement=$(echo "$completion_b - $completion_a" | bc -l)

    if (( $(echo "$quality_improvement > 0.2" | bc -l) )) && \
       (( $(echo "$completion_improvement > 5" | bc -l) )); then
        echo "Challenger is better!"
        echo "  Quality improvement: +$quality_improvement"
        echo "  Completion improvement: +$completion_improvement%"
        return 0
    else
        echo "Challenger is not significantly better"
        echo "  Quality improvement: $quality_improvement (need >0.2)"
        echo "  Completion improvement: $completion_improvement% (need >5%)"
        return 1
    fi
}

# Auto-promote if fine-tuned model performs better
# Args: $1=test_name, $2=master_name
auto_promote_if_better() {
    local test_name="$1"
    local master_name="$2"

    echo "Checking if auto-promotion is warranted..."

    if is_model_better "$test_name" 100; then
        echo "🎉 Fine-tuned model outperforms baseline!"
        echo "Auto-promoting challenger to champion..."

        # Stop A/B test
        stop_ab_test "$test_name" "b"

        # Promote challenger
        ./scripts/promote-master.sh "$master_name"

        echo "✅ Auto-promotion complete!"

        # Log promotion event
        jq -n \
            --arg test "$test_name" \
            --arg master "$master_name" \
            --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{
                event: "auto_promotion",
                test_name: $test,
                master: $master,
                timestamp: $timestamp,
                reason: "Fine-tuned model outperformed baseline"
            }' >> "coordination/logs/auto-learning-events.jsonl"

        return 0
    else
        echo "⏸️  Fine-tuned model not ready for promotion yet"
        return 1
    fi
}

# ==============================================================================
# MAIN AUTO-DEPLOYMENT WORKFLOW
# ==============================================================================

# Full auto-deployment workflow
# Args: $1=model_id, $2=master_name
auto_deploy_workflow() {
    local model_id="$1"
    local master_name="$2"

    echo "=== Auto-Deployment Workflow ==="
    echo "Model: $model_id"
    echo "Master: $master_name"
    echo ""

    # Step 1: Deploy as challenger
    echo "[Step 1/3] Deploying as challenger..."
    deploy_as_challenger "$model_id" "$master_name"

    # Step 2: Start A/B test (10% traffic)
    echo "[Step 2/3] Starting A/B test..."
    start_ab_test "$model_id" "$master_name" 10

    # Step 3: Monitor and auto-promote
    echo "[Step 3/3] Monitoring for auto-promotion..."
    echo "Waiting for 100+ tasks per variant..."
    echo ""
    echo "💡 Use this command to check progress:"
    echo "   get_ab_summary '${master_name}-${model_id}'"
    echo ""
    echo "💡 To manually check promotion readiness:"
    echo "   auto_promote_if_better '${master_name}-${model_id}' '$master_name'"
}

# ==============================================================================
# EXPORT FUNCTIONS
# ==============================================================================

export -f deploy_as_challenger
export -f start_ab_test
export -f is_model_better
export -f auto_promote_if_better
export -f auto_deploy_workflow

# ==============================================================================
# CLI
# ==============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        deploy)
            auto_deploy_workflow "$2" "$3"
            ;;
        check)
            auto_promote_if_better "$2" "$3"
            ;;
        *)
            echo "Usage:"
            echo "  $0 deploy <model_id> <master_name>  - Deploy fine-tuned model"
            echo "  $0 check <test_name> <master_name>  - Check if ready to promote"
            exit 1
            ;;
    esac
fi
