const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const execPromise = util.promisify(exec);

class ShadowAIScanner {
  constructor() {
    this.findings = [];
    this.scanStartTime = null;
    this.scanEndTime = null;
  }

  async scanKubernetesCluster() {
    console.log('[ShadowAI] Starting cluster scan...');
    this.scanStartTime = new Date().toISOString();
    this.findings = [];

    const policies = await this.loadPolicies();
    const namespaces = policies.shadowAiDetection?.scanNamespaces || ['default', 'cortex'];

    for (const namespace of namespaces) {
      console.log(`[ShadowAI] Scanning namespace: ${namespace}`);

      await this.scanPodsForApiKeys(namespace);
      await this.scanServicesForAiEndpoints(namespace);
      await this.scanConfigMapsForSecrets(namespace);
    }

    this.scanEndTime = new Date().toISOString();

    const report = this.generateReport();
    await this.saveReport(report);

    console.log(`[ShadowAI] Scan complete. Found ${this.findings.length} issues.`);

    return report;
  }

  async loadPolicies() {
    try {
      const data = await fs.readFile('/app/policies.json', 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[ShadowAI] Failed to load policies:', error.message);
      return {
        approvedAiProviders: ['anthropic.com', 'api.anthropic.com'],
        approvedMcpServers: []
      };
    }
  }

  async scanPodsForApiKeys(namespace) {
    try {
      const { stdout } = await execPromise(`kubectl get pods -n ${namespace} -o json`);
      const podsData = JSON.parse(stdout);

      for (const pod of podsData.items || []) {
        const podName = pod.metadata.name;
        const containers = pod.spec.containers || [];

        for (const container of containers) {
          const env = container.env || [];

          // Check for AI API keys
          const suspiciousEnvVars = [
            'ANTHROPIC_API_KEY',
            'OPENAI_API_KEY',
            'OPENAI_API_SECRET',
            'COHERE_API_KEY',
            'AI21_API_KEY',
            'HUGGINGFACE_TOKEN'
          ];

          for (const envVar of env) {
            if (suspiciousEnvVars.includes(envVar.name)) {
              // Check if this is an approved usage
              const isApproved = this.isApprovedAiUsage(pod, container, envVar.name);

              if (!isApproved) {
                this.findings.push({
                  severity: 'high',
                  type: 'unauthorized_api_key',
                  namespace: namespace,
                  pod: podName,
                  container: container.name,
                  details: `Found ${envVar.name} in environment variables`,
                  recommendation: 'Verify this AI API usage is authorized'
                });
              }
            }
          }

          // Check image for AI-related names
          if (this.isSuspiciousImage(container.image)) {
            this.findings.push({
              severity: 'medium',
              type: 'suspicious_image',
              namespace: namespace,
              pod: podName,
              container: container.name,
              details: `Suspicious AI-related image: ${container.image}`,
              recommendation: 'Verify this image is from approved registry'
            });
          }
        }
      }
    } catch (error) {
      console.error(`[ShadowAI] Failed to scan pods in ${namespace}:`, error.message);
    }
  }

  async scanServicesForAiEndpoints(namespace) {
    try {
      const { stdout } = await execPromise(`kubectl get services -n ${namespace} -o json`);
      const servicesData = JSON.parse(stdout);

      for (const service of servicesData.items || []) {
        const serviceName = service.metadata.name;
        const annotations = service.metadata.annotations || {};

        // Check for external AI endpoints in annotations
        const suspiciousPatterns = [
          'openai.com',
          'api.openai.com',
          'cohere.ai',
          'ai21.com',
          'huggingface.co'
        ];

        const annotationsStr = JSON.stringify(annotations).toLowerCase();
        for (const pattern of suspiciousPatterns) {
          if (annotationsStr.includes(pattern)) {
            this.findings.push({
              severity: 'medium',
              type: 'external_ai_endpoint',
              namespace: namespace,
              service: serviceName,
              details: `Service references external AI endpoint: ${pattern}`,
              recommendation: 'Verify this external connection is authorized'
            });
          }
        }
      }
    } catch (error) {
      console.error(`[ShadowAI] Failed to scan services in ${namespace}:`, error.message);
    }
  }

  async scanConfigMapsForSecrets(namespace) {
    try {
      const { stdout } = await execPromise(`kubectl get configmaps -n ${namespace} -o json`);
      const configMapsData = JSON.parse(stdout);

      for (const cm of configMapsData.items || []) {
        const cmName = cm.metadata.name;
        const data = cm.data || {};

        // Look for potential API keys in configmap data
        const dataStr = JSON.stringify(data).toLowerCase();

        if (dataStr.includes('api_key') || dataStr.includes('api-key') ||
            dataStr.includes('apikey') || dataStr.includes('token')) {

          this.findings.push({
            severity: 'low',
            type: 'potential_credential',
            namespace: namespace,
            configmap: cmName,
            details: 'ConfigMap may contain API credentials',
            recommendation: 'Use Kubernetes Secrets instead of ConfigMaps for credentials'
          });
        }
      }
    } catch (error) {
      console.error(`[ShadowAI] Failed to scan configmaps in ${namespace}:`, error.message);
    }
  }

  isApprovedAiUsage(pod, container, envVarName) {
    // Approved Cortex components
    const approvedPodPrefixes = [
      'cortex-orchestrator',
      'cortex-queue-worker',
      'cortex-chat-backend'
    ];

    const podName = pod.metadata.name;

    // Only Anthropic API key is approved for Cortex components
    if (envVarName === 'ANTHROPIC_API_KEY') {
      return approvedPodPrefixes.some(prefix => podName.startsWith(prefix));
    }

    // All other API keys are unauthorized
    return false;
  }

  isSuspiciousImage(imageName) {
    const suspiciousPatterns = [
      'openai',
      'gpt',
      'langchain',
      'llama',
      'cohere',
      'ai21'
    ];

    const imageNameLower = imageName.toLowerCase();
    return suspiciousPatterns.some(pattern => imageNameLower.includes(pattern));
  }

  generateReport() {
    const criticalCount = this.findings.filter(f => f.severity === 'critical').length;
    const highCount = this.findings.filter(f => f.severity === 'high').length;
    const mediumCount = this.findings.filter(f => f.severity === 'medium').length;
    const lowCount = this.findings.filter(f => f.severity === 'low').length;

    return {
      scanDate: this.scanStartTime,
      scanDuration: new Date(this.scanEndTime) - new Date(this.scanStartTime),
      summary: {
        totalFindings: this.findings.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount
      },
      findings: this.findings,
      recommendations: this.generateRecommendations()
    };
  }

  generateRecommendations() {
    const recs = [];

    if (this.findings.some(f => f.type === 'unauthorized_api_key')) {
      recs.push('Remove or approve unauthorized AI API keys in cluster');
    }

    if (this.findings.some(f => f.type === 'suspicious_image')) {
      recs.push('Review and approve AI-related container images');
    }

    if (this.findings.some(f => f.type === 'potential_credential')) {
      recs.push('Move credentials from ConfigMaps to Secrets');
    }

    return recs;
  }

  async saveReport(report) {
    try {
      const reportPath = '/app/shadow-ai-report.json';
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`[ShadowAI] Report saved to ${reportPath}`);
    } catch (error) {
      console.error('[ShadowAI] Failed to save report:', error.message);
    }
  }
}

// Run scanner if executed directly
if (require.main === module) {
  const scanner = new ShadowAIScanner();
  scanner.scanKubernetesCluster()
    .then(report => {
      console.log('\n=== SHADOW AI SCAN REPORT ===');
      console.log(JSON.stringify(report.summary, null, 2));

      if (report.findings.length > 0) {
        console.log('\n=== FINDINGS ===');
        report.findings.forEach((finding, idx) => {
          console.log(`\n${idx + 1}. [${finding.severity.toUpperCase()}] ${finding.type}`);
          console.log(`   ${finding.details}`);
          console.log(`   Recommendation: ${finding.recommendation}`);
        });
      }

      process.exit(report.findings.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('[ShadowAI] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = ShadowAIScanner;
