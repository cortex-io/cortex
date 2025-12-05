#!/usr/bin/env python3
"""
Cortex AI Agents System - Main Integration

Brings together all AI agent enhancements into a unified, production-ready system:
- Advanced Observability & Monitoring
- Align-by-Design Governance Framework
- Autonomous Agent Execution
- Advanced Reasoning (Chain-of-Thought, ReAct, Plan-Execute)
- Multi-Agent Orchestration & Coordination
- AIQ Training & Measurement
- Consumer-Facing AI Agents (feature-flagged)
"""

import json
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass

# Import all AI agent components
from observability.agent_observer import AgentObserver, get_observer
from governance.align_by_design import AlignByDesignGovernance
from autonomous.autonomous_agent import AutonomousAgent, AutonomousAgentManager, TriggerType
from reasoning.advanced_reasoning import ChainOfThoughtReasoner, ReActAgent, PlanExecuteAgent
from orchestration.multi_agent_coordinator import MultiAgentCoordinator, CollaborativePatterns
from training.aiq_system import AIQAssessment, TrainingProgram, AIQTracker


@dataclass
class FeatureFlags:
    """Feature flags for gradual rollout"""
    observability_enabled: bool = True
    governance_enabled: bool = True
    autonomous_enabled: bool = False  # Conservative start
    advanced_reasoning_enabled: bool = True
    multi_agent_enabled: bool = True
    aiq_training_enabled: bool = True
    consumer_agents_enabled: bool = False  # Lower priority


