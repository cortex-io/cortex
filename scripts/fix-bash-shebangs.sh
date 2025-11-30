#!/usr/bin/env bash
#
# Fix bash shebangs to use /usr/bin/env bash for compatibility
# This ensures scripts use the modern bash in PATH instead of macOS default bash 3.2
#

set -euo pipefail

echo "════════════════════════════════════════════════════════════"
echo "  Fixing Bash Shebangs for Compatibility"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Replacing #!/bin/bash with #!/usr/bin/env bash"
echo ""

count=0

# Find all .sh files with #!/bin/bash shebang
while IFS= read -r script; do
  # Check if first line is exactly #!/bin/bash
  if head -1 "$script" | grep -q "^#!/bin/bash$"; then
    echo "Fixing: $script"

    # Use sed to replace the shebang (macOS compatible)
    sed -i '' '1s|^#!/bin/bash$|#!/usr/bin/env bash|' "$script"

    count=$((count + 1))
  fi
done < <(find scripts coordination testing -name "*.sh" -type f 2>/dev/null)

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Fixed $count bash scripts"
echo ""
echo "Verification:"
/usr/bin/env bash --version | head -1
echo ""
echo "Scripts will now use modern bash with associative array support."
echo "════════════════════════════════════════════════════════════"
