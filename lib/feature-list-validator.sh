#!/bin/bash

# Feature List Validator
# Validates feature list JSON files against schema

validate_feature_list() {
  local feature_list_file=$1

  if [ ! -f "$feature_list_file" ]; then
    echo "ERROR: Feature list file not found: $feature_list_file"
    return 1
  fi

  # Check if it's valid JSON
  if ! jq . "$feature_list_file" > /dev/null 2>&1; then
    echo "ERROR: Invalid JSON in feature list"
    return 1
  fi

  # Validate required top-level fields
  local required_fields=("task_id" "total_features" "completed" "created_at" "features")

  for field in "${required_fields[@]}"; do
    if ! jq -e ".$field" "$feature_list_file" > /dev/null 2>&1; then
      echo "ERROR: Missing required field: $field"
      return 1
    fi
  done

  # Validate features array
  local feature_count=$(jq '.features | length' "$feature_list_file")
  local total_features=$(jq '.total_features' "$feature_list_file")

  if [ "$feature_count" -ne "$total_features" ]; then
    echo "ERROR: Feature count mismatch (total_features: $total_features, actual: $feature_count)"
    return 1
  fi

  # Validate each feature
  local invalid_features=$(jq -r '
    .features[] |
    select(
      .feature_id == null or
      .description == null or
      .status == null or
      .priority == null or
      .test_command == null
    ) |
    .feature_id // "unknown"
  ' "$feature_list_file")

  if [ -n "$invalid_features" ]; then
    echo "ERROR: Invalid features found:"
    echo "$invalid_features"
    return 1
  fi

  # Validate status values
  local invalid_status=$(jq -r '
    .features[] |
    select(.status != "failing" and .status != "in_progress" and .status != "passing" and .status != "blocked") |
    .feature_id
  ' "$feature_list_file")

  if [ -n "$invalid_status" ]; then
    echo "ERROR: Invalid status values in features:"
    echo "$invalid_status"
    return 1
  fi

  # Validate priority values
  local invalid_priority=$(jq -r '
    .features[] |
    select(.priority != "high" and .priority != "medium" and .priority != "low") |
    .feature_id
  ' "$feature_list_file")

  if [ -n "$invalid_priority" ]; then
    echo "ERROR: Invalid priority values in features:"
    echo "$invalid_priority"
    return 1
  fi

  # Check for duplicate feature IDs
  local duplicate_ids=$(jq -r '.features[].feature_id' "$feature_list_file" | sort | uniq -d)

  if [ -n "$duplicate_ids" ]; then
    echo "ERROR: Duplicate feature IDs found:"
    echo "$duplicate_ids"
    return 1
  fi

  echo "Feature list validation passed"
  return 0
}

# Get next available feature (no dependencies or all dependencies met)
get_next_feature() {
  local feature_list_file=$1

  # Get features with no dependencies first
  jq -r '.features[] | select(.status == "failing" and (.dependencies | length) == 0) | .feature_id' "$feature_list_file" | head -1
}

# Update feature status
update_feature_status() {
  local feature_list_file=$1
  local feature_id=$2
  local new_status=$3
  local test_results=${4:-null}

  local temp_file="${feature_list_file}.tmp"

  jq \
    --arg fid "$feature_id" \
    --arg status "$new_status" \
    --argjson results "$test_results" \
    '
    .features = [
      .features[] |
      if .feature_id == $fid then
        .status = $status |
        .updated_at = (now | todate) |
        if $results != null then
          .test_results = $results
        else . end |
        if $status == "passing" then
          .completed_at = (now | todate)
        else . end |
        if $status == "in_progress" then
          .assigned_to = env.WORKER_ID
        else . end
      else . end
    ] |
    .completed = ([.features[] | select(.status == "passing")] | length)
    ' "$feature_list_file" > "$temp_file"

  mv "$temp_file" "$feature_list_file"
}

# Get feature details
get_feature() {
  local feature_list_file=$1
  local feature_id=$2

  jq --arg fid "$feature_id" \
    '.features[] | select(.feature_id == $fid)' \
    "$feature_list_file"
}

# Get feature statistics
get_feature_stats() {
  local feature_list_file=$1

  jq '{
    total: .total_features,
    completed: ([.features[] | select(.status == "passing")] | length),
    in_progress: ([.features[] | select(.status == "in_progress")] | length),
    failing: ([.features[] | select(.status == "failing")] | length),
    blocked: ([.features[] | select(.status == "blocked")] | length),
    completion_percentage: (([.features[] | select(.status == "passing")] | length) / .total_features * 100 | round)
  }' "$feature_list_file"
}

# Export functions if sourced
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
  export -f validate_feature_list
  export -f get_next_feature
  export -f update_feature_status
  export -f get_feature
  export -f get_feature_stats
fi
