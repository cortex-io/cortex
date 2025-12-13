#!/usr/bin/env node

/**
 * Cortex Approval Router
 *
 * Routes permit approval requests to appropriate masters:
 * - Identifies required approvers based on permit type
 * - Creates approval handoffs to master agents
 * - Tracks approval status and timeouts
 * - Handles approval workflows (serial, parallel, consensus)
 *
 * Integration with master handoff system
 */

const fs = require('fs').promises;
const path = require('path');

class ApprovalRouter {
  constructor(options = {}) {
    this.coordinationDir = options.coordinationDir || path.join(__dirname, '..');
    this.handoffsDir = path.join(this.coordinationDir, 'masters');
    this.approvalTimeoutHours = options.approvalTimeoutHours || 48;

    // Approval routing rules
    this.approvalRules = {
      PRODUCTION_DEPLOYMENT: {
        approvers: ['security-master', 'development-master'],
        workflow: 'all_required', // All must approve
        timeout_hours: 24,
        escalation: 'coordinator-master'
      },
      DATABASE_MIGRATION: {
        approvers: ['development-master', 'coordinator-master'],
        workflow: 'all_required',
        timeout_hours: 48,
        escalation: 'coordinator-master'
      },
      INFRASTRUCTURE_CHANGE: {
        approvers: ['cicd-master', 'security-master'],
        workflow: 'all_required',
        timeout_hours: 24,
        escalation: 'coordinator-master'
      },
      SECURITY_PATCH: {
        approvers: ['security-master'],
        workflow: 'any', // Any one can approve
        timeout_hours: 12,
        escalation: 'coordinator-master'
      },
      EMERGENCY_CHANGE: {
        approvers: [], // Auto-approved
        workflow: 'auto',
        timeout_hours: 0
      },
      CONFIGURATION_CHANGE: {
        approvers: [], // Auto-approved
        workflow: 'auto',
        timeout_hours: 0
      }
    };
  }

  /**
   * Route approval request to appropriate masters
   */
  async routeApproval(permit) {
    const rules = this.approvalRules[permit.permit_type];

    if (!rules) {
      throw new Error(`No approval rules for permit type: ${permit.permit_type}`);
    }

    // Auto-approved permits don't need routing
    if (rules.workflow === 'auto') {
      console.log(`[ApprovalRouter] Permit ${permit.permit_id} is auto-approved, no routing needed`);
      return {
        routed: false,
        reason: 'Auto-approved permit type'
      };
    }

    console.log(`[ApprovalRouter] Routing permit ${permit.permit_id} to approvers: ${rules.approvers.join(', ')}`);

    // Create handoffs for each approver
    const handoffs = [];
    for (const approver of rules.approvers) {
      const handoff = await this.createApprovalHandoff(permit, approver, rules);
      handoffs.push(handoff);
    }

    // Track approval request
    await this.trackApprovalRequest({
      permit_id: permit.permit_id,
      permit_type: permit.permit_type,
      approvers: rules.approvers,
      workflow: rules.workflow,
      handoffs: handoffs.map(h => h.handoff_id),
      requested_at: new Date().toISOString(),
      timeout_at: this.calculateTimeout(rules.timeout_hours),
      status: 'pending'
    });

    return {
      routed: true,
      approvers: rules.approvers,
      handoffs: handoffs
    };
  }

  /**
   * Create approval handoff to a master
   */
  async createApprovalHandoff(permit, approverMaster, rules) {
    const handoffId = this.generateHandoffId('approval', approverMaster);
    const approverDir = path.join(this.handoffsDir, approverMaster, 'handoffs');

    await fs.mkdir(approverDir, { recursive: true });

    const handoff = {
      handoff_id: handoffId,
      handoff_type: 'approval_request',
      from: 'union-system',
      to_master: approverMaster,
      priority: this.getApprovalPriority(permit.permit_type),
      created_at: new Date().toISOString(),
      timeout_at: this.calculateTimeout(rules.timeout_hours),
      status: 'pending_pickup',
      payload: {
        permit_id: permit.permit_id,
        permit_type: permit.permit_type,
        requester: permit.requester,
        resource: permit.resource,
        justification: permit.justification,
        change_description: permit.change_description,
        tests_passed: permit.tests_passed,
        security_scan_passed: permit.security_scan_passed,
        rollback_plan_id: permit.rollback_plan_id,
        workflow: rules.workflow,
        approval_instructions: this.getApprovalInstructions(permit, approverMaster)
      }
    };

    const handoffPath = path.join(approverDir, `${handoffId}.json`);
    await fs.writeFile(handoffPath, JSON.stringify(handoff, null, 2));

    console.log(`[ApprovalRouter] Created approval handoff: ${handoffPath}`);

    return handoff;
  }

