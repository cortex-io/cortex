#!/usr/bin/env python3
"""
Comprehensive Integration Tests for Data Intelligence Platform
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from cortex_intelligence_platform import CortexIntelligencePlatform


class TestDataIntelligencePlatform(unittest.TestCase):
    """Test all platform components"""

    @classmethod
    def setUpClass(cls):
        """Initialize platform once for all tests"""
        cls.platform = CortexIntelligencePlatform()

    def test_task_parsing(self):
        """Test natural language task parsing"""
        result = self.platform.task_parser.parse("Fix authentication bug")
        self.assertIsInstance(result, dict)
        print("✓ Task parsing works")

    def test_rag_system(self):
        """Test RAG recommendations"""
        recs = self.platform.rag_system.get_contextual_recommendations(
            "Implement login feature",
            "development"
        )
        self.assertIn('similar_tasks', recs)
        print("✓ RAG system works")

    def test_lineage_tracking(self):
        """Test lineage tracking"""
        lineage_id = self.platform.lineage_tracker.record_task_created(
            'test-task-001',
            'test-user',
            {'task_type': 'development'}
        )
        self.assertIsNotNone(lineage_id)
        print("✓ Lineage tracking works")

    def test_cost_prediction(self):
        """Test cost prediction"""
        prediction = self.platform.cost_predictor.predict_cost({
            'complexity': 'medium',
            'task_type': 'development'
        })
        self.assertIn('estimated_cost_usd', prediction)
        print("✓ Cost prediction works")

    def test_system_monitoring(self):
        """Test system monitoring"""
        health = self.platform.system_monitor.check_health({
            'error_rate': 0.02,
            'avg_latency_ms': 5000
        })
        self.assertEqual(health['overall_status'], 'healthy')
        print("✓ System monitoring works")

    def test_end_to_end(self):
        """Test end-to-end task processing"""
        result = self.platform.process_task("Add user authentication to the system")

        self.assertIn('parsed_task', result)
        self.assertIn('routing', result)
        self.assertIn('cost_prediction', result)
        self.assertIn('lineage_id', result)

        print("\n✓ End-to-end integration test passed!")
        print(f"  - Master: {result['routing']['master']}")
        print(f"  - Confidence: {result['routing']['confidence']:.2%}")
        print(f"  - Cost: ${result['cost_prediction']['estimated_cost_usd']:.4f}")


def run_tests():
    """Run all tests"""
    print("\n" + "="*60)
    print("Running Cortex Data Intelligence Platform Tests")
    print("="*60 + "\n")

    suite = unittest.TestLoader().loadTestsFromTestCase(TestDataIntelligencePlatform)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "="*60)
    if result.wasSuccessful():
        print("✅ All tests passed!")
    else:
        print("❌ Some tests failed")
    print("="*60 + "\n")

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
