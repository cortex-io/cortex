#!/usr/bin/env bash
#
# Batch generate unique SVG hero images for all blog posts
#

set -euo pipefail

BLOG_ROOT="/Users/ryandahlberg/Projects/blog"
IMAGES_DIR="$BLOG_ROOT/public/images/posts"

# Generate unique SVG with theme variations
generate_unique_svg() {
    local filename="$1"
    local variant="$2"
    local output_path="$IMAGES_DIR/${filename}"

    # Color schemes (each post gets different colors)
    local colors=(
        "#00ff9d" "#00d4ff"  # Variant 1: Green/Cyan
        "#ff00ff" "#00ffff"  # Variant 2: Magenta/Cyan
        "#ffaa00" "#ff0088"  # Variant 3: Orange/Pink
        "#00ff00" "#0088ff"  # Variant 4: Green/Blue
        "#ff6600" "#ffff00"  # Variant 5: Orange/Yellow
        "#00ffaa" "#aa00ff"  # Variant 6: Cyan/Purple
        "#ff3366" "#66ff33"  # Variant 7: Red/Green
        "#3366ff" "#ff6633"  # Variant 8: Blue/Orange
        "#ff0066" "#00ff66"  # Variant 9: Pink/Green
        "#6600ff" "#ff9900"  # Variant 10: Purple/Orange
    )

    local idx1=$(( (variant * 2) % 20 ))
    local idx2=$(( (variant * 2 + 1) % 20 ))
    local color1="${colors[$idx1]}"
    local color2="${colors[$idx2]}"

    # Shape variations
    local shapes=("circle" "rect" "polygon" "path")
    local shape_idx=$((variant % 4))
    local shape="${shapes[$shape_idx]}"

    # Pattern variations
    local pattern=$((variant % 5))

    cat > "$output_path" << EOF
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg_$variant" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0e27;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1a1f3a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d1b2a;stop-opacity:1" />
    </linearGradient>

    <linearGradient id="grad_$variant" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:$color1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:$color2;stop-opacity:1" />
    </linearGradient>

    <radialGradient id="glow_$variant" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:$color1;stop-opacity:0.6" />
      <stop offset="100%" style="stop-color:$color1;stop-opacity:0" />
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg_$variant)"/>

  <!-- Circuit pattern variation $pattern -->
  <g opacity="0.08" stroke="$color1" stroke-width="1">
EOF

    # Different circuit patterns based on variant
    case $pattern in
        0)
            cat >> "$output_path" << 'EOF'
    <line x1="100" y1="100" x2="300" y2="100"/>
    <line x1="300" y1="100" x2="300" y2="200"/>
    <line x1="500" y1="150" x2="700" y2="150"/>
    <line x1="700" y1="150" x2="700" y2="300"/>
    <circle cx="300" cy="100" r="4" fill="inherit"/>
    <circle cx="700" cy="150" r="4" fill="inherit"/>
EOF
            ;;
        1)
            cat >> "$output_path" << 'EOF'
    <line x1="200" y1="200" x2="400" y2="200"/>
    <line x1="400" y1="200" x2="400" y2="400"/>
    <line x1="800" y1="250" x2="1000" y2="250"/>
    <circle cx="400" cy="200" r="4" fill="inherit"/>
    <circle cx="1000" cy="250" r="4" fill="inherit"/>
EOF
            ;;
        2)
            cat >> "$output_path" << 'EOF'
    <line x1="150" y1="300" x2="350" y2="300"/>
    <line x1="600" y1="100" x2="800" y2="100"/>
    <line x1="800" y1="100" x2="800" y2="250"/>
    <circle cx="350" cy="300" r="4" fill="inherit"/>
    <circle cx="800" cy="250" r="4" fill="inherit"/>
EOF
            ;;
        3)
            cat >> "$output_path" << 'EOF'
    <line x1="250" y1="150" x2="450" y2="150"/>
    <line x1="700" y1="400" x2="900" y2="400"/>
    <line x1="900" y1="400" x2="900" y2="500"/>
    <circle cx="450" cy="150" r="4" fill="inherit"/>
    <circle cx="900" cy="500" r="4" fill="inherit"/>
EOF
            ;;
        4)
            cat >> "$output_path" << 'EOF'
    <line x1="300" y1="250" x2="500" y2="250"/>
    <line x1="750" y1="150" x2="950" y2="150"/>
    <line x1="950" y1="150" x2="950" y2="350"/>
    <circle cx="500" cy="250" r="4" fill="inherit"/>
    <circle cx="950" cy="350" r="4" fill="inherit"/>
EOF
            ;;
    esac

    cat >> "$output_path" << EOF
  </g>

  <!-- Central design element -->
  <g transform="translate(600, 315)">
    <circle cx="0" cy="0" r="$((120 + variant * 5))" fill="url(#glow_$variant)" opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.7;0.4" dur="$((2 + variant % 2))s" repeatCount="indefinite"/>
    </circle>
