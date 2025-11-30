#!/usr/bin/env bash

# Knowledge Base Search
# Search across master knowledge bases, routing history, and completed tasks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
MASTERS_DIR="${CORTEX_ROOT}/coordination/masters"
TASKS_DIR="${CORTEX_ROOT}/coordination/tasks"
ROUTING_LOG="${CORTEX_ROOT}/coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl"

# Search by keywords across all knowledge bases
search_by_keywords() {
    local query="$1"
    local max_results="${2:-10}"

    local results=()
    local result_count=0

    # Search in all master knowledge bases
    for master_dir in "${MASTERS_DIR}"/*; do
        if [[ -d "$master_dir/knowledge-base" ]]; then
            local master_name
            master_name=$(basename "$master_dir")

            # Search JSONL files
            for kb_file in "$master_dir/knowledge-base"/*.jsonl; do
                if [[ -f "$kb_file" ]]; then
                    local kb_name
                    kb_name=$(basename "$kb_file" .jsonl)

                    # Search for query in file (case-insensitive)
                    local matches
                    matches=$(grep -i "$query" "$kb_file" 2>/dev/null || true)

                    if [[ -n "$matches" ]]; then
                        while IFS= read -r line; do
                            if [[ $result_count -ge $max_results ]]; then
                                break 2
                            fi

                            # Extract relevant info from JSON line
                            local timestamp
                            timestamp=$(echo "$line" | jq -r '.timestamp // .created_at // "unknown"' 2>/dev/null || echo "unknown")

                            local relevance_score=0.5
                            # Simple relevance scoring based on keyword frequency
                            local keyword_count
                            keyword_count=$(echo "$line" | grep -io "$query" | wc -l | tr -d ' ')
                            relevance_score=$(echo "scale=2; 0.5 + ($keyword_count * 0.1)" | bc | awk '{if($1>1.0) print 1.0; else print $1}')

                            results+=("{\"master\":\"${master_name}\",\"source\":\"${kb_name}\",\"timestamp\":\"${timestamp}\",\"relevance\":${relevance_score},\"content\":$(echo "$line" | jq -c '.')}")
                            result_count=$((result_count + 1))
                        done <<< "$matches"
                    fi
                fi
            done
        fi
    done

    # Output results as JSON array
    if [[ ${#results[@]} -gt 0 ]]; then
        echo "[$(IFS=','; echo "${results[*]}")]" | jq -c 'sort_by(-.relevance)'
    else
        echo "[]"
    fi
}

# Find similar tasks based on description
find_similar_tasks() {
    local task_description="$1"
    local max_results="${2:-5}"

    local results=()
    local result_count=0

    # Extract keywords from task description (simple tokenization)
    local keywords
    keywords=$(echo "$task_description" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | grep -v '^$' | sort -u)

    # Search completed tasks
    if [[ -d "$TASKS_DIR" ]]; then
        for task_file in "$TASKS_DIR"/task-*.json; do
            if [[ -f "$task_file" ]]; then
                local task_id
                task_id=$(basename "$task_file" .json)

                local task_content
                task_content=$(cat "$task_file")

                local task_desc
                task_desc=$(echo "$task_content" | jq -r '.description // .task_description // ""' 2>/dev/null || echo "")

                if [[ -z "$task_desc" ]]; then
                    continue
                fi

                # Calculate similarity score (keyword overlap)
                local task_desc_lower
                task_desc_lower=$(echo "$task_desc" | tr '[:upper:]' '[:lower:]')

                local match_count=0
                local total_keywords=0

                while IFS= read -r keyword; do
                    if [[ -n "$keyword" && ${#keyword} -gt 3 ]]; then  # Skip short words
                        total_keywords=$((total_keywords + 1))
                        if [[ "$task_desc_lower" == *"$keyword"* ]]; then
                            match_count=$((match_count + 1))
                        fi
                    fi
                done <<< "$keywords"

                if [[ $total_keywords -gt 0 ]]; then
                    local similarity
                    similarity=$(echo "scale=2; $match_count / $total_keywords" | bc)

                    # Only include if similarity > 0.2
                    if (( $(echo "$similarity > 0.2" | bc -l) )); then
                        local master
                        master=$(echo "$task_content" | jq -r '.master // "unknown"' 2>/dev/null || echo "unknown")

                        local status
                        status=$(echo "$task_content" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

                        results+=("{\"task_id\":\"${task_id}\",\"master\":\"${master}\",\"status\":\"${status}\",\"similarity\":${similarity},\"description\":\"${task_desc}\"}")
                        result_count=$((result_count + 1))

                        if [[ $result_count -ge $max_results ]]; then
                            break
                        fi
                    fi
                fi
            fi
        done
    fi

    # Output results sorted by similarity
    if [[ ${#results[@]} -gt 0 ]]; then
        echo "[$(IFS=','; echo "${results[*]}")]" | jq -c 'sort_by(-.similarity) | .[:'"$max_results"']'
    else
        echo "[]"
    fi
}

# Get routing history for similar keywords
get_routing_history() {
    local keywords="$1"
    local max_results="${2:-10}"

    if [[ ! -f "$ROUTING_LOG" ]]; then
        echo "[]"
        return
    fi

    local results=()
    local result_count=0

    # Search routing decisions log
    local matches
    matches=$(grep -i "$keywords" "$ROUTING_LOG" 2>/dev/null || true)

    if [[ -n "$matches" ]]; then
        while IFS= read -r line; do
            if [[ $result_count -ge $max_results ]]; then
                break
            fi

            local decision
            decision=$(echo "$line" | jq -r '.recommended_master // .master // "unknown"' 2>/dev/null || echo "unknown")

            local confidence
            confidence=$(echo "$line" | jq -r '.confidence // 0.5' 2>/dev/null || echo "0.5")

            local outcome
            outcome=$(echo "$line" | jq -r '.outcome // "unknown"' 2>/dev/null || echo "unknown")

            local timestamp
            timestamp=$(echo "$line" | jq -r '.timestamp // "unknown"' 2>/dev/null || echo "unknown")

            results+=("{\"decision\":\"${decision}\",\"confidence\":${confidence},\"outcome\":\"${outcome}\",\"timestamp\":\"${timestamp}\"}")
            result_count=$((result_count + 1))
        done <<< "$matches"
    fi

    if [[ ${#results[@]} -gt 0 ]]; then
        echo "[$(IFS=','; echo "${results[*]}")]" | jq -c '.'
    else
        echo "[]"
    fi
}

# Suggest master based on combined search results
suggest_master() {
    local query="$1"

    # Search knowledge bases
    local kb_results
    kb_results=$(search_by_keywords "$query" 5)

    # Find similar tasks
    local similar_tasks
    similar_tasks=$(find_similar_tasks "$query" 5)

    # Get routing history
    local routing_history
    routing_history=$(get_routing_history "$query" 5)

    # Count master occurrences weighted by relevance/similarity
    declare -A master_scores

    # Weight from KB results (weight: relevance)
    if [[ "$kb_results" != "[]" ]]; then
        while IFS= read -r result; do
            if [[ -n "$result" ]]; then
                local master
                master=$(echo "$result" | jq -r '.master')

                local relevance
                relevance=$(echo "$result" | jq -r '.relevance')

                if [[ -n "${master_scores[$master]:-}" ]]; then
                    master_scores[$master]=$(echo "${master_scores[$master]} + $relevance" | bc)
                else
                    master_scores[$master]=$relevance
                fi
            fi
        done < <(echo "$kb_results" | jq -c '.[]')
    fi

    # Weight from similar tasks (weight: similarity * 1.5)
    if [[ "$similar_tasks" != "[]" ]]; then
        while IFS= read -r result; do
            if [[ -n "$result" ]]; then
                local master
                master=$(echo "$result" | jq -r '.master')

                local similarity
                similarity=$(echo "$result" | jq -r '.similarity')

                local weighted_score
                weighted_score=$(echo "$similarity * 1.5" | bc)

                if [[ -n "${master_scores[$master]:-}" ]]; then
                    master_scores[$master]=$(echo "${master_scores[$master]} + $weighted_score" | bc)
                else
                    master_scores[$master]=$weighted_score
                fi
            fi
        done < <(echo "$similar_tasks" | jq -c '.[]')
    fi

    # Weight from routing history (weight: confidence * 2.0 if outcome=success)
    if [[ "$routing_history" != "[]" ]]; then
        while IFS= read -r result; do
            if [[ -n "$result" ]]; then
                local master
                master=$(echo "$result" | jq -r '.decision')

                local confidence
                confidence=$(echo "$result" | jq -r '.confidence')

                local outcome
                outcome=$(echo "$result" | jq -r '.outcome')

                local weight=1.5
                if [[ "$outcome" == "success" ]]; then
                    weight=2.0
                fi

                local weighted_score
                weighted_score=$(echo "$confidence * $weight" | bc)

                if [[ -n "${master_scores[$master]:-}" ]]; then
                    master_scores[$master]=$(echo "${master_scores[$master]} + $weighted_score" | bc)
                else
                    master_scores[$master]=$weighted_score
                fi
            fi
        done < <(echo "$routing_history" | jq -c '.[]')
    fi

    # Find master with highest score
    local recommended_master="coordinator-master"  # default
    local max_score=0.0

    for master in "${!master_scores[@]}"; do
        local score=${master_scores[$master]}
        if (( $(echo "$score > $max_score" | bc -l) )); then
            max_score=$score
            recommended_master=$master
        fi
    done

    # Calculate confidence based on score separation
    local confidence=0.5
    if (( $(echo "$max_score > 0" | bc -l) )); then
        # Normalize confidence to 0.6-0.95 range
        confidence=$(echo "scale=2; 0.6 + ($max_score / 10) * 0.35" | bc | awk '{if($1>0.95) print 0.95; else print $1}')
    fi

    # Build response
    local response=$(cat <<EOF
{
  "query": "$query",
  "relevant_kb_results": $kb_results,
  "similar_tasks": $similar_tasks,
  "routing_precedents": $routing_history,
  "recommended_master": "$recommended_master",
  "confidence": $confidence,
  "reasoning": "Based on ${#master_scores[@]} master(s) analysis: $(for m in "${!master_scores[@]}"; do echo "$m=${master_scores[$m]}"; done | tr '\n' ' ')"
}
EOF
)

    echo "$response" | jq -c '.'
}

# Search for specific task by ID
search_task_by_id() {
    local task_id="$1"

    local task_file="${TASKS_DIR}/${task_id}.json"

    if [[ -f "$task_file" ]]; then
        cat "$task_file" | jq -c '.'
    else
        echo "{\"error\":\"Task ${task_id} not found\"}"
        return 1
    fi
}

# CLI interface
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        search)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 search <query> [max_results]"
                exit 1
            fi
            search_by_keywords "$2" "${3:-10}"
            ;;

        similar)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 similar <task_description> [max_results]"
                exit 1
            fi
            shift
            find_similar_tasks "$*" "${2:-5}"
            ;;

        routing)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 routing <keywords> [max_results]"
                exit 1
            fi
            get_routing_history "$2" "${3:-10}"
            ;;

        suggest)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 suggest <query>"
                exit 1
            fi
            shift
            suggest_master "$*"
            ;;

        task)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 task <task_id>"
                exit 1
            fi
            search_task_by_id "$2"
            ;;

        *)
            echo "Usage: $0 {search|similar|routing|suggest|task} [args...]"
            echo ""
            echo "Commands:"
            echo "  search <query> [max]       - Search knowledge bases by keywords"
            echo "  similar <description> [max] - Find similar tasks"
            echo "  routing <keywords> [max]    - Get routing history"
            echo "  suggest <query>             - Suggest master for query"
            echo "  task <task_id>              - Get task by ID"
            exit 1
            ;;
    esac
fi