  /**
   * Process approval response from master
   */
  async processApprovalResponse(handoffId, response) {
    const approvalRequest = await this.loadApprovalRequest(response.permit_id);

    if (!approvalRequest) {
      throw new Error(`No approval request found for permit ${response.permit_id}`);
    }

    // Update handoff status
    approvalRequest.responses = approvalRequest.responses || [];
    approvalRequest.responses.push({
      handoff_id: handoffId,
      approver: response.approver,
      decision: response.decision, // 'approved' or 'denied'
      reason: response.reason,
      responded_at: new Date().toISOString()
    });

    // Check if approval workflow is complete
    const workflowComplete = this.checkWorkflowComplete(approvalRequest);

    if (workflowComplete.complete) {
      approvalRequest.status = workflowComplete.decision;
      approvalRequest.completed_at = new Date().toISOString();

      console.log(`[ApprovalRouter] Approval workflow complete for permit ${response.permit_id}: ${workflowComplete.decision}`);
    }

    await this.saveApprovalRequest(approvalRequest);

    return {
      workflow_complete: workflowComplete.complete,
      decision: workflowComplete.decision,
      approval_request: approvalRequest
    };
  }

  /**
   * Check if approval workflow is complete
   */
  checkWorkflowComplete(approvalRequest) {
    const rules = this.approvalRules[approvalRequest.permit_type];
    const responses = approvalRequest.responses || [];

    // Check for any denials
    const denials = responses.filter(r => r.decision === 'denied');
    if (denials.length > 0) {
      return {
        complete: true,
        decision: 'denied',
        reason: `Denied by ${denials[0].approver}: ${denials[0].reason}`
      };
    }

    // Check based on workflow type
    if (rules.workflow === 'all_required') {
      const approvals = responses.filter(r => r.decision === 'approved');
      const allApproversResponded = rules.approvers.every(approver =>
        approvals.some(a => a.approver === approver)
      );

      if (allApproversResponded) {
        return {
          complete: true,
          decision: 'approved',
          reason: 'All required approvers approved'
        };
      }
    } else if (rules.workflow === 'any') {
      const approvals = responses.filter(r => r.decision === 'approved');
      if (approvals.length > 0) {
        return {
          complete: true,
          decision: 'approved',
          reason: `Approved by ${approvals[0].approver}`
        };
      }
    }

    return {
      complete: false
    };
  }

  /**
   * Check for timed out approvals and escalate
   */
  async checkTimeouts() {
    const approvalRequests = await this.listApprovalRequests({ status: 'pending' });
    const now = new Date();
    let escalated = 0;

    for (const request of approvalRequests) {
      if (new Date(request.timeout_at) < now) {
        console.log(`[ApprovalRouter] Approval timeout for permit ${request.permit_id}, escalating...`);
        await this.escalateApproval(request);
        escalated++;
      }
    }

    return escalated;
  }

  /**
   * Escalate timed out approval to coordinator
   */
  async escalateApproval(approvalRequest) {
    const rules = this.approvalRules[approvalRequest.permit_type];
    const escalationMaster = rules.escalation || 'coordinator-master';

    const handoff = await this.createApprovalHandoff(
      approvalRequest,
      escalationMaster,
      {
        ...rules,
        timeout_hours: 24 // Additional 24 hours for escalation
      }
    );

    approvalRequest.status = 'escalated';
    approvalRequest.escalated_to = escalationMaster;
    approvalRequest.escalated_at = new Date().toISOString();
    approvalRequest.escalation_handoff = handoff.handoff_id;

    await this.saveApprovalRequest(approvalRequest);

    console.log(`[ApprovalRouter] Escalated permit ${approvalRequest.permit_id} to ${escalationMaster}`);
  }

