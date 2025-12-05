#!/usr/bin/env python3
"""
Integration Tests for Cortex AI Agents System

Tests all major components and their integration.
"""

import pytest
import json
from pathlib import Path
from datetime import datetime

# Import components
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from cortex_ai_agents import CortexAIAgents, FeatureFlags
from observability.agent_observer import AgentObserver, get_observer
from governance.align_by_design import AlignByDesignGovernance, RiskLevel
from autonomous.autonomous_agent import AutonomousAgent, TriggerType
from reasoning.advanced_reasoning import ChainOfThoughtReasoner, ReActAgent
from orchestration.multi_agent_coordinator import MultiAgentCoordinator
from training.aiq_system import AIQAssessment, TrainingProgram


class TestObservability:
    """Test observability and monitoring"""

    def test_observe_decision(self):
        """Test decision observation"""
        observer = get_observer()

        observer.observe_decision('test-agent-001', {
            'decision': 'route',
            'confidence': 0.85,
            'reasoning_chain': ['step1', 'step2']
        })

        observations = observer.get_recent_observations('test-agent-001', limit=1)
        assert len(observations) > 0
        assert observations[0]['type'] == 'decision'
        assert observations[0]['confidence'] == 0.85

    def test_observe_action(self):
        """Test action observation"""
        observer = get_observer()

        observer.observe_action('test-agent-001',
            {'action': 'test'},
            {'success': True, 'latency_ms': 100, 'cost': 0.01}
        )

        observations = observer.get_recent_observations('test-agent-001', limit=1)
        assert len(observations) > 0
        assert observations[0]['type'] == 'action'
        assert observations[0]['success'] is True

    def test_health_score(self):
        """Test health score calculation"""
        observer = get_observer()

        # Record some successful actions
        for i in range(5):
            observer.observe_action('test-agent-002',
                {'action': f'test-{i}'},
                {'success': True, 'latency_ms': 100, 'cost': 0.01}
            )

        health = observer.get_agent_health('test-agent-002')
        assert health >= 0.0 and health <= 1.0
        assert health > 0.8  # Should be healthy

    def test_anomaly_detection(self):
        """Test anomaly detection"""
        observer = get_observer()

        # Record normal actions
        for i in range(5):
            observer.observe_decision('test-agent-003', {
                'decision': 'route',
                'confidence': 0.85
            })

        # Record anomalous action (low confidence)
        observer.observe_decision('test-agent-003', {
            'decision': 'route',
            'confidence': 0.30  # Significant drop
        })

        # Anomaly should be detected
        recent = observer.get_recent_observations('test-agent-003', limit=10)
        anomalies = [o for o in recent if o.get('anomalies')]
        assert len(anomalies) > 0


class TestGovernance:
    """Test governance framework"""

    def test_policy_evaluation(self):
        """Test policy engine"""
        governance = AlignByDesignGovernance()

        # Low-risk action should be approved
        result = governance.validate_action('test-agent', {
            'action_id': 'test-001',
            'agent_type': 'security-master',
            'action_type': 'analyze',
            'files_changed': ['test.py'],
            'estimated_cost': 0.01,
            'reasoning_provided': True,
            'audit_logged': True
        })

        assert result['approved'] is True
        assert result['policy_result']['risk_level'] in ['NONE', 'LOW']

    def test_high_risk_rejection(self):
        """Test high-risk action rejection"""
        governance = AlignByDesignGovernance()

        # High-risk action should require approval
        result = governance.validate_action('test-agent', {
            'action_id': 'test-002',
            'agent_type': 'development-master',
            'action_type': 'deploy',  # High risk
            'reasoning_provided': True,
            'audit_logged': True
        })

        # Should have required approvals
        assert len(result['policy_result']['required_approvals']) > 0

    def test_ethics_validation(self):
        """Test ethics validator"""
        governance = AlignByDesignGovernance()

        # Action without reasoning should have ethics concerns
        result = governance.validate_action('test-agent', {
            'action_id': 'test-003',
            'agent_type': 'development-master',
            'action_type': 'analyze',
            'reasoning_provided': False  # No reasoning
        })

        # Should have ethics concerns
        assert len(result['ethics_result']['concerns']) > 0


class TestAutonomous:
    """Test autonomous agent execution"""

    def test_trigger_registration(self):
        """Test trigger registration"""
        agent = AutonomousAgent('test-autonomous-001', 'test-type', {
            'autonomous_enabled': True
        })

        agent.register_trigger(
            TriggerType.EVENT,
            condition=lambda ctx: ctx.get('event') == 'test',
            action=lambda ctx: {'result': 'executed'}
        )

        assert len(agent.triggers) == 1
        assert agent.triggers[0]['type'] == TriggerType.EVENT

    def test_trigger_evaluation(self):
        """Test trigger evaluation"""
        agent = AutonomousAgent('test-autonomous-002', 'test-type', {
            'autonomous_enabled': True
        })

        agent.register_trigger(
            TriggerType.EVENT,
            condition=lambda ctx: ctx.get('event') == 'test',
            action=lambda ctx: {'result': 'executed'}
        )

        # Should trigger
        actions = agent.evaluate_triggers({'event': 'test'})
        assert len(actions) == 1

        # Should not trigger
        actions = agent.evaluate_triggers({'event': 'other'})
        assert len(actions) == 0


