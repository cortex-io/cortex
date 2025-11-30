#!/usr/bin/env bash
# Analyze Cortex codebase for simplification opportunities

CORTEX_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "  Cortex Codebase Analysis"
echo "═══════════════════════════════════════════════════════════"
echo ""

# File counts
echo "📊 File Statistics:"
echo "-----------------------------------------------------------"
echo "Total files: $(find . -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/\.venv/*' | wc -l)"
echo "JavaScript files: $(find . -name '*.js' ! -path '*/node_modules/*' | wc -l)"
echo "Shell scripts: $(find . -name '*.sh' ! -path '*/node_modules/*' | wc -l)"
echo "Python files: $(find . -name '*.py' ! -path '*/.venv/*' | wc -l)"
echo "JSON files: $(find . -name '*.json' ! -path '*/node_modules/*' ! -path '*/.venv/*' | wc -l)"
echo ""

# Code size
echo "📏 Code Size:"
echo "-----------------------------------------------------------"
echo "Total lines of code: $(find . -type f \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) ! -path '*/node_modules/*' ! -path '*/.venv/*' ! -path '*/.git/*' -exec wc -l {} \; | awk '{sum+=$1} END {print sum}')"
echo ""

# Unused files (not referenced anywhere)
echo "🗑️  Potentially Unused Files:"
echo "-----------------------------------------------------------"

# Check for files with "test" in name that aren't in testing/
find . -name '*test*' -type f ! -path '*/testing/*' ! -path '*/node_modules/*' ! -path '*/.venv/*' | head -10

# Check for files with "old" or "backup" in name
echo ""
echo "Files marked as old/backup:"
find . -name '*old*' -o -name '*backup*' -o -name '*.bak' ! -path '*/node_modules/*' | head -10

# Empty directories
echo ""
echo "Empty directories:"
find . -type d -empty ! -path '*/node_modules/*' ! -path '*/.git/*'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Analysis Complete"
echo "═══════════════════════════════════════════════════════════"
