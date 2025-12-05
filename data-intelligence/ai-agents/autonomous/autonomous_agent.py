#!/usr/bin/env python3
"""
Autonomous Agent Framework

Enables agents to act autonomously based on triggers, permissions, and governance.
"""

import json
from datetime import datetime
from typing import Dict, List, Optional, Callable
from pathlib import Path
from enum import Enum


class TriggerType(Enum):
    """Types of triggers for autonomous actions"""
    CRON = "cron"
    EVENT = "event"
    THRESHOLD = "threshold"
    MANUAL = "manual"


class AutonomousAgent:
    """Autonomous agent that can act without human initiation"""

    def __init__(self, agent_id: str, agent_type: str, config: Dict):
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.config = config
        self.triggers = []
        self.actions = []
        self.enabled = config.get('autonomous_enabled', False)

    def register_trigger(self, trigger_type: TriggerType, condition: Callable, action: Callable):
        """Register autonomous trigger"""
        self.triggers.append({
            'type': trigger_type,
            'condition': condition,
            'action': action,
            'enabled': True
        })

    def evaluate_triggers(self, context: Dict) -> List[Dict]:
        """Evaluate all triggers and return actions to take"""
        if not self.enabled:
            return []

        actions_to_take = []

        for trigger in self.triggers:
            if not trigger['enabled']:
                continue

            try:
                if trigger['condition'](context):
                    actions_to_take.append({
                        'trigger': trigger['type'].value,
                        'action': trigger['action'],
                        'context': context,
                        'timestamp': datetime.now().isoformat()
                    })
            except Exception as e:
                print(f"Error evaluating trigger: {e}")

        return actions_to_take

    def execute_autonomous_action(self, action: Dict, governance) -> Dict:
        """Execute autonomous action with governance checks"""
        from ..observability.agent_observer import get_observer
        from ..governance.align_by_design import AlignByDesignGovernance

        observer = get_observer()
        governance = governance or AlignByDesignGovernance()

        # Governance validation
        validation = governance.validate_action(self.agent_id, action)

        if not validation['approved']:
            observer.observe_decision(self.agent_id, {
                'decision': 'reject',
                'reason': 'governance_validation_failed',
                'validation': validation
            })
            return {
                'success': False,
                'reason': 'governance_rejection',
                'validation': validation
            }

        # Execute action
        observer.observe_decision(self.agent_id, {
            'decision': 'execute',
            'confidence': 1.0,
            'action': action
        })

        try:
            result = action['action'](action['context'])

            observer.observe_action(self.agent_id, action, {
                'success': True,
                'result': result,
                'latency_ms': 100,
                'cost': 0.001
            })

            return {
                'success': True,
                'result': result
            }

        except Exception as e:
            observer.observe_action(self.agent_id, action, {
                'success': False,
                'error': str(e),
                'latency_ms': 100
            })

            return {
                'success': False,
                'error': str(e)
            }


class AutonomousAgentManager:
    """Manage multiple autonomous agents"""

    def __init__(self):
        self.agents = {}
        self.config_dir = Path('data-intelligence/ai-agents/autonomous/configs')
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def register_agent(self, agent: AutonomousAgent):
        """Register autonomous agent"""
        self.agents[agent.agent_id] = agent

    def enable_autonomous_mode(self, agent_id: str):
        """Enable autonomous mode for agent"""
        if agent_id in self.agents:
            self.agents[agent_id].enabled = True

    def disable_autonomous_mode(self, agent_id: str):
        """Disable autonomous mode for agent"""
        if agent_id in self.agents:
            self.agents[agent_id].enabled = False

    def evaluate_all_agents(self, context: Dict) -> Dict[str, List[Dict]]:
        """Evaluate triggers for all agents"""
        results = {}

        for agent_id, agent in self.agents.items():
            actions = agent.evaluate_triggers(context)
            if actions:
                results[agent_id] = actions

        return results


# Predefined autonomous behaviors
class AutomaticSecurityScanner(AutonomousAgent):
    """Autonomous security scanner"""

    def __init__(self, agent_id: str):
        super().__init__(agent_id, 'security-master', {
            'autonomous_enabled': True,
            'scan_frequency': 'daily'
        })

        # Register daily scan trigger
        self.register_trigger(
            TriggerType.CRON,
            condition=lambda ctx: ctx.get('time_of_day') == '02:00',  # 2 AM
            action=self._perform_security_scan
        )

        # Register CVE detection trigger
        self.register_trigger(
            TriggerType.EVENT,
            condition=lambda ctx: ctx.get('event_type') == 'new_cve_published',
            action=self._scan_for_cve
        )

    def _perform_security_scan(self, context: Dict) -> Dict:
        """Perform comprehensive security scan"""
        return {
            'action': 'security_scan',
            'scope': 'full_repository',
            'timestamp': datetime.now().isoformat()
        }

    def _scan_for_cve(self, context: Dict) -> Dict:
        """Scan for specific CVE"""
        cve_id = context.get('cve_id')
        return {
            'action': 'cve_scan',
            'cve_id': cve_id,
            'timestamp': datetime.now().isoformat()
        }


if __name__ == '__main__':
    manager = AutonomousAgentManager()

    # Create autonomous security scanner
    scanner = AutomaticSecurityScanner('security-agent-001')
    manager.register_agent(scanner)

    # Simulate trigger
    context = {'time_of_day': '02:00'}
    actions = manager.evaluate_all_agents(context)

    print(json.dumps(actions, indent=2))
