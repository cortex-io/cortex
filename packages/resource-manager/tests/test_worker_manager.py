"""
Unit tests for Worker Manager

Tests the worker management functionality including listing, provisioning,
draining, and destroying workers.
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))

from worker_manager import (
    WorkerManager,
    WorkerManagerError,
    WorkerType,
    WorkerStatus,
    WORKER_SIZES
)


@pytest.fixture
def worker_manager():
    """Create a WorkerManager instance for testing"""
    config = {
        "talos_mcp_endpoint": "test://talos",
        "proxmox_mcp_endpoint": "test://proxmox",
        "kubectl_context": "test-context"
    }
    return WorkerManager(config)


@pytest.fixture
def mock_kubectl_nodes():
    """Mock kubectl get nodes output"""
    return {
        "items": [
            {
                "metadata": {
                    "name": "permanent-worker-1",
                    "labels": {"kubernetes.io/hostname": "permanent-worker-1"},
                    "annotations": {},
                    "creationTimestamp": "2023-01-01T00:00:00Z"
                },
                "spec": {},
                "status": {
                    "conditions": [
                        {"type": "Ready", "status": "True"}
                    ],
                    "capacity": {
                        "cpu": "4",
                        "memory": "8Gi",
                        "pods": "110"
                    },
                    "allocatable": {
                        "cpu": "3800m",
                        "memory": "7Gi",
                        "pods": "110"
                    }
                }
            },
            {
                "metadata": {
                    "name": "burst-worker-1",
                    "labels": {
                        "worker-type": "burst",
                        "kubernetes.io/hostname": "burst-worker-1"
                    },
                    "annotations": {
                        "worker-ttl": "2024-01-02T00:00:00Z"
                    },
                    "creationTimestamp": "2024-01-01T00:00:00Z"
                },
                "spec": {},
                "status": {
                    "conditions": [
                        {"type": "Ready", "status": "True"}
                    ],
                    "capacity": {
                        "cpu": "4",
                        "memory": "8Gi",
                        "pods": "110"
                    },
                    "allocatable": {
                        "cpu": "3800m",
                        "memory": "7Gi",
                        "pods": "110"
                    }
                }
            }
        ]
    }


class TestWorkerManager:
    """Test suite for WorkerManager"""

    def test_init(self, worker_manager):
        """Test WorkerManager initialization"""
        assert worker_manager.talos_mcp_endpoint == "test://talos"
        assert worker_manager.proxmox_mcp_endpoint == "test://proxmox"
        assert worker_manager.kubectl_context == "test-context"

    @patch('worker_manager.subprocess.run')
    def test_list_workers(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test listing all workers"""
        # Mock kubectl get nodes
        mock_run.return_value = Mock(
            stdout=json.dumps(mock_kubectl_nodes),
            returncode=0
        )

        workers = worker_manager.list_workers()

        assert len(workers) == 2
        assert workers[0]['name'] == "permanent-worker-1"
        assert workers[0]['type'] == WorkerType.PERMANENT.value
        assert workers[1]['name'] == "burst-worker-1"
        assert workers[1]['type'] == WorkerType.BURST.value
        assert 'ttl_expires' in workers[1]

    @patch('worker_manager.subprocess.run')
    def test_list_workers_with_filter(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test listing workers with type filter"""
        mock_run.return_value = Mock(
            stdout=json.dumps(mock_kubectl_nodes),
            returncode=0
        )

        # Filter for burst workers only
        burst_workers = worker_manager.list_workers(type_filter="burst")
        assert len(burst_workers) == 1
        assert burst_workers[0]['type'] == WorkerType.BURST.value

        # Filter for permanent workers only
        permanent_workers = worker_manager.list_workers(type_filter="permanent")
        assert len(permanent_workers) == 1
        assert permanent_workers[0]['type'] == WorkerType.PERMANENT.value

    def test_get_node_type_burst(self, worker_manager):
        """Test identifying burst worker type"""
        node = {
            "metadata": {
                "labels": {"worker-type": "burst"}
            }
        }
        assert worker_manager._get_node_type(node) == WorkerType.BURST

    def test_get_node_type_permanent(self, worker_manager):
        """Test identifying permanent worker type"""
        node = {
            "metadata": {
                "labels": {}
            }
        }
        assert worker_manager._get_node_type(node) == WorkerType.PERMANENT

    def test_get_node_status_ready(self, worker_manager):
        """Test node status detection - ready"""
        node = {
            "spec": {},
            "status": {
                "conditions": [
                    {"type": "Ready", "status": "True"}
                ]
            }
        }
        assert worker_manager._get_node_status(node) == WorkerStatus.READY

    def test_get_node_status_draining(self, worker_manager):
        """Test node status detection - draining"""
        node = {
            "spec": {"unschedulable": True},
            "status": {
                "conditions": [
                    {"type": "Ready", "status": "True"}
                ]
            }
        }
        assert worker_manager._get_node_status(node) == WorkerStatus.DRAINING

    def test_provision_workers_validation(self, worker_manager):
        """Test provision_workers input validation"""
        # Test invalid count
        with pytest.raises(WorkerManagerError, match="Worker count must be between 1 and 10"):
            worker_manager.provision_workers(count=0, ttl=24)

        with pytest.raises(WorkerManagerError, match="Worker count must be between 1 and 10"):
            worker_manager.provision_workers(count=11, ttl=24)

        # Test invalid TTL
        with pytest.raises(WorkerManagerError, match="TTL must be between 1 and 168 hours"):
            worker_manager.provision_workers(count=1, ttl=0)

        with pytest.raises(WorkerManagerError, match="TTL must be between 1 and 168 hours"):
            worker_manager.provision_workers(count=1, ttl=200)

        # Test invalid size
        with pytest.raises(WorkerManagerError, match="Invalid size"):
            worker_manager.provision_workers(count=1, ttl=24, size="invalid")

    def test_provision_workers_output(self, worker_manager):
        """Test provision_workers output structure"""
        # Note: This is a placeholder test since actual provisioning requires MCP integration
        # The function will work with the validation but MCP calls are not implemented
        try:
            workers = worker_manager.provision_workers(count=2, ttl=24, size="medium")
        except NotImplementedError:
            # Expected for now - MCP integration not implemented
            pass

    @patch('worker_manager.subprocess.run')
    def test_drain_worker(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test draining a worker"""
        # Mock kubectl get node
        single_node = {"items": [mock_kubectl_nodes["items"][1]]}
        mock_run.side_effect = [
            Mock(stdout=json.dumps(single_node["items"][0]), returncode=0),
            Mock(stdout="node drained", returncode=0)
        ]

        result = worker_manager.drain_worker("burst-worker-1")

        assert result['worker_id'] == "burst-worker-1"
        assert result['status'] == "draining"
        assert 'message' in result

    @patch('worker_manager.subprocess.run')
    def test_drain_worker_not_found(self, mock_run, worker_manager):
        """Test draining a non-existent worker"""
        mock_run.side_effect = Exception("Node not found")

        with pytest.raises(WorkerManagerError):
            worker_manager.drain_worker("non-existent-worker")

    @patch('worker_manager.subprocess.run')
    def test_destroy_burst_worker(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test destroying a burst worker"""
        # Mock kubectl get node (burst worker)
        burst_node = mock_kubectl_nodes["items"][1]
        burst_node["spec"]["unschedulable"] = True  # Make it drained

        mock_run.side_effect = [
            Mock(stdout=json.dumps(burst_node), returncode=0),  # get node
            Mock(stdout="node deleted", returncode=0)  # delete node
        ]

        result = worker_manager.destroy_worker("burst-worker-1")

        assert result['worker_id'] == "burst-worker-1"
        assert result['status'] in ["destroyed", "partial_destroy"]
        assert result['removed_from_cluster'] == True

    @patch('worker_manager.subprocess.run')
    def test_destroy_permanent_worker_blocked(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test that destroying a permanent worker is blocked"""
        # Mock kubectl get node (permanent worker)
        permanent_node = mock_kubectl_nodes["items"][0]

        mock_run.return_value = Mock(
            stdout=json.dumps(permanent_node),
            returncode=0
        )

        with pytest.raises(WorkerManagerError, match="SAFETY VIOLATION"):
            worker_manager.destroy_worker("permanent-worker-1")

    @patch('worker_manager.subprocess.run')
    def test_destroy_worker_not_drained(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test that destroying an undrained worker fails"""
        # Mock kubectl get node (burst worker, not drained)
        burst_node = mock_kubectl_nodes["items"][1]

        mock_run.return_value = Mock(
            stdout=json.dumps(burst_node),
            returncode=0
        )

        with pytest.raises(WorkerManagerError, match="not drained"):
            worker_manager.destroy_worker("burst-worker-1")

    @patch('worker_manager.subprocess.run')
    def test_destroy_worker_force(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test force destroying a worker without draining"""
        # Mock kubectl get node (burst worker, not drained)
        burst_node = mock_kubectl_nodes["items"][1]

        mock_run.side_effect = [
            Mock(stdout=json.dumps(burst_node), returncode=0),  # get node
            Mock(stdout="node deleted", returncode=0)  # delete node
        ]

        result = worker_manager.destroy_worker("burst-worker-1", force=True)

        assert result['worker_id'] == "burst-worker-1"
        assert result['removed_from_cluster'] == True

    @patch('worker_manager.subprocess.run')
    def test_get_worker_details(self, mock_run, worker_manager, mock_kubectl_nodes):
        """Test getting detailed worker information"""
        # Mock kubectl get node
        burst_node = mock_kubectl_nodes["items"][1]

        mock_run.return_value = Mock(
            stdout=json.dumps(burst_node),
            returncode=0
        )

        details = worker_manager.get_worker_details("burst-worker-1")

        assert details['name'] == "burst-worker-1"
        assert details['type'] == WorkerType.BURST.value
        assert 'resources' in details
        assert 'conditions' in details
        assert 'ttl_expires' in details

    @patch('worker_manager.subprocess.run')
    def test_get_worker_details_not_found(self, mock_run, worker_manager):
        """Test getting details for non-existent worker"""
        mock_run.side_effect = Exception("Node not found")

        with pytest.raises(WorkerManagerError):
            worker_manager.get_worker_details("non-existent-worker")

    def test_worker_sizes_config(self):
        """Test worker size configurations"""
        assert "small" in WORKER_SIZES
        assert "medium" in WORKER_SIZES
        assert "large" in WORKER_SIZES

        # Verify structure
        for size in ["small", "medium", "large"]:
            assert "cpu" in WORKER_SIZES[size]
            assert "memory_gb" in WORKER_SIZES[size]
            assert "disk_gb" in WORKER_SIZES[size]

        # Verify size ordering
        assert WORKER_SIZES["small"]["cpu"] < WORKER_SIZES["medium"]["cpu"]
        assert WORKER_SIZES["medium"]["cpu"] < WORKER_SIZES["large"]["cpu"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
