#!/usr/bin/env node

/**
 * Cortex Compliance Reporter
 *
 * Generates compliance reports from audit trail:
 * - SOC2 compliance metrics
 * - Security incident reports
 * - Worker performance reports
 * - Permit usage reports
 * - Export formats: JSON, CSV, HTML
 *
 * Integration with audit-logger.js
 */

const fs = require('fs').promises;
const path = require('path');
const AuditLogger = require('../../coordination/governance/audit-logger');

class ComplianceReporter {
  constructor(options = {}) {
    this.auditLogger = new AuditLogger(options);
    this.reportsDir = options.reportsDir || path.join(
      __dirname,
      '../../coordination/governance/reports'
    );
  }

  async initialize() {
    await this.auditLogger.initialize();
    await fs.mkdir(this.reportsDir, { recursive: true });
    console.log(`[ComplianceReporter] Initialized at ${this.reportsDir}`);
  }

  /**
   * Generate SOC2 compliance report
   */
  async generateSOC2Report(startDate, endDate) {
    const baseReport = await this.auditLogger.generateComplianceReport(startDate, endDate);

    const soc2Report = {
      report_type: 'SOC2',
      period: baseReport.period,
      generated_at: baseReport.generated_at,
      trust_service_criteria: {
        security: await this.assessSecurityCriteria(startDate, endDate),
        availability: await this.assessAvailabilityCriteria(startDate, endDate),
        processing_integrity: await this.assessProcessingIntegrityCriteria(startDate, endDate),
        confidentiality: await this.assessConfidentialityCriteria(startDate, endDate),
        privacy: await this.assessPrivacyCriteria(startDate, endDate)
      },
      integrity_check: baseReport.integrity_check,
      compliance_score: 0,
      violations: baseReport.compliance_violations
    };

    // Calculate overall compliance score (0-100)
    const criteria = soc2Report.trust_service_criteria;
    const scores = [
      criteria.security.score,
      criteria.availability.score,
      criteria.processing_integrity.score,
      criteria.confidentiality.score,
      criteria.privacy.score
    ];

    soc2Report.compliance_score = scores.reduce((a, b) => a + b, 0) / scores.length;

    return soc2Report;
  }

