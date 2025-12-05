#!/usr/bin/env node

/**
 * AI-Powered Tweet Generator
 *
 * Generates optimized tweet content from blog posts using Claude AI.
 * Supports single tweets, threads, and thread with summary strategies.
 */

const https = require('https');
const fs = require('fs');

class TweetGenerator {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = config.model || 'claude-sonnet-4-5-20250929';
    this.maxTweetLength = 280;
    this.maxHashtags = 3;

    if (!this.apiKey) {
      throw new Error('Anthropic API key is required (ANTHROPIC_API_KEY env var)');
    }
  }

  /**
   * Generate tweet content from blog post data
   *
   * @param {Object} blogPost - Parsed blog post data
   * @param {Object} options - Generation options
   * @returns {Object} Generated tweet content
   */
  async generate(blogPost, options = {}) {
    const {
      strategy = 'thread',
      includeHashtags = true,
      includeLink = true,
      blogUrl = null,
      tone = 'professional_technical',
      maxThreadLength = 5
    } = options;

    const prompt = this.buildPrompt(blogPost, {
      strategy,
      includeHashtags,
      includeLink,
      blogUrl,
      tone,
      maxThreadLength
    });

    try {
      const response = await this.callClaude(prompt);
      const tweets = this.parseResponse(response, strategy);

      return {
        strategy,
        tweets,
        totalLength: tweets.reduce((sum, t) => sum + t.length, 0),
        tweetCount: tweets.length,
        hashtags: this.extractHashtags(tweets),
        preview: tweets.join('\n\n---\n\n')
      };
    } catch (error) {
      throw new Error(`Failed to generate tweets: ${error.message}`);
    }
  }

  /**
   * Build AI prompt for tweet generation
   */
  buildPrompt(blogPost, options) {
    const { strategy, includeHashtags, includeLink, blogUrl, tone, maxThreadLength } = options;

    const link = includeLink && blogUrl ? blogUrl : '';
    const hashtagNote = includeHashtags ? 'Include relevant hashtags (max 3).' : 'Do not include hashtags.';

    let strategyInstructions = '';

    if (strategy === 'single_tweet') {
      strategyInstructions = `
Generate a SINGLE tweet (max 280 characters) that captures the essence of this blog post.
The tweet should be punchy, engaging, and make people want to read more.
${hashtagNote}
${link ? `Include this link: ${link}` : ''}
`;
    } else if (strategy === 'thread') {
      strategyInstructions = `
Generate a Twitter THREAD (${maxThreadLength} tweets maximum) that summarizes this blog post.

Thread requirements:
- Each tweet must be ≤280 characters
- First tweet: Hook that grabs attention
- Middle tweets: Key points, stats, insights
- Last tweet: Call to action + link
- ${hashtagNote}
- Make it conversational and engaging
${link ? `Include this link in the LAST tweet: ${link}` : ''}
`;
    } else if (strategy === 'thread_with_summary') {
      strategyInstructions = `
Generate a Twitter THREAD with an executive summary structure:

Tweet 1: Attention-grabbing hook + one-line summary
Tweet 2-3: "What we built" - Key deliverables and features
Tweet 4-5: "The results" - Stats, metrics, impact
Tweet 6: Call to action + link

Requirements:
- Each tweet must be ≤280 characters
- Use concrete numbers and stats
- ${hashtagNote}
${link ? `Include this link in the LAST tweet: ${link}` : ''}
`;
    }

    return `You are an expert technical content marketer creating Twitter content for a software engineering blog.

BLOG POST DATA:
Title: ${blogPost.title}
Summary: ${blogPost.summary}
Date: ${blogPost.date}
Tags: ${blogPost.tags.join(', ')}
Key Points:
${blogPost.keyPoints.slice(0, 5).map(p => `- ${p}`).join('\n')}

Stats/Metrics:
${blogPost.stats.slice(0, 5).map(s => `- ${s}`).join('\n')}

${strategyInstructions}

TONE: ${tone}

Output ONLY the tweet text(s), one per line for threads. No additional commentary or metadata.
For threads, separate each tweet with "---" on its own line.

Example thread format:
Tweet 1 text here
---
Tweet 2 text here
---
Tweet 3 text here

Generate the tweets now:`;
  }

  /**
   * Call Claude API
   */
  async callClaude(prompt) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(body);

            if (res.statusCode >= 200 && res.statusCode < 300) {
              const content = response.content[0].text;
              resolve(content);
            } else {
              reject(new Error(`Claude API error: ${response.error?.message || body}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse Claude API response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Claude API request failed: ${error.message}`));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Parse Claude's response into tweet array
   */
  parseResponse(response, strategy) {
    // Split by --- separator for threads
    const tweets = response
      .split(/\n---\n/)
      .map(tweet => tweet.trim())
      .filter(tweet => tweet.length > 0);

    // Validate tweet lengths
    const validTweets = tweets.map(tweet => {
      if (tweet.length > this.maxTweetLength) {
        console.warn(`Tweet exceeds ${this.maxTweetLength} chars, truncating: ${tweet.substring(0, 50)}...`);
        return tweet.substring(0, this.maxTweetLength - 3) + '...';
      }
      return tweet;
    });

    return validTweets;
  }

  /**
   * Extract hashtags from tweets
   */
  extractHashtags(tweets) {
    const hashtags = new Set();
    const hashtagRegex = /#\w+/g;

    for (const tweet of tweets) {
      const matches = tweet.match(hashtagRegex);
      if (matches) {
        matches.forEach(tag => hashtags.add(tag));
      }
    }

    return Array.from(hashtags);
  }

  /**
   * Generate multiple strategies for comparison
   */
  async generateAll(blogPost, options = {}) {
    const strategies = ['single_tweet', 'thread', 'thread_with_summary'];
    const results = {};

    for (const strategy of strategies) {
      try {
        results[strategy] = await this.generate(blogPost, {
          ...options,
          strategy
        });
      } catch (error) {
        console.error(`Failed to generate ${strategy}:`, error.message);
        results[strategy] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Validate tweet content
   */
  validate(tweets) {
    const issues = [];

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];

      if (tweet.length > this.maxTweetLength) {
        issues.push(`Tweet ${i + 1} exceeds ${this.maxTweetLength} characters (${tweet.length} chars)`);
      }

      if (tweet.length < 10) {
        issues.push(`Tweet ${i + 1} is too short (${tweet.length} chars)`);
      }

      const hashtags = (tweet.match(/#\w+/g) || []);
      if (hashtags.length > this.maxHashtags) {
        issues.push(`Tweet ${i + 1} has too many hashtags (${hashtags.length}, max ${this.maxHashtags})`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// CLI interface
if (require.main === module) {
  const BlogParser = require('./blog-parser.js');

  const command = process.argv[2];
  const arg = process.argv[3];

  (async () => {
    try {
      const generator = new TweetGenerator();

      switch (command) {
        case 'generate':
          if (!arg) {
            console.error('Usage: tweet-generator.js generate <blog-file> [strategy]');
            process.exit(1);
          }

          const blogPost = BlogParser.parse(arg);
          const strategy = process.argv[4] || 'thread';
          const blogUrl = process.argv[5] || null;

          const result = await generator.generate(blogPost, {
            strategy,
            includeHashtags: true,
            includeLink: true,
            blogUrl
          });

          console.log('\n=== GENERATED TWEETS ===\n');
          console.log(result.preview);
          console.log('\n=== METADATA ===\n');
          console.log(`Strategy: ${result.strategy}`);
          console.log(`Tweet count: ${result.tweetCount}`);
          console.log(`Total characters: ${result.totalLength}`);
          console.log(`Hashtags: ${result.hashtags.join(', ')}`);

          // Validate
          const validation = generator.validate(result.tweets);
          if (!validation.valid) {
            console.log('\n=== VALIDATION ISSUES ===\n');
            validation.issues.forEach(issue => console.log(`⚠️  ${issue}`));
          } else {
            console.log('\n✅ All tweets valid');
          }
          break;

        case 'all':
          if (!arg) {
            console.error('Usage: tweet-generator.js all <blog-file> [blog-url]');
            process.exit(1);
          }

          const post = BlogParser.parse(arg);
          const url = process.argv[4] || null;
          const allResults = await generator.generateAll(post, {
            includeHashtags: true,
            includeLink: true,
            blogUrl: url
          });

          for (const [strat, res] of Object.entries(allResults)) {
            console.log(`\n=== ${strat.toUpperCase()} ===\n`);
            if (res.error) {
              console.log(`Error: ${res.error}`);
            } else {
              console.log(res.preview);
              console.log(`\n(${res.tweetCount} tweets, ${res.totalLength} chars)`);
            }
          }
          break;

        default:
          console.log('Cortex Tweet Generator v1.0.0');
          console.log('\nUsage:');
          console.log('  tweet-generator.js generate <file> [strategy] [url]  - Generate tweets');
          console.log('  tweet-generator.js all <file> [url]                  - Generate all strategies');
          console.log('\nStrategies: single_tweet, thread, thread_with_summary');
          console.log('\nEnvironment variables:');
          console.log('  ANTHROPIC_API_KEY  - Required: Your Anthropic API key');
          break;
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = TweetGenerator;
