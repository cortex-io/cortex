#!/usr/bin/env node
/**
 * Test script for K8s Resource Manager
 * Tests K8s client, service discovery, and health monitor in mock mode
 */

const K8sResourceManager = require('./k8s-client');
const ServiceDiscovery = require('./service-discovery');
const HealthMonitor = require('./health-monitor');

async function testK8sClient() {
  console.log('\n=== Testing K8s Resource Manager ===\n');

  // Initialize K8s client in mock mode
  const k8sClient = new K8sResourceManager({
    mockMode: true,
    mcpServerUrl: 'http://localhost:3001'
  });

  console.log('1. Initializing K8s client...');
  const initialized = await k8sClient.initialize();
  console.log(`   Initialized: ${initialized}`);
  console.log(`   Connected: ${k8sClient.connected}`);
  console.log(`   Mock Mode: ${k8sClient.mockMode}`);

  console.log('\n2. Checking health...');
  const healthy = await k8sClient.checkHealth();
  console.log(`   Healthy: ${healthy}`);
  console.log(`   Last health check:`, k8sClient.lastHealthCheck);

  console.log('\n3. Listing namespaces...');
  const namespaces = await k8sClient.listNamespaces();
  console.log(`   Found ${namespaces.length} namespaces:`);
  namespaces.forEach(ns => console.log(`     - ${ns.name} (${ns.status})`));

  console.log('\n4. Discovering MCP servers...');
  const mcpServers = await k8sClient.discoverMCPServers('cortex-system');
  console.log(`   Found ${mcpServers.length} MCP servers:`);
  mcpServers.forEach(svc => {
    console.log(`     - ${svc.name} (${svc.type}) at ${svc.clusterIP}`);
  });

  console.log('\n5. Listing pods in cortex-system...');
  const pods = await k8sClient.listPods('cortex-system');
  console.log(`   Found ${pods.length} pods:`);
  pods.forEach(pod => {
    console.log(`     - ${pod.name} (${pod.phase}) ready=${pod.ready}`);
  });

  console.log('\n6. Listing deployments...');
  const deployments = await k8sClient.listDeployments('cortex-system');
  console.log(`   Found ${deployments.length} deployments:`);
  deployments.forEach(deploy => {
    console.log(`     - ${deploy.name}: ${deploy.readyReplicas}/${deploy.replicas} ready`);
  });

  console.log('\n7. Getting node status...');
  const nodes = await k8sClient.getNodeStatus();
  console.log(`   Found ${nodes.length} nodes:`);
  nodes.forEach(node => {
    console.log(`     - ${node.name}: ready=${node.ready}, version=${node.kubeletVersion}`);
  });

  console.log('\n8. Testing pod logs...');
  const logs = await k8sClient.getPodLogs('cortex-system', 'k3s-mcp-server-5d8f6b7c9d-x4k2m');
  console.log(`   Retrieved logs (${logs.logs.split('\n').length} lines)`);

  console.log('\n9. Testing scale deployment...');
  const scaleResult = await k8sClient.scaleDeployment('cortex-system', 'cortex-dashboard', 3);
  console.log(`   Scale result:`, scaleResult);

  console.log('\n10. Shutdown K8s client...');
  await k8sClient.shutdown();
  console.log('    K8s client stopped');

  console.log('\n=== K8s Client Tests Complete ===\n');
}

async function testServiceDiscovery() {
  console.log('\n=== Testing Service Discovery ===\n');

  const k8sClient = new K8sResourceManager({ mockMode: true });
  await k8sClient.initialize();

  const serviceDiscovery = new ServiceDiscovery(k8sClient, {
    cortexHome: process.cwd(),
    discoveryInterval: 5000 // 5 seconds for testing
  });

  console.log('1. Starting service discovery...');
  await serviceDiscovery.start();

  console.log('\n2. Waiting for discovery to complete...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n3. Getting discovered services...');
  const services = serviceDiscovery.getDiscoveredServices();
  console.log(`   Discovered ${services.length} services:`);
  services.forEach(svc => {
    console.log(`     - ${svc.namespace}/${svc.name} (last seen: ${svc.last_seen})`);
  });

  console.log('\n4. Getting discovery status...');
  const status = serviceDiscovery.getStatus();
  console.log(`   Status:`, status);

  console.log('\n5. Getting statistics...');
  const stats = serviceDiscovery.getStatistics();
  console.log(`   Statistics:`, stats);

  console.log('\n6. Stopping service discovery...');
  serviceDiscovery.stop();

  await k8sClient.shutdown();

  console.log('\n=== Service Discovery Tests Complete ===\n');
}

async function testHealthMonitor() {
  console.log('\n=== Testing Health Monitor ===\n');

  const k8sClient = new K8sResourceManager({ mockMode: true });
  await k8sClient.initialize();

  const healthMonitor = new HealthMonitor(k8sClient, {
    cortexHome: process.cwd(),
    checkInterval: 5000, // 5 seconds for testing
    monitoredNamespaces: ['cortex-system']
  });

  console.log('1. Starting health monitor...');
  await healthMonitor.start();

  console.log('\n2. Waiting for health check to complete...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n3. Getting health status...');
  const status = healthMonitor.getHealthStatus();
  console.log(`   Status:`, status);

  console.log('\n4. Checking specific service health...');
  const serviceHealth = await healthMonitor.checkServiceByName('cortex-system', 'k3s-mcp-server');
  console.log(`   Service health:`, serviceHealth);

  console.log('\n5. Forcing immediate health check...');
  const healthCheck = await healthMonitor.forceCheck();
  console.log(`   Health check result:`, {
    timestamp: healthCheck.timestamp,
    overall_status: healthCheck.overall_status,
    cluster_status: healthCheck.cluster.status,
    pods_status: healthCheck.pods.status
  });

  console.log('\n6. Getting recent health checks...');
  const recentChecks = await healthMonitor.getRecentHealthChecks(3);
  console.log(`   Retrieved ${recentChecks.length} recent checks`);

  console.log('\n7. Getting health statistics...');
  const stats = await healthMonitor.getStatistics();
  console.log(`   Statistics:`, stats);

  console.log('\n8. Stopping health monitor...');
  healthMonitor.stop();

  await k8sClient.shutdown();

  console.log('\n=== Health Monitor Tests Complete ===\n');
}

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     K8s Resource Manager Test Suite (Mock Mode)               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await testK8sClient();
    await testServiceDiscovery();
    await testHealthMonitor();

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ALL TESTS PASSED                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║                    TESTS FAILED                                ║');
    console.error('╚════════════════════════════════════════════════════════════════╝');
    console.error('\nError:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
