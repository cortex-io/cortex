#!/bin/bash
# Asset Catalog Generator for Cortex
# Creates comprehensive catalog of all coordination files, schemas, and scripts

set -euo pipefail

CATALOG_FILE="coordination/catalog/asset-catalog.json"
CATALOG_DIR="coordination/catalog"

# ==============================================================================
# CATALOG GENERATION
# ==============================================================================

echo "Generating Cortex Asset Catalog..."

mkdir -p "$CATALOG_DIR"

# Initialize catalog
cat > "$CATALOG_FILE" <<'EOF'
{
  "generated_at": "",
  "cortex_version": "1.0",
  "summary": {
    "total_assets": 0,
    "by_category": {},
    "by_owner": {}
  },
  "assets": []
}
EOF

# Update timestamp
jq '.generated_at = (now | strftime("%Y-%m-%dT%H:%M:%S%z"))' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"

# ==============================================================================
# SCHEMA ASSETS
# ==============================================================================

echo "Cataloging schemas..."

for schema_file in coordination/schemas/*.json; do
    if [[ -f "$schema_file" ]]; then
        schema_name=$(basename "$schema_file" .json)

        # Extract schema metadata
        jq --arg file "$schema_file" \
           --arg name "$schema_name" \
           '.assets += [{
               asset_id: $name,
               category: "schema",
               name: $name,
               file_path: $file,
               description: "JSON schema definition",
               owner: "platform",
               required_by: [],
               last_modified: (now | strftime("%Y-%m-%d")),
               validation_required: true
           }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
        mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
    fi
done

# ==============================================================================
# PROMPT ASSETS
# ==============================================================================

echo "Cataloging prompts..."

# Master prompts
for prompt_file in coordination/prompts/masters/*.md; do
    if [[ -f "$prompt_file" ]]; then
        prompt_name=$(basename "$prompt_file" .md)

        jq --arg file "$prompt_file" \
           --arg name "$prompt_name" \
           '.assets += [{
               asset_id: ("prompt-master-" + $name),
               category: "prompt",
               subcategory: "master",
               name: $name,
               file_path: $file,
               description: ("System prompt for " + $name),
               owner: "platform",
               versioned: true,
               ab_test_eligible: true,
               last_modified: (now | strftime("%Y-%m-%d"))
           }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
        mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
    fi
done

# Worker prompts
for prompt_file in coordination/prompts/workers/*.md; do
    if [[ -f "$prompt_file" ]]; then
        prompt_name=$(basename "$prompt_file" .md)

        jq --arg file "$prompt_file" \
           --arg name "$prompt_name" \
           '.assets += [{
               asset_id: ("prompt-worker-" + $name),
               category: "prompt",
               subcategory: "worker",
               name: $name,
               file_path: $file,
               description: ("System prompt for " + $name),
               owner: "platform",
               versioned: true,
               ab_test_eligible: true,
               last_modified: (now | strftime("%Y-%m-%d"))
           }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
        mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
    fi
done

# ==============================================================================
# CONFIGURATION ASSETS
# ==============================================================================

echo "Cataloging configurations..."

# Routing config
if [[ -f "coordination/routing/config.json" ]]; then
    jq '.assets += [{
        asset_id: "routing-config",
        category: "configuration",
        name: "routing-config",
        file_path: "coordination/routing/config.json",
        description: "5-layer MoE routing configuration",
        owner: "coordinator-master",
        critical: true,
        requires_validation: true,
        schema: "routing-config.schema.json"
    }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
    mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
fi

# Master aliases
for master_dir in coordination/masters/*/; do
    if [[ -f "${master_dir}aliases.json" ]]; then
        master_name=$(basename "$master_dir")

        jq --arg master "$master_name" \
           --arg file "${master_dir}aliases.json" \
           '.assets += [{
               asset_id: ("aliases-" + $master),
               category: "configuration",
               subcategory: "version-alias",
               name: ($master + "-aliases"),
               file_path: $file,
               description: ("Version aliases for " + $master),
               owner: $master,
               critical: true,
               requires_validation: true
           }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
        mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
    fi