EOF

    # Different center shapes based on variant
    case $shape_idx in
        0) # Circle
            cat >> "$output_path" << EOF
    <circle cx="0" cy="0" r="$((70 + variant * 3))" fill="none" stroke="url(#grad_$variant)" stroke-width="3">
      <animate attributeName="r" values="$((70 + variant * 3));$((75 + variant * 3));$((70 + variant * 3))" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="0" cy="0" r="$((50 + variant * 2))" fill="none" stroke="$color2" stroke-width="2" opacity="0.6"/>
EOF
            ;;
        1) # Rectangle
            cat >> "$output_path" << EOF
    <rect x="-$((60 + variant * 3))" y="-$((60 + variant * 3))" width="$((120 + variant * 6))" height="$((120 + variant * 6))"
          fill="none" stroke="url(#grad_$variant)" stroke-width="3" rx="10">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/>
    </rect>
EOF
            ;;
        2) # Polygon
            cat >> "$output_path" << EOF
    <polygon points="-$((70 + variant * 3)),0 0,-$((70 + variant * 3)) $((70 + variant * 3)),0 0,$((70 + variant * 3))"
             fill="none" stroke="url(#grad_$variant)" stroke-width="3">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="15s" repeatCount="indefinite"/>
    </polygon>
EOF
            ;;
        3) # Star path
            cat >> "$output_path" << EOF
    <path d="M 0,-$((80 + variant * 3)) L $((20 + variant)),-$((20 + variant)) L $((80 + variant * 3)),0 L $((20 + variant)),$((20 + variant)) L 0,$((80 + variant * 3)) L -$((20 + variant)),$((20 + variant)) L -$((80 + variant * 3)),0 L -$((20 + variant)),-$((20 + variant)) Z"
          fill="none" stroke="url(#grad_$variant)" stroke-width="3">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite"/>
    </path>
EOF
            ;;
    esac

    cat >> "$output_path" << EOF
  </g>

  <!-- Animated particles -->
  <g>
EOF

    # Random particles based on variant
    for i in {1..4}; do
        local px=$((100 + (variant * 137 + i * 227) % 1000))
        local py=$((100 + (variant * 173 + i * 311) % 430))
        cat >> "$output_path" << EOF
    <circle cx="$px" cy="$py" r="3" fill="$color1">
      <animateTransform attributeName="transform" type="translate"
        values="0,0; 0,-20; 0,0" dur="$((2 + i))s" begin="${i}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.3;1;0.3" dur="$((2 + i))s" begin="${i}s" repeatCount="indefinite"/>
    </circle>
EOF
    done

    cat >> "$output_path" << EOF
  </g>

  <!-- Corner status indicators -->
  <g>
    <circle cx="40" cy="40" r="8" fill="$color1" opacity="0.8">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="1160" cy="40" r="8" fill="$color2" opacity="0.8">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="0.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="40" cy="590" r="8" fill="$color1" opacity="0.8">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="1s" repeatCount="indefinite"/>
    </circle>
    <circle cx="1160" cy="590" r="8" fill="$color2" opacity="0.8">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="1.5s" repeatCount="indefinite"/>
    </circle>
  </g>

  <!-- Decorative accent bars -->
  <rect x="0" y="0" width="1200" height="4" fill="$color1" opacity="0.4"/>
  <rect x="0" y="626" width="1200" height="4" fill="$color2" opacity="0.4"/>

  <!-- Corner brackets (HUD style) -->
  <g stroke="$color1" stroke-width="3" fill="none" opacity="0.6">
    <path d="M 20,60 L 20,20 L 60,20"/>
    <path d="M 1180,60 L 1180,20 L 1140,20"/>
    <path d="M 20,570 L 20,610 L 60,610"/>
    <path d="M 1180,570 L 1180,610 L 1140,610"/>
  </g>
</svg>
EOF

    echo "Generated: $filename"
}

# Main execution
main() {
    cd "$BLOG_ROOT"

    echo "Generating unique SVG hero images..."

    local variant=1

    # Get all posts with .jpg images
    for post in src/content/posts/*.md; do
        # Check if post uses .jpg image
        local jpg_image=$(grep "^\s*image:.*\.jpg" "$post" | head -1 | awk '{print $2}' | sed 's|/images/posts/||')

        if [ -n "$jpg_image" ]; then
            # Generate SVG filename
            local svg_filename="${jpg_image%.jpg}.svg"

            # Generate unique SVG
            generate_unique_svg "$svg_filename" $variant

            # Update post frontmatter to use SVG
            local jpg_path="/images/posts/$jpg_image"
            local svg_path="/images/posts/$svg_filename"
            sed -i '' "s|$jpg_path|$svg_path|g" "$post"

            echo "Updated: $(basename "$post")"

            ((variant++))
        fi
    done

    echo "✅ Generated $((variant - 1)) unique SVG hero images!"
}

main
