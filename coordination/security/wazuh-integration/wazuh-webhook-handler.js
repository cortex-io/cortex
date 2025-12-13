/**
 * Wazuh Webhook Handler for Cortex Security Master
 * Processes security alerts from Wazuh and triggers remediation
 *
 * Features:
 * - Alert signature verification
 * - Severity-based worker spawning
 * - SLA tracking for critical vulnerabilities
 * - Knowledge base integration
 * - Audit logging
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class WazuhWebhookHandler {
  constructor(config = {}) {
    this.config = {
      webhook_port: config.webhook_port || 9443,
      webhook_secret: config.webhook_secret || process.env.WAZUH_WEBHOOK_SECRET,
      wazuh_api_url: config.wazuh_api_url || 'https://10.88.140.202:55000',
      wazuh_api_token: config.wazuh_api_token || process.env.WAZUH_API_TOKEN,
      coordination_dir: config.coordination_dir || '/coordination',
      knowledge_base_dir: config.knowledge_base_dir || '/coordination/masters/security/knowledge-base',
      ...config
    };

    this.alert_queue = [];
    this.metrics = {
      alerts_received: 0,
      alerts_processed: 0,
      workers_spawned: 0,
      critical_count: 0,
      high_count: 0,
      medium_count: 0,
      low_count: 0,
      last_alert: null
    };

    this.severity_levels = {
      0: 'informational',
      1: 'low',
      3: 'medium',
      7: 'high',
      12: 'critical'
    };

    this.worker_routing = {
      'critical': {
        worker_type: 'fix-worker',
        priority: 'critical',
        sla_minutes: 240
      },
      'high': {
        worker_type: 'scan-worker',
        priority: 'high',
        sla_minutes: 1440
      },
      'medium': {
        worker_type: 'audit-worker',
        priority: 'medium',
        sla_minutes: 10080
      },
      'low': {
        worker_type: 'compliance-worker',
        priority: 'low',
        sla_minutes: 43200
      }
    };
  }

  /**
   * Verify Wazuh webhook signature
   * @param {Object} req - Express request object
   * @returns {boolean} True if signature is valid
   */
  verifySignature(req) {
    if (!this.config.webhook_secret) {
      console.warn('Warning: WAZUH_WEBHOOK_SECRET not configured, skipping signature verification');
      return true;
    }

    const signature = req.headers['x-wazuh-signature'];
    if (!signature) {
      console.warn('No signature in webhook header');
      return false;
    }

    const body = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('sha256', this.config.webhook_secret)
      .update(body)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Determine alert severity level
   * @param {Object} alert - Wazuh alert object
   * @returns {string} Severity level: critical, high, medium, low
   */
  determineSeverity(alert) {
    const rule_level = alert.rule?.level || 0;

    if (rule_level >= 12) return 'critical';
    if (rule_level >= 7) return 'high';
    if (rule_level >= 3) return 'medium';
    return 'low';
  }

  /**
   * Extract vulnerability data from alert
   * @param {Object} alert - Wazuh alert object
   * @returns {Object} Structured vulnerability data
   */
  extractVulnerabilityData(alert) {
    return {
      alert_id: alert.id || `alert-${Date.now()}`,
      timestamp: alert.timestamp || new Date().toISOString(),
      rule_id: alert.rule?.id,
      rule_level: alert.rule?.level,
      rule_description: alert.rule?.description,
      severity: this.determineSeverity(alert),
      agent_id: alert.agent?.id,
      agent_name: alert.agent?.name,
      agent_ip: alert.agent?.ip,
      data: alert.data || {},
      full_log: alert.full_log,
      decoded: alert.decoded || {}
    };
  }

  /**
   * Create handoff to Security Master worker
   * @param {Object} alert_data - Extracted vulnerability data
   * @returns {Object} Handoff configuration
   */
  createWorkerHandoff(alert_data) {
    const severity = alert_data.severity;
    const routing = this.worker_routing[severity];

    return {
      handoff_id: `wazuh-${alert_data.alert_id}-${Date.now()}`,
      from_master: 'wazuh',
      to_master: 'security',
      task_type: 'security_alert_remediation',
      priority: routing.priority,
      sla_minutes: routing.sla_minutes,
      alert_data: alert_data,
      worker_request: {
        worker_type: routing.worker_type,
        parent_master: 'security',
        task_id: `sec-task-${alert_data.alert_id}`,
        context: {
          alert_source: 'wazuh',
          severity: severity,
          agent_id: alert_data.agent_id,
          knowledge_base_refs: {
            vulnerability_database: path.join(this.config.knowledge_base_dir, 'vulnerability-history.jsonl'),
            remediation_strategies: path.join(this.config.knowledge_base_dir, 'remediation-patterns.json'),
            false_positives: path.join(this.config.knowledge_base_dir, 'false-positives.json')
          }
        },
        resources: {
          token_allocation: this.getTokenAllocation(severity),
          time_limit_minutes: routing.sla_minutes
        }
      },
      created_at: new Date().toISOString(),
      status: 'pending_pickup'
    };
  }

  /**
   * Get token allocation based on severity
   * @param {string} severity - Alert severity
   * @returns {number} Token allocation
   */
  getTokenAllocation(severity) {
    const allocations = {
      'critical': 20000,
      'high': 15000,
      'medium': 10000,
      'low': 5000
    };
    return allocations[severity] || 10000;
  }

  /**
   * Save alert to knowledge base for learning
   * @param {Object} alert_data - Alert data
   */
  async saveToKnowledgeBase(alert_data) {
    try {
      const kb_file = path.join(
        this.config.knowledge_base_dir,
        'alert-history.jsonl'
      );

      // Ensure directory exists
      const kb_dir = path.dirname(kb_file);
      if (!fs.existsSync(kb_dir)) {
        fs.mkdirSync(kb_dir, { recursive: true });
      }

      // Append to JSONL file
      const entry = {
        alert_id: alert_data.alert_id,
        timestamp: alert_data.timestamp,
        rule_id: alert_data.rule_id,
        severity: alert_data.severity,
        agent_id: alert_data.agent_id,
        rule_description: alert_data.rule_description,
        processed_at: new Date().toISOString()
      };

      fs.appendFileSync(kb_file, JSON.stringify(entry) + '\n');
      console.log(`Alert saved to knowledge base: ${alert_data.alert_id}`);
    } catch (error) {
      console.error(`Error saving to knowledge base: ${error.message}`);
    }
  }

  /**
   * Spawn worker for remediation
   * @param {Object} handoff - Handoff configuration
   */
  async spawnWorker(handoff) {
    try {
      const handoff_dir = path.join(
        this.config.coordination_dir,
        'masters/security/handoffs'
      );

      // Ensure directory exists
      if (!fs.existsSync(handoff_dir)) {
        fs.mkdirSync(handoff_dir, { recursive: true });
      }

      // Write handoff file
      const handoff_file = path.join(
        handoff_dir,
        `wazuh-alert-${handoff.alert_data.alert_id}-${Date.now()}.json`
      );

      fs.writeFileSync(handoff_file, JSON.stringify(handoff, null, 2));
      console.log(`Worker handoff created: ${handoff_file}`);

      this.metrics.workers_spawned++;
      return handoff_file;
    } catch (error) {
      console.error(`Error spawning worker: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log alert for audit trail
   * @param {Object} alert_data - Alert data
   */
  async logAudit(alert_data, action, status) {
    try {
      const log_file = path.join(
        this.config.coordination_dir,
        'masters/security/audit.jsonl'
      );

      const audit_entry = {
        timestamp: new Date().toISOString(),
        alert_id: alert_data.alert_id,
        action: action,
        status: status,
        severity: alert_data.severity,
        agent_id: alert_data.agent_id,
        rule_id: alert_data.rule_id
      };

      // Ensure parent directory exists
      const log_dir = path.dirname(log_file);
      if (!fs.existsSync(log_dir)) {
        fs.mkdirSync(log_dir, { recursive: true });
      }

      fs.appendFileSync(log_file, JSON.stringify(audit_entry) + '\n');
    } catch (error) {
      console.error(`Error writing audit log: ${error.message}`);
    }
  }

  /**
   * Process incoming webhook alert
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleWebhook(req, res) {
    try {
      // Verify signature
      if (!this.verifySignature(req)) {
        console.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const alert = req.body;
      this.metrics.alerts_received++;

      // Extract vulnerability data
      const alert_data = this.extractVulnerabilityData(alert);
      const severity = alert_data.severity;

      // Update metrics
      this.metrics.severity_counts = this.metrics.severity_counts || {};
      this.metrics.severity_counts[severity] = (this.metrics.severity_counts[severity] || 0) + 1;
      this.metrics.last_alert = alert_data.timestamp;

      console.log(`Alert received: ${alert_data.alert_id} [${severity}] from ${alert_data.agent_name}`);

      // Save to knowledge base
      await this.saveToKnowledgeBase(alert_data);

      // Create worker handoff
      const handoff = this.createWorkerHandoff(alert_data);

      // Spawn worker if severity warrants it
      if (severity === 'critical' || severity === 'high') {
        await this.spawnWorker(handoff);
        await this.logAudit(alert_data, 'worker_spawned', 'success');
      } else {
        // Queue for batch processing
        this.alert_queue.push(alert_data);
        await this.logAudit(alert_data, 'queued_for_batch', 'success');
      }

      this.metrics.alerts_processed++;

      // Return success
      res.json({
        status: 'processed',
        alert_id: alert_data.alert_id,
        severity: severity,
        action: severity === 'critical' ? 'worker_spawned' : 'queued'
      });

    } catch (error) {
      console.error(`Error processing webhook: ${error.message}`);
      await this.logAudit({}, 'webhook_error', 'failed');
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get handler metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queue_size: this.alert_queue.length,
      uptime_seconds: process.uptime()
    };
  }

  /**
   * Health check endpoint
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      status: 'healthy',
      alerts_received_total: this.metrics.alerts_received,
      alerts_processed: this.metrics.alerts_processed,
      queue_length: this.alert_queue.length,
      workers_spawned: this.metrics.workers_spawned,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process queued alerts in batch (scheduled task)
   */
  async processBatchQueue() {
    if (this.alert_queue.length === 0) return;

    console.log(`Processing batch queue: ${this.alert_queue.length} alerts`);

    while (this.alert_queue.length > 0) {
      const alert_data = this.alert_queue.shift();
      const handoff = this.createWorkerHandoff(alert_data);

      try {
        await this.spawnWorker(handoff);
        await this.logAudit(alert_data, 'batch_processed', 'success');
      } catch (error) {
        console.error(`Error processing batch alert: ${error.message}`);
        await this.logAudit(alert_data, 'batch_processing_error', 'failed');
      }
    }
  }
}

module.exports = WazuhWebhookHandler;