  /**
   * Get approval priority based on permit type
   */
  getApprovalPriority(permitType) {
    const priorities = {
      EMERGENCY_CHANGE: 'critical',
      SECURITY_PATCH: 'high',
      PRODUCTION_DEPLOYMENT: 'high',
      INFRASTRUCTURE_CHANGE: 'medium',
      DATABASE_MIGRATION: 'medium',
      CONFIGURATION_CHANGE: 'low'
    };
    return priorities[permitType] || 'medium';
  }

  /**
   * Get approval instructions for specific master
   */
  getApprovalInstructions(permit, approverMaster) {
    const instructions = {
      'security-master': {
        focus: 'Security implications, vulnerability scanning, secrets management',
        checklist: [
          'Review security scan results',
          'Check for exposed secrets or credentials',
          'Verify compliance with security policies',
          'Validate rollback plan security'
        ]
      },
      'development-master': {
        focus: 'Code quality, testing, technical implementation',
        checklist: [
          'Review test coverage and results',
          'Check code quality metrics',
          'Verify technical implementation approach',
          'Validate rollback plan technical feasibility'
        ]
      },
      'cicd-master': {
        focus: 'Deployment process, infrastructure, automation',
        checklist: [
          'Review deployment strategy',
          'Check infrastructure changes',
          'Verify CI/CD pipeline compatibility',
          'Validate rollback automation'
        ]
      },
      'coordinator-master': {
        focus: 'Overall system impact, coordination, business logic',
        checklist: [
          'Review system-wide impact',
          'Check coordination with other changes',
          'Verify business requirements alignment',
          'Validate overall risk assessment'
        ]
      }
    };

    return instructions[approverMaster] || {
      focus: 'General review',
      checklist: ['Review permit details', 'Assess risk', 'Make approval decision']
    };
  }

  // Helper methods

  generateHandoffId(type, master) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${type}-to-${master}-${timestamp}-${random}`;
  }

  calculateTimeout(hours) {
    const timeout = new Date();
    timeout.setHours(timeout.getHours() + hours);
    return timeout.toISOString();
  }

  async trackApprovalRequest(request) {
    const trackingDir = path.join(this.coordinationDir, 'union', 'approval-tracking');
    await fs.mkdir(trackingDir, { recursive: true });

    const filePath = path.join(trackingDir, `${request.permit_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(request, null, 2));
  }

  async loadApprovalRequest(permitId) {
    const trackingDir = path.join(this.coordinationDir, 'union', 'approval-tracking');
    const filePath = path.join(trackingDir, `${permitId}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async saveApprovalRequest(request) {
    const trackingDir = path.join(this.coordinationDir, 'union', 'approval-tracking');
    const filePath = path.join(trackingDir, `${request.permit_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(request, null, 2));
  }

  async listApprovalRequests(criteria = {}) {
    const trackingDir = path.join(this.coordinationDir, 'union', 'approval-tracking');
    await fs.mkdir(trackingDir, { recursive: true });

    const files = await fs.readdir(trackingDir);
    const requests = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await fs.readFile(path.join(trackingDir, file), 'utf8');
        const request = JSON.parse(data);

        if (criteria.status && request.status !== criteria.status) continue;

        requests.push(request);
      }
    }

    return requests;
  }
}

// CLI interface
if (require.main === module) {
  const router = new ApprovalRouter();

  const command = process.argv[2];

  (async () => {
    switch (command) {
      case 'check-timeouts':
        const escalated = await router.checkTimeouts();
        console.log(`Escalated ${escalated} timed out approvals`);
        break;

      case 'list':
        const requests = await router.listApprovalRequests();
        console.log(`Found ${requests.length} approval requests`);
        requests.forEach(r => {
          console.log(`- ${r.permit_id}: ${r.status} (${r.permit_type})`);
        });
        break;

      default:
        console.log('Usage: approval-router.js <command>');
        console.log('Commands: check-timeouts, list');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = ApprovalRouter;
