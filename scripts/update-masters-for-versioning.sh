#!/bin/bash

################################################################################
# Update Master Scripts for Version Aliasing
#
# Purpose: Updates all run-*-master.sh scripts to use version aliases
# This is a one-time migration script
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Updating all master scripts to use version aliases..."

for master in coordinator security development inventory cicd; do
    script_file="${SCRIPT_DIR}/run-${master}-master.sh"

    if [ ! -f "$script_file" ]; then
        echo "Warning: $script_file not found, skipping"
        continue
    fi

    echo "Updating $script_file..."

    # Create backup
    cp "$script_file" "${script_file}.backup"

    # Add version alias sourcing after other library sources
    # Find the line with "source.*lib/coordination.sh" and add version alias after it
    sed -i '' '/source.*lib\/coordination.sh/a\
source "$SCRIPT_DIR/lib/read-alias.sh"
' "$script_file"

    # Add version validation in the main() function, right after log_section
    # Find "log_section \"Starting" and add version check after it
    sed -i '' "/log_section \"Starting.*MASTER_NAME/a\\
\\
    # Validate master version\\
    if ! validate_champion \"$master\"; then\\
        log_error \"Champion version validation failed for $master\"\\
        exit 1\\
    fi\\
    MASTER_VERSION=\$(get_champion_version \"$master\")\\
    log_info \"Running champion version: \$MASTER_VERSION\"\\
" "$script_file"

    echo "  - Added version alias library source"
    echo "  - Added version validation"
    echo "  - Backup created: ${script_file}.backup"
done

echo ""
echo "All master scripts updated successfully!"
echo "Backups saved with .backup extension"
echo ""
echo "To test, run: ./scripts/run-coordinator-master.sh"
