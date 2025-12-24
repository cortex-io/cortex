/**
 * Kubernetes Tool Executor
 * Executes kubectl commands and returns structured data
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Execution result interface
 */
export interface K8sToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
}

/**
 * Command execution timeout (30 seconds)
 */
const KUBECTL_TIMEOUT = 30000;

/**
 * Sanitize input to prevent command injection
 */
function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input.replace(/[;&|`$(){}[\]<>]/g, '');
}

/**
 * Execute kubectl command safely
 */
async function executeKubectl(command: string): Promise<any> {
  try {
    const { stdout, stderr } = await execPromise(command, {
      timeout: KUBECTL_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
    });

    if (stderr && !stderr.includes('Warning')) {
      console.warn(`[K8sExecutor] kubectl stderr: ${stderr}`);
    }

    // Try to parse JSON output
    try {
      return JSON.parse(stdout);
    } catch {
      // If not JSON, return raw output
      return stdout.trim();
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Get cluster nodes information
 */
async function getNodes(): Promise<any> {
  const data = await executeKubectl('kubectl get nodes -o json');

  // Format node information
  return {
    nodes: data.items.map((node: any) => ({
      name: node.metadata.name,
      status: node.status.conditions.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
      version: node.status.nodeInfo.kubeletVersion,
      os: node.status.nodeInfo.osImage,
      kernel: node.status.nodeInfo.kernelVersion,
      containerRuntime: node.status.nodeInfo.containerRuntimeVersion,
      capacity: {
        cpu: node.status.capacity.cpu,
        memory: node.status.capacity.memory,
        pods: node.status.capacity.pods
      },
      allocatable: {
        cpu: node.status.allocatable.cpu,
        memory: node.status.allocatable.memory,
        pods: node.status.allocatable.pods
      },
      roles: Object.keys(node.metadata.labels)
        .filter(label => label.startsWith('node-role.kubernetes.io/'))
        .map(label => label.replace('node-role.kubernetes.io/', '')),
      age: node.metadata.creationTimestamp
    })),
    count: data.items.length
  };
}

/**
 * Get pods information
 */
async function getPods(namespace?: string, statusFilter?: string): Promise<any> {
  const nsFlag = namespace ? `-n ${sanitizeInput(namespace)}` : '-A';
  const data = await executeKubectl(`kubectl get pods ${nsFlag} -o json`);

  let pods = data.items.map((pod: any) => ({
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    status: pod.status.phase,
    ready: `${pod.status.containerStatuses?.filter((c: any) => c.ready).length || 0}/${pod.spec.containers.length}`,
    restarts: pod.status.containerStatuses?.reduce((sum: number, c: any) => sum + c.restartCount, 0) || 0,
    age: pod.metadata.creationTimestamp,
    node: pod.spec.nodeName,
    ip: pod.status.podIP,
    containers: pod.spec.containers.map((c: any) => ({
      name: c.name,
      image: c.image,
      ready: pod.status.containerStatuses?.find((cs: any) => cs.name === c.name)?.ready || false
    }))
  }));

  // Filter by status if specified
  if (statusFilter && statusFilter !== 'all') {
    pods = pods.filter((pod: any) => pod.status === statusFilter);
  }

  return {
    pods,
    count: pods.length
  };
}

/**
 * Get deployments information
 */
async function getDeployments(namespace?: string): Promise<any> {
  const nsFlag = namespace ? `-n ${sanitizeInput(namespace)}` : '-A';
  const data = await executeKubectl(`kubectl get deployments ${nsFlag} -o json`);

  return {
    deployments: data.items.map((deploy: any) => ({
      name: deploy.metadata.name,
      namespace: deploy.metadata.namespace,
      replicas: {
        desired: deploy.spec.replicas,
        ready: deploy.status.readyReplicas || 0,
        available: deploy.status.availableReplicas || 0,
        unavailable: deploy.status.unavailableReplicas || 0
      },
      strategy: deploy.spec.strategy.type,
      age: deploy.metadata.creationTimestamp,
      containers: deploy.spec.template.spec.containers.map((c: any) => ({
        name: c.name,
        image: c.image
      }))
    })),
    count: data.items.length
  };
}

/**
 * Get services information
 */
async function getServices(namespace?: string): Promise<any> {
  const nsFlag = namespace ? `-n ${sanitizeInput(namespace)}` : '-A';
  const data = await executeKubectl(`kubectl get services ${nsFlag} -o json`);

  return {
    services: data.items.map((svc: any) => ({
      name: svc.metadata.name,
      namespace: svc.metadata.namespace,
      type: svc.spec.type,
      clusterIP: svc.spec.clusterIP,
      externalIP: svc.spec.externalIPs || svc.status.loadBalancer?.ingress?.[0]?.ip || 'none',
      ports: svc.spec.ports?.map((p: any) => ({
        name: p.name,
        port: p.port,
        targetPort: p.targetPort,
        protocol: p.protocol,
        nodePort: p.nodePort
      })) || [],
      age: svc.metadata.creationTimestamp
    })),
    count: data.items.length
  };
}

/**
 * Get namespaces
 */
async function getNamespaces(): Promise<any> {
  const data = await executeKubectl('kubectl get namespaces -o json');

  return {
    namespaces: data.items.map((ns: any) => ({
      name: ns.metadata.name,
      status: ns.status.phase,
      age: ns.metadata.creationTimestamp
    })),
    count: data.items.length
  };
}

/**
 * Describe a specific pod
 */
async function describePod(podName: string, namespace: string = 'default'): Promise<any> {
  const safePodName = sanitizeInput(podName);
  const safeNamespace = sanitizeInput(namespace);

  const data = await executeKubectl(`kubectl get pod ${safePodName} -n ${safeNamespace} -o json`);

  return {
    name: data.metadata.name,
    namespace: data.metadata.namespace,
    status: data.status.phase,
    startTime: data.status.startTime,
    node: data.spec.nodeName,
    ip: data.status.podIP,
    labels: data.metadata.labels,
    annotations: data.metadata.annotations,
    containers: data.spec.containers.map((c: any) => {
      const status = data.status.containerStatuses?.find((cs: any) => cs.name === c.name);
      return {
        name: c.name,
        image: c.image,
        ready: status?.ready || false,
        restartCount: status?.restartCount || 0,
        state: status?.state,
        resources: c.resources
      };
    }),
    conditions: data.status.conditions,
    volumes: data.spec.volumes?.map((v: any) => ({
      name: v.name,
      type: Object.keys(v).filter(k => k !== 'name')[0]
    })) || []
  };
}

/**
 * Get pod logs
 */
async function getPodLogs(
  podName: string,
  namespace: string = 'default',
  container?: string,
  tailLines: number = 100
): Promise<any> {
  const safePodName = sanitizeInput(podName);
  const safeNamespace = sanitizeInput(namespace);
  const safeContainer = container ? sanitizeInput(container) : '';

  const containerFlag = safeContainer ? `-c ${safeContainer}` : '';
  const logs = await executeKubectl(
    `kubectl logs ${safePodName} -n ${safeNamespace} ${containerFlag} --tail=${tailLines}`
  );

  return {
    podName: safePodName,
    namespace: safeNamespace,
    container: safeContainer || 'default',
    lines: tailLines,
    logs: logs
  };
}

/**
 * Get cluster events
 */
async function getEvents(namespace?: string): Promise<any> {
  const nsFlag = namespace ? `-n ${sanitizeInput(namespace)}` : '-A';
  const data = await executeKubectl(`kubectl get events ${nsFlag} -o json --sort-by='.lastTimestamp'`);

  return {
    events: data.items.slice(-50).map((event: any) => ({
      type: event.type,
      reason: event.reason,
      message: event.message,
      object: `${event.involvedObject.kind}/${event.involvedObject.name}`,
      namespace: event.involvedObject.namespace,
      count: event.count,
      firstTime: event.firstTimestamp,
      lastTime: event.lastTimestamp
    })).reverse(),
    count: data.items.length
  };
}

/**
 * Get resource usage (requires metrics-server)
 */
async function getResourceUsage(): Promise<any> {
  try {
    // Try to get node metrics
    const nodeMetrics = await executeKubectl('kubectl top nodes --no-headers');
    const nodes = nodeMetrics.split('\n').filter((line: string) => line.trim()).map((line: string) => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0],
        cpuUsage: parts[1],
        cpuPercent: parts[2],
        memoryUsage: parts[3],
        memoryPercent: parts[4]
      };
    });

    // Try to get pod metrics
    const podMetrics = await executeKubectl('kubectl top pods -A --no-headers');
    const pods = podMetrics.split('\n').filter((line: string) => line.trim()).map((line: string) => {
      const parts = line.split(/\s+/);
      return {
        namespace: parts[0],
        name: parts[1],
        cpuUsage: parts[2],
        memoryUsage: parts[3]
      };
    });

    return {
      nodes,
      pods: pods.slice(0, 50), // Limit to top 50 pods
      available: true
    };
  } catch (error) {
    return {
      available: false,
      error: 'Metrics server not available or not installed'
    };
  }
}

/**
 * Main executor function for Kubernetes tools
 */
export async function executeK8sTool(
  toolName: string,
  input: any = {}
): Promise<K8sToolResult> {
  const startTime = Date.now();

  try {
    console.log(`[K8sExecutor] Executing tool: ${toolName}`, input);

    let data: any;

    switch (toolName) {
      case 'k8s_get_nodes':
        data = await getNodes();
        break;

      case 'k8s_get_pods':
        data = await getPods(input.namespace, input.status);
        break;

      case 'k8s_get_deployments':
        data = await getDeployments(input.namespace);
        break;

      case 'k8s_get_services':
        data = await getServices(input.namespace);
        break;

      case 'k8s_get_namespaces':
        data = await getNamespaces();
        break;

      case 'k8s_describe_pod':
        if (!input.pod_name) {
          throw new Error('pod_name is required');
        }
        data = await describePod(input.pod_name, input.namespace);
        break;

      case 'k8s_get_logs':
        if (!input.pod_name) {
          throw new Error('pod_name is required');
        }
        data = await getPodLogs(
          input.pod_name,
          input.namespace,
          input.container,
          input.tail_lines || 100
        );
        break;

      case 'k8s_get_events':
        data = await getEvents(input.namespace);
        break;

      case 'k8s_get_resource_usage':
        data = await getResourceUsage();
        break;

      default:
        throw new Error(`Unknown Kubernetes tool: ${toolName}`);
    }

    console.log(`[K8sExecutor] Tool ${toolName} executed successfully`);

    return {
      success: true,
      data,
      executionTime: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[K8sExecutor] Error executing tool ${toolName}:`, error);

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }

    return {
      success: false,
      error: 'Unknown error occurred',
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Health check for kubectl connectivity
 */
export async function checkKubectlHealth(): Promise<boolean> {
  try {
    await executeKubectl('kubectl version --client=true -o json');
    return true;
  } catch (error) {
    console.error('[K8sExecutor] kubectl health check failed:', error);
    return false;
  }
}
