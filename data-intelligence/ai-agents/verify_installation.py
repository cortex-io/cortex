#!/usr/bin/env python3
"""
Quick verification script to ensure AI Agents system is properly installed
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def verify_imports():
    """Verify all components can be imported"""
    print("🔍 Verifying AI Agents System Installation...\n")

    try:
        # Main integration
        from cortex_ai_agents import CortexAIAgents, FeatureFlags
        print("✅ Main integration (CortexAIAgents)")

        # Observability
        from observability.agent_observer import AgentObserver, get_observer
        print("✅ Observability (AgentObserver)")

        # Governance
        from governance.align_by_design import AlignByDesignGovernance
        print("✅ Governance (AlignByDesignGovernance)")

        # Autonomous
        from autonomous.autonomous_agent import AutonomousAgent, AutonomousAgentManager
        print("✅ Autonomous (AutonomousAgent)")

        # Reasoning
        from reasoning.advanced_reasoning import ChainOfThoughtReasoner, ReActAgent
        print("✅ Reasoning (ChainOfThoughtReasoner, ReActAgent)")

        # Orchestration
        from orchestration.multi_agent_coordinator import MultiAgentCoordinator
        print("✅ Orchestration (MultiAgentCoordinator)")

        # Training
        from training.aiq_system import AIQAssessment, TrainingProgram
        print("✅ Training (AIQAssessment, TrainingProgram)")

        return True

    except ImportError as e:
        print(f"❌ Import error: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_initialization():
    """Verify system can be initialized"""
    print("\n🔧 Testing System Initialization...\n")

    try:
        from cortex_ai_agents import CortexAIAgents

        # Initialize
        ai_agents = CortexAIAgents()
        print("✅ System initialized successfully")

        # Check status
        status = ai_agents.get_system_status()
        print(f"✅ System status retrieved")

        # Check components
        components = status['components']
        print(f"\n📊 Components Status:")
        for component, active in components.items():
            status_icon = "✅" if active else "⚠️"
            print(f"  {status_icon} {component}: {'Active' if active else 'Inactive'}")

        # Check features
        features = status['features']
        print(f"\n🎛️  Feature Flags:")
        for feature, enabled in features.items():
            status_icon = "✅" if enabled else "❌"
            print(f"  {status_icon} {feature}: {'Enabled' if enabled else 'Disabled'}")

        return True

    except Exception as e:
        print(f"❌ Initialization error: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_observability():
    """Test observability component"""
    print("\n👁️  Testing Observability...\n")

    try:
        from observability.agent_observer import get_observer

        observer = get_observer()

        # Record a test decision
        observer.observe_decision('test-agent', {
            'decision': 'test',
            'confidence': 0.85
        })
        print("✅ Decision observation recorded")

        # Record a test action
        observer.observe_action('test-agent',
            {'action': 'test'},
            {'success': True, 'latency_ms': 100}
        )
        print("✅ Action observation recorded")

        # Get health
        health = observer.get_agent_health('test-agent')
        print(f"✅ Health score calculated: {health:.1%}")

        return True

    except Exception as e:
        print(f"❌ Observability error: {e}")
        return False

def verify_governance():
    """Test governance component"""
    print("\n🔒 Testing Governance...\n")

    try:
        from governance.align_by_design import AlignByDesignGovernance

        governance = AlignByDesignGovernance()

        # Validate a low-risk action
        result = governance.validate_action('test-agent', {
            'agent_type': 'security-master',
            'action_type': 'analyze',
            'reasoning_provided': True,
            'audit_logged': True
        })

        print(f"✅ Action validated: {result['approved']}")
        print(f"   Risk level: {result['policy_result']['risk_level']}")

        return True

    except Exception as e:
        print(f"❌ Governance error: {e}")
        return False

def main():
    """Run all verification tests"""
    print("=" * 60)
    print("Cortex AI Agents System - Installation Verification")
    print("=" * 60)

    results = []

    # Run tests
    results.append(("Imports", verify_imports()))
    results.append(("Initialization", verify_initialization()))
    results.append(("Observability", verify_observability()))
    results.append(("Governance", verify_governance()))

    # Summary
    print("\n" + "=" * 60)
    print("📊 Verification Summary")
    print("=" * 60)

    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False

    print("=" * 60)

    if all_passed:
        print("\n🎉 All verification tests passed!")
        print("✅ Cortex AI Agents System is ready to use")
        print("\nNext steps:")
        print("  1. Review README.md for usage examples")
        print("  2. Run: ./data-intelligence/ai-agents/deploy.sh check")
        print("  3. Deploy Phase 1: ./data-intelligence/ai-agents/deploy.sh phase1")
        return 0
    else:
        print("\n❌ Some verification tests failed")
        print("Please check error messages above")
        return 1

if __name__ == '__main__':
    sys.exit(main())
