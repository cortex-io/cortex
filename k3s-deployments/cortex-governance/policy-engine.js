const fs = require('fs').promises;
const path = require('path');

class PolicyEngine {
  constructor(policiesPath = '/app/policies.json') {
    this.policiesPath = policiesPath;
    this.policies = null;
    this.auditLog = [];
  }

  async initialize() {
    try {
      const policiesData = await fs.readFile(this.policiesPath, 'utf8');
      this.policies = JSON.parse(policiesData);
      console.log('[PolicyEngine] Policies loaded successfully');
    } catch (error) {
      console.error('[PolicyEngine] Failed to load policies:', error.message);
      // Use default policies
      this.policies = {
        destructiveOperations: {
          enabled: true,
          requireHumanApproval: true,
          operations: ['delete', 'terminate', 'shutdown', 'destroy']
        }
      };
    }
  }

  async evaluateTask(task) {
    if (!this.policies) {
      await this.initialize();
    }

    const evaluation = {
      taskId: task.id,
      allowed: true,
      requiresApproval: false,
      blockedReasons: [],
      warnings: [],
      evaluatedAt: new Date().toISOString()
    };

    // Check for destructive operations
    if (this.policies.destructiveOperations?.enabled) {
      const isDestructive = this.isDestructiveOperation(task);
      if (isDestructive) {
        evaluation.warnings.push('Task contains destructive operation');

        if (this.policies.destructiveOperations.requireHumanApproval) {
          evaluation.requiresApproval = true;
          evaluation.approvalReason = 'Destructive operation requires human approval';
        }
      }
    }

    // Check for unauthorized AI providers
    const unauthorizedProvider = this.checkUnauthorizedAiProvider(task);
    if (unauthorizedProvider) {
      evaluation.allowed = false;
      evaluation.blockedReasons.push(`Unauthorized AI provider: ${unauthorizedProvider}`);
    }

    // Check for unauthorized MCP servers
    const unauthorizedMcp = this.checkUnauthorizedMcpServer(task);
    if (unauthorizedMcp) {
      evaluation.warnings.push(`Potentially unauthorized MCP server: ${unauthorizedMcp}`);
    }

    // Log decision
    await this.logDecision(evaluation);

    return evaluation;
  }

  isDestructiveOperation(task) {
    const destructiveOps = this.policies.destructiveOperations?.operations || [];
    const taskText = JSON.stringify(task).toLowerCase();

    for (const op of destructiveOps) {
      if (taskText.includes(op.toLowerCase())) {
        // Check exceptions
        const exceptions = this.policies.destructiveOperations?.exceptions || [];
        const isException = exceptions.some(ex => taskText.includes(ex.toLowerCase()));

        if (!isException) {
          return true;
        }
      }
    }

    return false;
  }

  checkUnauthorizedAiProvider(task) {
    const approvedProviders = this.policies.approvedAiProviders || [];
    const taskText = JSON.stringify(task).toLowerCase();

    const aiProviderPatterns = [
      'openai.com',
      'api.openai.com',
      'cohere.ai',
      'ai21.com',
      'huggingface.co'
    ];

    for (const provider of aiProviderPatterns) {
      if (taskText.includes(provider) && !approvedProviders.includes(provider)) {
        return provider;
      }
    }

    return null;
  }

  checkUnauthorizedMcpServer(task) {
    const approvedServers = this.policies.approvedMcpServers || [];
    const taskText = JSON.stringify(task);

    // Simple pattern matching for MCP server references
    const mcpPattern = /"mcp[_-]?server":\s*"([^"]+)"/gi;
    const matches = taskText.matchAll(mcpPattern);

    for (const match of matches) {
      const serverName = match[1];
      if (!approvedServers.includes(serverName)) {
        return serverName;
      }
    }

    return null;
  }

  async logDecision(evaluation) {
    this.auditLog.push(evaluation);

    if (this.policies.auditLog?.enabled) {
      try {
        const logPath = this.policies.auditLog.path || '/app/audit/decisions.log';
        const logDir = path.dirname(logPath);

        await fs.mkdir(logDir, { recursive: true });
        await fs.appendFile(logPath, JSON.stringify(evaluation) + '\n');
      } catch (error) {
        console.error('[PolicyEngine] Failed to write audit log:', error.message);
      }
    }
  }

  async requestHumanApproval(task, evaluation) {
    console.log('[PolicyEngine] HUMAN APPROVAL REQUIRED');
    console.log(`Task ID: ${task.id}`);
    console.log(`Reason: ${evaluation.approvalReason}`);
    console.log(`Task Description: ${task.description || task.prompt}`);

    // In a real system, this would:
    // 1. Send notification to Slack/email
    // 2. Create approval request in database
    // 3. Wait for human decision via API/webhook
    // 4. Return approval decision

    // For now, we'll block the task
    return {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      reason: 'Awaiting human approval'
    };
  }

  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }
}

module.exports = PolicyEngine;