class CortexAIAgents:
    """
    Main AI Agents System Integration

    Coordinates all AI agent enhancements and provides unified interface
    for autonomous, intelligent agent execution.
    """

    def __init__(self, config_path: Optional[Path] = None):
        """Initialize AI agents system"""
        self.config_path = config_path or Path('data-intelligence/ai-agents/config')
        self.config_path.mkdir(parents=True, exist_ok=True)

        # Load feature flags
        self.features = self._load_feature_flags()

        # Initialize components based on feature flags
        self.observer = get_observer() if self.features.observability_enabled else None
        self.governance = AlignByDesignGovernance() if self.features.governance_enabled else None
        self.autonomous_manager = AutonomousAgentManager() if self.features.autonomous_enabled else None

        # Reasoning engines
        if self.features.advanced_reasoning_enabled:
            self.cot_reasoner = ChainOfThoughtReasoner()
            self.react_agent = ReActAgent()
            self.plan_execute_agent = PlanExecuteAgent()

        # Multi-agent coordination
        self.coordinator = MultiAgentCoordinator() if self.features.multi_agent_enabled else None

        # AIQ training
        if self.features.aiq_training_enabled:
            self.aiq_assessment = AIQAssessment()
            self.training_program = TrainingProgram()
            self.aiq_tracker = AIQTracker()

        # Register autonomous agents if enabled
        if self.features.autonomous_enabled:
            self._register_autonomous_agents()

    def _load_feature_flags(self) -> FeatureFlags:
        """Load feature flags from config"""
        flags_file = self.config_path / 'features.yaml'

        if flags_file.exists():
            with open(flags_file, 'r') as f:
                config = yaml.safe_load(f)
                return FeatureFlags(**config.get('features', {}))

        # Return defaults
        return FeatureFlags()

    def _register_autonomous_agents(self):
        """Register autonomous agents from configuration"""
        agents_config = self.config_path / 'autonomous-agents.yaml'

        if not agents_config.exists():
            return

        with open(agents_config, 'r') as f:
            config = yaml.safe_load(f)

        for agent_config in config.get('agents', []):
            agent = AutonomousAgent(
                agent_id=agent_config['id'],
                agent_type=agent_config['type'],
                config=agent_config
            )

            # Register triggers from config
            for trigger_config in agent_config.get('triggers', []):
                agent.register_trigger(
                    trigger_type=TriggerType(trigger_config['type']),
                    condition=self._create_condition(trigger_config['condition']),
                    action=self._create_action(trigger_config['action'])
                )

            self.autonomous_manager.register_agent(agent)

    def _create_condition(self, condition_config: Dict) -> callable:
        """Create condition function from config"""
        condition_type = condition_config['type']

        if condition_type == 'time':
            target_time = condition_config['value']
            return lambda ctx: ctx.get('time_of_day') == target_time

        elif condition_type == 'event':
            event_type = condition_config['value']
            return lambda ctx: ctx.get('event_type') == event_type

        elif condition_type == 'threshold':
            metric = condition_config['metric']
            threshold = condition_config['threshold']
            operator = condition_config.get('operator', '>')

            if operator == '>':
                return lambda ctx: ctx.get(metric, 0) > threshold
            elif operator == '<':
                return lambda ctx: ctx.get(metric, 0) < threshold
            elif operator == '==':
                return lambda ctx: ctx.get(metric, 0) == threshold

        # Default: always false
        return lambda ctx: False

    def _create_action(self, action_config: Dict) -> callable:
        """Create action function from config"""
        action_type = action_config['type']

        def action_func(context: Dict) -> Dict:
            return {
                'action': action_type,
                'config': action_config,
                'executed_at': datetime.now().isoformat()
            }

        return action_func

    # ========== Core AI Agent Operations ==========

    def execute_task_with_reasoning(
        self,
        task: str,
        context: Dict,
        reasoning_mode: str = 'react'
    ) -> Dict:
        """
        Execute task using advanced reasoning

        Args:
            task: Task description
            context: Task context
            reasoning_mode: 'cot' (chain-of-thought), 'react', or 'plan-execute'

        Returns:
            Execution result with reasoning trace
        """
        if not self.features.advanced_reasoning_enabled:
            return {'error': 'Advanced reasoning not enabled'}

        # Observe decision
        if self.observer:
            self.observer.observe_decision('reasoning-engine', {
                'task': task,
                'mode': reasoning_mode,
                'confidence': 0.8
            })

        try:
            if reasoning_mode == 'cot':
                steps = self.cot_reasoner.reason(task, context)
                result = {
                    'success': True,
                    'reasoning_mode': 'chain-of-thought',
                    'steps': [{'step': s.step_number, 'thought': s.thought} for s in steps],
                    'total_steps': len(steps)
                }

            elif reasoning_mode == 'react':
                result = self.react_agent.solve(task, context)
                result['reasoning_mode'] = 'react'

            elif reasoning_mode == 'plan-execute':
                result = self.plan_execute_agent.solve(task, context)
                result['reasoning_mode'] = 'plan-execute'

            else:
                result = {'error': f'Unknown reasoning mode: {reasoning_mode}'}

            # Observe action
            if self.observer and result.get('success'):
                self.observer.observe_action('reasoning-engine', {'task': task}, {
                    'success': True,
                    'latency_ms': 1500,
                    'cost': 0.01
                })

            return result

        except Exception as e:
            if self.observer:
                self.observer.observe_action('reasoning-engine', {'task': task}, {
                    'success': False,
                    'error': str(e)
                })

            return {
                'success': False,
                'error': str(e),
                'reasoning_mode': reasoning_mode
            }

    def orchestrate_multi_agent_task(self, task: Dict) -> Dict:
        """
        Orchestrate complex task across multiple agents

        Args:
            task: Task definition with type and requirements

        Returns:
            Orchestration result with all subtask results
        """
        if not self.features.multi_agent_enabled:
            return {'error': 'Multi-agent orchestration not enabled'}

        # Governance check
        if self.governance:
            validation = self.governance.validate_action('coordinator', {
                'agent_type': 'coordinator-master',
                'action_type': 'orchestrate',
                'task': task,
                'reasoning_provided': True
            })

            if not validation['approved']:
                return {
                    'success': False,
                    'reason': 'governance_rejected',
                    'validation': validation
                }

        # Observe orchestration decision
        if self.observer:
            self.observer.observe_decision('coordinator', {
                'decision': 'orchestrate',
                'task': task,
                'confidence': 0.9
            })

        # Execute orchestration
        try:
            result = self.coordinator.orchestrate_complex_task(task)

            # Observe result
            if self.observer:
                self.observer.observe_action('coordinator', task, {
                    'success': result.get('success', False),
                    'subtasks': result.get('total_subtasks', 0),
                    'latency_ms': 5000,
                    'cost': 0.10
                })

            return result

        except Exception as e:
            if self.observer:
                self.observer.observe_action('coordinator', task, {
                    'success': False,
                    'error': str(e)
                })

            return {
                'success': False,
                'error': str(e)
            }

    def execute_autonomous_action(
        self,
        agent_id: str,
        action: Dict
    ) -> Dict:
        """
        Execute autonomous agent action with full governance

        Args:
            agent_id: ID of autonomous agent
            action: Action to execute

        Returns:
            Execution result
        """
        if not self.features.autonomous_enabled:
            return {'error': 'Autonomous execution not enabled'}

        if agent_id not in self.autonomous_manager.agents:
            return {'error': f'Agent {agent_id} not registered'}

        agent = self.autonomous_manager.agents[agent_id]

        # Execute with governance
        result = agent.execute_autonomous_action(action, self.governance)

        return result

    def evaluate_autonomous_triggers(self, context: Dict) -> Dict:
        """
        Evaluate all autonomous agent triggers

        Args:
            context: Current system context

        Returns:
            Actions triggered by context
        """
        if not self.features.autonomous_enabled:
            return {'error': 'Autonomous execution not enabled'}

        actions = self.autonomous_manager.evaluate_all_agents(context)

        return {
            'triggered_agents': len(actions),
            'actions': actions,
            'timestamp': datetime.now().isoformat()
        }

    def assess_user_aiq(self, user_id: str, responses: Dict) -> Dict:
        """
        Assess user's AI Quotient

        Args:
            user_id: User identifier
            responses: Assessment responses (0-100 for each area)

        Returns:
            AIQ assessment with score and level
        """
        if not self.features.aiq_training_enabled:
            return {'error': 'AIQ training not enabled'}

        assessment = self.aiq_assessment.assess(user_id, responses)

        # Track progress
        self.aiq_tracker.record_assessment(user_id, assessment)

        return assessment

    def generate_training_plan(
        self,
        user_id: str,
        current_aiq: float,
        target_aiq: float,
        assessment: Dict
    ) -> Dict:
        """
        Generate personalized training plan

        Args:
            user_id: User identifier
            current_aiq: Current AIQ score
            target_aiq: Target AIQ score
            assessment: AIQ assessment result

        Returns:
            Personalized training plan
        """
        if not self.features.aiq_training_enabled:
            return {'error': 'AIQ training not enabled'}

        plan = self.training_program.generate_training_plan(
            user_id,
            current_aiq,
            target_aiq,
            assessment
        )

        return plan

    def get_agent_health(self, agent_id: Optional[str] = None) -> Dict:
        """
        Get agent health metrics

        Args:
            agent_id: Specific agent or None for all agents

        Returns:
            Health metrics and status
        """
        if not self.features.observability_enabled:
            return {'error': 'Observability not enabled'}

        if agent_id:
            health_score = self.observer.get_agent_health(agent_id)
            recent_observations = self.observer.get_recent_observations(agent_id, limit=10)

            return {
                'agent_id': agent_id,
                'health_score': health_score,
                'recent_observations': len(recent_observations),
                'timestamp': datetime.now().isoformat()
            }
        else:
            # All agents
            all_health = {}
            for aid in self.observer.agent_observations.keys():
                all_health[aid] = self.observer.get_agent_health(aid)

            return {
                'agents': all_health,
                'timestamp': datetime.now().isoformat()
            }

    def validate_action(self, agent_id: str, action: Dict) -> Dict:
        """
        Validate action through governance framework

        Args:
            agent_id: Agent requesting action
            action: Action to validate

        Returns:
            Validation result
        """
        if not self.features.governance_enabled:
            return {'approved': True, 'note': 'Governance not enabled'}

        return self.governance.validate_action(agent_id, action)

    # ========== System Management ==========

    def get_system_status(self) -> Dict:
        """Get overall AI agents system status"""
        return {
            'features': {
                'observability': self.features.observability_enabled,
                'governance': self.features.governance_enabled,
                'autonomous': self.features.autonomous_enabled,
                'advanced_reasoning': self.features.advanced_reasoning_enabled,
                'multi_agent': self.features.multi_agent_enabled,
                'aiq_training': self.features.aiq_training_enabled,
                'consumer_agents': self.features.consumer_agents_enabled
            },
            'components': {
                'observer': self.observer is not None,
                'governance': self.governance is not None,
                'autonomous_manager': self.autonomous_manager is not None,
                'coordinator': self.coordinator is not None,
                'cot_reasoner': hasattr(self, 'cot_reasoner'),
                'react_agent': hasattr(self, 'react_agent'),
                'aiq_assessment': hasattr(self, 'aiq_assessment')
            },
            'registered_agents': (
                len(self.autonomous_manager.agents)
                if self.autonomous_manager else 0
            ),
            'timestamp': datetime.now().isoformat()
        }

    def enable_feature(self, feature_name: str) -> Dict:
        """Enable a feature flag"""
        if not hasattr(self.features, feature_name):
            return {'error': f'Unknown feature: {feature_name}'}

        setattr(self.features, feature_name, True)
        self._save_feature_flags()

        return {
            'success': True,
            'feature': feature_name,
            'enabled': True
        }

    def disable_feature(self, feature_name: str) -> Dict:
        """Disable a feature flag"""
        if not hasattr(self.features, feature_name):
            return {'error': f'Unknown feature: {feature_name}'}

        setattr(self.features, feature_name, False)
        self._save_feature_flags()

        return {
            'success': True,
            'feature': feature_name,
            'enabled': False
        }

    def _save_feature_flags(self):
        """Save feature flags to config"""
        flags_file = self.config_path / 'features.yaml'

        config = {
            'features': {
                'observability_enabled': self.features.observability_enabled,
                'governance_enabled': self.features.governance_enabled,
                'autonomous_enabled': self.features.autonomous_enabled,
                'advanced_reasoning_enabled': self.features.advanced_reasoning_enabled,
                'multi_agent_enabled': self.features.multi_agent_enabled,
                'aiq_training_enabled': self.features.aiq_training_enabled,
                'consumer_agents_enabled': self.features.consumer_agents_enabled
            }
        }

        with open(flags_file, 'w') as f:
            yaml.dump(config, f)


if __name__ == '__main__':
    # Example usage
    print("🤖 Initializing Cortex AI Agents System...")

    ai_agents = CortexAIAgents()

    # Check system status
    status = ai_agents.get_system_status()
    print(f"\n📊 System Status:")
    print(json.dumps(status, indent=2))

    # Example: Execute task with reasoning
    if ai_agents.features.advanced_reasoning_enabled:
        print("\n🧠 Testing advanced reasoning...")
        result = ai_agents.execute_task_with_reasoning(
            "Analyze security vulnerabilities in authentication module",
            {'module': 'auth', 'language': 'python'},
            reasoning_mode='react'
        )
        print(f"Reasoning result: {result.get('success')} in {result.get('steps', 0)} steps")

    # Example: Check agent health
    if ai_agents.features.observability_enabled:
        print("\n💚 Checking agent health...")
        health = ai_agents.get_agent_health()
        print(f"Monitored agents: {len(health.get('agents', {}))}")

    print("\n✅ AI Agents System Ready!")
