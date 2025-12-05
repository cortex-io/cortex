#!/usr/bin/env node

/**
 * Buffer API Client
 *
 * Handles all interactions with Buffer's Publishing API for social media posting.
 * Supports creating updates, scheduling posts, and managing profiles.
 *
 * @see https://buffer.com/developers/api
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class BufferClient {
  constructor(config = {}) {
    this.accessToken = config.accessToken || process.env.BUFFER_ACCESS_TOKEN;
    this.profileId = config.profileId || process.env.BUFFER_PROFILE_ID;
    this.baseUrl = 'api.bufferapp.com';
    this.basePath = '/1';

    if (!this.accessToken) {
      throw new Error('Buffer access token is required (BUFFER_ACCESS_TOKEN env var)');
    }
  }

  /**
   * Make authenticated request to Buffer API
   */
  async request(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${this.accessToken}`;

      const options = {
        hostname: this.baseUrl,
        path: `${this.basePath}${url}`,
        method: method,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Cortex-Social-Publisher/1.0'
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
              resolve(response);
            } else {
              reject(new Error(`Buffer API error: ${response.error || response.message || body}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse Buffer API response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Buffer API request failed: ${error.message}`));
      });

      if (data && method === 'POST') {
        const postData = new URLSearchParams(data).toString();
        req.write(postData);
      }

      req.end();
    });
  }

  /**
   * Get all Buffer profiles (social media accounts)
   */
  async getProfiles() {
    try {
      const response = await this.request('GET', '/profiles.json');
      return response;
    } catch (error) {
      throw new Error(`Failed to get Buffer profiles: ${error.message}`);
    }
  }

  /**
   * Get specific profile by ID
   */
  async getProfile(profileId = null) {
    const id = profileId || this.profileId;
    if (!id) {
      throw new Error('Profile ID is required');
    }

    const profiles = await this.getProfiles();
    return profiles.find(p => p.id === id) || null;
  }

  /**
   * Create a new update (post) to Buffer
   *
   * @param {Object} options - Update options
   * @param {string} options.text - The text content of the update
   * @param {string[]} options.profile_ids - Array of profile IDs to post to
   * @param {boolean} options.shorten - Shorten links (default: true)
   * @param {boolean} options.now - Post immediately (default: false)
   * @param {number} options.scheduled_at - Unix timestamp for scheduling
   * @param {string[]} options.media - Array of media URLs or paths
   */
  async createUpdate(options) {
    const {
      text,
      profile_ids = [this.profileId],
      shorten = true,
      now = false,
      scheduled_at = null,
      media = null
    } = options;

    if (!text) {
      throw new Error('Update text is required');
    }

    if (!profile_ids || profile_ids.length === 0) {
      throw new Error('At least one profile ID is required');
    }

    const data = {
      text,
      profile_ids: profile_ids,
      shorten
    };

    if (now) {
      data.now = true;
    } else if (scheduled_at) {
      data.scheduled_at = scheduled_at;
    }

    if (media && media.length > 0) {
      data['media[photo]'] = media[0]; // Buffer accepts media in this format
    }

    try {
      const response = await this.request('POST', '/updates/create.json', data);
      return response;
    } catch (error) {
      throw new Error(`Failed to create Buffer update: ${error.message}`);
    }
  }

  /**
   * Create a Twitter thread (multiple connected tweets)
   *
   * @param {Object} options - Thread options
   * @param {string[]} options.tweets - Array of tweet texts
   * @param {string[]} options.profile_ids - Array of profile IDs
   * @param {boolean} options.now - Post immediately
   * @param {number} options.delay_seconds - Delay between tweets in thread
   */
  async createThread(options) {
    const {
      tweets,
      profile_ids = [this.profileId],
      now = false,
      delay_seconds = 30
    } = options;

    if (!tweets || tweets.length === 0) {
      throw new Error('At least one tweet is required for a thread');
    }

    const results = [];
    let scheduled_at = now ? null : Math.floor(Date.now() / 1000);

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];

      // Add thread indicator for multi-tweet threads
      let text = tweet;
      if (tweets.length > 1) {
        text = `${tweet}\n\n${i + 1}/${tweets.length}`;
      }

      try {
        const result = await this.createUpdate({
          text,
          profile_ids,
          now: i === 0 && now,
          scheduled_at: scheduled_at ? scheduled_at + (i * delay_seconds) : null
        });

        results.push(result);

        // Small delay to ensure proper ordering
        if (i < tweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        throw new Error(`Failed to create tweet ${i + 1}/${tweets.length}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get pending updates for a profile
   */
  async getPendingUpdates(profileId = null) {
    const id = profileId || this.profileId;
    if (!id) {
      throw new Error('Profile ID is required');
    }

    try {
      const response = await this.request('GET', `/profiles/${id}/updates/pending.json`);
      return response;
    } catch (error) {
      throw new Error(`Failed to get pending updates: ${error.message}`);
    }
  }

  /**
   * Get specific update by ID
   */
  async getUpdate(updateId) {
    if (!updateId) {
      throw new Error('Update ID is required');
    }

    try {
      const response = await this.request('GET', `/updates/${updateId}.json`);
      return response;
    } catch (error) {
      throw new Error(`Failed to get update: ${error.message}`);
    }
  }

  /**
   * Validate credentials and connection
   */
  async validate() {
    try {
      const profiles = await this.getProfiles();

      if (!profiles || profiles.length === 0) {
        throw new Error('No Buffer profiles found. Please connect a social media account.');
      }

      const twitterProfiles = profiles.filter(p => p.service === 'twitter');

      if (twitterProfiles.length === 0) {
        throw new Error('No Twitter profile found in Buffer. Please connect Twitter.');
      }

      return {
        valid: true,
        profiles: profiles.length,
        twitter_accounts: twitterProfiles.length,
        profile_ids: twitterProfiles.map(p => p.id)
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

// CLI interface for testing
if (require.main === module) {
  const command = process.argv[2];
  const client = new BufferClient();

  (async () => {
    try {
      switch (command) {
        case 'validate':
          const validation = await client.validate();
          console.log(JSON.stringify(validation, null, 2));
          break;

        case 'profiles':
          const profiles = await client.getProfiles();
          console.log(JSON.stringify(profiles, null, 2));
          break;

        case 'post':
          const text = process.argv[3];
          if (!text) {
            console.error('Usage: buffer-client.js post "Your tweet text"');
            process.exit(1);
          }
          const result = await client.createUpdate({ text, now: true });
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'thread':
          const tweets = process.argv.slice(3);
          if (tweets.length === 0) {
            console.error('Usage: buffer-client.js thread "Tweet 1" "Tweet 2" ...');
            process.exit(1);
          }
          const threadResult = await client.createThread({ tweets, now: true });
          console.log(JSON.stringify(threadResult, null, 2));
          break;

        default:
          console.log('Cortex Buffer API Client v1.0.0');
          console.log('\nUsage:');
          console.log('  buffer-client.js validate          - Validate Buffer credentials');
          console.log('  buffer-client.js profiles          - List all Buffer profiles');
          console.log('  buffer-client.js post "text"       - Create a single post');
          console.log('  buffer-client.js thread "t1" "t2"  - Create a tweet thread');
          console.log('\nEnvironment variables:');
          console.log('  BUFFER_ACCESS_TOKEN  - Required: Your Buffer API access token');
          console.log('  BUFFER_PROFILE_ID    - Optional: Default profile ID for posting');
          break;
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = BufferClient;
