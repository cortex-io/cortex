#!/usr/bin/env node

/**
 * Completion Validator
 * Validates worker completion against governance policies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CORTEX_ROOT = process.env.CORTEX_ROOT || path.join(__dirname, '../..');
const POLICY_FILE = path.join(CORTEX_ROOT, 'coordination/governance/policies/completion-validation.json');
const VIOLATIONS_LOG = path.join(CORTEX_ROOT, 'coordination/governance/violations.jsonl');

/**
 * Validate worker completion
 */
function validateWorkerCompletion(workerId, taskId, featureId) {
  const violations = [];
  const policy = loadPolicy();

  console.log(`Validating completion: worker=${workerId}, task=${taskId}, feature=${featureId || 'all'}`);

  // Check each rule
  for (const rule of policy.rules) {
    const result = validateRule(rule, workerId, taskId, featureId);

    if (!result.passed) {
      violations.push({
        rule_id: rule.rule_id,
        description: rule.description,
        message: result.message,
        severity: rule.enforcement,
        actions: rule.actions_on_violation
      });
    }
  }

  // Log violations
  if (violations.length > 0) {
    logViolations(workerId, taskId, featureId, violations);
  }

  return {
    valid: violations.length === 0,
    violations,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate a single rule
 */
function validateRule(rule, workerId, taskId, featureId) {
  const { check, parameters } = rule.validation;

  switch (check) {
    case 'test_results_present':
      return validateTestResults(taskId, featureId, parameters);

    case 'progress_file_exists':
      return validateProgressFile(workerId, parameters);

    case 'git_commits_present':
      return validateGitCommits(parameters);

    case 'feature_status_valid':
      return validateFeatureStatus(taskId, featureId, parameters);

    case 'dependencies_satisfied':
      return validateDependencies(taskId, featureId, parameters);

    default:
      return {
        passed: true,
        message: `Unknown check: ${check}`
      };
  }
}

/**
 * Validate test results
 */
function validateTestResults(taskId, featureId, parameters) {
  const featureListPath = path.join(CORTEX_ROOT, `coordination/feature-lists/${taskId}-features.json`);

  if (!fs.existsSync(featureListPath)) {
    return {
      passed: false,
      message: `Feature list not found: ${featureListPath}`
    };
  }

  const featureList = JSON.parse(fs.readFileSync(featureListPath, 'utf8'));
  const feature = featureList.features.find(f => f.feature_id === featureId);

  if (!feature) {
    return {
      passed: false,
      message: `Feature ${featureId} not found in feature list`
    };
  }

  // Check if test results exist
  if (!feature.test_results) {
    return {
      passed: false,
      message: `No test results for feature ${featureId}`
    };
  }

  // Check if tests passed
  if (parameters.require_passing && feature.test_results.exit_code !== 0) {
    return {
      passed: false,
      message: `Tests failed for feature ${featureId} (exit code: ${feature.test_results.exit_code})`
    };
  }

  return {
    passed: true,
    message: `Tests passed for feature ${featureId}`
  };
}

/**
 * Validate progress file exists
 */
function validateProgressFile(workerId, parameters) {
  const progressDir = path.join(CORTEX_ROOT, `coordination/workers/${workerId}/progress`);

  if (!fs.existsSync(progressDir)) {
    return {
      passed: false,
      message: `Progress directory not found: ${progressDir}`
    };
  }

  const currentSessionPath = path.join(progressDir, 'current-session.json');

  if (!fs.existsSync(currentSessionPath)) {
    return {
      passed: false,
      message: `No current session file found for worker ${workerId}`
    };
  }

  // Check minimum lines if specified
  if (parameters.min_lines) {
    const progressFiles = fs.readdirSync(progressDir)
      .filter(f => f.match(/session-\d+-progress\.txt/))
      .sort()
      .reverse();

    if (progressFiles.length === 0) {
      return {
        passed: false,
        message: `No progress files found for worker ${workerId}`
      };
    }

    const latestProgressFile = path.join(progressDir, progressFiles[0]);
    const content = fs.readFileSync(latestProgressFile, 'utf8');
    const lines = content.split('\n').length;

    if (lines < parameters.min_lines) {
      return {
        passed: false,
        message: `Progress file has only ${lines} lines (minimum: ${parameters.min_lines})`
      };
    }
  }

  return {
    passed: true,
    message: `Progress file exists for worker ${workerId}`
  };
}

/**
 * Validate git commits
 */
function validateGitCommits(parameters) {
  const lookbackMinutes = parameters.lookback_minutes || 60;
  const minCommits = parameters.min_commits || 1;
  const authorPattern = parameters.author_pattern || 'cortex';

  try {
    const since = `${lookbackMinutes} minutes ago`;
    const command = `git log --oneline --since="${since}" --author="${authorPattern}"`;

    const output = execSync(command, {
      cwd: CORTEX_ROOT,
      encoding: 'utf8'
    });

    const commits = output.trim().split('\n').filter(line => line.length > 0);

    if (commits.length < minCommits) {
      // Try without author filter
      const commandNoAuthor = `git log --oneline --since="${since}"`;
      const outputNoAuthor = execSync(commandNoAuthor, {
        cwd: CORTEX_ROOT,
        encoding: 'utf8'
      });

      const commitsNoAuthor = outputNoAuthor.trim().split('\n').filter(line => line.length > 0);

      if (commitsNoAuthor.length < minCommits) {
        return {
          passed: false,
          message: `No recent git commits found (required: ${minCommits}, found: 0)`
        };
      }
    }

    return {
      passed: true,
      message: `Found ${commits.length} recent commits`
    };
  } catch (error) {
    return {
      passed: false,
      message: `Error checking git commits: ${error.message}`
    };
  }
}

/**
 * Validate feature status
 */
function validateFeatureStatus(taskId, featureId, parameters) {
  const featureListPath = path.join(CORTEX_ROOT, `coordination/feature-lists/${taskId}-features.json`);

  if (!fs.existsSync(featureListPath)) {
    return {
      passed: false,
      message: `Feature list not found: ${featureListPath}`
    };
  }

  const featureList = JSON.parse(fs.readFileSync(featureListPath, 'utf8'));
  const feature = featureList.features.find(f => f.feature_id === featureId);

  if (!feature) {
    return {
      passed: false,
      message: `Feature ${featureId} not found`
    };
  }

  // Check status
  if (parameters.required_status && feature.status !== parameters.required_status) {
    return {
      passed: false,
      message: `Feature status is '${feature.status}' (required: '${parameters.required_status}')`
    };
  }

  // Check test results if required
  if (parameters.test_results_required && !feature.test_results) {
    return {
      passed: false,
      message: `Test results required but not found for feature ${featureId}`
    };
  }

  if (parameters.test_exit_code !== undefined && feature.test_results) {
    if (feature.test_results.exit_code !== parameters.test_exit_code) {
      return {
        passed: false,
        message: `Test exit code is ${feature.test_results.exit_code} (required: ${parameters.test_exit_code})`
      };
    }
  }

  return {
    passed: true,
    message: `Feature status is valid: ${feature.status}`
  };
}

/**
 * Validate dependencies
 */
function validateDependencies(taskId, featureId, parameters) {
  const featureListPath = path.join(CORTEX_ROOT, `coordination/feature-lists/${taskId}-features.json`);

  if (!fs.existsSync(featureListPath)) {
    return {
      passed: true,
      message: 'No feature list - skipping dependency check'
    };
  }

  const featureList = JSON.parse(fs.readFileSync(featureListPath, 'utf8'));
  const feature = featureList.features.find(f => f.feature_id === featureId);

  if (!feature || !feature.dependencies || feature.dependencies.length === 0) {
    return {
      passed: true,
      message: 'No dependencies to check'
    };
  }

  // Check each dependency
  for (const depId of feature.dependencies) {
    const dep = featureList.features.find(f => f.feature_id === depId);

    if (!dep) {
      return {
        passed: false,
        message: `Dependency ${depId} not found`
      };
    }

    if (dep.status !== 'passing') {
      return {
        passed: false,
        message: `Dependency ${depId} is not passing (status: ${dep.status})`
      };
    }
  }

  return {
    passed: true,
    message: 'All dependencies satisfied'
  };
}

/**
 * Load policy
 */
function loadPolicy() {
  if (!fs.existsSync(POLICY_FILE)) {
    throw new Error(`Policy file not found: ${POLICY_FILE}`);
  }

  return JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
}

/**
 * Log violations
 */
function logViolations(workerId, taskId, featureId, violations) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    worker_id: workerId,
    task_id: taskId,
    feature_id: featureId,
    violations,
    action: 'completion_rejected'
  };

  fs.appendFileSync(VIOLATIONS_LOG, JSON.stringify(logEntry) + '\n');
}

// CLI usage
if (require.main === module) {
  const [workerId, taskId, featureId] = process.argv.slice(2);

  if (!workerId || !taskId) {
    console.error('Usage: completion-validator.js <worker_id> <task_id> [feature_id]');
    process.exit(1);
  }

  const result = validateWorkerCompletion(workerId, taskId, featureId);

  console.log(JSON.stringify(result, null, 2));

  process.exit(result.valid ? 0 : 1);
}

module.exports = { validateWorkerCompletion };
