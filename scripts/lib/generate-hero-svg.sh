#!/usr/bin/env bash
#
# Generate unique SVG hero images for blog posts
#

generate_cortex_svg() {
    local output_file="$1"
    local title="$2"
    local variant="${3:-1}"

    # Color variations
    local colors=(
        "#00ff9d #00d4ff"  # Green/Cyan
        "#ff00ff #00ffff"  # Magenta/Cyan
        "#ffaa00 #ff0088"  # Orange/Pink
        "#00ff00 #0088ff"  # Green/Blue
        "#ff6600 #ffff00"  # Orange/Yellow
    )

    local color_idx=$((variant % 5))
    local color_pair=(${colors[$color_idx]})
    local color1="${color_pair[0]}"
    local color2="${color_pair[1]}"

    cat > "$output_file" << EOF
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg${variant}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0e27;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1a1f3a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d1b2a;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="grad${variant}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
    </linearGradient>
    <radialGradient id="glow${variant}" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:0.6" />
      <stop offset="100%" style="stop-color:${color1};stop-opacity:0" />
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg${variant})"/>

  <!-- Circuit pattern -->
  <g opacity="0.08" stroke="${color1}" stroke-width="1">
    <line x1="100" y1="100" x2="300" y2="100"/>
    <line x1="300" y1="100" x2="300" y2="200"/>
    <line x1="500" y1="150" x2="700" y2="150"/>
    <circle cx="300" cy="100" r="4" fill="${color1}"/>
    <circle cx="700" cy="150" r="4" fill="${color1}"/>
  </g>

  <!-- Central element -->
  <g transform="translate(600, 315)">
    <circle cx="0" cy="0" r="120" fill="url(#glow${variant})" opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle cx="0" cy="0" r="80" fill="none" stroke="url(#grad${variant})" stroke-width="3">
      <animate attributeName="r" values="80;85;80" dur="2s" repeatCount="indefinite"/>
    </circle>
  </g>

  <!-- Corner indicators -->
  <circle cx="40" cy="40" r="8" fill="${color1}" opacity="0.8">
    <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="1160" cy="40" r="8" fill="${color2}" opacity="0.8">
    <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="0.5s" repeatCount="indefinite"/>
  </circle>

  <!-- Accent bars -->
  <rect x="0" y="0" width="1200" height="4" fill="${color1}" opacity="0.4"/>
  <rect x="0" y="626" width="1200" height="4" fill="${color2}" opacity="0.4"/>

  <!-- Corner brackets -->
  <g stroke="${color1}" stroke-width="3" fill="none" opacity="0.6">
    <path d="M 20,60 L 20,20 L 60,20"/>
    <path d="M 1180,60 L 1180,20 L 1140,20"/>
    <path d="M 20,570 L 20,610 L 60,610"/>
    <path d="M 1180,570 L 1180,610 L 1140,610"/>
  </g>
</svg>
EOF
}

# Export function
export -f generate_cortex_svg
