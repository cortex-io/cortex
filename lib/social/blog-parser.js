#!/usr/bin/env node

/**
 * Blog Post Parser
 *
 * Extracts metadata, frontmatter, and content from markdown blog posts.
 * Supports YAML frontmatter and various content extraction strategies.
 */

const fs = require('fs');
const path = require('path');

class BlogParser {
  /**
   * Parse a markdown blog post file
   *
   * @param {string} filePath - Path to the markdown file
   * @returns {Object} Parsed blog post data
   */
  static parse(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Blog post file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Extract frontmatter (if exists)
    const frontmatter = this.extractFrontmatter(content);

    // Extract content (without frontmatter)
    const bodyContent = this.extractBody(content);

    // Extract title (from frontmatter, first H1, or filename)
    const title = this.extractTitle(frontmatter, bodyContent, filename);

    // Extract summary/description
    const summary = this.extractSummary(frontmatter, bodyContent);

    // Extract tags/categories
    const tags = this.extractTags(frontmatter, bodyContent);

    // Extract date
    const date = this.extractDate(frontmatter, filename);

    // Extract author
    const author = this.extractAuthor(frontmatter, bodyContent);

    // Extract key points (for tweet thread generation)
    const keyPoints = this.extractKeyPoints(bodyContent);

    // Extract stats/metrics (if present)
    const stats = this.extractStats(bodyContent);

    return {
      filePath,
      filename,
      title,
      summary,
      tags,
      date,
      author,
      keyPoints,
      stats,
      frontmatter,
      content: bodyContent,
      wordCount: bodyContent.split(/\s+/).length,
      readTime: Math.ceil(bodyContent.split(/\s+/).length / 200) // ~200 wpm
    };
  }

