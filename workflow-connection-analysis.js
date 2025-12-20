#!/usr/bin/env node

/**
 * Workflow Connection Health Analyzer
 * Analyzes n8n workflow connections for:
 * 1. Tool -> Agent (ai_tool) connections
 * 2. Tool -> Implementation (main) connections
 * 3. Orphaned nodes
 * 4. Circular dependencies
 * 5. Connection optimization opportunities
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = '/Users/ryandahlberg/Projects/n8n/n8n-cortex/n8n-cortex-proxmox-MASTER-BAKED.json';

// Load workflow
const workflow = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

// Connection analysis results
const analysis = {
  totalNodes: 0,
  toolNodes: [],
  implementationNodes: [],
  agentNodes: [],
  supportNodes: [],
  orphanedNodes: [],
  connectionIssues: [],
  circularDeps: [],
  optimizationOpportunities: [],
  healthScore: 0
};

// Node categorization
function categorizeNodes() {
  workflow.nodes.forEach(node => {
    analysis.totalNodes++;

    if (node.type === '@n8n/n8n-nodes-langchain.toolWorkflow' ||
        node.type === '@n8n/n8n-nodes-langchain.toolCode') {
      analysis.toolNodes.push(node);
    } else if (node.type === 'n8n-nodes-base.httpRequest' ||
               node.type === 'n8n-nodes-base.code') {
      analysis.implementationNodes.push(node);
    } else if (node.type === '@n8n/n8n-nodes-langchain.agent') {
      analysis.agentNodes.push(node);
    } else if (node.type !== 'n8n-nodes-base.stickyNote') {
      analysis.supportNodes.push(node);
    }
  });
}

// Check tool -> agent connections
function checkToolAgentConnections() {
  const agentName = analysis.agentNodes[0]?.name;

  analysis.toolNodes.forEach(tool => {
    const connections = workflow.connections[tool.name];

    if (!connections) {
      analysis.connectionIssues.push({
        severity: 'critical',
        node: tool.name,
        issue: 'Tool has no connections at all',
        type: 'missing_connections'
      });
      return;
    }

    if (!connections.ai_tool) {
      analysis.connectionIssues.push({
        severity: 'critical',
        node: tool.name,
        issue: 'Tool missing ai_tool connection to agent',
        expected: `Should connect to: ${agentName}`,
        type: 'missing_ai_tool'
      });
    } else {
      // Verify ai_tool connects to actual agent
      const aiToolTarget = connections.ai_tool[0]?.[0]?.node;
      if (aiToolTarget !== agentName) {
        analysis.connectionIssues.push({
          severity: 'high',
          node: tool.name,
          issue: `ai_tool connects to wrong node: ${aiToolTarget}`,
          expected: agentName,
          type: 'wrong_ai_tool_target'
        });
      }
    }
  });
}

// Check tool -> implementation connections
function checkToolImplementationConnections() {
  analysis.toolNodes.forEach(tool => {
    const connections = workflow.connections[tool.name];

    if (!connections?.main) {
      analysis.connectionIssues.push({
        severity: 'critical',
        node: tool.name,
        issue: 'Tool missing main connection to implementation',
        type: 'missing_implementation'
      });
      return;
    }

    // Verify main connects to an implementation node
    const mainTarget = connections.main[0]?.[0]?.node;
    const targetNode = workflow.nodes.find(n => n.name === mainTarget);

    if (!targetNode) {
      analysis.connectionIssues.push({
        severity: 'critical',
        node: tool.name,
        issue: `main connection points to non-existent node: ${mainTarget}`,
        type: 'broken_connection'
      });
    } else if (!['n8n-nodes-base.httpRequest', 'n8n-nodes-base.code'].includes(targetNode.type)) {
      analysis.connectionIssues.push({
        severity: 'medium',
        node: tool.name,
        issue: `main connection points to non-implementation node: ${mainTarget} (${targetNode.type})`,
        type: 'unusual_implementation'
      });
    }
  });
}

// Find orphaned nodes
function findOrphanedNodes() {
  const allConnections = new Set();
  const nodesWithOutgoing = new Set();

  // Collect all nodes that appear in connections
  Object.entries(workflow.connections).forEach(([sourceName, connTypes]) => {
    nodesWithOutgoing.add(sourceName);
    Object.values(connTypes).forEach(connArray => {
      connArray.forEach(connGroup => {
        connGroup.forEach(conn => {
          allConnections.add(conn.node);
        });
      });
    });
  });

  // Find nodes with no incoming OR outgoing connections
  workflow.nodes.forEach(node => {
    // Skip special nodes
    if (node.type === 'n8n-nodes-base.stickyNote' ||
        node.type === '@n8n/n8n-nodes-langchain.chatTrigger' ||
        node.type === '@n8n/n8n-nodes-langchain.agent' ||
        node.type === '@n8n/n8n-nodes-langchain.lmChatAnthropic' ||
        node.type === '@n8n/n8n-nodes-langchain.memoryBufferWindow') {
      return;
    }

    const hasIncoming = allConnections.has(node.name);
    const hasOutgoing = nodesWithOutgoing.has(node.name);

    if (!hasIncoming && !hasOutgoing) {
      analysis.orphanedNodes.push({
        name: node.name,
        id: node.id,
        type: node.type,
        severity: 'high'
      });
    } else if (!hasIncoming) {
      analysis.orphanedNodes.push({
        name: node.name,
        id: node.id,
        type: node.type,
        issue: 'No incoming connections',
        severity: 'medium'
      });
    }
  });
}

// Detect circular dependencies
function detectCircularDependencies() {
  const visited = new Set();
  const recursionStack = new Set();

  function hasCycle(nodeName, path = []) {
    if (recursionStack.has(nodeName)) {
      analysis.circularDeps.push({
        cycle: [...path, nodeName],
        severity: 'high'
      });
      return true;
    }

    if (visited.has(nodeName)) {
      return false;
    }

    visited.add(nodeName);
    recursionStack.add(nodeName);
    path.push(nodeName);

    const connections = workflow.connections[nodeName];
    if (connections) {
      for (const connType of Object.values(connections)) {
        for (const connGroup of connType) {
          for (const conn of connGroup) {
            if (hasCycle(conn.node, [...path])) {
              return true;
            }
          }
        }
      }
    }

    recursionStack.delete(nodeName);
    return false;
  }

  workflow.nodes.forEach(node => {
    if (!visited.has(node.name)) {
      hasCycle(node.name);
    }
  });
}

// Identify optimization opportunities
function identifyOptimizations() {
  // Check for duplicate implementations
  const implementationUrls = new Map();

  analysis.implementationNodes.forEach(node => {
    if (node.type === 'n8n-nodes-base.httpRequest') {
      const url = node.parameters?.url;
      if (url) {
        if (implementationUrls.has(url)) {
          analysis.optimizationOpportunities.push({
            type: 'duplicate_implementation',
            severity: 'low',
            message: `Duplicate HTTP request to ${url}`,
            nodes: [implementationUrls.get(url), node.name]
          });
        } else {
          implementationUrls.set(url, node.name);
        }
      }
    }
  });

  // Check for tools without descriptions
  analysis.toolNodes.forEach(tool => {
    if (!tool.parameters?.description || tool.parameters.description.length < 20) {
      analysis.optimizationOpportunities.push({
        type: 'poor_description',
        severity: 'low',
        node: tool.name,
        message: 'Tool has inadequate description (should be descriptive for AI agent)'
      });
    }
  });

  // Check for missing sticky note organization
  const stickyNotes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote');
  const toolsPerSection = Math.ceil(analysis.toolNodes.length / stickyNotes.length);

  if (toolsPerSection > 10) {
    analysis.optimizationOpportunities.push({
      type: 'organization',
      severity: 'low',
      message: `Consider adding more sticky notes for organization (${analysis.toolNodes.length} tools with ${stickyNotes.length} sections)`
    });
  }

  // Check for tools that could share implementations
  const httpMethods = new Map();
  analysis.implementationNodes.forEach(node => {
    if (node.type === 'n8n-nodes-base.httpRequest') {
      const method = node.parameters?.method || 'GET';
      const baseUrl = node.parameters?.url?.split('/{')[0];
      const key = `${method}:${baseUrl}`;

      if (!httpMethods.has(key)) {
        httpMethods.set(key, []);
      }
      httpMethods.get(key).push(node.name);
    }
  });

  httpMethods.forEach((nodes, key) => {
    if (nodes.length > 3) {
      analysis.optimizationOpportunities.push({
        type: 'consolidation_opportunity',
        severity: 'low',
        message: `${nodes.length} similar HTTP requests (${key}) could potentially share logic`,
        nodes: nodes
      });
    }
  });
}

// Calculate health score
function calculateHealthScore() {
  let score = 100;

  // Deduct for critical issues
  const criticalIssues = analysis.connectionIssues.filter(i => i.severity === 'critical');
  score -= criticalIssues.length * 20;

  // Deduct for high severity issues
  const highIssues = [...analysis.connectionIssues.filter(i => i.severity === 'high'),
                      ...analysis.orphanedNodes.filter(n => n.severity === 'high'),
                      ...analysis.circularDeps];
  score -= highIssues.length * 10;

  // Deduct for medium issues
  const mediumIssues = [...analysis.connectionIssues.filter(i => i.severity === 'medium'),
                        ...analysis.orphanedNodes.filter(n => n.severity === 'medium')];
  score -= mediumIssues.length * 5;

  // Small deduction for optimizations
  score -= analysis.optimizationOpportunities.length * 1;

  analysis.healthScore = Math.max(0, Math.min(100, score));
}

// Generate report
function generateReport() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     WORKFLOW CONNECTION HEALTH ANALYSIS REPORT               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 OVERVIEW`);
  console.log(`   Total Nodes: ${analysis.totalNodes}`);
  console.log(`   Tool Nodes: ${analysis.toolNodes.length}`);
  console.log(`   Implementation Nodes: ${analysis.implementationNodes.length}`);
  console.log(`   Agent Nodes: ${analysis.agentNodes.length}`);
  console.log(`   Health Score: ${analysis.healthScore}/100 ${getHealthEmoji(analysis.healthScore)}`);
  console.log('');

  // Critical Issues
  const criticalIssues = analysis.connectionIssues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    console.log(`🚨 CRITICAL ISSUES (${criticalIssues.length})`);
    criticalIssues.forEach(issue => {
      console.log(`   ❌ ${issue.node}`);
      console.log(`      Issue: ${issue.issue}`);
      if (issue.expected) console.log(`      Expected: ${issue.expected}`);
      console.log('');
    });
  }

  // High Priority Issues
  const highIssues = analysis.connectionIssues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    console.log(`⚠️  HIGH PRIORITY ISSUES (${highIssues.length})`);
    highIssues.forEach(issue => {
      console.log(`   ⚠️  ${issue.node}`);
      console.log(`      Issue: ${issue.issue}`);
      if (issue.expected) console.log(`      Expected: ${issue.expected}`);
      console.log('');
    });
  }

  // Orphaned Nodes
  if (analysis.orphanedNodes.length > 0) {
    console.log(`🔌 ORPHANED NODES (${analysis.orphanedNodes.length})`);
    analysis.orphanedNodes.forEach(node => {
      const emoji = node.severity === 'high' ? '❌' : '⚠️';
      console.log(`   ${emoji} ${node.name} (${node.type})`);
      if (node.issue) console.log(`      ${node.issue}`);
      console.log('');
    });
  }

  // Circular Dependencies
  if (analysis.circularDeps.length > 0) {
    console.log(`🔄 CIRCULAR DEPENDENCIES (${analysis.circularDeps.length})`);
    analysis.circularDeps.forEach(dep => {
      console.log(`   🔄 Cycle detected: ${dep.cycle.join(' → ')}`);
      console.log('');
    });
  }

  // Tool Connection Verification
  console.log(`🔧 TOOL CONNECTION VERIFICATION`);
  const toolsWithValidConnections = analysis.toolNodes.filter(tool => {
    const connections = workflow.connections[tool.name];
    return connections?.ai_tool && connections?.main;
  }).length;

  console.log(`   ✅ Tools with valid ai_tool connections: ${toolsWithValidConnections}/${analysis.toolNodes.length}`);
  console.log(`   ✅ Tools with valid main connections: ${toolsWithValidConnections}/${analysis.toolNodes.length}`);
  console.log('');

  // Optimization Opportunities
  if (analysis.optimizationOpportunities.length > 0) {
    console.log(`💡 OPTIMIZATION OPPORTUNITIES (${analysis.optimizationOpportunities.length})`);
    analysis.optimizationOpportunities.forEach(opp => {
      console.log(`   💡 ${opp.message}`);
      if (opp.nodes) console.log(`      Affected: ${opp.nodes.join(', ')}`);
      console.log('');
    });
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                          SUMMARY                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const totalIssues = criticalIssues.length + highIssues.length +
                      analysis.orphanedNodes.filter(n => n.severity === 'high').length +
                      analysis.circularDeps.length;

  if (totalIssues === 0) {
    console.log('   ✅ All connections are healthy!');
    console.log('   ✅ All tools properly connected to agent via ai_tool');
    console.log('   ✅ All tools properly connected to implementations via main');
    console.log('   ✅ No orphaned nodes detected');
    console.log('   ✅ No circular dependencies detected');
  } else {
    console.log(`   ⚠️  ${totalIssues} issues require attention`);
    if (criticalIssues.length > 0) {
      console.log(`   🚨 ${criticalIssues.length} critical issues must be fixed immediately`);
    }
  }

  console.log('');
  console.log(`   Health Score: ${analysis.healthScore}/100 ${getHealthEmoji(analysis.healthScore)}`);
  console.log('');
}

function getHealthEmoji(score) {
  if (score >= 90) return '🟢 Excellent';
  if (score >= 70) return '🟡 Good';
  if (score >= 50) return '🟠 Fair';
  return '🔴 Needs Attention';
}

// Export detailed JSON report
function exportJsonReport() {
  const reportPath = '/Users/ryandahlberg/Projects/cortex/workflow-connection-analysis-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
  console.log(`📄 Detailed JSON report saved to: ${reportPath}\n`);
}

// Run analysis
categorizeNodes();
checkToolAgentConnections();
checkToolImplementationConnections();
findOrphanedNodes();
detectCircularDependencies();
identifyOptimizations();
calculateHealthScore();
generateReport();
exportJsonReport();
