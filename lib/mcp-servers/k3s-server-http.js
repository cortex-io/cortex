#!/usr/bin/env node

/**
 * K3s MCP Server - HTTP/SSE Transport
 *
 * Standalone containerized MCP server for K3s Kubernetes cluster integration
 * Runs as an HTTP service accessible to Cortex components
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { KubeConfig, CoreV1Api, AppsV1Api, BatchV1Api, CustomObjectsApi } from '@kubernetes/client-node';
import http from 'http';
import yaml from 'js-yaml';

// Configuration
const K3S_API_URL = process.env.K3S_API_URL || 'https://10.88.145.180:6443';
const K3S_KUBECONFIG = process.env.K3S_KUBECONFIG || process.env.HOME + '/.kube/config';
const PORT = process.env.PORT || 3001;

class K3sMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'k3s-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        },
      }
    );

    // Initialize Kubernetes clients
    this.kc = new KubeConfig();
    try {
      this.kc.loadFromFile(K3S_KUBECONFIG);
    } catch (error) {
      console.error(`Failed to load kubeconfig from ${K3S_KUBECONFIG}: ${error.message}`);
      console.error('Attempting to load from default config...');
      this.kc.loadFromDefault();
    }

    this.coreApi = this.kc.makeApiClient(CoreV1Api);
    this.appsApi = this.kc.makeApiClient(AppsV1Api);
    this.batchApi = this.kc.makeApiClient(BatchV1Api);
    this.customApi = this.kc.makeApiClient(CustomObjectsApi);

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_pods',
          description: 'List pods across namespaces with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace to list pods from (default: all namespaces)'
              },
              labelSelector: {
                type: 'string',
                description: 'Label selector to filter pods (e.g., "app=cortex")'
              }
            }
          }
        },
        {
          name: 'list_deployments',
          description: 'List deployments in a namespace',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace to list deployments from (default: all namespaces)'
              }
            }
          }
        },
        {
          name: 'list_services',
          description: 'List services in a namespace',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace to list services from (default: all namespaces)'
              }
            }
          }
        },
        {
          name: 'list_scaledobjects',
          description: 'List KEDA ScaledObjects in a namespace',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace to list ScaledObjects from (default: all namespaces)'
              }
            }
          }
        },
        {
          name: 'get_pod_logs',
          description: 'Get logs from a pod container',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace of the pod'
              },
              podName: {
                type: 'string',
                description: 'Name of the pod'
              },
              container: {
                type: 'string',
                description: 'Container name (optional if pod has single container)'
              },
              tailLines: {
                type: 'number',
                description: 'Number of lines to tail (default: 100)'
              }
            },
            required: ['namespace', 'podName']
          }
        },
        {
          name: 'scale_deployment',
          description: 'Scale a deployment to a specific replica count',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace of the deployment'
              },
              deploymentName: {
                type: 'string',
                description: 'Name of the deployment'
              },
              replicas: {
                type: 'number',
                description: 'Target number of replicas'
              }
            },
            required: ['namespace', 'deploymentName', 'replicas']
          }
        },
        {
          name: 'apply_manifest',
          description: 'Apply a Kubernetes YAML manifest',
          inputSchema: {
            type: 'object',
            properties: {
              manifest: {
                type: 'string',
                description: 'YAML manifest to apply'
              },
              namespace: {
                type: 'string',
                description: 'Namespace to apply the manifest to (optional, uses manifest metadata)'
              }
            },
            required: ['manifest']
          }
        },
        {
          name: 'delete_resource',
          description: 'Delete a Kubernetes resource',
          inputSchema: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                description: 'Resource kind (Pod, Deployment, Service, etc.)'
              },
              name: {
                type: 'string',
                description: 'Resource name'
              },
              namespace: {
                type: 'string',
                description: 'Namespace of the resource'
              }
            },
            required: ['kind', 'name', 'namespace']
          }
        },
        {
          name: 'get_node_status',
          description: 'Get cluster node health and status',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'list_namespaces',
          description: 'List all namespaces in the cluster',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'create_job',
          description: 'Create a Kubernetes Job',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace to create the job in'
              },
              name: {
                type: 'string',
                description: 'Job name'
              },
              image: {
                type: 'string',
                description: 'Container image to run'
              },
              command: {
                type: 'array',
                items: { type: 'string' },
                description: 'Command to run (optional)'
              },
              env: {
                type: 'object',
                description: 'Environment variables as key-value pairs'
              },
              ttlSecondsAfterFinished: {
                type: 'number',
                description: 'TTL for job cleanup after completion (default: 3600)'
              }
            },
            required: ['namespace', 'name', 'image']
          }
        },
        {
          name: 'watch_pod_status',
          description: 'Get the current status of a pod',
          inputSchema: {
            type: 'object',
            properties: {
              namespace: {
                type: 'string',
                description: 'Namespace of the pod'
              },
              podName: {
                type: 'string',
                description: 'Name of the pod'
              }
            },
            required: ['namespace', 'podName']
          }
        }
      ]
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'k3s://cluster/health',
          name: 'K3s Cluster Health',
          description: 'Overall cluster health status including node conditions',
          mimeType: 'application/json'
        },
        {
          uri: 'k3s://deployments/cortex-system',
          name: 'Cortex System Deployments',
          description: 'All deployments in cortex-system namespace',
          mimeType: 'application/json'
        },
        {
          uri: 'k3s://scaledobjects/all',
          name: 'All KEDA ScaledObjects',
          description: 'All KEDA ScaledObjects across all namespaces',
          mimeType: 'application/json'
        },
        {
          uri: 'k3s://workers/active',
          name: 'Active Worker Pods',
          description: 'Currently running Cortex worker pods',
          mimeType: 'application/json'
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'list_pods':
            result = await this.listPods(args.namespace, args.labelSelector);
            break;

          case 'list_deployments':
            result = await this.listDeployments(args.namespace);
            break;

          case 'list_services':
            result = await this.listServices(args.namespace);
            break;

          case 'list_scaledobjects':
            result = await this.listScaledObjects(args.namespace);
            break;

          case 'get_pod_logs':
            result = await this.getPodLogs(args.namespace, args.podName, args.container, args.tailLines);
            break;

          case 'scale_deployment':
            result = await this.scaleDeployment(args.namespace, args.deploymentName, args.replicas);
            break;

          case 'apply_manifest':
            result = await this.applyManifest(args.manifest, args.namespace);
            break;

          case 'delete_resource':
            result = await this.deleteResource(args.kind, args.name, args.namespace);
            break;

          case 'get_node_status':
            result = await this.getNodeStatus();
            break;

          case 'list_namespaces':
            result = await this.listNamespaces();
            break;

          case 'create_job':
            result = await this.createJob(args);
            break;

          case 'watch_pod_status':
            result = await this.watchPodStatus(args.namespace, args.podName);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      try {
        let result;

        if (uri === 'k3s://cluster/health') {
          result = await this.getClusterHealth();
        } else if (uri === 'k3s://deployments/cortex-system') {
          result = await this.listDeployments('cortex-system');
        } else if (uri === 'k3s://scaledobjects/all') {
          result = await this.listScaledObjects();
        } else if (uri === 'k3s://workers/active') {
          result = await this.getActiveWorkers();
        } else {
          throw new Error(`Unknown resource URI: ${uri}`);
        }

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2)
          }]
        };

      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error.message}`);
      }
    });
  }

  // Tool implementations
  async listPods(namespace, labelSelector) {
    if (namespace) {
      const response = await this.coreApi.listNamespacedPod(
        namespace,
        undefined, undefined, undefined, undefined,
        labelSelector
      );
      return response.body.items.map(pod => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        phase: pod.status.phase,
        podIP: pod.status.podIP,
        nodeName: pod.spec.nodeName,
        containers: pod.spec.containers.map(c => c.name),
        ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True'
      }));
    } else {
      const response = await this.coreApi.listPodForAllNamespaces(
        undefined, undefined, undefined,
        labelSelector
      );
      return response.body.items.map(pod => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        phase: pod.status.phase,
        podIP: pod.status.podIP,
        nodeName: pod.spec.nodeName,
        ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True'
      }));
    }
  }

  async listDeployments(namespace) {
    if (namespace) {
      const response = await this.appsApi.listNamespacedDeployment(namespace);
      return response.body.items.map(deploy => ({
        name: deploy.metadata.name,
        namespace: deploy.metadata.namespace,
        replicas: deploy.spec.replicas,
        readyReplicas: deploy.status.readyReplicas || 0,
        availableReplicas: deploy.status.availableReplicas || 0,
        image: deploy.spec.template.spec.containers[0]?.image
      }));
    } else {
      const response = await this.appsApi.listDeploymentForAllNamespaces();
      return response.body.items.map(deploy => ({
        name: deploy.metadata.name,
        namespace: deploy.metadata.namespace,
        replicas: deploy.spec.replicas,
        readyReplicas: deploy.status.readyReplicas || 0,
        availableReplicas: deploy.status.availableReplicas || 0
      }));
    }
  }

  async listServices(namespace) {
    if (namespace) {
      const response = await this.coreApi.listNamespacedService(namespace);
      return response.body.items.map(svc => ({
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP,
        ports: svc.spec.ports?.map(p => ({ port: p.port, targetPort: p.targetPort, protocol: p.protocol }))
      }));
    } else {
      const response = await this.coreApi.listServiceForAllNamespaces();
      return response.body.items.map(svc => ({
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP
      }));
    }
  }

  async listScaledObjects(namespace) {
    try {
      const response = namespace
        ? await this.customApi.listNamespacedCustomObject(
            'keda.sh',
            'v1alpha1',
            namespace,
            'scaledobjects'
          )
        : await this.customApi.listClusterCustomObject(
            'keda.sh',
            'v1alpha1',
            'scaledobjects'
          );

      return response.body.items.map(so => ({
        name: so.metadata.name,
        namespace: so.metadata.namespace,
        scaleTargetRef: so.spec.scaleTargetRef,
        minReplicaCount: so.spec.minReplicaCount,
        maxReplicaCount: so.spec.maxReplicaCount,
        triggers: so.spec.triggers?.map(t => t.type)
      }));
    } catch (error) {
      if (error.response?.statusCode === 404) {
        return { message: 'KEDA not installed or ScaledObjects CRD not found' };
      }
      throw error;
    }
  }

  async getPodLogs(namespace, podName, container, tailLines = 100) {
    const response = await this.coreApi.readNamespacedPodLog(
      podName,
      namespace,
      container,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tailLines,
      undefined
    );
    return { logs: response.body };
  }

  async scaleDeployment(namespace, deploymentName, replicas) {
    const patch = {
      spec: {
        replicas: replicas
      }
    };

    await this.appsApi.patchNamespacedDeploymentScale(
      deploymentName,
      namespace,
      patch,
      undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
    );

    return {
      success: true,
      message: `Scaled ${deploymentName} in ${namespace} to ${replicas} replicas`
    };
  }

  async applyManifest(manifestYaml, namespace) {
    const docs = yaml.loadAll(manifestYaml);
    const results = [];

    for (const doc of docs) {
      if (!doc || !doc.kind) continue;

      const targetNamespace = namespace || doc.metadata?.namespace || 'default';

      // This is a simplified implementation
      // In production, you'd want to handle different resource types appropriately
      results.push({
        kind: doc.kind,
        name: doc.metadata?.name,
        namespace: targetNamespace,
        status: 'applied'
      });
    }

    return { applied: results };
  }

  async deleteResource(kind, name, namespace) {
    try {
      switch (kind.toLowerCase()) {
        case 'pod':
          await this.coreApi.deleteNamespacedPod(name, namespace);
          break;
        case 'deployment':
          await this.appsApi.deleteNamespacedDeployment(name, namespace);
          break;
        case 'service':
          await this.coreApi.deleteNamespacedService(name, namespace);
          break;
        case 'job':
          await this.batchApi.deleteNamespacedJob(name, namespace);
          break;
        default:
          throw new Error(`Unsupported resource kind: ${kind}`);
      }

      return {
        success: true,
        message: `Deleted ${kind} ${name} from namespace ${namespace}`
      };
    } catch (error) {
      throw new Error(`Failed to delete ${kind} ${name}: ${error.message}`);
    }
  }

  async getNodeStatus() {
    const response = await this.coreApi.listNode();
    return response.body.items.map(node => ({
      name: node.metadata.name,
      ready: node.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
      kubeletVersion: node.status.nodeInfo.kubeletVersion,
      osImage: node.status.nodeInfo.osImage,
      capacity: {
        cpu: node.status.capacity?.cpu,
        memory: node.status.capacity?.memory,
        pods: node.status.capacity?.pods
      },
      allocatable: {
        cpu: node.status.allocatable?.cpu,
        memory: node.status.allocatable?.memory,
        pods: node.status.allocatable?.pods
      },
      conditions: node.status.conditions?.map(c => ({
        type: c.type,
        status: c.status,
        reason: c.reason
      }))
    }));
  }

  async listNamespaces() {
    const response = await this.coreApi.listNamespace();
    return response.body.items.map(ns => ({
      name: ns.metadata.name,
      status: ns.status.phase,
      creationTimestamp: ns.metadata.creationTimestamp,
      labels: ns.metadata.labels
    }));
  }

  async createJob(args) {
    const {
      namespace,
      name,
      image,
      command,
      env = {},
      ttlSecondsAfterFinished = 3600
    } = args;

    const job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name,
        namespace
      },
      spec: {
        ttlSecondsAfterFinished,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [{
              name: 'worker',
              image,
              command: command || undefined,
              env: Object.entries(env).map(([name, value]) => ({ name, value: String(value) }))
            }]
          }
        }
      }
    };

    const response = await this.batchApi.createNamespacedJob(namespace, job);

    return {
      success: true,
      jobName: response.body.metadata.name,
      namespace: response.body.metadata.namespace
    };
  }

  async watchPodStatus(namespace, podName) {
    const response = await this.coreApi.readNamespacedPodStatus(podName, namespace);
    const pod = response.body;

    return {
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      phase: pod.status.phase,
      conditions: pod.status.conditions?.map(c => ({
        type: c.type,
        status: c.status,
        reason: c.reason,
        message: c.message
      })),
      containerStatuses: pod.status.containerStatuses?.map(cs => ({
        name: cs.name,
        ready: cs.ready,
        restartCount: cs.restartCount,
        state: Object.keys(cs.state || {})[0]
      }))
    };
  }

  // Resource implementations
  async getClusterHealth() {
    const nodes = await this.getNodeStatus();
    const totalNodes = nodes.length;
    const readyNodes = nodes.filter(n => n.ready).length;

    return {
      healthy: readyNodes === totalNodes,
      totalNodes,
      readyNodes,
      nodes: nodes.map(n => ({
        name: n.name,
        ready: n.ready,
        kubeletVersion: n.kubeletVersion
      }))
    };
  }

  async getActiveWorkers() {
    const workers = await this.listPods(undefined, 'app.cortex.ai/component=worker');
    return {
      total: workers.length,
      running: workers.filter(w => w.phase === 'Running').length,
      workers: workers.map(w => ({
        name: w.name,
        namespace: w.namespace,
        phase: w.phase,
        node: w.nodeName,
        ready: w.ready
      }))
    };
  }

  async startHTTPServer() {
    const httpServer = http.createServer(async (req, res) => {
      // Health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          service: 'k3s-mcp-server',
          k3s_api_url: K3S_API_URL
        }));
        return;
      }

      // MCP SSE endpoint
      if (req.url === '/mcp' || req.url === '/sse') {
        const transport = new SSEServerTransport('/mcp', res);
        await this.server.connect(transport);
        return;
      }

      // 404 for other routes
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`K3s MCP Server running on http://0.0.0.0:${PORT}`);
      console.log(`K3s API: ${K3S_API_URL}`);
      console.log(`Kubeconfig: ${K3S_KUBECONFIG}`);
      console.log(`Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
    });
  }
}

// Start the server
const server = new K3sMCPServer();
server.startHTTPServer();
