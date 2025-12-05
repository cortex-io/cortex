#!/usr/bin/env python3
"""
Advanced Agent Observability System

Real-time monitoring of AI agent behavior, decisions, and anomalies.
Production-grade observability for autonomous agents.
"""

import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict, deque
from pathlib import Path
import numpy as np


class AgentObserver:
    """Advanced observability for AI agents"""

    def __init__(self, alert_threshold: float = 0.8):
        self.observations = deque(maxlen=10000)
        self.agent_metrics = defaultdict(lambda: {
            'decisions': 0,
            'actions': 0,
            'errors': 0,
            'latencies': [],
            'costs': [],
            'confidence_scores': [],
            'anomalies': []
        })
        self.alert_threshold = alert_threshold
        self.baseline_metrics = {}

    def observe_decision(self, agent_id: str, decision: Dict):
        """Observe agent decision with full context"""
        observation = {
            'timestamp': datetime.now().isoformat(),
            'agent_id': agent_id,
            'type': 'decision',
            'decision': decision,
            'confidence': decision.get('confidence', 0),
            'reasoning_steps': decision.get('reasoning_chain', []),
            'context_used': decision.get('context', {}),
            'tools_called': decision.get('tools', [])
        }

        self.observations.append(observation)
        self.agent_metrics[agent_id]['decisions'] += 1
        self.agent_metrics[agent_id]['confidence_scores'].append(decision.get('confidence', 0))

        # Check for anomalies
        anomalies = self._detect_anomalies(agent_id, observation)
        if anomalies:
            self.agent_metrics[agent_id]['anomalies'].extend(anomalies)
            self._trigger_alerts(agent_id, anomalies)

    def observe_action(self, agent_id: str, action: Dict, result: Dict):
        """Observe agent action execution"""
        observation = {
            'timestamp': datetime.now().isoformat(),
            'agent_id': agent_id,
            'type': 'action',
            'action': action,
            'result': result,
            'latency_ms': result.get('latency_ms', 0),
            'cost_usd': result.get('cost', 0),
            'success': result.get('success', False),
            'tokens_used': result.get('tokens', 0)
        }

        self.observations.append(observation)
        self.agent_metrics[agent_id]['actions'] += 1

        if not result.get('success'):
            self.agent_metrics[agent_id]['errors'] += 1

        self.agent_metrics[agent_id]['latencies'].append(result.get('latency_ms', 0))
        self.agent_metrics[agent_id]['costs'].append(result.get('cost', 0))

    def observe_interaction(self, agent_id: str, interaction_type: str, data: Dict):
        """Observe agent interactions (with users, other agents, systems)"""
        observation = {
            'timestamp': datetime.now().isoformat(),
            'agent_id': agent_id,
            'type': 'interaction',
            'interaction_type': interaction_type,
            'data': data
        }
        self.observations.append(observation)

    def _detect_anomalies(self, agent_id: str, observation: Dict) -> List[Dict]:
        """Detect anomalous behavior"""
        anomalies = []
        metrics = self.agent_metrics[agent_id]

        # Anomaly 1: Confidence drift
        if len(metrics['confidence_scores']) > 10:
            recent_confidence = np.mean(metrics['confidence_scores'][-10:])
            baseline_confidence = np.mean(metrics['confidence_scores'][:-10]) if len(metrics['confidence_scores']) > 20 else recent_confidence

            if abs(recent_confidence - baseline_confidence) > 0.2:
                anomalies.append({
                    'type': 'confidence_drift',
                    'severity': 'medium',
                    'message': f'Confidence drift detected: {baseline_confidence:.2f} -> {recent_confidence:.2f}',
                    'agent_id': agent_id
                })

        # Anomaly 2: Error rate spike
        if metrics['decisions'] > 20:
            error_rate = metrics['errors'] / max(metrics['actions'], 1)
            if error_rate > 0.1:  # 10% error rate
                anomalies.append({
                    'type': 'high_error_rate',
                    'severity': 'high',
                    'message': f'Error rate {error_rate:.1%} exceeds threshold',
                    'agent_id': agent_id
                })

        # Anomaly 3: Cost spike
        if len(metrics['costs']) > 10:
            recent_cost = np.mean(metrics['costs'][-10:])
            baseline_cost = np.mean(metrics['costs'][:-10]) if len(metrics['costs']) > 20 else recent_cost

            if recent_cost > baseline_cost * 2:
                anomalies.append({
                    'type': 'cost_spike',
                    'severity': 'medium',
                    'message': f'Cost spike: ${baseline_cost:.4f} -> ${recent_cost:.4f}',
                    'agent_id': agent_id
                })

        # Anomaly 4: Latency spike
        if len(metrics['latencies']) > 10:
            recent_latency = np.mean(metrics['latencies'][-10:])
            baseline_latency = np.mean(metrics['latencies'][:-10]) if len(metrics['latencies']) > 20 else recent_latency

            if recent_latency > baseline_latency * 2:
                anomalies.append({
                    'type': 'latency_spike',
                    'severity': 'low',
                    'message': f'Latency spike: {baseline_latency:.0f}ms -> {recent_latency:.0f}ms',
                    'agent_id': agent_id
                })

        return anomalies

    def _trigger_alerts(self, agent_id: str, anomalies: List[Dict]):
        """Trigger alerts for anomalies"""
        for anomaly in anomalies:
            print(f"🚨 ALERT [{anomaly['severity'].upper()}] Agent {agent_id}: {anomaly['message']}")

            # Log to file
            alert_log = Path('data-intelligence/lakehouse/logs/agent-alerts.jsonl')
            alert_log.parent.mkdir(parents=True, exist_ok=True)

            with open(alert_log, 'a') as f:
                f.write(json.dumps({
                    'timestamp': datetime.now().isoformat(),
                    'agent_id': agent_id,
                    'anomaly': anomaly
                }) + '\n')

    def get_agent_health(self, agent_id: str) -> Dict:
        """Get comprehensive agent health metrics"""
        metrics = self.agent_metrics[agent_id]

        return {
            'agent_id': agent_id,
            'health_score': self._calculate_health_score(agent_id),
            'total_decisions': metrics['decisions'],
            'total_actions': metrics['actions'],
            'error_rate': metrics['errors'] / max(metrics['actions'], 1),
            'avg_confidence': np.mean(metrics['confidence_scores']) if metrics['confidence_scores'] else 0,
            'avg_latency_ms': np.mean(metrics['latencies']) if metrics['latencies'] else 0,
            'total_cost': sum(metrics['costs']),
            'anomaly_count': len(metrics['anomalies']),
            'recent_anomalies': metrics['anomalies'][-5:]
        }

    def _calculate_health_score(self, agent_id: str) -> float:
        """Calculate overall health score (0-1)"""
        metrics = self.agent_metrics[agent_id]

        if metrics['decisions'] == 0:
            return 1.0

        # Factors
        error_rate = metrics['errors'] / max(metrics['actions'], 1)
        confidence = np.mean(metrics['confidence_scores']) if metrics['confidence_scores'] else 0.5
        anomaly_ratio = len(metrics['anomalies']) / max(metrics['decisions'], 1)

        # Score calculation
        error_score = max(0, 1 - (error_rate * 10))  # Penalize errors heavily
        confidence_score = confidence
        anomaly_score = max(0, 1 - (anomaly_ratio * 5))  # Penalize anomalies

        return (error_score * 0.4 + confidence_score * 0.4 + anomaly_score * 0.2)

    def get_system_health(self) -> Dict:
        """Get overall system health"""
        all_agents = list(self.agent_metrics.keys())

        return {
            'timestamp': datetime.now().isoformat(),
            'total_agents': len(all_agents),
            'agent_health': {
                agent_id: self.get_agent_health(agent_id)
                for agent_id in all_agents
            },
            'system_health_score': np.mean([
                self._calculate_health_score(agent_id)
                for agent_id in all_agents
            ]) if all_agents else 1.0,
            'total_observations': len(self.observations),
            'active_alerts': sum(
                len(metrics['anomalies'])
                for metrics in self.agent_metrics.values()
            )
        }

    def export_trace(self, agent_id: str, time_window_minutes: int = 60) -> List[Dict]:
        """Export decision/action trace for an agent"""
        cutoff = datetime.now() - timedelta(minutes=time_window_minutes)

        trace = [
            obs for obs in self.observations
            if obs['agent_id'] == agent_id and
            datetime.fromisoformat(obs['timestamp']) > cutoff
        ]

        return sorted(trace, key=lambda x: x['timestamp'])


# Global observer instance
_observer = None

def get_observer() -> AgentObserver:
    """Get global observer instance"""
    global _observer
    if _observer is None:
        _observer = AgentObserver()
    return _observer


if __name__ == '__main__':
    observer = get_observer()

    # Example usage
    observer.observe_decision('agent-001', {
        'decision': 'execute_task',
        'confidence': 0.92,
        'reasoning_chain': ['analyze', 'plan', 'decide']
    })

    observer.observe_action('agent-001', {
        'action': 'spawn_worker'
    }, {
        'success': True,
        'latency_ms': 1250,
        'cost': 0.003,
        'tokens': 1500
    })

    health = observer.get_agent_health('agent-001')
    print(json.dumps(health, indent=2))
