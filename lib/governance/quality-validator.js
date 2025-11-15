#!/usr/bin/env node

/**
 * Quality Validator for Worker Outputs
 *
 * Performs comprehensive quality checks on worker execution results
 * to ensure data integrity, completeness, and adherence to standards.
 *
 * Quality Checks:
 * - Output completeness (all required fields present)
 * - Structure validity (proper JSON schema)
 * - Summary quality (length, clarity, actionability)
 * - Artifact validation (files exist, proper formats)
 * - Token efficiency (reasonable usage vs. output quality)
 * - Execution time validation (within expected bounds)
 * - Error handling consistency
 * - Deliverables validation
 */

const fs = require('fs').promises;
const path = require('path');

class QualityValidator {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.env.COMMIT_RELAY_HOME || path.join(__dirname, '../..');
    this.qualityLogPath = options.qualityLogPath || path.join(this.projectRoot, 'coordination/governance/quality-checks.jsonl');

    // Quality check thresholds
    this.thresholds = {
      minSummaryLength: 50,        // Characters
      maxSummaryLength: 2000,      // Characters
      minTokenEfficiency: 0.1,     // Output quality per token (estimated)
      maxTokenWaste: 0.3,          // Max acceptable waste ratio
      expectedDurationVariance: 2.0, // Max multiplier from expected
      requiredFields: ['status', 'output_location', 'summary', 'artifacts']
    };