  /**
   * Extract YAML frontmatter from content
   */
  static extractFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {};
    }

    const yamlContent = match[1];
    const frontmatter = {};

    // Simple YAML parser (handles basic key: value pairs)
    yamlContent.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        // Remove quotes
        value = value.replace(/^["']|["']$/g, '');

        // Handle arrays (simple comma-separated or bracketed)
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        } else if (key === 'tags' || key === 'categories') {
          value = [value];
        }

        // Handle booleans
        if (value === 'true') value = true;
        if (value === 'false') value = false;

        frontmatter[key] = value;
      }
    });

    return frontmatter;
  }

  /**
   * Extract body content (without frontmatter)
   */
  static extractBody(content) {
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
    return content.replace(frontmatterRegex, '').trim();
  }

  /**
   * Extract title from frontmatter or first H1
   */
  static extractTitle(frontmatter, content, filename) {
    // Try frontmatter first
    if (frontmatter.title) {
      return frontmatter.title;
    }

    // Try first H1
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Fall back to filename (remove date prefix and extension)
    return filename
      .replace(/^\d{4}-\d{2}-\d{2}-/, '')
      .replace(/\.md$/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Extract summary/description
   */
  static extractSummary(frontmatter, content) {
    // Try frontmatter
    if (frontmatter.description || frontmatter.summary) {
      return frontmatter.description || frontmatter.summary;
    }

    // Try TL;DR section
    const tldrMatch = content.match(/##\s*TL;?DR[:\s]*\n\n([\s\S]*?)(?=\n##|\n---|\Z)/i);
    if (tldrMatch) {
      return tldrMatch[1].trim().split('\n')[0];
    }

    // Try first paragraph after title
    const paragraphs = content.split('\n\n');
    for (const para of paragraphs) {
      if (!para.startsWith('#') && para.trim().length > 50) {
        return para.trim().split('\n')[0].substring(0, 300);
      }
    }

    return '';
  }

  /**
   * Extract tags/categories
   */
  static extractTags(frontmatter, content) {
    const tags = [];

    // From frontmatter
    if (frontmatter.tags) {
      tags.push(...(Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags]));
    }
    if (frontmatter.categories) {
      tags.push(...(Array.isArray(frontmatter.categories) ? frontmatter.categories : [frontmatter.categories]));
    }
    if (frontmatter.category) {
      tags.push(frontmatter.category);
    }

    // Auto-detect common technical tags from content
    const techKeywords = {
      'AI': /\b(AI|artificial intelligence|machine learning|LLM|GPT|Claude)\b/i,
      'DevOps': /\b(DevOps|CI\/CD|Docker|Kubernetes|deployment)\b/i,
      'Security': /\b(security|vulnerability|CVE|audit|compliance)\b/i,
      'Performance': /\b(performance|optimization|speed|latency|throughput)\b/i,
      'Testing': /\b(testing|test|TDD|unit test|integration test)\b/i
    };

    for (const [tag, regex] of Object.entries(techKeywords)) {
      if (regex.test(content) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)].slice(0, 5); // Unique, max 5
  }

  /**
   * Extract date from frontmatter or filename
   */
  static extractDate(frontmatter, filename) {
    if (frontmatter.date) {
      return frontmatter.date;
    }

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      return dateMatch[1];
    }

    return new Date().toISOString().split('T')[0];
  }

  /**
   * Extract author
   */
  static extractAuthor(frontmatter, content) {
    if (frontmatter.author) {
      return frontmatter.author;
    }

    // Try to find author in content (after date line)
    const authorMatch = content.match(/\*\*[^*]+\*\*\s*\|\s*([^|\n]+)/);
    if (authorMatch) {
      return authorMatch[1].trim();
    }

    return 'Cortex Team';
  }

  /**
   * Extract key points for tweet thread generation
   */
  static extractKeyPoints(content) {
    const points = [];

    // Extract bullet points from key sections
    const sections = content.split(/\n##\s+/);

    for (const section of sections) {
      const lines = section.split('\n');
      for (const line of lines) {
        // Match bullet points or numbered lists
        if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
          const point = line.replace(/^[-*•\d.]+\s+/, '').trim();
          if (point.length > 20 && point.length < 200) {
            points.push(point);
          }
        }
      }
    }

    return points.slice(0, 10); // Max 10 key points
  }

  /**
   * Extract stats/metrics from content
   */
  static extractStats(content) {
    const stats = [];

    // Match patterns like "X hours", "X% faster", "X lines of code"
    const statPatterns = [
      /(\d+[-–]\d+|\d+)\s*(hours?|weeks?|months?|days?)/gi,
      /(\d+[-–]\d+|\d+)x\s*(faster|slower|more|less)/gi,
      /(\d+[-–]\d+|\d+)%/g,
      /(\d{1,3}(,\d{3})*|\d+)\s*(lines?|tests?|files?|commits?)/gi
    ];

    for (const pattern of statPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        stats.push(...matches.slice(0, 3));
      }
    }

    return [...new Set(stats)].slice(0, 5);
  }

  /**
   * Get all blog posts from directory
   */
  static getAllPosts(directory) {
    if (!fs.existsSync(directory)) {
      throw new Error(`Blog directory not found: ${directory}`);
    }

    const files = fs.readdirSync(directory);
    const posts = [];

    for (const file of files) {
      if (file.endsWith('.md') && file !== 'README.md') {
        const filePath = path.join(directory, file);
        try {
          const post = this.parse(filePath);
          posts.push(post);
        } catch (error) {
          console.error(`Failed to parse ${file}:`, error.message);
        }
      }
    }

    // Sort by date (newest first)
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    return posts;
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'parse':
        if (!arg) {
          console.error('Usage: blog-parser.js parse <file-path>');
          process.exit(1);
        }
        const post = BlogParser.parse(arg);
        console.log(JSON.stringify(post, null, 2));
        break;

      case 'list':
        const directory = arg || 'projects/blog';
        const posts = BlogParser.getAllPosts(directory);
        console.log(JSON.stringify(posts, null, 2));
        break;

      default:
        console.log('Cortex Blog Parser v1.0.0');
        console.log('\nUsage:');
        console.log('  blog-parser.js parse <file>  - Parse a single blog post');
        console.log('  blog-parser.js list [dir]    - List all posts in directory');
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = BlogParser;