  /**
   * Assess Security criteria (CC6.1 - CC6.8)
   */
  async assessSecurityCriteria(startDate, endDate) {
    const securityEvents = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'security_scan'
    });

    const accessControlEvents = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'access_control'
    });

    const deniedAccess = accessControlEvents.filter(e => e.result === 'denied');
    const totalAccess = accessControlEvents.length;

    return {
      score: totalAccess > 0 ? ((totalAccess - deniedAccess.length) / totalAccess) * 100 : 100,
      metrics: {
        security_scans_performed: securityEvents.length,
        access_control_checks: totalAccess,
        access_denied_count: deniedAccess.length,
        vulnerabilities_detected: securityEvents.reduce((sum, e) =>
          sum + (e.context?.vulnerabilities_found || 0), 0
        )
      },
      findings: deniedAccess.length > 0 ? [
        `${deniedAccess.length} access control denials detected`
      ] : []
    };
  }

  /**
   * Assess Availability criteria (A1.1 - A1.3)
   */
  async assessAvailabilityCriteria(startDate, endDate) {
    const deployments = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'deployment'
    });

    const rollbacks = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'rollback_executed'
    });

    const successfulDeployments = deployments.filter(e => e.result === 'success').length;
    const totalDeployments = deployments.length;

    return {
      score: totalDeployments > 0 ? (successfulDeployments / totalDeployments) * 100 : 100,
      metrics: {
        total_deployments: totalDeployments,
        successful_deployments: successfulDeployments,
        rollbacks_executed: rollbacks.length,
        availability_rate: totalDeployments > 0 ?
          ((successfulDeployments - rollbacks.length) / totalDeployments) * 100 : 100
      },
      findings: rollbacks.length > 0 ? [
        `${rollbacks.length} rollbacks executed during period`
      ] : []
    };
  }

  /**
   * Assess Processing Integrity criteria (PI1.1 - PI1.5)
   */
  async assessProcessingIntegrityCriteria(startDate, endDate) {
    const integrityCheck = await this.auditLogger.verifyIntegrity();

    const workerSpawns = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'worker_spawn'
    });

    const certChecks = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'certification_check'
    });

    const validCerts = certChecks.filter(e => e.result === 'valid').length;
    const totalCerts = certChecks.length;

    return {
      score: integrityCheck.valid && (totalCerts > 0 ? (validCerts / totalCerts) * 100 : 100),
      metrics: {
        audit_log_integrity: integrityCheck.valid,
        worker_spawns: workerSpawns.length,
        certification_checks: totalCerts,
        valid_certifications: validCerts,
        certification_compliance_rate: totalCerts > 0 ? (validCerts / totalCerts) * 100 : 100
      },
      findings: [
        ...(!integrityCheck.valid ? ['Audit log integrity check failed'] : []),
        ...(integrityCheck.errors || [])
      ]
    };
  }

  /**
   * Assess Confidentiality criteria (C1.1 - C1.2)
   */
  async assessConfidentialityCriteria(startDate, endDate) {
    const permitEvents = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate
    });

    const permitRequests = permitEvents.filter(e => e.event_type === 'permit_requested');
    const unauthorizedPermits = permitRequests.filter(e =>
      e.context?.certification_valid === false
    );

    return {
      score: permitRequests.length > 0 ?
        ((permitRequests.length - unauthorizedPermits.length) / permitRequests.length) * 100 : 100,
      metrics: {
        permit_requests: permitRequests.length,
        unauthorized_attempts: unauthorizedPermits.length,
        confidentiality_compliance_rate: permitRequests.length > 0 ?
          ((permitRequests.length - unauthorizedPermits.length) / permitRequests.length) * 100 : 100
      },
      findings: unauthorizedPermits.length > 0 ? [
        `${unauthorizedPermits.length} unauthorized permit attempts detected`
      ] : []
    };
  }

  /**
   * Assess Privacy criteria (P1.1 - P8.1)
   */
  async assessPrivacyCriteria(startDate, endDate) {
    // For now, we assume privacy compliance based on audit trail existence
    const auditEntries = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate
    });

    return {
      score: auditEntries.length > 0 ? 100 : 0,
      metrics: {
        audit_trail_completeness: auditEntries.length > 0,
        total_audit_entries: auditEntries.length
      },
      findings: []
    };
  }

  /**
   * Generate worker performance report
   */
  async generateWorkerPerformanceReport(startDate, endDate) {
    const workerSpawns = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'worker_spawn'
    });

    const workerStats = {};

    for (const spawn of workerSpawns) {
      const workerType = spawn.resource?.worker_type || 'unknown';

      if (!workerStats[workerType]) {
        workerStats[workerType] = {
          worker_type: workerType,
          total_spawns: 0,
          certified_spawns: 0,
          permit_required_spawns: 0,
          environments: {}
        };
      }

      workerStats[workerType].total_spawns++;

      if (spawn.context?.certification_valid) {
        workerStats[workerType].certified_spawns++;
      }

      if (spawn.context?.permit_id) {
        workerStats[workerType].permit_required_spawns++;
      }

      const env = spawn.context?.environment || 'unknown';
      workerStats[workerType].environments[env] =
        (workerStats[workerType].environments[env] || 0) + 1;
    }

    return {
      report_type: 'worker_performance',
      period: { start: startDate, end: endDate },
      generated_at: new Date().toISOString(),
      total_worker_spawns: workerSpawns.length,
      worker_types: Object.values(workerStats)
    };
  }

  /**
   * Generate permit usage report
   */
  async generatePermitUsageReport(startDate, endDate) {
    const permitRequests = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'permit_requested'
    });

    const permitApprovals = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'permit_approved'
    });

    const permitConsumptions = await this.auditLogger.query({
      start_time: startDate,
      end_time: endDate,
      event_type: 'permit_consumed'
    });

    const permitStats = {};

    for (const request of permitRequests) {
      const permitType = request.resource?.permit_type || 'unknown';

      if (!permitStats[permitType]) {
        permitStats[permitType] = {
          permit_type: permitType,
          requested: 0,
          auto_approved: 0,
          manual_approved: 0,
          consumed: 0
        };
      }

      permitStats[permitType].requested++;

      if (request.context?.auto_approved) {
        permitStats[permitType].auto_approved++;
      }
    }

    for (const approval of permitApprovals) {
      // Count fully approved permits
      if (approval.context?.fully_approved) {
        // We don't have permit_type in approval events, would need to join
        // For now, just count total manual approvals
      }
    }

    return {
      report_type: 'permit_usage',
      period: { start: startDate, end: endDate },
      generated_at: new Date().toISOString(),
      summary: {
        total_requests: permitRequests.length,
        total_approvals: permitApprovals.length,
        total_consumptions: permitConsumptions.length
      },
      by_permit_type: Object.values(permitStats)
    };
  }

  /**
   * Export report to file
   */
  async exportReport(report, format = 'json', filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `${report.report_type}-${timestamp}.${format}`;
    }

    const filePath = path.join(this.reportsDir, filename);

    switch (format) {
      case 'json':
        await fs.writeFile(filePath, JSON.stringify(report, null, 2));
        break;

      case 'csv':
        const csv = this.convertToCSV(report);
        await fs.writeFile(filePath, csv);
        break;

      case 'html':
        const html = this.convertToHTML(report);
        await fs.writeFile(filePath, html);
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`[ComplianceReporter] Exported report to ${filePath}`);
    return filePath;
  }

  convertToCSV(report) {
    // Simple CSV conversion for metrics
    const lines = [`Report Type,${report.report_type}`];
    lines.push(`Generated At,${report.generated_at}`);
    lines.push('');

    if (report.trust_service_criteria) {
      lines.push('Trust Service Criteria,Score');
      for (const [criterion, data] of Object.entries(report.trust_service_criteria)) {
        lines.push(`${criterion},${data.score.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }

  convertToHTML(report) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${report.report_type} Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .score { font-weight: bold; }
    .high { color: green; }
    .medium { color: orange; }
    .low { color: red; }
  </style>
</head>
<body>
  <h1>${report.report_type} Report</h1>
  <p>Generated: ${report.generated_at}</p>
  <p>Period: ${report.period?.start} to ${report.period?.end}</p>

  <h2>Summary</h2>
  <pre>${JSON.stringify(report, null, 2)}</pre>
</body>
</html>`;
  }
}

// CLI interface
if (require.main === module) {
  const reporter = new ComplianceReporter();

  const command = process.argv[2];

  (async () => {
    await reporter.initialize();

    const days = parseInt(process.argv[3] || '30');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let report;

    switch (command) {
      case 'soc2':
        report = await reporter.generateSOC2Report(
          startDate.toISOString(),
          endDate.toISOString()
        );
        console.log('SOC2 Report:', JSON.stringify(report, null, 2));
        await reporter.exportReport(report, 'json');
        await reporter.exportReport(report, 'html');
        break;

      case 'workers':
        report = await reporter.generateWorkerPerformanceReport(
          startDate.toISOString(),
          endDate.toISOString()
        );
        console.log('Worker Performance Report:', JSON.stringify(report, null, 2));
        await reporter.exportReport(report, 'json');
        break;

      case 'permits':
        report = await reporter.generatePermitUsageReport(
          startDate.toISOString(),
          endDate.toISOString()
        );
        console.log('Permit Usage Report:', JSON.stringify(report, null, 2));
        await reporter.exportReport(report, 'json');
        break;

      default:
        console.log('Usage: compliance-reporter.js <command> [days]');
        console.log('Commands:');
        console.log('  soc2 [days]     - Generate SOC2 compliance report');
        console.log('  workers [days]  - Generate worker performance report');
        console.log('  permits [days]  - Generate permit usage report');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = ComplianceReporter;
