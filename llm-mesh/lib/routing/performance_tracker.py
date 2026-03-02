"""
Routing Performance Tracker

Tracks routing decisions through the 5-layer cascade and learns from outcomes.
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import hashlib


class RoutingPerformanceTracker:
    """
    Track routing performance across the 5-layer cascade

    Layers:
    1. Keyword matching (5ms, 80% accuracy)
    2. Semantic similarity (50ms, 88% accuracy)
    3. RAG vector search (150ms, 92% accuracy)
    4. PyTorch neural (300ms, 96% accuracy)
    5. Clarification fallback (100% accuracy)
    """

    LAYERS = ["keyword", "semantic", "rag", "pytorch", "clarification"]

    def __init__(self, log_file: Optional[Path] = None, config_file: Optional[Path] = None):
        """
        Initialize performance tracker

        Args:
            log_file: Path to performance.jsonl log file
            config_file: Path to routing config.json
        """
        # Default paths relative to cortex root
        cortex_root = Path(__file__).resolve().parents[3]
        self.log_file = log_file or cortex_root / "coordination" / "routing" / "performance.jsonl"
        self.config_file = config_file or cortex_root / "coordination" / "routing" / "config.json"

        # Ensure directories exist
        self.log_file.parent.mkdir(parents=True, exist_ok=True)

        # Load config
        self.config = self._load_config()

        # Current routing session
        self.current_routing = None
        self.layer_timings = {}

    def _load_config(self) -> Dict:
        """Load routing configuration"""
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                return json.load(f)

        # Default config
        return {
            "routing_layers": [
                {"layer_id": 1, "layer_name": "keyword", "confidence_threshold": 0.85},
                {"layer_id": 2, "layer_name": "semantic", "confidence_threshold": 0.70},
                {"layer_id": 3, "layer_name": "rag", "confidence_threshold": 0.85},
                {"layer_id": 4, "layer_name": "pytorch", "confidence_threshold": 0.90},
                {"layer_id": 5, "layer_name": "clarification", "confidence_threshold": 1.00}
            ]
        }

    def start_routing(self, task_description: str, task_id: Optional[str] = None,
                     task_metadata: Optional[Dict] = None) -> str:
        """
        Start tracking a new routing decision

        Args:
            task_description: Natural language task description
            task_id: Optional task ID
            task_metadata: Optional task metadata

        Returns:
            event_id: Unique routing event ID
        """
        timestamp = datetime.now(timezone.utc)

        # Generate unique event ID
        event_id = self._generate_event_id(task_description, timestamp)

        self.current_routing = {
            "event_id": event_id,
            "timestamp": timestamp.isoformat(),
            "task_id": task_id,
            "task_description": task_description,
            "task_metadata": task_metadata or {},
            "routing_layers": [],
            "final_decision": None,
            "total_latency_ms": 0,
            "outcome": None,
            "learning_feedback": None
        }

        self.layer_timings = {}

        return event_id

    def record_layer_attempt(
        self,
        layer_name: str,
        confidence: float,
        selected_master: Optional[str] = None,
        success: bool = False,
        metadata: Optional[Dict] = None
    ):
        """
        Record a routing attempt through a specific layer

        Args:
            layer_name: Name of routing layer
            confidence: Confidence score (0-1)
            selected_master: Master selected by this layer (if any)
            success: Whether this layer succeeded (met threshold)
            metadata: Layer-specific metadata
        """
        if not self.current_routing:
            raise RuntimeError("No active routing session. Call start_routing() first.")

        # Get layer config
        layer_config = next(
            (l for l in self.config["routing_layers"] if l["layer_name"] == layer_name),
            {}
        )

        layer_id = layer_config.get("layer_id", len(self.current_routing["routing_layers"]) + 1)
        threshold = layer_config.get("confidence_threshold", 0.5)

        # Calculate latency for this layer
        layer_start_key = f"{layer_name}_start"
        if layer_start_key in self.layer_timings:
            latency_ms = (time.time() - self.layer_timings[layer_start_key]) * 1000
        else:
            latency_ms = 0

        layer_record = {
            "layer_id": layer_id,
            "layer_name": layer_name,
            "attempted": True,
            "success": success,
            "confidence": confidence,
            "threshold": threshold,
            "selected_master": selected_master,
            "latency_ms": latency_ms,
            "metadata": metadata or {}
        }

        self.current_routing["routing_layers"].append(layer_record)

    def mark_layer_start(self, layer_name: str):
        """Mark the start time for a layer (for latency tracking)"""
        self.layer_timings[f"{layer_name}_start"] = time.time()

    def finalize_routing(
        self,
        selected_master: str,
        routing_layer: str,
        confidence: float,
        all_probabilities: Optional[Dict[str, float]] = None
    ):
        """
        Finalize the routing decision

        Args:
            selected_master: Final master selection
            routing_layer: Layer that made the final decision
            confidence: Final confidence score
            all_probabilities: Probability distribution across masters
        """
        if not self.current_routing:
            raise RuntimeError("No active routing session. Call start_routing() first.")

        self.current_routing["final_decision"] = {
            "selected_master": selected_master,
            "routing_layer": routing_layer,
            "confidence": confidence,
            "all_probabilities": all_probabilities or {}
        }

        # Calculate total latency
        total_latency = sum(
            layer.get("latency_ms", 0)
            for layer in self.current_routing["routing_layers"]
        )
        self.current_routing["total_latency_ms"] = total_latency

        # Write to log
        self._write_to_log()

    def record_outcome(
        self,
        task_completed: bool,
        task_status: str = "unknown",
        was_correct_master: Optional[bool] = None,
        user_corrected_to: Optional[str] = None,
        completion_time_minutes: Optional[float] = None,
        quality_score: Optional[float] = None
    ):
        """
        Record the outcome of a routed task for learning

        Args:
            task_completed: Whether task completed successfully
            task_status: Task status (completed/failed/in_progress/unknown)
            was_correct_master: Whether routing was correct
            user_corrected_to: Master user corrected to (if wrong)
            completion_time_minutes: Time to complete task
            quality_score: Quality score (0-1)
        """
        if not self.current_routing:
            return

        self.current_routing["outcome"] = {
            "task_completed": task_completed,
            "task_status": task_status,
            "was_correct_master": was_correct_master,
            "user_corrected_to": user_corrected_to,
            "completion_time_minutes": completion_time_minutes,
            "quality_score": quality_score
        }

        # Generate learning feedback
        self._generate_learning_feedback()

        # Update log
        self._write_to_log()

    def _generate_learning_feedback(self):
        """Generate learning feedback from outcome"""
        if not self.current_routing or not self.current_routing.get("outcome"):
            return

        outcome = self.current_routing["outcome"]
        final_decision = self.current_routing["final_decision"]

        correct_routing = outcome.get("was_correct_master", True)
        should_have_routed_to = outcome.get("user_corrected_to")

        # Analyze which layer should have caught it
        layer_should_have_caught = None
        threshold_too_high = False
        threshold_too_low = False

        if not correct_routing and should_have_routed_to:
            # Check if any layer had the correct answer but confidence was too low
            for layer in self.current_routing["routing_layers"]:
                if layer.get("selected_master") == should_have_routed_to:
                    if layer["confidence"] < layer["threshold"]:
                        layer_should_have_caught = layer["layer_name"]
                        threshold_too_high = True
                        break

        # Check if routing layer had low confidence but we still used it
        if final_decision:
            final_layer = next(
                (l for l in self.current_routing["routing_layers"]
                 if l["layer_name"] == final_decision["routing_layer"]),
                None
            )
            if final_layer and not correct_routing:
                # If we were wrong and confidence was barely above threshold
                if final_layer["confidence"] - final_layer["threshold"] < 0.05:
                    threshold_too_low = True

        self.current_routing["learning_feedback"] = {
            "correct_routing": correct_routing,
            "should_have_routed_to": should_have_routed_to,
            "layer_should_have_caught": layer_should_have_caught,
            "threshold_too_high": threshold_too_high,
            "threshold_too_low": threshold_too_low
        }

    def _write_to_log(self):
        """Append current routing to log file"""
        if not self.current_routing:
            return

        with open(self.log_file, 'a') as f:
            json.dump(self.current_routing, f)
            f.write('\n')

    def _generate_event_id(self, task_description: str, timestamp: datetime) -> str:
        """Generate unique event ID"""
        hash_input = f"{task_description}{timestamp.isoformat()}".encode('utf-8')
        hash_suffix = hashlib.sha256(hash_input).hexdigest()[:8]

        date_str = timestamp.strftime("%Y%m%d")
        time_str = timestamp.strftime("%H%M%S")

        return f"route-{date_str}-{time_str}-{hash_suffix}"

    def get_recent_events(self, limit: int = 100) -> List[Dict]:
        """Get recent routing events from log"""
        if not self.log_file.exists():
            return []

        events = []
        with open(self.log_file, 'r') as f:
            for line in f:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

        return events[-limit:]

    def get_layer_stats(self, layer_name: str, window_hours: int = 24) -> Dict:
        """
        Get performance statistics for a specific layer

        Args:
            layer_name: Layer to analyze
            window_hours: Time window in hours

        Returns:
            Statistics dict
        """
        events = self.get_recent_events(limit=10000)

        # Filter to time window
        cutoff = datetime.now(timezone.utc).timestamp() - (window_hours * 3600)
        events = [
            e for e in events
            if datetime.fromisoformat(e["timestamp"]).timestamp() > cutoff
        ]

        # Filter to events where this layer was attempted
        layer_events = [
            e for e in events
            if any(l["layer_name"] == layer_name and l["attempted"] for l in e.get("routing_layers", []))
        ]

        if not layer_events:
            return {
                "layer_name": layer_name,
                "attempts": 0,
                "success_rate": 0,
                "avg_confidence": 0,
                "avg_latency_ms": 0
            }

        # Calculate stats
        successes = sum(
            1 for e in layer_events
            if any(l["layer_name"] == layer_name and l.get("success", False) for l in e["routing_layers"])
        )

        confidences = [
            l["confidence"]
            for e in layer_events
            for l in e["routing_layers"]
            if l["layer_name"] == layer_name
        ]

        latencies = [
            l["latency_ms"]
            for e in layer_events
            for l in e["routing_layers"]
            if l["layer_name"] == layer_name and l.get("latency_ms", 0) > 0
        ]

        return {
            "layer_name": layer_name,
            "attempts": len(layer_events),
            "successes": successes,
            "success_rate": successes / len(layer_events) if layer_events else 0,
            "avg_confidence": sum(confidences) / len(confidences) if confidences else 0,
            "avg_latency_ms": sum(latencies) / len(latencies) if latencies else 0,
            "min_latency_ms": min(latencies) if latencies else 0,
            "max_latency_ms": max(latencies) if latencies else 0
        }

    def get_accuracy_by_layer(self, window_hours: int = 24) -> Dict[str, float]:
        """
        Calculate routing accuracy by layer

        Returns dict of layer_name -> accuracy
        """
        events = self.get_recent_events(limit=10000)

        # Filter to time window and events with outcome feedback
        cutoff = datetime.now(timezone.utc).timestamp() - (window_hours * 3600)
        events = [
            e for e in events
            if datetime.fromisoformat(e["timestamp"]).timestamp() > cutoff
            and e.get("outcome") is not None
            and e["outcome"].get("was_correct_master") is not None
        ]

        if not events:
            return {layer: 0.0 for layer in self.LAYERS}

        accuracy = {}
        for layer_name in self.LAYERS:
            # Events where this layer made the final decision
            layer_decisions = [
                e for e in events
                if e.get("final_decision", {}).get("routing_layer") == layer_name
            ]

            if not layer_decisions:
                accuracy[layer_name] = 0.0
                continue

            correct = sum(
                1 for e in layer_decisions
                if e["outcome"]["was_correct_master"]
            )

            accuracy[layer_name] = correct / len(layer_decisions)

        return accuracy


def example_usage():
    """Example usage of routing performance tracker"""
    tracker = RoutingPerformanceTracker()

    # Start routing
    event_id = tracker.start_routing(
        task_description="Fix authentication bug in user login system",
        task_id="task-001",
        task_metadata={"priority": "high", "source": "user"}
    )

    # Layer 1: Keyword
    tracker.mark_layer_start("keyword")
    time.sleep(0.005)  # Simulate 5ms
    tracker.record_layer_attempt(
        layer_name="keyword",
        confidence=0.82,
        selected_master="development-master",
        success=False,  # Below threshold of 0.85
        metadata={"matched_keywords": ["fix", "bug"]}
    )

    # Layer 2: Semantic
    tracker.mark_layer_start("semantic")
    time.sleep(0.05)  # Simulate 50ms
    tracker.record_layer_attempt(
        layer_name="semantic",
        confidence=0.91,
        selected_master="development-master",
        success=True,  # Above threshold of 0.70
        metadata={"similarity_score": 0.91, "cluster": "development"}
    )

    # Finalize
    tracker.finalize_routing(
        selected_master="development-master",
        routing_layer="semantic",
        confidence=0.91,
        all_probabilities={
            "development-master": 0.91,
            "security-master": 0.05,
            "cicd-master": 0.04
        }
    )

    # Later: record outcome
    tracker.record_outcome(
        task_completed=True,
        task_status="completed",
        was_correct_master=True,
        completion_time_minutes=45,
        quality_score=0.95
    )

    print(f"Logged routing decision: {event_id}")

    # Get stats
    stats = tracker.get_layer_stats("semantic")
    print(f"\nSemantic layer stats: {json.dumps(stats, indent=2)}")


if __name__ == "__main__":
    example_usage()
