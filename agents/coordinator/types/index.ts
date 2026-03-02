/**
 * Coordinator Agent Type Definitions
 * Based on GM Decision Engine specification
 */

export interface Task {
  task_id: string;
  task_name: string;
  description: string;
  domain: TaskDomain;
  priority: Priority;
  complexity?: ComplexityScore;
  created_at: string;
  deadline?: string;
  requester: string;
  metadata?: Record<string, any>;
}

export type TaskDomain =
  | 'vm_provisioning'
  | 'network_configuration'
  | 'dns_management'
  | 'kubernetes_cluster'
  | 'k8s_workloads'
  | 'workflow_automation'
  | 'integration_design'
  | 'multi_system_orchestration';

export type Priority = 'p0_critical' | 'p1_high' | 'p2_medium' | 'p3_low';

export type ContractorType =
  | 'infrastructure-contractor'
  | 'talos-contractor'
  | 'n8n-contractor'
  | 'security-contractor'
  | 'configuration-contractor';

export interface ComplexityScore {
  final_score: number;
  classification: ComplexityClassification;
  dimensions: {
    technical_complexity: number;
    integration_points: number;
    unknowns_ambiguity: number;
    risk_level: number;
    dependencies: number;
  };
  estimated_time_hours: number;
  estimated_tokens: number;
  contractor_count: number;
  requires_escalation: boolean;
}

export type ComplexityClassification =
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'very_complex'
  | 'extremely_complex';

export interface ContractorHealth {
  contractor_id: ContractorType;
  health: 'healthy' | 'degraded' | 'unhealthy';
  current_load: {
    active_tasks: number;
    capacity: number;
    utilization: number;
    tokens_allocated: number;
    tokens_remaining: number;
  };
  performance_metrics: {
    avg_response_time: string;
    success_rate: number;
    sla_compliance: number;
  };
  availability: 'available' | 'busy' | 'overloaded';
}

export interface PriorityQueueItem {
  task: Task;
  priority_score: number;
  wait_time_ms: number;
  contractor?: ContractorType;
  enqueued_at: string;
}

export interface PriorityQueue {
  p0_critical: PriorityQueueItem[];
  p1_high: PriorityQueueItem[];
  p2_medium: PriorityQueueItem[];
  p3_low: PriorityQueueItem[];
}

export interface RoutingDecision {
  task_id: string;
  contractor: ContractorType;
  backup_contractor?: ContractorType;
  complexity_score: ComplexityScore;
  priority: Priority;
  action: 'assign' | 'queue' | 'escalate';
  reason: string;
  estimated_start_time?: string;
}

export interface PriorityScoring {
  impact: number;
  urgency: number;
  business_value: number;
  risk: number;
  final_score: number;
  priority_level: Priority;
}

export interface Handoff {
  handoff_id: string;
  from_division: string;
  to_division: string;
  handoff_type: 'resource_request' | 'task_delegation' | 'status_update' | 'escalation';
  priority: Priority;
  created_at: string;
  context: {
    summary: string;
    details: Record<string, any>;
    requirements: string[];
    acceptance_criteria: string[];
    deadline?: string;
  };
  status: 'pending' | 'acknowledged' | 'in_progress' | 'completed' | 'blocked';
}

export interface CoordinatorConfig {
  divisions: {
    [key: string]: {
      daily_tokens: number;
      emergency_reserve_percentage: number;
    };
  };
  contractors: {
    [key in ContractorType]: {
      max_concurrent_tasks: number;
      max_token_budget: number;
      max_session_hours: number;
    };
  };
  sla: {
    [key in Priority]: {
      response_sla_minutes: number;
    };
  };
  load_balancing: {
    available_threshold: number;
    busy_threshold: number;
    overloaded_threshold: number;
  };
}

export interface ProjectRequest {
  project_id?: string;
  objective: string;
  requirements: string[];
  constraints?: Record<string, any>;
  success_criteria: string[];
  priority: Priority;
  estimated_complexity?: number;
  deadline?: string;
  requester: string;
}

export interface PMSpawnRequest {
  pm_id: string;
  project_id: string;
  project_objective: string;
  estimated_complexity: number;
  token_budget: number;
  divisions_involved: string[];
  created_at: string;
  state: 'spawning' | 'active' | 'completed' | 'failed';
}

export interface CoordinatorState {
  active_tasks: Map<string, Task>;
  queues: PriorityQueue;
  contractor_health: Map<ContractorType, ContractorHealth>;
  active_projects: Map<string, PMSpawnRequest>;
  metrics: {
    tasks_routed_today: number;
    avg_routing_time_ms: number;
    escalations_today: number;
    queue_depth_avg: number;
  };
  last_updated: string;
}
