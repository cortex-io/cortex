"""
Resource Allocation Manager
Handles resource allocation, tracking, and lifecycle management for cortex jobs.
"""

import uuid
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum


class AllocationState(str, Enum):
    """Allocation lifecycle states"""
    PENDING = "pending"
    ACTIVE = "active"
    RELEASING = "releasing"
    RELEASED = "released"
    FAILED = "failed"


class Priority(str, Enum):
    """Job priority levels"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class WorkerSpec:
    """Worker specification"""
    worker_id: str
    worker_type: str
    cpu: float
    memory: int  # MB
    status: str = "pending"
    endpoint: Optional[str] = None


@dataclass
class MCPServerSpec:
    """MCP Server specification"""
    server_name: str
    endpoint: Optional[str] = None
    status: str = "pending"
    port: Optional[int] = None


@dataclass
class ResourceAllocation:
    """Resource allocation record"""
    allocation_id: str
    job_id: str
    state: AllocationState
    priority: Priority

    # Requested resources
    mcp_servers: List[str]
    workers_requested: Optional[int] = None

    # Allocated resources
    mcp_server_specs: List[MCPServerSpec] = field(default_factory=list)
    workers_allocated: List[WorkerSpec] = field(default_factory=list)

    # Resource usage
    cpu_allocated: float = 0.0
    memory_allocated: int = 0  # MB

    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    activated_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    ttl_seconds: int = 3600  # 1 hour default

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_expired(self) -> bool:
        """Check if allocation has exceeded TTL"""
        if self.state in [AllocationState.RELEASED, AllocationState.FAILED]:
            return False

        reference_time = self.activated_at or self.created_at
        expiry_time = reference_time + timedelta(seconds=self.ttl_seconds)
        return datetime.utcnow() > expiry_time

    def age_seconds(self) -> float:
        """Get allocation age in seconds"""
        return (datetime.utcnow() - self.created_at).total_seconds()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        # Convert enums to strings
        data['state'] = self.state.value
        data['priority'] = self.priority.value
        # Convert datetime objects
        data['created_at'] = self.created_at.isoformat()
        data['activated_at'] = self.activated_at.isoformat() if self.activated_at else None
        data['released_at'] = self.released_at.isoformat() if self.released_at else None
        return data


@dataclass
class ClusterCapacity:
    """Cluster resource capacity"""
    total_cpu: float
    total_memory: int  # MB
    total_workers: int

    allocated_cpu: float = 0.0
    allocated_memory: int = 0
    allocated_workers: int = 0

    running_mcp_servers: List[str] = field(default_factory=list)
    active_allocations: int = 0

    @property
    def available_cpu(self) -> float:
        return self.total_cpu - self.allocated_cpu

    @property
    def available_memory(self) -> int:
        return self.total_memory - self.allocated_memory

    @property
    def available_workers(self) -> int:
        return self.total_workers - self.allocated_workers

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'total_cpu': self.total_cpu,
            'total_memory': self.total_memory,
            'total_workers': self.total_workers,
            'allocated_cpu': self.allocated_cpu,
            'allocated_memory': self.allocated_memory,
            'allocated_workers': self.allocated_workers,
            'available_cpu': self.available_cpu,
            'available_memory': self.available_memory,
            'available_workers': self.available_workers,
            'running_mcp_servers': self.running_mcp_servers,
            'active_allocations': self.active_allocations
        }


class AllocationManager:
    """Manages resource allocations and cluster capacity"""

    def __init__(
        self,
        total_cpu: float = 16.0,
        total_memory: int = 32768,  # 32GB
        total_workers: int = 10
    ):
        self.capacity = ClusterCapacity(
            total_cpu=total_cpu,
            total_memory=total_memory,
            total_workers=total_workers
        )
        self.allocations: Dict[str, ResourceAllocation] = {}
        self.mcp_server_registry: Dict[str, MCPServerSpec] = {}

        # Configuration
        self.worker_cpu = 1.0  # CPU per worker
        self.worker_memory = 2048  # MB per worker
        self.mcp_server_ports = list(range(9000, 9100))  # Port pool
        self.next_port_idx = 0

    def _allocate_port(self) -> int:
        """Allocate next available port"""
        port = self.mcp_server_ports[self.next_port_idx]
        self.next_port_idx = (self.next_port_idx + 1) % len(self.mcp_server_ports)
        return port

    def _start_mcp_server(self, server_name: str) -> MCPServerSpec:
        """Start or reuse MCP server"""
        # Check if server already running
        if server_name in self.mcp_server_registry:
            spec = self.mcp_server_registry[server_name]
            if spec.status == "running":
                return spec

        # Allocate new server
        port = self._allocate_port()
        spec = MCPServerSpec(
            server_name=server_name,
            endpoint=f"http://localhost:{port}",
            status="running",
            port=port
        )
        self.mcp_server_registry[server_name] = spec

        # Add to capacity tracking
        if server_name not in self.capacity.running_mcp_servers:
            self.capacity.running_mcp_servers.append(server_name)

        return spec

    def _provision_workers(self, count: int, job_id: str) -> List[WorkerSpec]:
        """Provision workers for job"""
        workers = []
        for i in range(count):
            worker_id = f"worker-{job_id}-{i:03d}"
            worker = WorkerSpec(
                worker_id=worker_id,
                worker_type="cortex-worker",
                cpu=self.worker_cpu,
                memory=self.worker_memory,
                status="active",
                endpoint=f"http://localhost:{8000 + len(self.allocations) * 10 + i}"
            )
            workers.append(worker)
        return workers

    def _check_capacity(self, workers_count: int) -> tuple[bool, Optional[str]]:
        """Check if resources are available"""
        if workers_count > self.capacity.available_workers:
            return False, f"Insufficient workers: requested {workers_count}, available {self.capacity.available_workers}"

        cpu_needed = workers_count * self.worker_cpu
        if cpu_needed > self.capacity.available_cpu:
            return False, f"Insufficient CPU: needed {cpu_needed}, available {self.capacity.available_cpu}"

        memory_needed = workers_count * self.worker_memory
        if memory_needed > self.capacity.available_memory:
            return False, f"Insufficient memory: needed {memory_needed}MB, available {self.capacity.available_memory}MB"

        return True, None

    def request_resources(
        self,
        job_id: str,
        mcp_servers: List[str],
        workers: Optional[int] = None,
        priority: str = "normal",
        ttl_seconds: int = 3600,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Request resources for a job.

        Args:
            job_id: Unique job identifier
            mcp_servers: List of MCP server names to start
            workers: Number of workers to provision (optional)
            priority: Job priority (low, normal, high, critical)
            ttl_seconds: Time-to-live for allocation
            metadata: Additional metadata

        Returns:
            Dict with allocation details
        """
        allocation_id = f"alloc-{uuid.uuid4().hex[:12]}"

        # Validate priority
        try:
            priority_enum = Priority(priority)
        except ValueError:
            priority_enum = Priority.NORMAL

        # Create allocation
        allocation = ResourceAllocation(
            allocation_id=allocation_id,
            job_id=job_id,
            state=AllocationState.PENDING,
            priority=priority_enum,
            mcp_servers=mcp_servers,
            workers_requested=workers,
            ttl_seconds=ttl_seconds,
            metadata=metadata or {}
        )

        try:
            # Check capacity if workers requested
            if workers and workers > 0:
                can_allocate, error_msg = self._check_capacity(workers)
                if not can_allocate:
                    allocation.state = AllocationState.FAILED
                    allocation.metadata['error'] = error_msg
                    self.allocations[allocation_id] = allocation
                    return {
                        'allocation_id': allocation_id,
                        'status': 'failed',
                        'error': error_msg
                    }

            # Start MCP servers
            for server_name in mcp_servers:
                server_spec = self._start_mcp_server(server_name)
                allocation.mcp_server_specs.append(server_spec)

            # Provision workers if requested
            if workers and workers > 0:
                worker_specs = self._provision_workers(workers, job_id)
                allocation.workers_allocated = worker_specs
                allocation.cpu_allocated = workers * self.worker_cpu
                allocation.memory_allocated = workers * self.worker_memory

                # Update capacity
                self.capacity.allocated_workers += workers
                self.capacity.allocated_cpu += allocation.cpu_allocated
                self.capacity.allocated_memory += allocation.memory_allocated

            # Activate allocation
            allocation.state = AllocationState.ACTIVE
            allocation.activated_at = datetime.utcnow()
            self.capacity.active_allocations += 1

            # Store allocation
            self.allocations[allocation_id] = allocation

            return {
                'allocation_id': allocation_id,
                'status': 'active',
                'job_id': job_id,
                'mcp_servers': [
                    {
                        'name': spec.server_name,
                        'endpoint': spec.endpoint,
                        'status': spec.status
                    }
                    for spec in allocation.mcp_server_specs
                ],
                'workers_allocated': [
                    {
                        'worker_id': w.worker_id,
                        'endpoint': w.endpoint,
                        'cpu': w.cpu,
                        'memory': w.memory
                    }
                    for w in allocation.workers_allocated
                ],
                'resources': {
                    'cpu': allocation.cpu_allocated,
                    'memory': allocation.memory_allocated,
                    'workers': len(allocation.workers_allocated)
                },
                'ttl_seconds': ttl_seconds,
                'created_at': allocation.created_at.isoformat()
            }

        except Exception as e:
            allocation.state = AllocationState.FAILED
            allocation.metadata['error'] = str(e)
            self.allocations[allocation_id] = allocation
            return {
                'allocation_id': allocation_id,
                'status': 'failed',
                'error': str(e)
            }

    def release_resources(self, allocation_id: str) -> Dict[str, Any]:
        """
        Release resources for an allocation.

        Args:
            allocation_id: Allocation identifier

        Returns:
            Dict with release status
        """
        if allocation_id not in self.allocations:
            return {
                'status': 'error',
                'error': f'Allocation {allocation_id} not found'
            }

        allocation = self.allocations[allocation_id]

        if allocation.state in [AllocationState.RELEASED, AllocationState.RELEASING]:
            return {
                'status': 'already_released',
                'allocation_id': allocation_id,
                'released_at': allocation.released_at.isoformat() if allocation.released_at else None
            }

        # Mark as releasing
        allocation.state = AllocationState.RELEASING

        try:
            # Release workers
            workers_released = len(allocation.workers_allocated)
            if workers_released > 0:
                self.capacity.allocated_workers -= workers_released
                self.capacity.allocated_cpu -= allocation.cpu_allocated
                self.capacity.allocated_memory -= allocation.memory_allocated

            # Mark workers for destruction (simulate queuing)
            for worker in allocation.workers_allocated:
                worker.status = "destroying"

            # MCP servers remain running (idle timeout will handle them)
            # In production, you'd mark them for scale-down after idle period

            # Mark as released
            allocation.state = AllocationState.RELEASED
            allocation.released_at = datetime.utcnow()
            self.capacity.active_allocations -= 1

            return {
                'status': 'released',
                'allocation_id': allocation_id,
                'job_id': allocation.job_id,
                'workers_released': workers_released,
                'cpu_freed': allocation.cpu_allocated,
                'memory_freed': allocation.memory_allocated,
                'released_at': allocation.released_at.isoformat(),
                'duration_seconds': allocation.age_seconds()
            }

        except Exception as e:
            allocation.state = AllocationState.FAILED
            allocation.metadata['release_error'] = str(e)
            return {
                'status': 'error',
                'error': str(e)
            }

    def get_capacity(self) -> Dict[str, Any]:
        """
        Get current cluster capacity and utilization.

        Returns:
            Dict with capacity information
        """
        return self.capacity.to_dict()

    def get_allocation(self, allocation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get details of a specific allocation.

        Args:
            allocation_id: Allocation identifier

        Returns:
            Dict with allocation details or None if not found
        """
        if allocation_id not in self.allocations:
            return None

        allocation = self.allocations[allocation_id]

        return {
            'allocation_id': allocation.allocation_id,
            'job_id': allocation.job_id,
            'state': allocation.state.value,
            'priority': allocation.priority.value,
            'resources': {
                'cpu_allocated': allocation.cpu_allocated,
                'memory_allocated': allocation.memory_allocated,
                'workers': len(allocation.workers_allocated)
            },
            'mcp_servers': [
                {
                    'name': spec.server_name,
                    'endpoint': spec.endpoint,
                    'status': spec.status
                }
                for spec in allocation.mcp_server_specs
            ],
            'workers': [
                {
                    'worker_id': w.worker_id,
                    'endpoint': w.endpoint,
                    'status': w.status,
                    'cpu': w.cpu,
                    'memory': w.memory
                }
                for w in allocation.workers_allocated
            ],
            'timestamps': {
                'created_at': allocation.created_at.isoformat(),
                'activated_at': allocation.activated_at.isoformat() if allocation.activated_at else None,
                'released_at': allocation.released_at.isoformat() if allocation.released_at else None,
                'age_seconds': allocation.age_seconds()
            },
            'ttl_seconds': allocation.ttl_seconds,
            'is_expired': allocation.is_expired(),
            'metadata': allocation.metadata
        }

    def cleanup_expired_allocations(self) -> List[str]:
        """
        Clean up expired allocations.

        Returns:
            List of cleaned up allocation IDs
        """
        expired = []
        for allocation_id, allocation in list(self.allocations.items()):
            if allocation.is_expired() and allocation.state == AllocationState.ACTIVE:
                self.release_resources(allocation_id)
                expired.append(allocation_id)
        return expired

    def list_allocations(
        self,
        state: Optional[str] = None,
        job_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List allocations with optional filtering.

        Args:
            state: Filter by allocation state
            job_id: Filter by job ID

        Returns:
            List of allocation summaries
        """
        results = []
        for allocation_id, allocation in self.allocations.items():
            # Apply filters
            if state and allocation.state.value != state:
                continue
            if job_id and allocation.job_id != job_id:
                continue

            results.append({
                'allocation_id': allocation_id,
                'job_id': allocation.job_id,
                'state': allocation.state.value,
                'priority': allocation.priority.value,
                'workers': len(allocation.workers_allocated),
                'age_seconds': allocation.age_seconds(),
                'is_expired': allocation.is_expired()
            })

        return results
