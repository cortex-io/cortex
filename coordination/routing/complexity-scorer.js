#!/usr/bin/env node
/**
 * Complexity Scorer
 *
 * Analyzes task descriptions and provides complexity scores (1-10).
 * Uses multiple factors:
 * - Keyword analysis (security, architecture, performance, etc.)
 * - Scope indicators (multi-file, system-wide, etc.)
 * - Dependency analysis
 * - Domain complexity
 * - Time indicators
 */

class ComplexityScorer {
  constructor() {
    // High complexity indicators
    this.highComplexityKeywords = [
      'security', 'vulnerability', 'exploit', 'cve', 'audit',
      'architecture', 'distributed', 'microservices', 'scaling',
      'performance', 'optimization', 'profiling', 'bottleneck',
      'migration', 'refactor', 'rewrite', 'restructure',
      'compliance', 'encryption', 'authentication', 'authorization',
      'multi-tenant', 'high-availability', 'fault-tolerant',
      'real-time', 'streaming', 'concurrent', 'parallel',
      'database', 'schema', 'transactions', 'consistency',
      'deployment', 'kubernetes', 'orchestration', 'infrastructure'
    ];

    // Medium complexity indicators
    this.mediumComplexityKeywords = [
      'implement', 'integrate', 'build', 'develop', 'create',
      'api', 'endpoint', 'service', 'component', 'module',
      'testing', 'validation', 'error handling', 'logging',
      'configuration', 'monitoring', 'metrics', 'alerts',
      'workflow', 'automation', 'pipeline', 'process',
      'ui', 'frontend', 'backend', 'full-stack'
    ];

    // Low complexity indicators
    this.lowComplexityKeywords = [
      'simple', 'basic', 'quick', 'minor', 'small',
      'typo', 'format', 'style', 'comment', 'documentation',
      'fix typo', 'update comment', 'rename', 'move',
      'delete', 'remove', 'clean', 'cleanup'
    ];

    // Scope indicators
    this.scopeIndicators = {
      file_level: ['file', 'function', 'method', 'class'],
      module_level: ['module', 'package', 'component', 'service'],
      system_level: ['system', 'architecture', 'infrastructure', 'platform'],
      multi_system: ['integration', 'cross-system', 'multi-service', 'distributed']
    };

    // Dependency complexity
    this.dependencyKeywords = [
      'depends on', 'requires', 'integration', 'coordination',
      'multiple', 'several', 'various', 'across'
    ];
  }

  /**
   * Score task complexity (1-10)
   * @param {string} taskDescription - Task to analyze
   * @param {Object} context - Additional context
   * @returns {number} Complexity score 1-10
   */
  score(taskDescription, context = {}) {
    const taskLower = taskDescription.toLowerCase();
    let score = 5; // Base score (medium)

    // Factor 1: Keyword analysis (+/- 2 points)
    const keywordScore = this._scoreKeywords(taskLower);
    score += keywordScore;

    // Factor 2: Scope analysis (+0 to +2 points)
    const scopeScore = this._scoreScope(taskLower);
    score += scopeScore;

    // Factor 3: Dependencies (+0 to +1 point)
    const dependencyScore = this._scoreDependencies(taskLower);
    score += dependencyScore;

    // Factor 4: Task length/detail (+0 to +1 point)
    const lengthScore = this._scoreLength(taskDescription);
    score += lengthScore;

    // Factor 5: Explicit complexity from context
    if (context.priority === 'critical' || context.priority === 'high') {
      score += 1;
    }

    if (context.estimated_hours && context.estimated_hours > 8) {
      score += 1;
    }

    // Factor 6: Multiple phases/components
    const componentScore = this._scoreComponents(taskDescription);
    score += componentScore;

    // Clamp to 1-10 range
    return Math.max(1, Math.min(10, Math.round(score)));
  }

  /**
   * Get detailed complexity factors
   * @param {string} taskDescription
   * @returns {Object} Breakdown of complexity factors
   */
  getComplexityFactors(taskDescription) {
    const taskLower = taskDescription.toLowerCase();

    return {
      keyword_complexity: this._scoreKeywords(taskLower),
      scope_complexity: this._scoreScope(taskLower),
      dependency_complexity: this._scoreDependencies(taskLower),
      length_complexity: this._scoreLength(taskDescription),
      component_count: this._countComponents(taskDescription),
      high_complexity_matches: this._countMatches(taskLower, this.highComplexityKeywords),
      medium_complexity_matches: this._countMatches(taskLower, this.mediumComplexityKeywords),
      low_complexity_matches: this._countMatches(taskLower, this.lowComplexityKeywords)
    };
  }

