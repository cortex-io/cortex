/**
 * Context Analyzer Service
 * Analyzes user queries and Cortex responses to generate contextual action suggestions
 */

export interface ContextualSuggestion {
  type: 'action' | 'insight' | 'question' | 'related_check';
  title: string;
  description: string;
  actions: Array<{
    label: string;
    prompt: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
}

export class ContextAnalyzer {

  /**
   * Analyze user query to generate contextual suggestions
   * Only triggers on user's query, not Cortex response
   */
  analyzeSuggestions(userQuery: string, cortexResponse: string): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];
    const lowerQuery = userQuery.toLowerCase();

    // Pattern 1: Network/UniFi queries
    if (/unifi|network|wifi|wireless|ap|access\s+point|ubiquiti/i.test(lowerQuery)) {
      suggestions.push({
        type: 'related_check',
        title: 'Network Performance Analysis',
        description: 'Deep dive into network health, performance metrics, and optimization opportunities',
        actions: [
          {
            label: 'Run speed test across APs',
            prompt: 'Run a speed test on all UniFi access points and compare against baseline performance',
            priority: 'high'
          },
          {
            label: 'Check firmware status',
            prompt: 'Check firmware versions on all UniFi devices and identify any pending updates',
            priority: 'medium'
          },
          {
            label: 'Analyze bandwidth usage',
            prompt: 'Show current bandwidth usage by client and identify top consumers',
            priority: 'medium'
          },
          {
            label: 'Optimize channel allocation',
            prompt: 'Analyze WiFi channel usage and recommend optimal channel assignments to reduce interference',
            priority: 'low'
          }
        ]
      });
    }

    // Pattern 2: Kubernetes/Cluster queries
    if (/k3s|kubernetes|cluster|pods?|nodes?|deployments?|namespaces?|containers?/i.test(lowerQuery)) {
      suggestions.push({
        type: 'action',
        title: 'Cluster Health & Optimization',
        description: 'Comprehensive cluster analysis and resource optimization suggestions',
        actions: [
          {
            label: 'Run resource audit',
            prompt: 'Audit cluster resource usage and identify pods or namespaces with inefficient resource allocations',
            priority: 'high'
          },
          {
            label: 'Review recent events',
            prompt: 'Show critical Kubernetes events from the last 24 hours across all namespaces',
            priority: 'high'
          },
          {
            label: 'Security scan',
            prompt: 'Run security scan on cluster looking for vulnerabilities, exposed services, and misconfigurations',
            priority: 'medium'
          },
          {
            label: 'Optimize resources',
            prompt: 'Analyze pod resource requests/limits and recommend optimizations to improve cluster efficiency',
            priority: 'low'
          }
        ]
      });
    }

    // Pattern 3: Security/Sandfly queries
    if (/sandfly|security|alert|vulnerability|vuln|threat|intrusion|malware/i.test(lowerQuery)) {
      suggestions.push({
        type: 'insight',
        title: 'Security Alert Triage',
        description: 'Prioritize and investigate security findings with contextual analysis',
        actions: [
          {
            label: 'Triage active alerts',
            prompt: 'Show all active Sandfly alerts, prioritize by severity, and suggest immediate actions for critical findings',
            priority: 'high'
          },
          {
            label: 'Compare against baseline',
            prompt: 'Compare current security posture against historical baseline and identify new anomalies or regressions',
            priority: 'medium'
          },
          {
            label: 'Cross-reference threats',
            prompt: 'Cross-reference Sandfly findings with recent cluster events and network activity to identify potential attack patterns',
            priority: 'medium'
          },
          {
            label: 'Generate compliance report',
            prompt: 'Generate security compliance report showing current posture against CIS benchmarks and best practices',
            priority: 'low'
          }
        ]
      });
    }

    // Pattern 4: Proxmox/VM/Infrastructure queries
    if (/proxmox|vm|virtual\s+machine|container|lxc|host|hypervisor|vcpu|vram/i.test(lowerQuery)) {
      suggestions.push({
        type: 'related_check',
        title: 'Infrastructure Health Check',
        description: 'Validate underlying infrastructure supporting Kubernetes workloads',
        actions: [
          {
            label: 'Check K3s node health',
            prompt: 'Verify health of Proxmox VMs running K3s nodes - check resource usage, disk I/O, and network connectivity',
            priority: 'high'
          },
          {
            label: 'Test network connectivity',
            prompt: 'Test network connectivity between Proxmox hosts and to external services',
            priority: 'medium'
          },
          {
            label: 'Review resource allocation',
            prompt: 'Review CPU, memory, and storage allocation across all Proxmox VMs and identify over/under-provisioned resources',
            priority: 'medium'
          },
          {
            label: 'Check backup status',
            prompt: 'Verify backup status for critical VMs and containers, identify any failed or missing backups',
            priority: 'low'
          }
        ]
      });
    }

    // Only show suggestions for the 4 core systems: UniFi, K3s, Sandfly, Proxmox
    // Removed generic patterns (Performance, Errors, Monitoring) to focus on specific systems

    return suggestions;
  }

  /**
   * Generate a contextual insight based on multiple suggestions
   */
  generateInsight(suggestions: ContextualSuggestion[]): string | null {
    if (suggestions.length === 0) {
      return null;
    }

    const types = suggestions.map(s => s.type);
    const hasSecuritySuggestion = types.includes('insight');
    const hasActionSuggestion = types.includes('action');

    if (hasSecuritySuggestion && hasActionSuggestion) {
      return 'This query involves both security and operational concerns. Consider addressing security findings first to prevent potential escalation.';
    }

    if (suggestions.length >= 3) {
      return 'Multiple operational areas detected. Consider a holistic approach starting with infrastructure validation, then application layer checks.';
    }

    return null;
  }
}

export const contextAnalyzer = new ContextAnalyzer();
