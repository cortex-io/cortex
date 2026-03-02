/**
 * Issue Detector Service
 * Analyzes Cortex responses and identifies minor issues that can be auto-fixed
 */

export interface DetectedIssue {
  type: 'pod_stuck' | 'high_restarts' | 'image_pull_error' | 'crash_loop' | 'pending_pvc' | 'node_pressure' | 'other';
  severity: 'minor' | 'moderate' | 'critical';
  title: string;
  description: string;
  resource: {
    kind: string;
    name: string;
    namespace?: string;
  };
  fixCommand?: string;
  autoFixable: boolean;
}

export class IssueDetector {

  /**
   * Analyze response text and detect common Kubernetes issues
   * Uses block-based extraction to handle markdown-formatted Cortex responses
   */
  detectIssues(responseText: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    console.log('[IssueDetector] detectIssues called, text length:', responseText.length);

    // Extract issue blocks (e.g., "1. **CrashLoopBackOff**: ...")
    const issueBlocks = this.extractIssueBlocks(responseText);
    console.log('[IssueDetector] Found', issueBlocks.length, 'issue blocks');

    for (const block of issueBlocks) {
      console.log('[IssueDetector] Processing block type:', block.type);

      // Extract pod references from bullet lines in this block
      // Pattern matches: - `podname` (namespace) or - `podname` (namespace) - details
      const podPattern = /^\s*[\-•\*]\s*`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)/gim;

      for (const line of block.lines) {
        const match = podPattern.exec(line);
        if (match) {
          const podName = match[1];
          const namespace = match[2];

          console.log('[IssueDetector] Found pod:', podName, 'in namespace', namespace, 'for issue type:', block.type);

          // Determine issue type and severity based on block header
          const issueInfo = this.categorizeIssue(block.type, line);

          if (issueInfo) {
            issues.push({
              type: issueInfo.type,
              severity: issueInfo.severity,
              title: `${block.type}: ${podName}`,
              description: `The pod ${podName} in namespace ${namespace} ${issueInfo.description}`,
              resource: {
                kind: 'Pod',
                name: podName,
                namespace: namespace
              },
              fixCommand: issueInfo.fixCommand.replace('{pod}', podName).replace('{namespace}', namespace),
              autoFixable: issueInfo.autoFixable
            });
          }
        }
      }
    }

    // Deduplicate issues by resource name and type
    const uniqueIssues = issues.filter((issue, index, self) =>
      index === self.findIndex(i =>
        i.resource.name === issue.resource.name &&
        i.type === issue.type
      )
    );

    console.log('[IssueDetector] Detected', uniqueIssues.length, 'unique issues');
    return uniqueIssues;
  }

  /**
   * Extract issue blocks from markdown-formatted response
   * Looks for numbered headers like "1. **IssueType**:" followed by bullet points
   */
  private extractIssueBlocks(text: string): Array<{ type: string; lines: string[] }> {
    const blocks: Array<{ type: string; lines: string[] }> = [];
    const lines = text.split('\n');
    let currentBlock: { type: string; lines: string[] } | null = null;

    for (const line of lines) {
      // Check for issue block header: "1. **IssueType**:" or "**IssueType**:"
      const headerMatch = /^\s*\d*\.\s*\*\*([^*]+)\*\*/.exec(line);

      if (headerMatch) {
        // Save previous block if exists
        if (currentBlock) {
          blocks.push(currentBlock);
        }

        // Start new block
        const issueType = headerMatch[1].trim();
        currentBlock = { type: issueType, lines: [line] };
        continue;
      }

      // If we're in a block, add lines until we hit empty line or next header
      if (currentBlock) {
        if (!line.trim() || /^\s*\d+\.\s*\*\*/.test(line) || /^##/.test(line)) {
          blocks.push(currentBlock);
          currentBlock = null;
          continue;
        }
        currentBlock.lines.push(line);
      }
    }

    // Add final block
    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  /**
   * Categorize an issue based on its type header and line content
   */
  private categorizeIssue(blockType: string, line: string): {
    type: DetectedIssue['type'];
    severity: DetectedIssue['severity'];
    description: string;
    fixCommand: string;
    autoFixable: boolean;
  } | null {
    const lowerType = blockType.toLowerCase();
    const lowerLine = line.toLowerCase();

    // ContainerCreating / stuck pods
    if (lowerType.includes('containercreating') || lowerType.includes('stuck') || lowerLine.includes('stuck')) {
      return {
        type: 'pod_stuck',
        severity: 'minor',
        description: 'is stuck in ContainerCreating state',
        fixCommand: 'kubectl describe pod {pod} -n {namespace} && kubectl delete pod {pod} -n {namespace}',
        autoFixable: true
      };
    }

    // CrashLoopBackOff / crashing
    if (lowerType.includes('crashloop') || lowerType.includes('crash') || lowerLine.includes('crash')) {
      // Check for restart count to determine severity
      const restartMatch = /(\d+)\s+restarts?/i.exec(line);
      const restartCount = restartMatch ? parseInt(restartMatch[1]) : 0;
      const severity = restartCount >= 100 ? 'moderate' : 'minor';

      return {
        type: restartCount >= 10 ? 'high_restarts' : 'crash_loop',
        severity,
        description: restartCount > 0 ? `is crashing repeatedly (${restartCount} restarts)` : 'is in CrashLoopBackOff state',
        fixCommand: restartCount > 0
          ? 'kubectl logs {pod} -n {namespace} --previous --tail=100 && kubectl describe pod {pod} -n {namespace}'
          : 'kubectl logs {pod} -n {namespace} --tail=100 && kubectl describe pod {pod} -n {namespace}',
        autoFixable: false
      };
    }

    // ImagePullBackOff
    if (lowerType.includes('imagepull') || lowerLine.includes('image') || lowerLine.includes('pull')) {
      return {
        type: 'image_pull_error',
        severity: 'moderate',
        description: 'cannot pull container image',
        fixCommand: 'kubectl describe pod {pod} -n {namespace}',
        autoFixable: false
      };
    }

    // Pending PVC
    if (lowerType.includes('pvc') || lowerType.includes('pending') || lowerLine.includes('pvc')) {
      return {
        type: 'pending_pvc',
        severity: 'moderate',
        description: 'has pending PersistentVolumeClaim',
        fixCommand: 'kubectl describe pod {pod} -n {namespace} && kubectl get pvc -n {namespace}',
        autoFixable: false
      };
    }

    // Node pressure
    if (lowerType.includes('node') || lowerType.includes('pressure')) {
      return {
        type: 'node_pressure',
        severity: 'critical',
        description: 'is experiencing node pressure',
        fixCommand: 'kubectl describe node && kubectl top nodes',
        autoFixable: false
      };
    }

    // Generic other issue
    return {
      type: 'other',
      severity: 'minor',
      description: `has an issue: ${blockType}`,
      fixCommand: 'kubectl describe pod {pod} -n {namespace}',
      autoFixable: false
    };
  }

  /**
   * Extract only structured sections (bullet points, numbered lists)
   * Ignore prose/explanatory text
   */
  private extractStructuredIssues(text: string): string[] {
    const sections: string[] = [];

    // Split by common section headers
    const issueHeaders = /(?:###?\s*)?(?:Notable\s+)?Issues?\s*(?:Detected)?:?/gi;
    const parts = text.split(issueHeaders);

    // Take sections after "Issues" headers
    for (let i = 1; i < parts.length; i++) {
      // Only take until next major section
      const section = parts[i].split(/\n\n#{1,3}\s+/)[0];
      sections.push(section);
    }

    // If text contains issue keywords, ALWAYS add full text search
    // (sections from headers might not capture everything)
    if (text.includes('ContainerCreating') || text.includes('CrashLoopBackOff')) {
      console.log('[IssueDetector] Text contains issue keywords, adding full text for search');
      // Extract lines containing ContainerCreating or CrashLoopBackOff
      const lines = text.split('\n');
      const relevantLines = lines.filter(line =>
        line.includes('ContainerCreating') || line.includes('CrashLoopBackOff')
      );
      console.log('[IssueDetector] Found', relevantLines.length, 'lines with issue keywords:', relevantLines.slice(0, 3));
      // Add the full text as a section to search
      sections.push(text);
    }

    return sections;
  }

  /**
   * Generate a fix prompt for an issue
   */
  generateFixPrompt(issue: DetectedIssue): string {
    switch (issue.type) {
      case 'pod_stuck':
        return `Fix the pod "${issue.resource.name}" stuck in ContainerCreating state in namespace "${issue.resource.namespace}". First describe the pod to identify the issue, then take appropriate action (delete pod if needed, check PVC/secrets, etc.).`;

      case 'high_restarts':
        return `Investigate why "${issue.resource.name}" has high restart counts. Check logs, describe the pod to find crash reasons, and suggest fixes for the root cause.`;

      case 'image_pull_error':
        return `Fix the ImagePullBackOff error for pod "${issue.resource.name}". Check the image name, registry credentials, and network connectivity.`;

      case 'crash_loop':
        return `Diagnose and fix the CrashLoopBackOff for pod "${issue.resource.name}". Review logs and configuration for errors.`;

      case 'pending_pvc':
        return `Resolve the pending PersistentVolumeClaim "${issue.resource.name}". Check storage classes, available PVs, and provisioner status.`;

      case 'node_pressure':
        return `Address node pressure on "${issue.resource.name}". Check node resources, evict unnecessary pods, or scale the cluster.`;

      default:
        return `Investigate and fix the issue with ${issue.resource.kind} "${issue.resource.name}".`;
    }
  }

  /**
   * Format issues as markdown for display
   */
  formatIssuesAsMarkdown(issues: DetectedIssue[]): string {
    if (issues.length === 0) {
      return '';
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const moderateIssues = issues.filter(i => i.severity === 'moderate');
    const minorIssues = issues.filter(i => i.severity === 'minor');

    let markdown = '\n\n---\n\n## Detected Issues\n\n';

    if (criticalIssues.length > 0) {
      markdown += '### Critical Issues\n\n';
      criticalIssues.forEach(issue => {
        markdown += `- **${issue.title}**\n  ${issue.description}\n`;
        if (issue.fixCommand) {
          markdown += `  \`${issue.fixCommand}\`\n`;
        }
        markdown += '\n';
      });
    }

    if (moderateIssues.length > 0) {
      markdown += '### Moderate Issues\n\n';
      moderateIssues.forEach(issue => {
        markdown += `- **${issue.title}**\n  ${issue.description}\n`;
        if (issue.fixCommand) {
          markdown += `  \`${issue.fixCommand}\`\n`;
        }
        markdown += '\n';
      });
    }

    if (minorIssues.length > 0) {
      markdown += '### Minor Issues\n\n';
      minorIssues.forEach(issue => {
        markdown += `- **${issue.title}**\n  ${issue.description}\n`;
        if (issue.fixCommand) {
          markdown += `  \`${issue.fixCommand}\`\n`;
        }
        markdown += '\n';
      });
    }

    return markdown;
  }
}

export const issueDetector = new IssueDetector();
