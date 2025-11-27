#!/usr/bin/env node

/**
 * GitHub Achievement Tracker
 *
 * Tracks real-time achievement progress via GitHub API
 * Calculates current tier, progress to next tier, and opportunity scores
 */

const fs = require('fs').promises;
const path = require('path');

class AchievementTracker {
  constructor(options = {}) {
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.username = options.username || process.env.GITHUB_USERNAME;
    this.apiBase = 'https://api.github.com';
    this.definitionsPath = path.join(__dirname, '../config/achievement-definitions.json');
    this.progressPath = path.join(__dirname, '../knowledge-base/progress.json');
    this.metricsPath = path.join(__dirname, '../metrics/tracking-history.jsonl');

    if (!this.githubToken) {
      console.warn('[Achievement Tracker] No GitHub token found. Set GITHUB_TOKEN environment variable.');
    }
  }

  /**
   * Load achievement definitions
   */
  async loadDefinitions() {
    try {
      const content = await fs.readFile(this.definitionsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('[Achievement Tracker] Failed to load definitions:', error.message);
      throw error;
    }
  }

  /**
   * Make authenticated GitHub API request with retry logic
   */
  async githubRequest(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cortex-achievement-tracker',
      ...(this.githubToken && { 'Authorization': `Bearer ${this.githubToken}` }),
      ...options.headers
    };

    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        // Check rate limit
        const remaining = response.headers.get('x-ratelimit-remaining');
        if (remaining && parseInt(remaining) < 10) {
          console.warn(`[Achievement Tracker] Low rate limit: ${remaining} requests remaining`);
        }

        if (!response.ok) {
          // Handle rate limiting with exponential backoff
          if (response.status === 429 || response.status === 403) {
            const resetTime = response.headers.get('x-ratelimit-reset');
            if (resetTime && attempt < maxRetries) {
              const waitTime = Math.min(Math.pow(2, attempt) * 1000, 60000); // Max 1 minute
              console.warn(`[Achievement Tracker] Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }

          // For 404 or 422, don't retry - resource doesn't exist or query is invalid
          if (response.status === 404 || response.status === 422) {
            return null; // Return null instead of throwing for missing resources
          }

          const errorText = await response.text();
          throw new Error(`GitHub API error (${response.status}): ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`[Achievement Tracker] Request failed, retrying in ${waitTime}ms (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error(`[Achievement Tracker] API request failed for ${endpoint} after ${maxRetries} attempts:`, lastError.message);
    return null; // Return null instead of throwing to allow other achievements to continue
  }

  /**
   * Track Pair Extraordinaire progress
   * Count co-authored commits in merged PRs
   */
  async trackPairExtraordinaire() {
    try {
      // Get user's repositories first
      const repos = await this.githubRequest(`/users/${this.username}/repos?per_page=100&sort=updated`);

      if (!repos || !Array.isArray(repos)) {
        console.warn('[Achievement Tracker] No repositories found for Pair Extraordinaire');
        return { achievement_id: 'pair_extraordinaire', count: 0 };
      }

      let coauthoredCount = 0;

      // For each repo, get merged PRs
      for (const repo of repos) {
        try {
          const prs = await this.githubRequest(`/repos/${repo.full_name}/pulls?state=closed&per_page=100`);

          for (const pr of prs) {
            // Only count merged PRs by this user
            if (!pr.merged_at || pr.user.login !== this.username) continue;

            // Check commits for co-authors
            const commits = await this.githubRequest(`/repos/${repo.full_name}/pulls/${pr.number}/commits`);

            const hasCoauthor = commits.some(commit => {
              const message = commit.commit.message || '';
              return message.includes('Co-authored-by:') || message.includes('Co-Authored-By:');
            });

            if (hasCoauthor) {
              coauthoredCount++;
            }
          }
        } catch (repoError) {
          // Skip repos we don't have access to
          continue;
        }
      }

      return {
        achievement_id: 'pair_extraordinaire',
        count: coauthoredCount,
        current_tier: this.calculateTier('pair_extraordinaire', coauthoredCount),
        progress: this.calculateProgress('pair_extraordinaire', coauthoredCount)
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Pair Extraordinaire:', error.message);
      return { achievement_id: 'pair_extraordinaire', count: 0, error: error.message };
    }
  }

  /**
   * Track Pull Shark progress
   * Count merged PRs
   */
  async trackPullShark() {
    try {
      // Get user's repositories
      const repos = await this.githubRequest(`/users/${this.username}/repos?per_page=100&sort=updated`);

      if (!repos || !Array.isArray(repos)) {
        console.warn('[Achievement Tracker] No repositories found for Pull Shark');
        return { achievement_id: 'pull_shark', count: 0 };
      }

      let mergedCount = 0;

      // For each repo, count merged PRs by this user
      for (const repo of repos) {
        try {
          const prs = await this.githubRequest(`/repos/${repo.full_name}/pulls?state=closed&per_page=100`);

          // Count PRs that were merged by this user
          const mergedPRs = prs.filter(pr => pr.merged_at && pr.user.login === this.username);
          mergedCount += mergedPRs.length;
        } catch (repoError) {
          // Skip repos we don't have access to
          continue;
        }
      }

      return {
        achievement_id: 'pull_shark',
        count: mergedCount,
        current_tier: this.calculateTier('pull_shark', mergedCount),
        progress: this.calculateProgress('pull_shark', mergedCount)
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Pull Shark:', error.message);
      return { achievement_id: 'pull_shark', count: 0, error: error.message };
    }
  }

  /**
   * Track Starstruck progress
   * Find repos with most stars
   */
  async trackStarstruck() {
    try {
      const repos = await this.githubRequest(`/users/${this.username}/repos?per_page=100&sort=stars`);

      const maxStars = repos.length > 0 ? Math.max(...repos.map(r => r.stargazers_count)) : 0;
      const topRepo = repos.find(r => r.stargazers_count === maxStars);

      return {
        achievement_id: 'starstruck',
        count: maxStars,
        current_tier: this.calculateTier('starstruck', maxStars),
        progress: this.calculateProgress('starstruck', maxStars),
        top_repo: topRepo ? {
          name: topRepo.full_name,
          stars: topRepo.stargazers_count,
          url: topRepo.html_url
        } : null
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Starstruck:', error.message);
      return { achievement_id: 'starstruck', count: 0, error: error.message };
    }
  }

  /**
   * Track Galaxy Brain progress
   * Count accepted answers in discussions (requires GraphQL)
   */
  async trackGalaxyBrain() {
    try {
      // GraphQL query to find accepted answers
      const query = `
        query($username: String!) {
          user(login: $username) {
            repositoryDiscussionComments(first: 100) {
              nodes {
                discussion {
                  answer {
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.githubToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'cortex-achievement-tracker'
        },
        body: JSON.stringify({
          query,
          variables: { username: this.username }
        })
      });

      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
      }

      // Count accepted answers
      let acceptedCount = 0;
      const comments = data.data?.user?.repositoryDiscussionComments?.nodes || [];

      for (const comment of comments) {
        if (comment.discussion?.answer?.author?.login === this.username) {
          acceptedCount++;
        }
      }

      return {
        achievement_id: 'galaxy_brain',
        count: acceptedCount,
        current_tier: this.calculateTier('galaxy_brain', acceptedCount),
        progress: this.calculateProgress('galaxy_brain', acceptedCount),
        unlocked: acceptedCount >= 2
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Galaxy Brain:', error.message);
      return {
        achievement_id: 'galaxy_brain',
        count: 0,
        current_tier: 'none',
        progress: {
          current: 0,
          next_tier: 'bronze',
          next_requirement: 2,
          percentage: 0
        },
        note: 'GraphQL API error - check token permissions',
        error: error.message
      };
    }
  }

  /**
   * Track Quickdraw (issues/PRs closed < 5 min)
   */
  async trackQuickdraw() {
    try {
      const repos = await this.githubRequest(`/users/${this.username}/repos?per_page=100&sort=updated`);
      let quickdrawCount = 0;

      for (const repo of repos) {
        try {
          const issues = await this.githubRequest(`/repos/${repo.full_name}/issues?state=closed&creator=${this.username}&per_page=100`);

          for (const issue of issues) {
            if (!issue.closed_at) continue;

            const created = new Date(issue.created_at);
            const closed = new Date(issue.closed_at);
            const diffMinutes = (closed - created) / 1000 / 60;

            if (diffMinutes <= 5) {
              quickdrawCount++;
            }
          }
        } catch (repoError) {
          continue;
        }
      }

      return {
        achievement_id: 'quickdraw',
        count: quickdrawCount,
        unlocked: quickdrawCount >= 1,
        fastest_close: quickdrawCount > 0 ? 'Data available' : 'N/A'
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Quickdraw:', error.message);
      return { achievement_id: 'quickdraw', count: 0, error: error.message };
    }
  }

  /**
   * Track YOLO achievement
   * Count merged PRs without review
   */
  async trackYOLO() {
    try {
      const repos = await this.githubRequest(`/users/${this.username}/repos?per_page=100&sort=updated`);
      let yoloCount = 0;

      for (const repo of repos) {
        try {
          const prs = await this.githubRequest(`/repos/${repo.full_name}/pulls?state=closed&per_page=100`);

          for (const pr of prs) {
            // Only count merged PRs by this user
            if (!pr.merged_at || pr.user.login !== this.username) continue;

            // Check if PR had any reviews
            const reviews = await this.githubRequest(`/repos/${repo.full_name}/pulls/${pr.number}/reviews`);

            // YOLO = merged without any reviews
            if (reviews.length === 0) {
              yoloCount++;
            }
          }
        } catch (repoError) {
          continue;
        }
      }

      return {
        achievement_id: 'yolo',
        count: yoloCount,
        unlocked: yoloCount >= 1,
        current_tier: this.calculateTier('yolo', yoloCount),
        progress: this.calculateProgress('yolo', yoloCount)
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking YOLO:', error.message);
      return { achievement_id: 'yolo', count: 0, error: error.message };
    }
  }

  /**
   * Track Public Sponsor achievement
   * Check if user is sponsoring others
   */
  async trackPublicSponsor() {
    try {
      // Note: Sponsorship data requires GraphQL and may have privacy restrictions
      // For now, return placeholder
      return {
        achievement_id: 'public_sponsor',
        count: 0,
        unlocked: false,
        note: 'Requires GraphQL API with sponsorship access. Check manually at github.com/sponsors'
      };
    } catch (error) {
      console.error('[Achievement Tracker] Error tracking Public Sponsor:', error.message);
      return { achievement_id: 'public_sponsor', count: 0, error: error.message };
    }
  }

  /**
   * Calculate current tier for an achievement
   */
  calculateTier(achievementId, count) {
    const definitions = require(this.definitionsPath);
    const achievement = definitions.achievements[achievementId];

    if (!achievement || !achievement.tiers) {
      return 'unknown';
    }

    // Find highest tier achieved
    let currentTier = 'none';
    for (const tier of achievement.tiers.reverse()) {
      if (count >= tier.requirement) {
        currentTier = tier.name;
        break;
      }
    }

    return currentTier;
  }

  /**
   * Calculate progress to next tier
   */
  calculateProgress(achievementId, count) {
    const definitions = require(this.definitionsPath);
    const achievement = definitions.achievements[achievementId];

    if (!achievement || !achievement.tiers) {
      return { current: 0, next_tier: 'unknown', next_requirement: 0, percentage: 0 };
    }

    // Find next tier
    const sortedTiers = [...achievement.tiers].sort((a, b) => a.requirement - b.requirement);
    let nextTier = null;

    for (const tier of sortedTiers) {
      if (count < tier.requirement) {
        nextTier = tier;
        break;
      }
    }

    if (!nextTier) {
      // Max tier achieved
      const maxTier = sortedTiers[sortedTiers.length - 1];
      return {
        current: count,
        next_tier: 'max',
        next_requirement: maxTier.requirement,
        percentage: 100,
        completed: true
      };
    }

    // Calculate percentage to next tier
    const previousTier = sortedTiers.find(t => t.requirement <= count);
    const baseCount = previousTier ? previousTier.requirement : 0;
    const range = nextTier.requirement - baseCount;
    const progress = count - baseCount;
    const percentage = Math.min(100, Math.floor((progress / range) * 100));

    return {
      current: count,
      next_tier: nextTier.name,
      next_requirement: nextTier.requirement,
      needed: nextTier.requirement - count,
      percentage: percentage
    };
  }

  /**
   * Get all achievement progress
   */
  async getAllProgress() {
    console.log('[Achievement Tracker] Fetching all achievement progress...');

    const results = {
      username: this.username,
      timestamp: new Date().toISOString(),
      achievements: {}
    };

    try {
      // Track each achievement
      results.achievements.pair_extraordinaire = await this.trackPairExtraordinaire();
      results.achievements.pull_shark = await this.trackPullShark();
      results.achievements.starstruck = await this.trackStarstruck();
      results.achievements.galaxy_brain = await this.trackGalaxyBrain();
      results.achievements.quickdraw = await this.trackQuickdraw();
      results.achievements.yolo = await this.trackYOLO();
      results.achievements.public_sponsor = await this.trackPublicSponsor();

      // Calculate summary
      results.summary = {
        total_achievements: Object.keys(results.achievements).length,
        unlocked: Object.values(results.achievements).filter(a => a.unlocked || a.count > 0).length,
        in_progress: Object.values(results.achievements).filter(a => a.count > 0 && !a.unlocked).length
      };

      // Save progress
      await this.saveProgress(results);

      // Log metric
      await this.logMetric(results);

      return results;
    } catch (error) {
      console.error('[Achievement Tracker] Error fetching progress:', error.message);
      results.error = error.message;
      return results;
    }
  }

  /**
   * Save progress to knowledge base
   */
  async saveProgress(progress) {
    try {
      await fs.mkdir(path.dirname(this.progressPath), { recursive: true });
      await fs.writeFile(this.progressPath, JSON.stringify(progress, null, 2));
      console.log('[Achievement Tracker] Progress saved to knowledge base');
    } catch (error) {
      console.error('[Achievement Tracker] Failed to save progress:', error.message);
    }
  }

  /**
   * Log tracking event to metrics
   */
  async logMetric(progress) {
    try {
      await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });

      const metric = {
        timestamp: new Date().toISOString(),
        event: 'achievement_tracking',
        username: this.username,
        summary: progress.summary,
        achievements: Object.entries(progress.achievements).map(([id, data]) => ({
          id,
          count: data.count,
          tier: data.current_tier || (data.unlocked ? 'unlocked' : 'none')
        }))
      };

      await fs.appendFile(this.metricsPath, JSON.stringify(metric) + '\n');
    } catch (error) {
      console.error('[Achievement Tracker] Failed to log metric:', error.message);
    }
  }

  /**
   * Get opportunity score for each achievement
   * Higher score = easier to unlock / more ROI
   */
  async getOpportunityScores() {
    const progress = await this.getAllProgress();
    const definitions = await this.loadDefinitions();
    const opportunities = [];

    for (const [achievementId, achievementData] of Object.entries(progress.achievements)) {
      const definition = definitions.achievements[achievementId];

      if (!definition || !definition.earnable || !definition.automation.enabled) {
        continue;
      }

      // Calculate opportunity score (0-100)
      let score = 0;

      // Priority from definition (0-40 points)
      const priorityScores = { high: 40, medium: 25, low: 10, none: 0 };
      score += priorityScores[definition.automation_priority] || 0;

      // Proximity to next tier (0-30 points)
      if (achievementData.progress) {
        score += achievementData.progress.percentage * 0.3;
      }

      // Automation ease (0-30 points)
      const automationScores = {
        'coauthor_commits': 30,    // Already implemented
        'instant_fix': 28,         // Easy to automate
        'self_merge': 28,          // Easy to automate
        'feature_branch_workflow': 20, // Moderate effort
        'discussion_response': 15   // Complex
      };
      score += automationScores[definition.automation.strategy] || 0;

      opportunities.push({
        achievement_id: achievementId,
        name: definition.name,
        icon: definition.icon,
        current_count: achievementData.count || 0,
        current_tier: achievementData.current_tier || 'none',
        next_tier: achievementData.progress?.next_tier,
        progress_percentage: achievementData.progress?.percentage || 0,
        opportunity_score: Math.round(score),
        automation_strategy: definition.automation.strategy,
        automation_enabled: definition.automation.enabled,
        priority: definition.automation_priority
      });
    }

    // Sort by opportunity score
    opportunities.sort((a, b) => b.opportunity_score - a.opportunity_score);

    return {
      timestamp: new Date().toISOString(),
      username: this.username,
      opportunities: opportunities,
      top_3: opportunities.slice(0, 3)
    };
  }
}

// CLI usage
if (require.main === module) {
  const tracker = new AchievementTracker();

  tracker.getAllProgress()
    .then(progress => {
      console.log('\n=== Achievement Progress ===\n');
      console.log(JSON.stringify(progress, null, 2));

      return tracker.getOpportunityScores();
    })
    .then(opportunities => {
      console.log('\n=== Top Opportunities ===\n');
      opportunities.top_3.forEach((opp, i) => {
        console.log(`${i + 1}. ${opp.icon} ${opp.name}`);
        console.log(`   Score: ${opp.opportunity_score}/100`);
        console.log(`   Current: ${opp.current_tier} (${opp.current_count})`);
        console.log(`   Strategy: ${opp.automation_strategy}\n`);
      });
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = AchievementTracker;
