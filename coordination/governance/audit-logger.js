#!/usr/bin/env node

/**
 * Cortex Audit Logger
 *
 * Immutable, tamper-evident audit trail for compliance:
 * - Append-only JSONL log file
 * - SHA-256 hash chain for integrity
 * - Comprehensive event logging
 * - Tamper detection
 * - Compliance reporting integration
 *
 * All union operations, worker spawns, permit usage logged here
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
  constructor(options = {}) {
    this.coordinationDir = options.coordinationDir || path.join(__dirname, '../..');
    this.auditLogPath = path.join(
      this.coordinationDir,
      'governance',
      'audit-log.jsonl'
    );
    this.lastHash = null;
    this.initialized = false;
  }

  async initialize() {
    // Create audit log file if it doesn't exist
    try {
      await fs.access(this.auditLogPath);
    } catch (error) {
      // File doesn't exist, create it with genesis entry
      const genesisEntry = {
        timestamp: new Date().toISOString(),
        event_type: 'audit_log_initialized',
        message: 'Cortex audit log initialized',
        hash: this.hashEntry({ genesis: true }),
        previous_hash: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      await fs.writeFile(
        this.auditLogPath,
        JSON.stringify(genesisEntry) + '\n'
      );

      console.log('[AuditLogger] Created new audit log with genesis entry');
    }

    // Load last hash
    await this.loadLastHash();
    this.initialized = true;

    console.log(`[AuditLogger] Initialized at ${this.auditLogPath}`);
  }

  /**
   * Log an audit event
   */
  async logEvent(event) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Create audit entry
    const entry = {
      timestamp: new Date().toISOString(),
      event_type: event.event_type,
      actor: event.actor || { type: 'system', id: 'unknown' },
      action: event.action,
      resource: event.resource,
      context: event.context || {},
      result: event.result || 'success',
      metadata: event.metadata || {},
      previous_hash: this.lastHash
    };

    // Calculate hash of current entry
    entry.hash = this.hashEntry(entry);

    // Append to log file
    await fs.appendFile(
      this.auditLogPath,
      JSON.stringify(entry) + '\n'
    );

    // Update last hash
    this.lastHash = entry.hash;

    return entry;
  }

  /**
   * Log worker spawn event
   */
  async logWorkerSpawn(workerId, workerType, spawnedBy, context = {}) {
    return await this.logEvent({
      event_type: 'worker_spawn',
      actor: {
        type: 'master',
        id: spawnedBy,
        spiffe_id: `spiffe://cortex/masters/${spawnedBy}`
      },
      action: 'spawn_worker',
      resource: {
        type: 'worker',
        id: workerId,
        worker_type: workerType
      },
      context: {
        task_id: context.task_id,
        permit_id: context.permit_id,
        certification_valid: context.certification_valid,
        environment: context.environment
      },
      result: 'success'
    });
  }

  /**
   * Log permit request event
   */
  async logPermitRequest(permit, autoApproved = false) {
    return await this.logEvent({
      event_type: 'permit_requested',
      actor: permit.requester,
      action: 'request_permit',
      resource: {
        type: 'permit',
        id: permit.permit_id,
        permit_type: permit.permit_type,
        target_resource: permit.resource
      },
      context: {
        justification: permit.justification,
        auto_approved: autoApproved,
        rollback_plan_id: permit.rollback_plan_id
      },
      result: autoApproved ? 'auto_approved' : 'pending_approval'
    });
  }

  /**
   * Log permit approval event
   */
  async logPermitApproval(permitId, approverId, fullyApproved = false) {
    return await this.logEvent({
      event_type: 'permit_approved',
      actor: {
        type: 'master',
        id: approverId,
        spiffe_id: `spiffe://cortex/masters/${approverId}`
      },
      action: 'approve_permit',
      resource: {
        type: 'permit',
        id: permitId
      },
      context: {
        fully_approved: fullyApproved
      },
      result: 'success'
    });
  }

  /**
   * Log permit consumption event
   */
  async logPermitConsumption(permitId, consumerId, resource) {
    return await this.logEvent({
      event_type: 'permit_consumed',
      actor: {
        type: 'worker',
        id: consumerId
      },
      action: 'consume_permit',
      resource: {
        type: 'permit',
        id: permitId,
        applied_to: resource
      },
      result: 'success'
    });
  }

  /**
   * Log certification check event
   */
  async logCertificationCheck(workerId, workerType, valid, details = {}) {
    return await this.logEvent({
      event_type: 'certification_check',
      actor: {
        type: 'system',
        id: 'cert-validator'
      },
      action: 'validate_certification',
      resource: {
        type: 'worker',
        id: workerId,
        worker_type: workerType
      },
      context: {
        valid: valid,
        missing_required: details.missing_required || [],
        expired: details.expired || [],
        environment: details.environment
      },
      result: valid ? 'valid' : 'invalid'
    });
  }

  /**
   * Log rollback event
   */
  async logRollback(rollbackPlanId, triggeredBy, reason, success = true) {
    return await this.logEvent({
      event_type: 'rollback_executed',
      actor: {
        type: 'system',
        id: triggeredBy
      },
      action: 'execute_rollback',
      resource: {
        type: 'rollback_plan',
        id: rollbackPlanId
      },
      context: {
        trigger_reason: reason
      },
      result: success ? 'success' : 'failure'
    });
  }

  /**
   * Log deployment event
   */
  async logDeployment(deploymentId, environment, deployedBy, permitId = null) {
    return await this.logEvent({
      event_type: 'deployment',
      actor: {
        type: 'worker',
        id: deployedBy
      },
      action: 'deploy',
      resource: {
        type: 'deployment',
        id: deploymentId,
        environment: environment
      },
      context: {
        permit_id: permitId
      },
      result: 'success'
    });
  }

  /**
   * Log security scan event
   */
  async logSecurityScan(scanId, scannedBy, findings = {}) {
    return await this.logEvent({
      event_type: 'security_scan',
      actor: {
        type: 'worker',
        id: scannedBy
      },
      action: 'security_scan',
      resource: {
        type: 'scan',
        id: scanId
      },
      context: {
        vulnerabilities_found: findings.vulnerabilities || 0,
        critical: findings.critical || 0,
        high: findings.high || 0,
        medium: findings.medium || 0,
        low: findings.low || 0
      },
      result: findings.vulnerabilities > 0 ? 'vulnerabilities_found' : 'clean'
    });
  }

  /**
   * Log access control event
   */
  async logAccessControl(actorId, action, resource, granted = true, reason = '') {
    return await this.logEvent({
      event_type: 'access_control',
      actor: {
        type: 'unknown',
        id: actorId
      },
      action: action,
      resource: resource,
      context: {
        granted: granted,
        denial_reason: reason
      },
      result: granted ? 'granted' : 'denied'
    });
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity() {
    const entries = await this.readAllEntries();
    const results = {
      total_entries: entries.length,
      valid: true,
      errors: []
    };

    let previousHash = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify hash chain
      if (i > 0) {
        if (entry.previous_hash !== previousHash) {
          results.valid = false;
          results.errors.push({
            line: i + 1,
            error: 'Hash chain broken',
            expected: previousHash,
            actual: entry.previous_hash
          });
        }
      }

      // Verify entry hash
      const calculatedHash = this.hashEntry(entry);
      if (calculatedHash !== entry.hash) {
        results.valid = false;
        results.errors.push({
          line: i + 1,
          error: 'Entry hash mismatch',
          expected: calculatedHash,
          actual: entry.hash
        });
      }

      previousHash = entry.hash;
    }

    return results;
  }

  /**
   * Query audit log
   */
  async query(criteria = {}) {
    const entries = await this.readAllEntries();
    let filtered = entries;

    // Filter by event type
    if (criteria.event_type) {
      filtered = filtered.filter(e => e.event_type === criteria.event_type);
    }

    // Filter by actor
    if (criteria.actor_id) {
      filtered = filtered.filter(e =>
        e.actor && e.actor.id === criteria.actor_id
      );
    }

    // Filter by resource type
    if (criteria.resource_type) {
      filtered = filtered.filter(e =>
        e.resource && e.resource.type === criteria.resource_type
      );
    }

    // Filter by time range
    if (criteria.start_time) {
      const startTime = new Date(criteria.start_time);
      filtered = filtered.filter(e =>
        new Date(e.timestamp) >= startTime
      );
    }

    if (criteria.end_time) {
      const endTime = new Date(criteria.end_time);
      filtered = filtered.filter(e =>
        new Date(e.timestamp) <= endTime
      );
    }

    // Filter by result
    if (criteria.result) {
      filtered = filtered.filter(e => e.result === criteria.result);
    }

    return filtered;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate, endDate) {
    const entries = await this.query({
      start_time: startDate,
      end_time: endDate
    });

    const report = {
      period: {
        start: startDate,
        end: endDate
      },
      generated_at: new Date().toISOString(),
      summary: {
        total_events: entries.length,
        by_type: {},
        by_result: {},
        actors: new Set(),
        resources: new Set()
      },
      security_events: [],
      compliance_violations: [],
      integrity_check: await this.verifyIntegrity()
    };

    // Aggregate statistics
    for (const entry of entries) {
      // By type
      report.summary.by_type[entry.event_type] =
        (report.summary.by_type[entry.event_type] || 0) + 1;

      // By result
      report.summary.by_result[entry.result] =
        (report.summary.by_result[entry.result] || 0) + 1;

      // Track actors and resources
      if (entry.actor) {
        report.summary.actors.add(entry.actor.id);
      }
      if (entry.resource) {
        report.summary.resources.add(entry.resource.type);
      }

      // Flag security events
      if (['security_scan', 'access_control', 'permit_denied'].includes(entry.event_type)) {
        report.security_events.push(entry);
      }

      // Flag compliance violations
      if (entry.result === 'denied' || entry.result === 'failure') {
        report.compliance_violations.push(entry);
      }
    }

    report.summary.actors = Array.from(report.summary.actors);
    report.summary.resources = Array.from(report.summary.resources);

    return report;
  }

  // Helper methods

  hashEntry(entry) {
    // Create deterministic hash (exclude hash and previous_hash fields)
    const { hash, previous_hash, ...hashable } = entry;
    const payload = JSON.stringify(hashable, Object.keys(hashable).sort());
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  async loadLastHash() {
    try {
      const entries = await this.readAllEntries();
      if (entries.length > 0) {
        this.lastHash = entries[entries.length - 1].hash;
      }
    } catch (error) {
      console.error('[AuditLogger] Failed to load last hash:', error.message);
      this.lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
    }
  }

  async readAllEntries() {
    const content = await fs.readFile(this.auditLogPath, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  async getEntryCount() {
    const entries = await this.readAllEntries();
    return entries.length;
  }
}

// CLI interface
if (require.main === module) {
  const logger = new AuditLogger();

  const command = process.argv[2];

  (async () => {
    await logger.initialize();

    switch (command) {
      case 'verify':
        const integrity = await logger.verifyIntegrity();
        console.log('Integrity check:', JSON.stringify(integrity, null, 2));
        process.exit(integrity.valid ? 0 : 1);
        break;

      case 'query':
        const eventType = process.argv[3];
        const results = await logger.query({ event_type: eventType });
        console.log(`Found ${results.length} events`);
        results.forEach(e => {
          console.log(`[${e.timestamp}] ${e.event_type}: ${e.action || 'N/A'}`);
        });
        break;

      case 'report':
        const days = parseInt(process.argv[3] || '30');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const report = await logger.generateComplianceReport(
          startDate.toISOString(),
          endDate.toISOString()
        );
        console.log('Compliance Report:', JSON.stringify(report, null, 2));
        break;

      case 'count':
        const count = await logger.getEntryCount();
        console.log(`Total audit entries: ${count}`);
        break;

      default:
        console.log('Usage: audit-logger.js <command> [args]');
        console.log('Commands:');
        console.log('  verify           - Verify audit log integrity');
        console.log('  query <type>     - Query events by type');
        console.log('  report [days]    - Generate compliance report');
        console.log('  count            - Count total entries');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = AuditLogger;