done

# ==============================================================================
# SCRIPT ASSETS
# ==============================================================================

echo "Cataloging scripts..."

# Count and catalog scripts
for script_dir in scripts/lib scripts/daemons scripts; do
    if [[ -d "$script_dir" ]]; then
        script_count=$(find "$script_dir" -maxdepth 1 -name "*.sh" -type f 2>/dev/null | wc -l | tr -d ' ')
        dir_name=$(basename "$script_dir")

        if [[ $script_count -gt 0 ]]; then
            jq --arg dir "$dir_name" \
               --arg count "$script_count" \
               '.assets += [{
                   asset_id: ("scripts-" + $dir),
                   category: "scripts",
                   subcategory: $dir,
                   name: ($dir + " scripts"),
                   count: ($count | tonumber),
                   description: ("Scripts in " + $dir + " directory"),
                   owner: "platform"
               }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
            mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"
        fi
    fi
done

# ==============================================================================
# LIBRARY ASSETS
# ==============================================================================

echo "Cataloging libraries..."

lib_count=$(find scripts/lib -maxdepth 1 -name "*.sh" -type f 2>/dev/null | wc -l | tr -d ' ')

jq --arg count "$lib_count" \
   '.assets += [{
       asset_id: "libraries",
       category: "library",
       name: "libraries",
       count: ($count | tonumber),
       description: "Bash libraries in scripts/lib",
       owner: "platform",
       reusable: true
   }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"

# ==============================================================================
# DOCUMENTATION ASSETS
# ==============================================================================

echo "Cataloging documentation..."

doc_count=$(find docs -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

jq --arg count "$doc_count" \
   '.assets += [{
       asset_id: "documentation",
       category: "documentation",
       name: "documentation",
       count: ($count | tonumber),
       description: "Documentation files in docs directory",
       owner: "platform",
       public: true
   }]' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"

# ==============================================================================
# SUMMARY STATISTICS
# ==============================================================================

echo "Generating summary statistics..."

# Update summary counts
jq '.summary.total_assets = (.assets | length) |
    .summary.by_category = (.assets | group_by(.category) | map({
        (.[0].category): length
    }) | add) |
    .summary.by_owner = (.assets | group_by(.owner) | map({
        (.[0].owner): length
    }) | add)' "$CATALOG_FILE" > "$CATALOG_FILE.tmp"
mv "$CATALOG_FILE.tmp" "$CATALOG_FILE"

# ==============================================================================
# VALIDATION REPORT
# ==============================================================================

echo "Generating validation report..."

VALIDATION_REPORT="$CATALOG_DIR/validation-report.json"

jq '{
    generated_at: (now | strftime("%Y-%m-%dT%H:%M:%S%z")),
    total_assets: .summary.total_assets,
    critical_assets: (.assets | map(select(.critical == true)) | length),
    assets_requiring_validation: (.assets | map(select(.requires_validation == true or .validation_required == true)) | length),
    assets_with_schemas: (.assets | map(select(.schema != null)) | length),
    validation_checklist: (.assets | map(select(.requires_validation == true or .validation_required == true)) | map({
        asset_id,
        file_path,
        schema,
        owner
    }))
}' "$CATALOG_FILE" > "$VALIDATION_REPORT"

# ==============================================================================
# OUTPUT
# ==============================================================================

echo ""
echo "=== Asset Catalog Generated ==="
echo "Catalog file: $CATALOG_FILE"
echo "Validation report: $VALIDATION_REPORT"
echo ""
jq '.summary' "$CATALOG_FILE"
echo ""
echo "Critical assets requiring validation:"
jq -r '.validation_checklist[] | "  - " + .asset_id + " (" + .file_path + ")"' "$VALIDATION_REPORT"

echo ""
echo "Done!"
