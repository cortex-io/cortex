# Blog Post Images

This directory contains featured images and graphics for blog posts.

## Image Guidelines

### Featured Images (Hero Images)
- **Dimensions:** 1200x630px (optimal for social media sharing)
- **Format:** PNG or JPEG
- **File size:** < 500KB (optimized for web)
- **Naming:** `post-slug-hero.png` or `post-slug-hero.jpg`

### In-Post Images
- **Dimensions:** 800-1200px wide
- **Format:** PNG for diagrams, JPEG for photos
- **File size:** < 300KB per image
- **Naming:** `post-slug-description.png`

## Current Images

### cortex-ai-agents-hero.png
**Post:** 2025-12-03 - Transforming Cortex: From Task Router to Autonomous AI Agent Platform
**Description:** Hero image showing the AI Agents system architecture with autonomous execution, reasoning, orchestration, and safety controls
**Dimensions:** 1200x630px
**Status:** Placeholder (needs design)

## Creating Images

For diagrams and technical illustrations:
- Use tools like Figma, Sketch, or Excalidraw
- Maintain Cortex brand colors: #0066CC (primary), #00CC66 (success), #FF6B6B (danger)
- Use clear, readable fonts (minimum 14px for body text)
- Include the Cortex logo in bottom-right corner

For social media cards:
- Include post title prominently
- Add key visual element (icon, diagram, or illustration)
- Use high contrast for readability
- Test on both light and dark backgrounds

## Image Optimization

Before committing images:
```bash
# Install optimization tools
brew install imageoptim-cli

# Optimize images
imageoptim --quality=85 projects/blog/images/*.png
```

## Placeholder Images

Until custom images are created, you can use:
- Unsplash (https://unsplash.com) - Free high-quality photos
- Hero Patterns (https://heropatterns.com) - SVG background patterns
- unDraw (https://undraw.co) - Illustration library

Remember to check licenses and provide attribution where required.