class TestReasoning:
    """Test advanced reasoning patterns"""

    def test_chain_of_thought(self):
        """Test Chain-of-Thought reasoning"""
        # Skip if no API key
        try:
            cot = ChainOfThoughtReasoner()
            steps = cot.reason(
                "Test task",
                {'context': 'test'}
            )

            assert isinstance(steps, list)
            # Should have reasoning steps
            assert len(steps) > 0
        except Exception as e:
            pytest.skip(f"CoT test requires API key: {e}")

    def test_react_agent(self):
        """Test ReAct agent"""
        react = ReActAgent()

        # Register test tool
        react.register_tool(
            'test_tool',
            lambda x: "test result",
            "Test tool description"
        )

        assert 'test_tool' in react.tools
        assert react.max_iterations == 10


class TestOrchestration:
    """Test multi-agent orchestration"""

    def test_agent_registration(self):
        """Test agent registration"""
        coordinator = MultiAgentCoordinator()

        coordinator.register_agent('agent-001', 'test-type', ['test'])

        assert 'agent-001' in coordinator.agents
        assert coordinator.agents['agent-001']['status'] == 'idle'

    def test_task_decomposition(self):
        """Test task decomposition"""
        coordinator = MultiAgentCoordinator()

        task = {'type': 'migrate_authentication'}
        subtasks = coordinator._decompose_task(task)

        # Should decompose into multiple subtasks
        assert len(subtasks) > 1
        assert any(s['type'] == 'analyze' for s in subtasks)
        assert any(s['type'] == 'implement' for s in subtasks)


class TestAIQ:
    """Test AIQ training system"""

    def test_aiq_assessment(self):
        """Test AIQ assessment"""
        assessment_tool = AIQAssessment()

        responses = {
            'prompt_engineering': 75,
            'ai_limitations': 80,
            'agent_collaboration': 70,
            'governance_ethics': 85,
            'strategic_thinking': 65
        }

        result = assessment_tool.assess('test-user-001', responses)

        assert 'aiq_score' in result
        assert 'level' in result
        assert result['aiq_score'] > 0
        assert result['aiq_score'] <= 100
        assert result['level'] in ['novice', 'beginner', 'intermediate', 'proficient', 'expert']

    def test_training_plan(self):
        """Test training plan generation"""
        assessment_tool = AIQAssessment()
        training = TrainingProgram()

        responses = {
            'prompt_engineering': 60,  # Below 70
            'ai_limitations': 70,
            'agent_collaboration': 55,  # Below 70
            'governance_ethics': 80,
            'strategic_thinking': 50  # Below 70
        }

        assessment = assessment_tool.assess('test-user-002', responses)
        plan = training.generate_training_plan(
            'test-user-002',
            assessment['aiq_score'],
            80,
            assessment
        )

        assert 'recommended_modules' in plan
        assert len(plan['recommended_modules']) > 0
        # Should recommend modules for weak areas
        assert len(plan['weak_areas']) > 0


class TestIntegration:
    """Test full system integration"""

    def test_system_initialization(self):
        """Test AI agents system initialization"""
        ai_agents = CortexAIAgents()

        status = ai_agents.get_system_status()

        assert 'features' in status
        assert 'components' in status
        assert status['components']['observer'] is True
        assert status['components']['governance'] is True

    def test_feature_flags(self):
        """Test feature flag management"""
        ai_agents = CortexAIAgents()

        # Check initial state
        assert isinstance(ai_agents.features.observability_enabled, bool)
        assert isinstance(ai_agents.features.governance_enabled, bool)

    def test_reasoning_execution(self):
        """Test reasoning execution through main system"""
        ai_agents = CortexAIAgents()

        if not ai_agents.features.advanced_reasoning_enabled:
            pytest.skip("Advanced reasoning not enabled")

        # Test with plan-execute (doesn't require API key)
        result = ai_agents.execute_task_with_reasoning(
            "Test task",
            {'test': True},
            reasoning_mode='plan-execute'
        )

        assert 'reasoning_mode' in result

    def test_governance_validation(self):
        """Test governance validation through main system"""
        ai_agents = CortexAIAgents()

        validation = ai_agents.validate_action('test-agent', {
            'agent_type': 'development-master',
            'action_type': 'analyze',
            'reasoning_provided': True,
            'audit_logged': True
        })

        assert 'approved' in validation
        assert 'policy_result' in validation
        assert 'ethics_result' in validation

    def test_health_monitoring(self):
        """Test health monitoring through main system"""
        ai_agents = CortexAIAgents()

        # Record some observations
        ai_agents.observer.observe_decision('test-integration-001', {
            'decision': 'test',
            'confidence': 0.9
        })

        # Get health
        health = ai_agents.get_agent_health('test-integration-001')

        assert 'agent_id' in health
        assert 'health_score' in health
        assert health['health_score'] >= 0.0
        assert health['health_score'] <= 1.0


if __name__ == '__main__':
    # Run tests
    pytest.main([__file__, '-v', '--tb=short'])
