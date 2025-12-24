const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = process.env.PORT || 8000;

/**
 * Execute a command safely
 */
async function executeCommand(command) {
  try {
    const { stdout, stderr } = await execPromise(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command: command
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      command: command
    };
  }
}

/**
 * Process user query and determine what to execute
 */
async function processQuery(query) {
  const lowerQuery = query.toLowerCase();
  
  // K8s cluster queries
  if (lowerQuery.includes('cluster') || lowerQuery.includes('k3s')) {
    const commands = [
      'kubectl cluster-info',
      'kubectl get nodes -o wide',
      'kubectl get namespaces',
      'kubectl get pods --all-namespaces | head -20',
      'kubectl top nodes || echo "Metrics not available"'
    ];
    
    const results = [];
    for (const cmd of commands) {
      const result = await executeCommand(cmd);
      results.push(result);
    }
    
    return {
      query: query,
      type: 'cluster_info',
      results: results
    };
  }
  
  // Pod queries
  if (lowerQuery.includes('pod')) {
    const namespace = lowerQuery.match(/namespace[:\s]+(\S+)/)?.[1] || '--all-namespaces';
    const cmd = namespace === '--all-namespaces' 
      ? 'kubectl get pods --all-namespaces -o wide'
      : `kubectl get pods -n ${namespace} -o wide`;
    
    const result = await executeCommand(cmd);
    return {
      query: query,
      type: 'pod_info',
      results: [result]
    };
  }
  
  // Service queries
  if (lowerQuery.includes('service')) {
    const result = await executeCommand('kubectl get svc --all-namespaces -o wide');
    return {
      query: query,
      type: 'service_info',
      results: [result]
    };
  }
  
  // Deployment queries
  if (lowerQuery.includes('deployment')) {
    const result = await executeCommand('kubectl get deployments --all-namespaces -o wide');
    return {
      query: query,
      type: 'deployment_info',
      results: [result]
    };
  }
  
  // Default: return general cluster info
  const result = await executeCommand('kubectl cluster-info && kubectl get nodes');
  return {
    query: query,
    type: 'general',
    results: [result]
  };
}

/**
 * HTTP request handler
 */
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }
  
  // Main API endpoint
  if (req.url === '/api/tasks' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const query = data.payload?.query || data.query || 'cluster info';
        
        console.log(`[CortexAPI] Processing query: ${query}`);
        
        const result = await processQuery(query);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: data.id,
          status: 'completed',
          result: result
        }));
      } catch (error) {
        console.error('[CortexAPI] Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('============================================================');
  console.log('Cortex HTTP API Server');
  console.log('============================================================');
  console.log(`Listening on port ${PORT}`);
  console.log('\nEndpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /api/tasks - Execute Cortex tasks');
  console.log('============================================================');
});
