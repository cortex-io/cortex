#!/usr/bin/env node

/**
 * Cortex Worker Certification Validator
 *
 * Validates worker qualifications before spawn:
 * - Checks required certifications for worker type
 * - Validates certification expiration
 * - Tracks certification status in worker pool
 * - Auto-renews certifications based on performance
 * - Enforces union worker certification requirements
 *
 * Integration with worker-mode.js spawn process
 */

const fs = require('fs').promises;
const path = require('path');

class CertificationValidator {
  constructor(options = {}) {
    this.coordinationDir = options.coordinationDir || path.join(__dirname, '..');
    this.skillMatrixPath = path.join(__dirname, 'skill-matrix.json');
    this.certRecordsDir = path.join(this.coordinationDir, 'worker-certification', 'records');
    this.workerPoolPath = path.join(this.coordinationDir, 'worker-pool.json');

    this.skillMatrix = null;
  }

  async initialize() {
    await fs.mkdir(this.certRecordsDir, { recursive: true });

    // Load skill matrix
    const data = await fs.readFile(this.skillMatrixPath, 'utf8');
    this.skillMatrix = JSON.parse(data);

    console.log(`[CertValidator] Initialized with ${Object.keys(this.skillMatrix.worker_types).length} worker types`);
  }

  /**
   * Validate worker certifications before spawn
   */
  async validateWorkerSpawn(workerId, workerType, environment = 'development') {
    if (!this.skillMatrix) {
      await this.initialize();
    }

    const workerConfig = this.skillMatrix.worker_types[workerType];

    if (!workerConfig) {
      throw new Error(`Unknown worker type: ${workerType}`);
    }

    console.log(`[CertValidator] Validating ${workerType} for ${environment} environment`);

    // Check if worker type requires permit for this environment
    const permitRequired = workerConfig.permit_requirements[environment];

    // Load or create worker certification record
    const certRecord = await this.loadOrCreateCertRecord(workerId, workerType);

    // Validate required certifications
    const validationResults = {
      worker_id: workerId,
      worker_type: workerType,
      environment: environment,
      union_status: workerConfig.union_status,
      permit_required: permitRequired,
      certifications: {},
      missing_required: [],
      expired: [],
      valid: true,
      validated_at: new Date().toISOString()
    };

    // Check required certifications
    for (const certName of workerConfig.required_certifications) {
      const certStatus = await this.checkCertification(certRecord, certName);
      validationResults.certifications[certName] = certStatus;

      if (!certStatus.certified) {
        validationResults.missing_required.push(certName);
        validationResults.valid = false;
      } else if (certStatus.expired) {
        validationResults.expired.push(certName);
        validationResults.valid = false;
      }
    }

    // Check optional certifications (informational only)
    for (const certName of workerConfig.optional_certifications || []) {
      const certStatus = await this.checkCertification(certRecord, certName);
      validationResults.certifications[certName] = certStatus;
      // Optional certs don't affect validity
    }

    // Union workers have stricter requirements
    if (workerConfig.union_status === 'union') {
      validationResults.union_requirements = {
        all_certifications_current: validationResults.expired.length === 0,
        permit_required: permitRequired,
        audit_trail_required: true
      };

      if (!validationResults.union_requirements.all_certifications_current) {
        validationResults.valid = false;
        validationResults.denial_reason = 'Union worker certifications must be current';
      }
    }

    // Update worker pool with certification status
    await this.updateWorkerPoolCertification(workerId, validationResults);

    // Log validation
    await this.logCertificationCheck(validationResults);

    return validationResults;
  }

  /**
   * Check individual certification status
   */
  async checkCertification(certRecord, certName) {
    const certConfig = this.skillMatrix.certifications[certName];

    if (!certConfig) {
      return {
        certified: false,
        reason: 'Unknown certification'
      };
    }

    const workerCert = certRecord.certifications[certName];

    if (!workerCert) {
      return {
        certified: false,
        reason: 'Not yet certified',
        config: certConfig
      };
    }

    // Check expiration
    const expiresAt = new Date(workerCert.expires_at);
    const now = new Date();

    if (now > expiresAt) {
      return {
        certified: true,
        expired: true,
        expires_at: workerCert.expires_at,
        reason: `Expired on ${expiresAt.toISOString()}`,
        config: certConfig
      };
    }

    // Check if nearing expiration (within 7 days)
    const daysUntilExpiration = (expiresAt - now) / (1000 * 60 * 60 * 24);

    return {
      certified: true,
      expired: false,
      expires_at: workerCert.expires_at,
      days_until_expiration: Math.floor(daysUntilExpiration),
      renewal_recommended: daysUntilExpiration < 7,
      earned_at: workerCert.earned_at,
      config: certConfig
    };
  }

