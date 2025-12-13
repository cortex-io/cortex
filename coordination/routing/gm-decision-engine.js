#!/usr/bin/env node
/**
 * GM Decision Engine
 *
 * Automatic contractor selection and task routing for Cortex Construction HQ.
 * Implements intelligent decision-making for:
 * - Task complexity scoring (1-10)
 * - Automatic contractor (master) selection
 * - Resource estimation (tokens, time, workers)
 * - Parallel task decomposition
 *
 * Integrates with existing MoE router and knowledge bases.
 */

const fs = require('fs');
const path = require('path');
const ComplexityScorer = require('./complexity-scorer');
const ResourceEstimator = require('./resource-estimator');

class GMDecisionEngine {
  constructor(options = {}) {
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || path.join(__dirname, '../..');
    this.knowledgeBasePath = path.join(this.cortexHome, 'coordination/masters');
    this.routingPatternsPath = path.join(this.cortexHome, 'coordination/masters/coordinator/knowledge-base/routing-patterns.json');
    this.decisionLogPath = path.join(this.cortexHome, 'coordination/routing/decision-log.jsonl');

    this.complexityScorer = new ComplexityScorer();
    this.resourceEstimator = new ResourceEstimator();

    // Load routing patterns and knowledge bases
    this.routingPatterns = this._loadRoutingPatterns();
    this.knowledgeBases = this._loadKnowledgeBases();

    // Complexity threshold for decomposition
    this.decompositionThreshold = options.decompositionThreshold || 7;

    // Ensure decision log directory exists
    this._ensureLogDirectory();
  }

  /**
   * Main decision function - select contractors and plan execution
   * @param {string} taskDescription - The task to analyze
   * @param {Object} taskContext - Additional context (priority, deadline, etc.)
   * @returns {Object} Decision with contractors, resources, and execution plan
   */
  async selectContractors(taskDescription, taskContext = {}) {
    const startTime = Date.now();

    // Step 1: Complexity analysis
    const complexity = await this._analyzeComplexity(taskDescription, taskContext);

    // Step 2: Contractor matching using MoE + knowledge bases
    const contractors = await this._matchContractors(taskDescription, complexity, taskContext);

    // Step 3: Resource estimation
    const resources = await this._estimateResources(complexity, contractors, taskDescription);

    // Step 4: Decomposition if needed
    let decomposition = null;
    if (complexity.score > this.decompositionThreshold) {
      decomposition = await this._decomposeTask(taskDescription, contractors, complexity);
    }

    // Build decision object
    const decision = {
      task_description: taskDescription,
      timestamp: new Date().toISOString(),
      decision_time_ms: Date.now() - startTime,
      complexity: complexity,
      primary_contractor: contractors.primary,
      supporting_contractors: contractors.supporting,
      estimated_tokens: resources.tokens,
      estimated_time_minutes: resources.time,
      estimated_workers: resources.workers,
      parallel_execution_plan: decomposition || resources.parallelPlan,
      confidence: contractors.confidence,
      reasoning: this._generateReasoning(complexity, contractors, resources, decomposition)
    };

    // Log decision
    this._logDecision(decision);

    return decision;
  }

  /**
   * Analyze task complexity
   * @private
   */
  async _analyzeComplexity(taskDescription, taskContext) {
    const score = this.complexityScorer.score(taskDescription, taskContext);
    const factors = this.complexityScorer.getComplexityFactors(taskDescription);

    return {
      score: score,
      level: this._getComplexityLevel(score),
      factors: factors,
      reasoning: this.complexityScorer.explain(taskDescription)
    };
  }

  /**
   * Match task to contractors using MoE routing + knowledge base analysis
   * @private
   */
  async _matchContractors(taskDescription, complexity, taskContext) {
    // Get MoE routing scores for all masters
    const moeScores = this._calculateMoEScores(taskDescription);

    // Enhance with knowledge base matching
    const kbScores = this._calculateKnowledgeBaseScores(taskDescription, complexity);

    // Combine scores (70% MoE, 30% KB)
    const combinedScores = this._combineScores(moeScores, kbScores);

    // Sort by score
    const sortedContractors = Object.entries(combinedScores)
      .map(([contractor, data]) => ({ contractor, ...data }))
      .sort((a, b) => b.score - a.score);

    // Select primary and supporting contractors
    const primary = sortedContractors[0];
    const supporting = sortedContractors
      .slice(1)
      .filter(c => c.score >= 0.4) // Only include if score > 40%
      .map(c => ({
        contractor: c.contractor,
        role: this._determineSupportingRole(c.contractor, primary.contractor),
        confidence: c.score
      }));

    return {
      primary: {
        contractor: primary.contractor,
        confidence: primary.score,
        reasoning: primary.reasoning
      },
      supporting: supporting,
      confidence: primary.score
    };
  }