    // Quality scores
    this.scores = {
      completeness: 0,
      validity: 0,
      summaryQuality: 0,
      artifactQuality: 0,
      tokenEfficiency: 0,
      executionQuality: 0,
      overall: 0
    };
  }

  /**
   * Validate worker output against quality criteria
   *
   * @param {Object} workerSpec - Worker specification with results
   * @returns {Object} Validation result with score and issues
   */
  async validateWorkerOutput(workerSpec) {
    const validation = {
      worker_id: workerSpec.worker_id,
      task_id: workerSpec.task_id,
      timestamp: new Date().toISOString(),
      passed: true,
      score: 0,
      issues: [],
      checks: {},
      recommendations: []
    };

    try {
      // 1. Check output completeness
      validation.checks.completeness = this.checkCompleteness(workerSpec);

      // 2. Check structure validity
      validation.checks.validity = this.checkValidity(workerSpec);

      // 3. Check summary quality
      validation.checks.summaryQuality = await this.checkSummaryQuality(workerSpec);

      // 4. Check artifact quality
      validation.checks.artifactQuality = await this.checkArtifactQuality(workerSpec);

      // 5. Check token efficiency
      validation.checks.tokenEfficiency = this.checkTokenEfficiency(workerSpec);

      // 6. Check execution quality
      validation.checks.executionQuality = this.checkExecutionQuality(workerSpec);

      // Calculate overall score (weighted average)
      const weights = {
        completeness: 0.20,
        validity: 0.15,
        summaryQuality: 0.15,
        artifactQuality: 0.15,
        tokenEfficiency: 0.20,
        executionQuality: 0.15
      };

      let totalScore = 0;
      let totalWeight = 0;

      for (const [check, weight] of Object.entries(weights)) {
        if (validation.checks[check]) {
          totalScore += validation.checks[check].score * weight;
          totalWeight += weight;

          if (!validation.checks[check].passed) {
            validation.passed = false;
            validation.issues.push(...validation.checks[check].issues);
          }
        }
      }

      validation.score = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

      // Generate recommendations
      validation.recommendations = this.generateRecommendations(validation);

      // Log validation result
      await this.logValidation(validation);

      return validation;

    } catch (error) {
      validation.passed = false;
      validation.score = 0;
      validation.issues.push({
        severity: 'critical',
        category: 'system',
        message: `Validation failed: ${error.message}`
      });

      return validation;
    }
  }

  /**
   * Check output completeness
   */
  checkCompleteness(workerSpec) {
    const check = {
      name: 'completeness',
      passed: true,
      score: 1.0,
      issues: []
    };

    const results = workerSpec.results || {};
    const requiredFields = this.thresholds.requiredFields;

    // Check for required fields
    for (const field of requiredFields) {
      if (!(field in results)) {
        check.passed = false;
        check.score -= 0.25;
        check.issues.push({
          severity: 'high',
          category: 'completeness',
          field: field,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Check for deliverables
    if (!workerSpec.deliverables || workerSpec.deliverables.length === 0) {
      check.score -= 0.1;
      check.issues.push({
        severity: 'medium',
        category: 'completeness',
        field: 'deliverables',
        message: 'No deliverables specified or produced'
      });
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Check structure validity
   */
  checkValidity(workerSpec) {
    const check = {
      name: 'validity',
      passed: true,
      score: 1.0,
      issues: []
    };

    // Check worker_id format
    if (!workerSpec.worker_id || typeof workerSpec.worker_id !== 'string') {
      check.passed = false;
      check.score -= 0.3;
      check.issues.push({
        severity: 'high',
        category: 'validity',
        field: 'worker_id',
        message: 'Invalid or missing worker_id'
      });
    }

    // Check status values
    const validStatuses = ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled'];
    if (workerSpec.results?.status && !validStatuses.includes(workerSpec.results.status)) {
      check.passed = false;
      check.score -= 0.2;
      check.issues.push({
        severity: 'high',
        category: 'validity',
        field: 'results.status',
        message: `Invalid status: ${workerSpec.results.status}. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Check execution timestamps
    if (workerSpec.execution) {
      if (workerSpec.execution.started_at && workerSpec.execution.completed_at) {
        const start = new Date(workerSpec.execution.started_at);
        const end = new Date(workerSpec.execution.completed_at);

        if (end < start) {
          check.passed = false;
          check.score -= 0.3;
          check.issues.push({
            severity: 'high',
            category: 'validity',
            field: 'execution.timestamps',
            message: 'Completed timestamp is before started timestamp'
          });
        }
      }
    }

    // Check artifacts structure
    if (workerSpec.results?.artifacts && !Array.isArray(workerSpec.results.artifacts)) {
      check.score -= 0.2;
      check.issues.push({
        severity: 'medium',
        category: 'validity',
        field: 'results.artifacts',
        message: 'Artifacts field must be an array'
      });
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Check summary quality
   */
  async checkSummaryQuality(workerSpec) {
    const check = {
      name: 'summaryQuality',
      passed: true,
      score: 1.0,
      issues: []
    };

    const summary = workerSpec.results?.summary;

    if (!summary || summary === null) {
      check.score = 0.3; // Partial credit - output exists but no summary
      check.issues.push({
        severity: 'medium',
        category: 'summary',
        field: 'results.summary',
        message: 'No summary provided'
      });
      return check;
    }

    const summaryLength = summary.length;

    // Check minimum length
    if (summaryLength < this.thresholds.minSummaryLength) {
      check.score -= 0.3;
      check.issues.push({
        severity: 'medium',
        category: 'summary',
        field: 'results.summary',
        message: `Summary too short (${summaryLength} chars, min: ${this.thresholds.minSummaryLength})`
      });
    }

    // Check maximum length
    if (summaryLength > this.thresholds.maxSummaryLength) {
      check.score -= 0.2;
      check.issues.push({
        severity: 'low',
        category: 'summary',
        field: 'results.summary',
        message: `Summary too long (${summaryLength} chars, max: ${this.thresholds.maxSummaryLength})`
      });
    }

    // Check for actionable content (basic heuristics)
    const hasActionableKeywords = /completed|implemented|fixed|updated|created|added|removed|refactored|tested|deployed/i.test(summary);
    if (!hasActionableKeywords && workerSpec.results?.status === 'completed') {
      check.score -= 0.2;
      check.issues.push({
        severity: 'low',
        category: 'summary',
        field: 'results.summary',
        message: 'Summary lacks actionable keywords describing what was accomplished'
      });
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Check artifact quality
   */
  async checkArtifactQuality(workerSpec) {
    const check = {
      name: 'artifactQuality',
      passed: true,
      score: 1.0,
      issues: []
    };

    const artifacts = workerSpec.results?.artifacts || [];

    if (artifacts.length === 0) {
      // Not necessarily bad - some workers don't produce artifacts
      check.score = 0.8;
      return check;
    }

    // Validate each artifact
    for (const artifact of artifacts) {
      if (typeof artifact === 'string') {
        // Artifact is a file path - check if file exists
        const artifactPath = path.isAbsolute(artifact) ? artifact : path.join(this.projectRoot, artifact);

        try {
          await fs.access(artifactPath);
        } catch (error) {
          check.score -= 0.3 / artifacts.length;
          check.issues.push({
            severity: 'medium',
            category: 'artifacts',
            field: 'results.artifacts',
            message: `Artifact file does not exist: ${artifact}`
          });
        }
      } else if (typeof artifact === 'object') {
        // Artifact is an object - check for required fields
        if (!artifact.path && !artifact.content) {
          check.score -= 0.2 / artifacts.length;
          check.issues.push({
            severity: 'medium',
            category: 'artifacts',
            field: 'results.artifacts',
            message: 'Artifact object missing path or content field'
          });
        }
      }
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Check token efficiency
   */
  checkTokenEfficiency(workerSpec) {
    const check = {
      name: 'tokenEfficiency',
      passed: true,
      score: 1.0,
      issues: []
    };

    const tokensUsed = workerSpec.execution?.tokens_used || 0;
    const tokenBudget = workerSpec.resources?.token_budget || 0;
    const status = workerSpec.results?.status;

    if (tokenBudget === 0) {
      return check; // Can't evaluate without budget
    }

    const utilizationRate = tokensUsed / tokenBudget;

    // Check for token waste (used < 10% of budget on failed task)
    if (status === 'failed' && utilizationRate < 0.1) {
      check.score -= 0.2;
      check.issues.push({
        severity: 'low',
        category: 'tokens',
        field: 'execution.tokens_used',
        message: `Low token utilization on failure (${(utilizationRate * 100).toFixed(1)}%)`
      });
    }

    // Check for budget overrun
    if (tokensUsed > tokenBudget) {
      check.score -= 0.3;
      check.issues.push({
        severity: 'medium',
        category: 'tokens',
        field: 'execution.tokens_used',
        message: `Token budget exceeded (used: ${tokensUsed}, budget: ${tokenBudget})`
      });
    }

    // Check for excessive usage on simple tasks
    if (status === 'completed' && utilizationRate > 0.9 && (workerSpec.results?.summary?.length || 0) < 100) {
      check.score -= 0.2;
      check.issues.push({
        severity: 'low',
        category: 'tokens',
        field: 'execution.tokens_used',
        message: 'High token usage with minimal output - possible inefficiency'
      });
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Check execution quality
   */
  checkExecutionQuality(workerSpec) {
    const check = {
      name: 'executionQuality',
      passed: true,
      score: 1.0,
      issues: []
    };

    const execution = workerSpec.execution || {};
    const expectedDuration = workerSpec.resources?.timeout_minutes || 15;
    const actualDuration = execution.duration_minutes || 0;

    // Check for timeout issues
    if (actualDuration >= expectedDuration * 0.95) {
      check.score -= 0.2;
      check.issues.push({
        severity: 'medium',
        category: 'execution',
        field: 'execution.duration_minutes',
        message: `Execution time near timeout (${actualDuration}/${expectedDuration} min)`
      });
    }

    // Check for unreasonably quick completion
    if (workerSpec.results?.status === 'completed' && actualDuration < 0.1) {
      check.score -= 0.3;
      check.issues.push({
        severity: 'medium',
        category: 'execution',
        field: 'execution.duration_minutes',
        message: 'Task completed suspiciously quickly - possible premature completion'
      });
    }

    // Check session tracking
    if (!execution.session_id && workerSpec.results?.status === 'completed') {
      check.score -= 0.1;
      check.issues.push({
        severity: 'low',
        category: 'execution',
        field: 'execution.session_id',
        message: 'No session ID recorded for completed worker'
      });
    }

    check.score = Math.max(0, check.score);
    return check;
  }

  /**
   * Generate recommendations based on validation results
   */
  generateRecommendations(validation) {
    const recommendations = [];

    // Group issues by category
    const issuesByCategory = {};
    for (const issue of validation.issues) {
      if (!issuesByCategory[issue.category]) {
        issuesByCategory[issue.category] = [];
      }
      issuesByCategory[issue.category].push(issue);
    }

    // Generate recommendations
    if (issuesByCategory.completeness) {
      recommendations.push({
        category: 'completeness',
        priority: 'high',
        recommendation: 'Ensure all required output fields are populated before marking worker as complete',
        affected_fields: issuesByCategory.completeness.map(i => i.field)
      });
    }

    if (issuesByCategory.summary) {
      recommendations.push({
        category: 'summary',
        priority: 'medium',
        recommendation: 'Improve summary quality with actionable descriptions of work completed',
        affected_fields: issuesByCategory.summary.map(i => i.field)
      });
    }

    if (issuesByCategory.tokens) {
      recommendations.push({
        category: 'tokens',
        priority: 'medium',
        recommendation: 'Optimize token usage to stay within budget while maintaining output quality',
        affected_fields: issuesByCategory.tokens.map(i => i.field)
      });
    }

    if (issuesByCategory.artifacts) {
      recommendations.push({
        category: 'artifacts',
        priority: 'high',
        recommendation: 'Verify all artifact files are created and accessible before completion',
        affected_fields: issuesByCategory.artifacts.map(i => i.field)
      });
    }

    return recommendations;
  }

  /**
   * Log validation result
   */
  async logValidation(validation) {
    try {
      const logEntry = JSON.stringify(validation) + '\n';
      await fs.appendFile(this.qualityLogPath, logEntry, 'utf8');
    } catch (error) {
      console.error('[QualityValidator] Failed to log validation:', error.message);
    }
  }

  /**
   * Get quality statistics from logs
   */
  async getQualityStatistics(options = {}) {
    try {
      const logContent = await fs.readFile(this.qualityLogPath, 'utf8');
      const lines = logContent.trim().split('\n').filter(l => l);

      const validations = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(v => v !== null);

      // Filter by time period if specified
      const period = options.period || '30d';
      const cutoffDate = this.getPeriodCutoff(period);
      const recentValidations = validations.filter(v => new Date(v.timestamp) >= cutoffDate);

      if (recentValidations.length === 0) {
        return {
          period,
          total_validations: 0,
          average_score: 0,
          pass_rate: 0,
          common_issues: []
        };
      }

      // Calculate statistics
      const totalScore = recentValidations.reduce((sum, v) => sum + v.score, 0);
      const passedCount = recentValidations.filter(v => v.passed).length;

      // Aggregate issues
      const issueCategories = {};
      for (const validation of recentValidations) {
        for (const issue of validation.issues) {
          if (!issueCategories[issue.category]) {
            issueCategories[issue.category] = 0;
          }
          issueCategories[issue.category]++;
        }
      }

      const commonIssues = Object.entries(issueCategories)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        period,
        total_validations: recentValidations.length,
        average_score: totalScore / recentValidations.length,
        pass_rate: (passedCount / recentValidations.length) * 100,
        common_issues: commonIssues
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          period: options.period || '30d',
          total_validations: 0,
          average_score: 0,
          pass_rate: 0,
          common_issues: []
        };
      }
      throw error;
    }
  }

  /**
   * Get cutoff date for period
   */
  getPeriodCutoff(period) {
    const now = new Date();
    const match = period.match(/^(\d+)([dh])$/);

    if (!match) {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    if (unit === 'd') {
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    } else if (unit === 'h') {
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    }

    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

module.exports = { QualityValidator };

// CLI
if (require.main === module) {
  const command = process.argv[2];
  const validator = new QualityValidator();

  if (command === 'validate') {
    const workerSpecPath = process.argv[3];
    if (!workerSpecPath) {
      console.error('Usage: quality-validator.js validate <worker-spec-path>');
      process.exit(1);
    }

    fs.readFile(workerSpecPath, 'utf8').then(content => {
      const workerSpec = JSON.parse(content);
      return validator.validateWorkerOutput(workerSpec);
    }).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    }).catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
  } else if (command === 'stats') {
    const period = process.argv[3] || '30d';
    validator.getQualityStatistics({ period }).then(stats => {
      console.log(JSON.stringify(stats, null, 2));
    }).catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  quality-validator.js validate <worker-spec-path>');
    console.log('  quality-validator.js stats [period]');
    process.exit(1);
  }
}
