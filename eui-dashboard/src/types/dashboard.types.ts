// Agent and Worker Types
export interface WorkerStatus {
  id: string;
  type: string;
  status: 'idle' | 'active' | 'completed' | 'failed';
  master: string;
  taskId?: string;
  spawnedAt: string;
  completedAt?: string;
  performance?: {
    tokensUsed: number;
    duration: number;
  };
}

export interface MasterStatus {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'busy';
  workload: number;
  allocated: number;
  used: number;
  tasksHandled: number;
}

// MoE Routing Types
export interface MoEDecision {
  id: string;
  timestamp: string;
  taskId: string;
  taskDescription: string;
  selectedExpert: string;
  confidence: number;
  alternatives: Array<{
    expert: string;
    score: number;
  }>;
  rationale?: string;
  outcome?: 'success' | 'failure' | 'pending';
}

// Task Types
export interface Task {
  id: string;
  title: string;
  type: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: string;
  assignedTo?: string;
  completedAt?: string;
  error?: string;
}

export interface TaskMetrics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// Token Budget Types
export interface TokenBudget {
  total: number;
  used: number;
  available: number;
  usagePercentage: number;
  mastersUsed: number;
  mastersAllocated: number;
  workersUsed: number;
  workersAllocated: number;
  efficiency: number;
}

// System Health Types
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  daemons: {
    [key: string]: {
      status: 'running' | 'stopped' | 'error';
      pid?: number;
      uptime?: number;
    };
  };
}

// Dashboard Metrics
export interface DashboardMetrics {
  workers: {
    active: number;
    completed: number;
    failed: number;
    total: number;
    successRate: number;
  };
  tokens: TokenBudget;
  tasks: TaskMetrics;
  masters: {
    [key: string]: MasterStatus;
  };
  timestamp: string;
}

// Event Types
export interface DashboardEvent {
  id: string;
  type: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

// Filter Types
export interface DashboardFilters {
  timeRange: {
    start: string;
    end: string;
  };
  status?: string[];
  masters?: string[];
  workers?: string[];
  search?: string;
}