  /**
   * Calculate MoE scores using routing patterns
   * @private
   */
  _calculateMoEScores(taskDescription) {
    const scores = {};
    const taskLower = taskDescription.toLowerCase();

    if (!this.routingPatterns || !this.routingPatterns.experts) {
      return scores;
    }

    for (const [expertName, expertConfig] of Object.entries(this.routingPatterns.experts)) {
      let score = 0;
      let keywordMatches = 0;
      let boosterMatches = 0;
      let negativeMatches = 0;

      // Score activation keywords
      if (expertConfig.activation_keywords) {
        for (const keyword of expertConfig.activation_keywords) {
          if (taskLower.includes(keyword.toLowerCase())) {
            keywordMatches++;
          }
        }
      }

      // Score confidence boosters
      if (expertConfig.confidence_boosters) {
        for (const booster of expertConfig.confidence_boosters) {
          if (taskLower.includes(booster.toLowerCase())) {
            boosterMatches++;
          }
        }
      }

      // Score negative indicators
      if (expertConfig.negative_indicators) {
        for (const negative of expertConfig.negative_indicators) {
          if (taskLower.includes(negative.toLowerCase())) {
            negativeMatches++;
          }
        }
      }

      // Calculate score using routing patterns formula
      score = (keywordMatches * 25) + (boosterMatches * 12) - (negativeMatches * 30);
      score = Math.max(0, Math.min(100, score)) / 100; // Normalize to 0-1

      scores[expertName] = {
        score: score,
        keywordMatches: keywordMatches,
        boosterMatches: boosterMatches,
        negativeMatches: negativeMatches,
        reasoning: `Matched ${keywordMatches} keywords, ${boosterMatches} boosters`
      };
    }

    return scores;
  }

  /**
   * Calculate knowledge base scores using worker types and past patterns
   * @private
   */
  _calculateKnowledgeBaseScores(taskDescription, complexity) {
    const scores = {};

    for (const [masterName, kb] of Object.entries(this.knowledgeBases)) {
      let score = 0.5; // Base score

      // Check worker types specialization match
      if (kb.workerTypes) {
        const matchingWorkers = kb.workerTypes.filter(wt =>
          this._workerMatchesTask(wt, taskDescription, complexity)
        );

        if (matchingWorkers.length > 0) {
          score += matchingWorkers.length * 0.1;
        }
      }

      // Check past patterns (if available)
      if (kb.patterns) {
        const matchingPatterns = kb.patterns.filter(p =>
          this._patternMatchesTask(p, taskDescription)
        );

        if (matchingPatterns.length > 0) {
          const avgSuccess = matchingPatterns.reduce((sum, p) => sum + (p.success_rate || 0.5), 0) / matchingPatterns.length;
          score += avgSuccess * 0.2;
        }
      }

      scores[masterName] = {
        score: Math.min(1.0, score),
        reasoning: `KB match based on worker types and patterns`
      };
    }

    return scores;
  }

  /**
   * Combine MoE and KB scores
   * @private
   */
  _combineScores(moeScores, kbScores) {
    const combined = {};
    const allContractors = new Set([
      ...Object.keys(moeScores),
      ...Object.keys(kbScores)
    ]);

    for (const contractor of allContractors) {
      const moe = moeScores[contractor] || { score: 0, reasoning: 'No MoE match' };
      const kb = kbScores[contractor] || { score: 0, reasoning: 'No KB match' };

      combined[contractor] = {
        score: (moe.score * 0.7) + (kb.score * 0.3),
        moeScore: moe.score,
        kbScore: kb.score,
        reasoning: `MoE: ${(moe.score * 100).toFixed(0)}%, KB: ${(kb.score * 100).toFixed(0)}%`
      };
    }

    return combined;
  }

  /**
   * Estimate resources needed
   * @private
   */
  async _estimateResources(complexity, contractors, taskDescription) {
    return this.resourceEstimator.estimate(
      taskDescription,
      complexity.score,
      contractors.primary.contractor,
      contractors.supporting.length
    );
  }

