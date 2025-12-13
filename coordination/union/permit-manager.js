#!/usr/bin/env node

/**
 * Cortex Union Permit Manager
 *
 * Manages approval gates for production changes:
 * - Issues permits based on type and risk level
 * - Tracks permit lifecycle (pending, approved, consumed, expired)
 * - Enforces expiration and rollback requirements
 * - Integrates with audit logging
 *
 * Union vs Non-Union:
 * - Union workers (security-fix, production-deploy) require permits
 * - Non-union workers (dev, test) may bypass for low-risk changes
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class PermitManager {
  constructor(options = {}) {
    this.coordinationDir = options.coordinationDir || path.join(__dirname, '..');
    this.permitsDir = path.join(this.coordinationDir, 'union', 'permits');
    this.schemaPath = path.join(this.coordinationDir, 'schemas', 'permit-request.schema.json');

    // Permit type configurations
    this.permitTypes = {
      EMERGENCY_CHANGE: {
        approval: 'auto',
        expiration_hours: 4,
        rollback_required: true,
        tests_required: false,
        approvers_required: 0,
        description: 'Emergency production fix'
      },
      PRODUCTION_DEPLOYMENT: {
        approval: 'manual',
        expiration_hours: 24,
        rollback_required: true,
        tests_required: true,
        approvers_required: 2,
        required_approvers: ['security-master', 'development-master'],
        description: 'Production deployment'
      },
      SECURITY_PATCH: {
        approval: 'auto_if_minor',
        expiration_hours: 12,
        rollback_required: true,
        tests_required: true,
        approvers_required: 1,
        cvss_threshold: 7.0, // Auto-approve if CVSS >= 7.0
        description: 'Security vulnerability patch'
      },
      CONFIGURATION_CHANGE: {
        approval: 'auto',
        expiration_hours: 8,
        rollback_required: true,
        tests_required: false,
        approvers_required: 0,
        audit_trail: true,
        description: 'Configuration change'
      },
      DATABASE_MIGRATION: {
        approval: 'manual',
        expiration_hours: 48,
        rollback_required: true,
        tests_required: true,
        approvers_required: 2,
        required_approvers: ['development-master', 'coordinator-master'],
        description: 'Database schema migration'
      },
      INFRASTRUCTURE_CHANGE: {
        approval: 'manual',
        expiration_hours: 24,
        rollback_required: true,
        tests_required: true,
        approvers_required: 2,
        required_approvers: ['cicd-master', 'security-master'],
        description: 'Infrastructure modification'
      }
    };
  }

  async initialize() {
    await fs.mkdir(this.permitsDir, { recursive: true });
    console.log(`[PermitManager] Initialized at ${this.permitsDir}`);
  }

  /**
   * Request a permit for a change
   */
  async requestPermit(request) {
    const permitId = this.generatePermitId(request.permit_type);

    // Validate request
    await this.validateRequest(request);

    const permitConfig = this.permitTypes[request.permit_type];
    if (!permitConfig) {
      throw new Error(`Unknown permit type: ${request.permit_type}`);
    }

    // Create permit
    const permit = {
      permit_id: permitId,
      permit_type: request.permit_type,
      requester: request.requester,
      resource: request.resource,
      justification: request.justification,
      change_description: request.change_description,
      rollback_plan_id: request.rollback_plan_id,
      tests_passed: request.tests_passed || false,
      security_scan_passed: request.security_scan_passed || false,
      requested_at: new Date().toISOString(),
      status: 'pending',
      approved_by: [],
      expires_at: this.calculateExpiration(permitConfig.expiration_hours),
      metadata: request.metadata || {},
      config: permitConfig
    };

    // Auto-approval logic
    const autoApprovalResult = await this.evaluateAutoApproval(permit, permitConfig);

    if (autoApprovalResult.approved) {
      permit.status = 'approved';
      permit.auto_approved = true;
      permit.auto_approval_reason = autoApprovalResult.reason;
      permit.approved_by.push({
        approver_id: 'system',
        approved_at: new Date().toISOString(),
        signature: this.signPermit(permit)
      });
      console.log(`[PermitManager] Auto-approved permit ${permitId}: ${autoApprovalResult.reason}`);
    } else {
      console.log(`[PermitManager] Manual approval required for permit ${permitId}`);
    }

    // Save permit
    await this.savePermit(permit);

    // Log to audit trail
    await this.logAuditEvent({
      event_type: 'permit_requested',
      permit_id: permitId,
      requester: request.requester,
      resource: request.resource,
      auto_approved: autoApprovalResult.approved
    });

    return permit;
  }

  /**
   * Evaluate if permit can be auto-approved
   */
  async evaluateAutoApproval(permit, config) {
    // Always require manual approval for production environment
    if (permit.resource.environment === 'production' &&
        config.approval === 'manual') {
      return {
        approved: false,
        reason: 'Production changes require manual approval'
      };
    }

    // Auto-approve emergency changes
    if (config.approval === 'auto') {
      return {
        approved: true,
        reason: `Auto-approved: ${config.description}`
      };
    }

    // Auto-approve security patches if CVSS is high enough
    if (config.approval === 'auto_if_minor' &&
        permit.metadata.cvss_score >= config.cvss_threshold) {
      return {
        approved: true,
        reason: `Auto-approved: High severity (CVSS ${permit.metadata.cvss_score})`
      };
    }

    // Check if rollback plan exists (required for some permits)
    if (config.rollback_required && !permit.rollback_plan_id) {
      return {
        approved: false,
        reason: 'Rollback plan required'
      };
    }

    // Check if tests passed (required for some permits)
    if (config.tests_required && !permit.tests_passed) {
      return {
        approved: false,
        reason: 'Tests must pass before approval'
      };
    }

    return {
      approved: false,
      reason: 'Manual approval required'
    };
  }

  /**
   * Approve a permit
   */
  async approvePermit(permitId, approverId, signature = null) {
    const permit = await this.loadPermit(permitId);

    if (permit.status !== 'pending') {
      throw new Error(`Permit ${permitId} is not pending (status: ${permit.status})`);
    }

    // Check if permit has expired
    if (new Date() > new Date(permit.expires_at)) {
      permit.status = 'expired';
      await this.savePermit(permit);
      throw new Error(`Permit ${permitId} has expired`);
    }

    // Add approval
    permit.approved_by.push({
      approver_id: approverId,
      approved_at: new Date().toISOString(),
      signature: signature || this.signPermit(permit)
    });

    // Check if we have enough approvals
    const config = this.permitTypes[permit.permit_type];
    if (permit.approved_by.length >= config.approvers_required) {
      // Check if required approvers have approved
      if (config.required_approvers) {
        const approverIds = permit.approved_by.map(a => a.approver_id);
        const hasRequiredApprovers = config.required_approvers.every(
          req => approverIds.includes(req)
        );

        if (hasRequiredApprovers) {
          permit.status = 'approved';
          console.log(`[PermitManager] Permit ${permitId} fully approved`);
        }
      } else {
        permit.status = 'approved';
        console.log(`[PermitManager] Permit ${permitId} fully approved`);
      }
    }

    await this.savePermit(permit);

    // Log approval
    await this.logAuditEvent({
      event_type: 'permit_approved',
      permit_id: permitId,
      approver_id: approverId,
      fully_approved: permit.status === 'approved'
    });

    return permit;
  }

  /**
   * Deny a permit
   */
  async denyPermit(permitId, denierId, reason) {
    const permit = await this.loadPermit(permitId);

    if (permit.status !== 'pending') {
      throw new Error(`Permit ${permitId} is not pending (status: ${permit.status})`);
    }

    permit.status = 'denied';
    permit.denied_by = {
      denier_id: denierId,
      denied_at: new Date().toISOString(),
      reason: reason
    };

    await this.savePermit(permit);

    // Log denial
    await this.logAuditEvent({
      event_type: 'permit_denied',
      permit_id: permitId,
      denier_id: denierId,
      reason: reason
    });

    console.log(`[PermitManager] Permit ${permitId} denied by ${denierId}: ${reason}`);
    return permit;
  }

  /**
   * Consume a permit (mark as used)
   */
  async consumePermit(permitId, consumerId) {
    const permit = await this.loadPermit(permitId);

    if (permit.status !== 'approved') {
      throw new Error(`Permit ${permitId} is not approved (status: ${permit.status})`);
    }

    // Check if permit has expired
    if (new Date() > new Date(permit.expires_at)) {
      permit.status = 'expired';
      await this.savePermit(permit);
      throw new Error(`Permit ${permitId} has expired`);
    }

    permit.status = 'consumed';
    permit.consumed_at = new Date().toISOString();
    permit.consumed_by = consumerId;

    await this.savePermit(permit);

    // Log consumption
    await this.logAuditEvent({
      event_type: 'permit_consumed',
      permit_id: permitId,
      consumer_id: consumerId
    });

    console.log(`[PermitManager] Permit ${permitId} consumed by ${consumerId}`);
    return permit;
  }

  /**
   * Revoke a permit
   */
  async revokePermit(permitId, revokerId, reason) {
    const permit = await this.loadPermit(permitId);

    permit.status = 'revoked';
    permit.revoked_by = {
      revoker_id: revokerId,
      revoked_at: new Date().toISOString(),
      reason: reason
    };

    await this.savePermit(permit);

    // Log revocation
    await this.logAuditEvent({
      event_type: 'permit_revoked',
      permit_id: permitId,
      revoker_id: revokerId,
      reason: reason
    });

    console.log(`[PermitManager] Permit ${permitId} revoked by ${revokerId}: ${reason}`);
    return permit;
  }

  /**
   * Check permit validity
   */
  async checkPermit(permitId) {
    const permit = await this.loadPermit(permitId);

    // Check expiration
    if (new Date() > new Date(permit.expires_at) &&
        permit.status === 'approved') {
      permit.status = 'expired';
      await this.savePermit(permit);
    }

    return {
      valid: permit.status === 'approved',
      status: permit.status,
      expires_at: permit.expires_at,
      permit: permit
    };
  }

  /**
   * List permits by criteria
   */
  async listPermits(criteria = {}) {
    const files = await fs.readdir(this.permitsDir);
    const permits = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const permit = await this.loadPermit(file.replace('.json', ''));

        // Filter by criteria
        if (criteria.status && permit.status !== criteria.status) continue;
        if (criteria.permit_type && permit.permit_type !== criteria.permit_type) continue;
        if (criteria.requester_id && permit.requester.id !== criteria.requester_id) continue;

        permits.push(permit);
      }
    }

    return permits;
  }

  /**
   * Clean up expired permits
   */
  async cleanupExpired() {
    const permits = await this.listPermits();
    let cleaned = 0;

    for (const permit of permits) {
      if (permit.status === 'approved' &&
          new Date() > new Date(permit.expires_at)) {
        permit.status = 'expired';
        await this.savePermit(permit);
        cleaned++;
      }
    }

    console.log(`[PermitManager] Cleaned up ${cleaned} expired permits`);
    return cleaned;
  }

  // Helper methods

  generatePermitId(permitType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const typePrefix = permitType.toLowerCase().replace(/_/g, '-');
    return `permit-${typePrefix}-${timestamp}-${random}`;
  }

  calculateExpiration(hours) {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + hours);
    return expiration.toISOString();
  }

  signPermit(permit) {
    const payload = JSON.stringify({
      permit_id: permit.permit_id,
      permit_type: permit.permit_type,
      requester: permit.requester,
      resource: permit.resource
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  async validateRequest(request) {
    // Basic validation
    if (!request.permit_type || !this.permitTypes[request.permit_type]) {
      throw new Error('Invalid permit_type');
    }
    if (!request.requester || !request.requester.type || !request.requester.id) {
      throw new Error('Invalid requester');
    }
    if (!request.resource || !request.resource.type || !request.resource.identifier) {
      throw new Error('Invalid resource');
    }
    if (!request.justification || request.justification.length < 20) {
      throw new Error('Justification must be at least 20 characters');
    }

    // Type-specific validation
    const config = this.permitTypes[request.permit_type];
    if (config.rollback_required && !request.rollback_plan_id) {
      console.warn(`[PermitManager] Warning: Rollback plan recommended for ${request.permit_type}`);
    }
  }

  async savePermit(permit) {
    const filePath = path.join(this.permitsDir, `${permit.permit_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(permit, null, 2));
  }

  async loadPermit(permitId) {
    const filePath = path.join(this.permitsDir, `${permitId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  async logAuditEvent(event) {
    // Integrate with audit logger (Phase 6.3)
    const auditLogPath = path.join(
      this.coordinationDir,
      'governance',
      'audit-log.jsonl'
    );

    const auditEntry = {
      timestamp: new Date().toISOString(),
      event_type: event.event_type,
      ...event
    };

    await fs.appendFile(
      auditLogPath,
      JSON.stringify(auditEntry) + '\n'
    );
  }
}

// CLI interface
if (require.main === module) {
  const manager = new PermitManager();

  const command = process.argv[2];

  (async () => {
    await manager.initialize();

    switch (command) {
      case 'request':
        // Example: node permit-manager.js request EMERGENCY_CHANGE
        const permitType = process.argv[3];
        const permit = await manager.requestPermit({
          permit_type: permitType,
          requester: { type: 'master', id: 'development-master' },
          resource: {
            type: 'deployment',
            identifier: 'cortex-api',
            environment: 'staging'
          },
          justification: 'Emergency fix for critical bug in production'
        });
        console.log('Permit created:', permit.permit_id);
        break;

      case 'approve':
        const permitId = process.argv[3];
        const approverId = process.argv[4] || 'security-master';
        await manager.approvePermit(permitId, approverId);
        break;

      case 'check':
        const checkId = process.argv[3];
        const status = await manager.checkPermit(checkId);
        console.log('Permit status:', JSON.stringify(status, null, 2));
        break;

      case 'list':
        const permits = await manager.listPermits();
        console.log(`Found ${permits.length} permits`);
        permits.forEach(p => {
          console.log(`- ${p.permit_id}: ${p.status} (${p.permit_type})`);
        });
        break;

      case 'cleanup':
        await manager.cleanupExpired();
        break;

      default:
        console.log('Usage: permit-manager.js <command> [args]');
        console.log('Commands: request, approve, check, list, cleanup');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = PermitManager;