  /**
   * Explain complexity score
   * @param {string} taskDescription
   * @returns {string} Human-readable explanation
   */
  explain(taskDescription) {
    const score = this.score(taskDescription);
    const factors = this.getComplexityFactors(taskDescription);
    const level = this._getComplexityLevel(score);

    let explanation = `Complexity: ${level} (${score}/10). `;

    const reasons = [];

    if (factors.high_complexity_matches > 0) {
      reasons.push(`${factors.high_complexity_matches} high-complexity indicators`);
    }

    if (factors.scope_complexity > 0.5) {
      reasons.push('system-level scope');
    }

    if (factors.dependency_complexity > 0) {
      reasons.push('multiple dependencies');
    }

    if (factors.component_count > 3) {
      reasons.push(`${factors.component_count} components`);
    }

    if (factors.length_complexity > 0) {
      reasons.push('detailed specification');
    }

    if (reasons.length > 0) {
      explanation += `Factors: ${reasons.join(', ')}.`;
    } else {
      explanation += 'Standard task complexity.';
    }

    return explanation;
  }

  /**
   * Score based on keywords
   * @private
   */
  _scoreKeywords(taskLower) {
    let score = 0;

    // High complexity keywords (+0.3 each, max +2)
    const highMatches = this._countMatches(taskLower, this.highComplexityKeywords);
    score += Math.min(2, highMatches * 0.3);

    // Medium complexity keywords (+0.1 each, max +1)
    const mediumMatches = this._countMatches(taskLower, this.mediumComplexityKeywords);
    score += Math.min(1, mediumMatches * 0.1);

    // Low complexity keywords (-0.3 each, max -2)
    const lowMatches = this._countMatches(taskLower, this.lowComplexityKeywords);
    score -= Math.min(2, lowMatches * 0.3);

    return score;
  }

  /**
   * Score based on scope
   * @private
   */
  _scoreScope(taskLower) {
    if (this._containsAny(taskLower, this.scopeIndicators.multi_system)) {
      return 2;
    }
    if (this._containsAny(taskLower, this.scopeIndicators.system_level)) {
      return 1.5;
    }
    if (this._containsAny(taskLower, this.scopeIndicators.module_level)) {
      return 0.5;
    }
    return 0;
  }

  /**
   * Score based on dependencies
   * @private
   */
  _scoreDependencies(taskLower) {
    const matches = this._countMatches(taskLower, this.dependencyKeywords);
    return Math.min(1, matches * 0.3);
  }

  /**
   * Score based on task description length
   * @private
   */
  _scoreLength(taskDescription) {
    const wordCount = taskDescription.split(/\s+/).length;

    if (wordCount > 100) return 1;
    if (wordCount > 50) return 0.5;
    return 0;
  }

  /**
   * Score based on number of components
   * @private
   */
  _scoreComponents(taskDescription) {
    const componentCount = this._countComponents(taskDescription);

    if (componentCount > 5) return 2;
    if (componentCount > 3) return 1;
    return 0;
  }

  /**
   * Count components (bullet points, numbered items)
   * @private
   */
  _countComponents(taskDescription) {
    // Count bullet points and numbered lists
    const bullets = (taskDescription.match(/(?:^|\n)[-*•]\s/g) || []).length;
    const numbers = (taskDescription.match(/(?:^|\n)\d+\.\s/g) || []).length;
    const sections = (taskDescription.match(/(?:^|\n)#{1,3}\s/g) || []).length;

    return Math.max(bullets, numbers, sections);
  }

  /**
   * Count keyword matches
   * @private
   */
  _countMatches(text, keywords) {
    return keywords.filter(kw => text.includes(kw.toLowerCase())).length;
  }

  /**
   * Check if text contains any keyword
   * @private
   */
  _containsAny(text, keywords) {
    return keywords.some(kw => text.includes(kw.toLowerCase()));
  }

  /**
   * Get complexity level from score
   * @private
   */
  _getComplexityLevel(score) {
    if (score <= 3) return 'Low';
    if (score <= 6) return 'Medium';
    if (score <= 8) return 'High';
    return 'Very High';
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: complexity-scorer.js <task_description>');
    console.log('Example: complexity-scorer.js "Fix security vulnerability in authentication"');
    process.exit(1);
  }

  const taskDescription = args.join(' ');
  const scorer = new ComplexityScorer();

  const score = scorer.score(taskDescription);
  const factors = scorer.getComplexityFactors(taskDescription);
  const explanation = scorer.explain(taskDescription);

  console.log(JSON.stringify({
    score: score,
    explanation: explanation,
    factors: factors
  }, null, 2));
}

module.exports = ComplexityScorer;
