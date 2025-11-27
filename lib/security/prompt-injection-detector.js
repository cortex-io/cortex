#!/usr/bin/env node

/**
 * Prompt Injection Detector
 * Detects and blocks potential prompt injection attacks in task descriptions
 *
 * Based on security research from Bugcrowd's "The Promptfather" guide
 * @see https://www.bugcrowd.com/resources/levelup/the-promptfather-an-offer-ai-cant-refuse/
 */

class PromptInjectionDetector {
  constructor() {
    // Patterns that indicate potential prompt injection attacks
    this.dangerousPatterns = [
      {
        pattern: /ignore\s+(previous|all|your)\s+(instructions?|prompts?|rules?)/i,
        severity: 'high',
        description: 'Instruction override attempt'
      },
      {
        pattern: /system\s+(override|instruction|prompt|mode)/i,
        severity: 'high',
        description: 'System mode manipulation'
      },
      {
        pattern: /(---+\s*)?(end|stop)\s+of\s+(user\s+)?(input|instructions?|context)/i,
        severity: 'high',
        description: 'Context boundary manipulation'
      },
      {
        pattern: /(---+\s*)?(new|start|begin)\s+(system|admin|root)\s+(instruction|mode|prompt)/i,
        severity: 'high',
        description: 'Privilege escalation attempt'
      },
      {
        pattern: /you\s+are\s+now\s+(a|an|in|the)/i,
        severity: 'medium',
        description: 'Identity manipulation'
      },
      {
        pattern: /(maintenance|debug|admin|root|superuser)\s+mode/i,
        severity: 'high',
        description: 'Privileged mode activation'
      },
      {
        pattern: /\!\[.*\]\(https?:\/\/(?!github\.com|localhost|127\.0\.0\.1)/i,
        severity: 'medium',
        description: 'External image exfiltration attempt'
      },
      {
        pattern: /(base64|atob|btoa|decode|decrypt)/i,
        severity: 'medium',
        description: 'Encoding/decoding attempt'
      },
      {
        pattern: /delete\s+(all|everything|files?|data)/i,
        severity: 'critical',
        description: 'Destructive operation attempt'
      },
      {
        pattern: /(\.env|credentials|secrets?|passwords?|tokens?|api[_-]?keys?)/i,
        severity: 'critical',
        description: 'Credential access attempt'
      },
      {
        pattern: /commit\s+to\s+(https?:\/\/(?!github\.com\/ry-ops))/i,
        severity: 'critical',
        description: 'External repository commit attempt'
      },
      {
        pattern: /curl\s+.*\s+(https?:\/\/(?!localhost|127\.0\.0\.1|github\.com))/i,
        severity: 'high',
        description: 'External network request'
      },
      {
        pattern: /rm\s+-rf\s+/i,
        severity: 'critical',
        description: 'Forced recursive deletion'
      }
    ];

    // Suspicious keyword combinations
    this.suspiciousKeywords = [
      ['override', 'system'],
      ['ignore', 'previous'],
      ['admin', 'mode'],
      ['exfiltrate', 'data'],
      ['bypass', 'security'],
      ['disable', 'validation']
    ];
  }

  /**
   * Analyze task description for prompt injection attacks
   * @param {string} taskDescription - The task description to analyze
   * @returns {Object} Analysis result with detected threats
   */
  analyze(taskDescription) {
    const threats = [];
    let maxSeverity = 'none';

    // Check dangerous patterns
    for (const { pattern, severity, description } of this.dangerousPatterns) {
      if (pattern.test(taskDescription)) {
        threats.push({
          type: 'pattern_match',
          severity,
          description,
          pattern: pattern.toString(),
          matched: taskDescription.match(pattern)?.[0]
        });

        // Update max severity
        if (this.getSeverityLevel(severity) > this.getSeverityLevel(maxSeverity)) {
          maxSeverity = severity;
        }
      }
    }

    // Check suspicious keyword combinations
    for (const keywords of this.suspiciousKeywords) {
      const lowerTask = taskDescription.toLowerCase();
      if (keywords.every(kw => lowerTask.includes(kw))) {
        threats.push({
          type: 'keyword_combination',
          severity: 'medium',
          description: `Suspicious keyword combination: ${keywords.join(' + ')}`,
          keywords
        });

        if (this.getSeverityLevel('medium') > this.getSeverityLevel(maxSeverity)) {
          maxSeverity = 'medium';
        }
      }
    }

    // Calculate risk score (0-1)
    const riskScore = this.calculateRiskScore(threats);

    return {
      safe: threats.length === 0,
      riskScore,
      severity: maxSeverity,
      threats,
      recommendation: this.getRecommendation(riskScore, maxSeverity)
    };
  }

  /**
   * Get numeric severity level
   */
  getSeverityLevel(severity) {
    const levels = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };
    return levels[severity] || 0;
  }

  /**
   * Calculate risk score based on detected threats
   */
  calculateRiskScore(threats) {
    if (threats.length === 0) return 0;

    const severityWeights = {
      low: 0.2,
      medium: 0.4,
      high: 0.7,
      critical: 1.0
    };

    const totalWeight = threats.reduce((sum, threat) => {
      return sum + (severityWeights[threat.severity] || 0);
    }, 0);

    // Normalize to 0-1 range
    return Math.min(1.0, totalWeight / threats.length);
  }

  /**
   * Get recommendation based on risk assessment
   */
  getRecommendation(riskScore, severity) {
    if (severity === 'critical') {
      return 'BLOCK - Critical security threat detected';
    }
    if (severity === 'high' || riskScore > 0.7) {
      return 'BLOCK - High risk of prompt injection';
    }
    if (severity === 'medium' || riskScore > 0.4) {
      return 'REVIEW - Manual review recommended';
    }
    if (riskScore > 0.2) {
      return 'WARN - Low risk detected, monitor execution';
    }
    return 'ALLOW - No threats detected';
  }

  /**
   * Validate and sanitize task description
   * @param {string} taskDescription - Task description to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(taskDescription, options = {}) {
    const {
      blockOnHigh = true,
      blockOnCritical = true,
      requireReviewOnMedium = false
    } = options;

    const analysis = this.analyze(taskDescription);

    // Determine if task should be blocked
    const shouldBlock =
      (blockOnCritical && analysis.severity === 'critical') ||
      (blockOnHigh && analysis.severity === 'high') ||
      (requireReviewOnMedium && analysis.severity === 'medium' && !options.reviewed);

    return {
      valid: !shouldBlock,
      analysis,
      blocked: shouldBlock,
      requiresReview: analysis.severity === 'medium' && !shouldBlock
    };
  }
}

module.exports = { PromptInjectionDetector };
