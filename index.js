#!/usr/bin/env node

/**
 * Cortex Entry Point
 *
 * Detects mode (master/worker) and starts appropriate component
 */

const mode = process.env.CORTEX_MODE; // master | worker
const type = process.env.CORTEX_TYPE; // coordinator | development | security | cicd | inventory | implementation | scan | analysis

console.log('='.repeat(60));
console.log('Cortex Startup');
console.log('='.repeat(60));
console.log(`Mode: ${mode || 'not set'}`);
console.log(`Type: ${type || 'not set'}`);
console.log(`Node: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Hostname: ${process.env.HOSTNAME || 'unknown'}`);
console.log('='.repeat(60));

if (!mode) {
  console.error('ERROR: CORTEX_MODE environment variable not set');
  console.error('Valid values: master, worker');
  console.error('');
  console.error('Examples:');
  console.error('  CORTEX_MODE=master CORTEX_TYPE=coordinator node index.js');
  console.error('  CORTEX_MODE=worker CORTEX_TYPE=implementation node index.js');
  process.exit(1);
}

if (!type) {
  console.error('ERROR: CORTEX_TYPE environment variable not set');
  console.error('');
  console.error('For masters: coordinator, development, security, cicd, inventory');
  console.error('For workers: implementation, security, analysis, scan');
  process.exit(1);
}

// Start appropriate mode
if (mode === 'master') {
  console.log(`Starting Cortex Master: ${type}`);
  const CortexMaster = require('./lib/masters/master-mode');
  const master = new CortexMaster();
  master.startTime = Date.now();
  master.start().catch(error => {
    console.error('Fatal error starting master:', error);
    // Masters should never die - restart after 5 seconds
    setTimeout(() => {
      console.log('Restarting master after fatal error...');
      master.start();
    }, 5000);
  });
} else if (mode === 'worker') {
  console.log(`Starting Cortex Worker: ${type}`);
  const CortexWorker = require('./lib/workers/worker-mode');
  const worker = new CortexWorker();
  worker.start().catch(error => {
    console.error('Fatal error starting worker:', error);
    process.exit(1);
  });
} else {
  console.error(`ERROR: Invalid CORTEX_MODE: ${mode}`);
  console.error('Valid values: master, worker');
  process.exit(1);
}