  /**
   * Decompose complex task into parallel subtasks
   * @private
   */
  async _decomposeTask(taskDescription, contractors, complexity) {
    const subtasks = [];

    // Analyze task structure
    const taskComponents = this._identifyTaskComponents(taskDescription);

    // If task has multiple clear components, decompose
    if (taskComponents.length > 1) {
      for (const component of taskComponents) {
        // Determine best contractor for this component
        const componentContractors = await this._matchContractors(
          component.description,
          { score: component.complexity },
          {}
        );

        subtasks.push({
          id: `subtask-${Date.now()}-${subtasks.length}`,
          description: component.description,
          contractor: componentContractors.primary.contractor,
          estimated_tokens: Math.round(this.resourceEstimator.estimateTokens(component.complexity)),
          estimated_time_minutes: Math.round(this.resourceEstimator.estimateTime(component.complexity)),
          dependencies: component.dependencies || [],
          parallel_group: component.parallelGroup
        });
      }
    } else {
      // Single complex task - break by phases
      const phases = this._identifyPhases(taskDescription, complexity.score);

      for (const phase of phases) {
        subtasks.push({
          id: `phase-${Date.now()}-${subtasks.length}`,
          description: phase.description,
          contractor: contractors.primary.contractor,
          estimated_tokens: Math.round(phase.tokens),
          estimated_time_minutes: Math.round(phase.time),
          dependencies: phase.dependencies || [],
          parallel_group: phase.parallelGroup
        });
      }
    }

    return {
      strategy: 'decomposed',
      total_subtasks: subtasks.length,
      subtasks: subtasks,
      execution_order: this._determineExecutionOrder(subtasks),
      estimated_total_time: this._calculateParallelTime(subtasks)
    };
  }

  /**
   * Identify distinct components in task description
   * @private
   */
  _identifyTaskComponents(taskDescription) {
    const components = [];

    // Look for enumerated items (1., 2., 3. or - item)
    const bulletRegex = /(?:^|\n)(?:[\d]+\.|[-*])\s+(.+?)(?=\n[\d]+\.|\n[-*]|$)/gs;
    const matches = taskDescription.matchAll(bulletRegex);

    let componentCount = 0;
    for (const match of matches) {
      components.push({
        description: match[1].trim(),
        complexity: 5, // Default medium complexity
        dependencies: [],
        parallelGroup: Math.floor(componentCount / 2) // Group in pairs
      });
      componentCount++;
    }

    // If no bullets found, treat as single component
    if (components.length === 0) {
      components.push({
        description: taskDescription,
        complexity: 8,
        dependencies: [],
        parallelGroup: 0
      });
    }

    return components;
  }

  /**
   * Identify phases for complex tasks
   * @private
   */
  _identifyPhases(taskDescription, complexityScore) {
    const baseTokens = this.resourceEstimator.estimateTokens(complexityScore);
    const baseTime = this.resourceEstimator.estimateTime(complexityScore);

    // Standard phases for complex tasks
    const phases = [
      {
        description: `Planning and design: ${taskDescription}`,
        tokens: baseTokens * 0.2,
        time: baseTime * 0.15,
        dependencies: [],
        parallelGroup: 0
      },
      {
        description: `Implementation: ${taskDescription}`,
        tokens: baseTokens * 0.5,
        time: baseTime * 0.6,
        dependencies: ['phase-0'],
        parallelGroup: 1
      },
      {
        description: `Testing and validation: ${taskDescription}`,
        tokens: baseTokens * 0.2,
        time: baseTime * 0.15,
        dependencies: ['phase-1'],
        parallelGroup: 2
      },
      {
        description: `Documentation and handoff: ${taskDescription}`,
        tokens: baseTokens * 0.1,
        time: baseTime * 0.1,
        dependencies: ['phase-2'],
        parallelGroup: 3
      }
    ];

    return phases;
  }

  /**
   * Determine execution order based on dependencies
   * @private
   */
  _determineExecutionOrder(subtasks) {
    const groups = {};

    for (const subtask of subtasks) {
      const group = subtask.parallel_group || 0;
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(subtask.id);
    }

    return Object.keys(groups).sort().map(groupId => ({
      group: parseInt(groupId),
      subtasks: groups[groupId],
      execution_mode: groups[groupId].length > 1 ? 'parallel' : 'sequential'
    }));
  }

  /**
   * Calculate total time for parallel execution
   * @private
   */
  _calculateParallelTime(subtasks) {
    const groups = {};

    for (const subtask of subtasks) {
      const group = subtask.parallel_group || 0;
      if (!groups[group]) {
        groups[group] = 0;
      }
      // Max time in each parallel group
      groups[group] = Math.max(groups[group], subtask.estimated_time_minutes);
    }

    // Sum of max times across groups
    return Object.values(groups).reduce((sum, time) => sum + time, 0);
  }

  /**
   * Get complexity level from score
   * @private
   */
  _getComplexityLevel(score) {
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    if (score <= 8) return 'high';
    return 'very_high';
  }

  /**
   * Determine supporting role for contractor
   * @private
   */
  _determineSupportingRole(contractor, primary) {
    const roles = {
      security: {
        development: 'security_review',
        inventory: 'security_audit',
        cicd: 'security_validation'
      },
      development: {
        security: 'implementation',
        inventory: 'tooling',
        cicd: 'automation'
      },
      inventory: {
        development: 'documentation',
        security: 'cataloging',
        cicd: 'tracking'
      },
      cicd: {
        development: 'deployment',
        security: 'validation',
        inventory: 'release_management'
      }
    };

    return roles[contractor]?.[primary] || 'support';
  }