  /**
   * Award certification to worker
   */
  async awardCertification(workerId, workerType, certName, reason = 'Manual award') {
    const certConfig = this.skillMatrix.certifications[certName];

    if (!certConfig) {
      throw new Error(`Unknown certification: ${certName}`);
    }

    const certRecord = await this.loadOrCreateCertRecord(workerId, workerType);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + certConfig.renewal_period_days);

    certRecord.certifications[certName] = {
      earned_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      level: certConfig.level,
      reason: reason,
      auto_awarded: false
    };

    await this.saveCertRecord(certRecord);

    console.log(`[CertValidator] Awarded ${certName} to ${workerId} (expires ${expiresAt.toISOString()})`);

    return certRecord.certifications[certName];
  }

  /**
   * Auto-renew certification based on performance
   */
  async autoRenewCertification(workerId, workerType, certName, performanceData) {
    const certConfig = this.skillMatrix.certifications[certName];
    const levelConfig = this.skillMatrix.certification_levels[certConfig.level];

    // Validate performance criteria
    const meetsRequirements = this.validatePerformanceCriteria(
      performanceData,
      certConfig.validation_criteria,
      levelConfig
    );

    if (!meetsRequirements.valid) {
      console.log(`[CertValidator] Auto-renewal denied for ${certName}: ${meetsRequirements.reason}`);
      return {
        renewed: false,
        reason: meetsRequirements.reason
      };
    }

    // Award renewed certification
    const cert = await this.awardCertification(
      workerId,
      workerType,
      certName,
      `Auto-renewed: ${meetsRequirements.reason}`
    );

    cert.auto_awarded = true;
    cert.performance_data = performanceData;

    const certRecord = await this.loadOrCreateCertRecord(workerId, workerType);
    certRecord.certifications[certName] = cert;
    await this.saveCertRecord(certRecord);

    console.log(`[CertValidator] Auto-renewed ${certName} for ${workerId}`);

    return {
      renewed: true,
      certification: cert
    };
  }

  /**
   * Validate performance against certification criteria
   */
  validatePerformanceCriteria(performanceData, criteria, levelConfig) {
    const checks = [];

    // Check task count requirement
    if (performanceData.tasks_completed < levelConfig.tasks_required) {
      return {
        valid: false,
        reason: `Insufficient tasks: ${performanceData.tasks_completed}/${levelConfig.tasks_required}`
      };
    }

    // Check success rate
    const successRate = performanceData.successful_tasks / performanceData.tasks_completed;
    if (successRate < levelConfig.success_rate) {
      return {
        valid: false,
        reason: `Low success rate: ${(successRate * 100).toFixed(1)}% < ${(levelConfig.success_rate * 100)}%`
      };
    }

    // Check specific criteria
    for (const [criterion, threshold] of Object.entries(criteria)) {
      if (!performanceData[criterion]) {
        continue; // Skip if not measured
      }

      const value = performanceData[criterion];
      const thresholdStr = String(threshold);

      // Parse threshold operators (>, <, >=, <=)
      if (thresholdStr.startsWith('>')) {
        const required = parseFloat(thresholdStr.substring(1));
        if (value <= required) {
          return {
            valid: false,
            reason: `${criterion}: ${value} not > ${required}`
          };
        }
      } else if (thresholdStr.startsWith('<')) {
        const required = parseFloat(thresholdStr.substring(1));
        if (value >= required) {
          return {
            valid: false,
            reason: `${criterion}: ${value} not < ${required}`
          };
        }
      }

      checks.push(`${criterion}: ${value} meets ${threshold}`);
    }

    return {
      valid: true,
      reason: checks.join(', ')
    };
  }

  /**
   * Revoke certification
   */
  async revokeCertification(workerId, workerType, certName, reason) {
    const certRecord = await this.loadOrCreateCertRecord(workerId, workerType);

    if (!certRecord.certifications[certName]) {
      throw new Error(`Worker ${workerId} does not have certification ${certName}`);
    }

    certRecord.certifications[certName].revoked = true;
    certRecord.certifications[certName].revoked_at = new Date().toISOString();
    certRecord.certifications[certName].revocation_reason = reason;

    await this.saveCertRecord(certRecord);

    console.log(`[CertValidator] Revoked ${certName} from ${workerId}: ${reason}`);

    return certRecord;
  }

  /**
   * Get certification summary for worker
   */
  async getCertificationSummary(workerId, workerType) {
    const certRecord = await this.loadOrCreateCertRecord(workerId, workerType);
    const workerConfig = this.skillMatrix.worker_types[workerType];

    const summary = {
      worker_id: workerId,
      worker_type: workerType,
      union_status: workerConfig.union_status,
      required_certifications: [],
      optional_certifications: [],
      overall_status: 'certified'
    };

    // Check required certifications
    for (const certName of workerConfig.required_certifications) {
      const status = await this.checkCertification(certRecord, certName);
      summary.required_certifications.push({
        name: certName,
        ...status
      });

      if (!status.certified || status.expired) {
        summary.overall_status = 'not_certified';
      }
    }

    // Check optional certifications
    for (const certName of workerConfig.optional_certifications || []) {
      const status = await this.checkCertification(certRecord, certName);
      summary.optional_certifications.push({
        name: certName,
        ...status
      });
    }

    return summary;
  }

  // Helper methods

  async loadOrCreateCertRecord(workerId, workerType) {
    const filePath = path.join(this.certRecordsDir, `${workerId}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Create new record
      return {
        worker_id: workerId,
        worker_type: workerType,
        created_at: new Date().toISOString(),
        certifications: {}
      };
    }
  }

  async saveCertRecord(certRecord) {
    const filePath = path.join(this.certRecordsDir, `${certRecord.worker_id}.json`);
    certRecord.updated_at = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(certRecord, null, 2));
  }

  async updateWorkerPoolCertification(workerId, validationResults) {
    try {
      const poolData = await fs.readFile(this.workerPoolPath, 'utf8');
      const pool = JSON.parse(poolData);

      // Find worker in active workers
      const worker = pool.active_workers?.find(w => w.worker_id === workerId);

      if (worker) {
        worker.certification_status = {
          valid: validationResults.valid,
          checked_at: validationResults.validated_at,
          union_status: validationResults.union_status,
          missing_required: validationResults.missing_required,
          expired: validationResults.expired
        };

        await fs.writeFile(this.workerPoolPath, JSON.stringify(pool, null, 2));
      }
    } catch (error) {
      console.error('[CertValidator] Failed to update worker pool:', error.message);
    }
  }

  async logCertificationCheck(validationResults) {
    const logPath = path.join(
      this.coordinationDir,
      'governance',
      'audit-log.jsonl'
    );

    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: 'certification_check',
      worker_id: validationResults.worker_id,
      worker_type: validationResults.worker_type,
      environment: validationResults.environment,
      valid: validationResults.valid,
      union_status: validationResults.union_status,
      missing_required: validationResults.missing_required,
      expired: validationResults.expired
    };

    await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
  }
}

// CLI interface
if (require.main === module) {
  const validator = new CertificationValidator();

  const command = process.argv[2];

  (async () => {
    await validator.initialize();

    switch (command) {
      case 'validate':
        const workerId = process.argv[3];
        const workerType = process.argv[4];
        const environment = process.argv[5] || 'development';
        const result = await validator.validateWorkerSpawn(workerId, workerType, environment);
        console.log('Validation result:', JSON.stringify(result, null, 2));
        break;

      case 'award':
        const awardWorkerId = process.argv[3];
        const awardWorkerType = process.argv[4];
        const certName = process.argv[5];
        await validator.awardCertification(awardWorkerId, awardWorkerType, certName);
        break;

      case 'summary':
        const summaryWorkerId = process.argv[3];
        const summaryWorkerType = process.argv[4];
        const summary = await validator.getCertificationSummary(summaryWorkerId, summaryWorkerType);
        console.log('Certification summary:', JSON.stringify(summary, null, 2));
        break;

      default:
        console.log('Usage: cert-validator.js <command> [args]');
        console.log('Commands:');
        console.log('  validate <workerId> <workerType> [environment]');
        console.log('  award <workerId> <workerType> <certName>');
        console.log('  summary <workerId> <workerType>');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = CertificationValidator;