  /**
   * Check if worker type matches task
   * @private
   */
  _workerMatchesTask(workerType, taskDescription, complexity) {
    const taskLower = taskDescription.toLowerCase();

    // Simple matching based on worker type specialization
    const specializationMap = {
      'feature_development': ['feature', 'new', 'create', 'implement', 'add'],
      'bug_resolution': ['bug', 'fix', 'error', 'issue', 'problem'],
      'code_improvement': ['refactor', 'improve', 'optimize', 'clean'],
      'performance': ['performance', 'speed', 'optimize', 'efficient'],
      'security_scanning': ['security', 'vulnerability', 'scan', 'audit'],
      'documentation': ['document', 'readme', 'guide', 'catalog']
    };

    const keywords = specializationMap[workerType.specialization] || [];
    return keywords.some(kw => taskLower.includes(kw));
  }

  /**
   * Check if pattern matches task
   * @private
   */
  _patternMatchesTask(pattern, taskDescription) {
    if (!pattern.keywords) return false;

    const taskLower = taskDescription.toLowerCase();
    const matchCount = pattern.keywords.filter(kw =>
      taskLower.includes(kw.toLowerCase())
    ).length;

    return matchCount >= Math.ceil(pattern.keywords.length * 0.5);
  }

  /**
   * Generate human-readable reasoning
   * @private
   */
  _generateReasoning(complexity, contractors, resources, decomposition) {
    let reasoning = `Task complexity: ${complexity.level} (${complexity.score}/10). `;
    reasoning += `Selected ${contractors.primary.contractor} as primary contractor with ${(contractors.primary.confidence * 100).toFixed(0)}% confidence. `;

    if (contractors.supporting.length > 0) {
      const supportList = contractors.supporting.map(s => s.contractor).join(', ');
      reasoning += `Supporting contractors: ${supportList}. `;
    }

    reasoning += `Estimated ${resources.tokens} tokens, ${resources.time} minutes, ${resources.workers} workers. `;

    if (decomposition) {
      reasoning += `Task decomposed into ${decomposition.total_subtasks} subtasks for parallel execution (estimated ${decomposition.estimated_total_time} minutes total).`;
    }

    return reasoning;
  }

  /**
   * Load routing patterns
   * @private
   */
  _loadRoutingPatterns() {
    try {
      if (fs.existsSync(this.routingPatternsPath)) {
        return JSON.parse(fs.readFileSync(this.routingPatternsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading routing patterns:', error.message);
    }
    return { experts: {} };
  }

  /**
   * Load all knowledge bases
   * @private
   */
  _loadKnowledgeBases() {
    const kbs = {};
    const masters = ['development', 'security', 'inventory', 'cicd'];

    for (const master of masters) {
      const kbPath = path.join(this.knowledgeBasePath, master, 'knowledge-base');

      if (!fs.existsSync(kbPath)) continue;

      const kb = {
        workerTypes: null,
        patterns: null
      };

      // Load worker types
      const workerTypesPath = path.join(kbPath, 'worker-types.json');
      if (fs.existsSync(workerTypesPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(workerTypesPath, 'utf8'));
          kb.workerTypes = data.worker_types || data;
        } catch (error) {
          console.error(`Error loading worker types for ${master}:`, error.message);
        }
      }

      // Load patterns (if exists as JSONL)
      const patternsPath = path.join(kbPath, 'implementation-patterns.jsonl');
      if (fs.existsSync(patternsPath)) {
        try {
          const lines = fs.readFileSync(patternsPath, 'utf8').split('\n').filter(l => l.trim());
          kb.patterns = lines.slice(-10).map(line => JSON.parse(line)); // Last 10 patterns
        } catch (error) {
          console.error(`Error loading patterns for ${master}:`, error.message);
        }
      }

      kbs[master] = kb;
    }

    return kbs;
  }

  /**
   * Ensure log directory exists
   * @private
   */
  _ensureLogDirectory() {
    const logDir = path.dirname(this.decisionLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Log decision to JSONL file
   * @private
   */
  _logDecision(decision) {
    try {
      const logEntry = JSON.stringify(decision) + '\n';
      fs.appendFileSync(this.decisionLogPath, logEntry);
    } catch (error) {
      console.error('Error logging decision:', error.message);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: gm-decision-engine.js <task_description>');
    console.log('Example: gm-decision-engine.js "Implement authentication system with JWT"');
    process.exit(1);
  }

  const taskDescription = args.join(' ');

  const engine = new GMDecisionEngine();

  engine.selectContractors(taskDescription)
    .then(decision => {
      console.log(JSON.stringify(decision, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = GMDecisionEngine;
