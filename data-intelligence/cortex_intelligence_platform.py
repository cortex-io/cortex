#!/usr/bin/env python3
"""
Cortex Data Intelligence Platform - Main Integration

Integrates all phases into a unified system.
"""

import sys
from pathlib import Path

# Add data-intelligence to path
sys.path.insert(0, str(Path(__file__).parent))

from migration.migrate import MigrationOrchestrator
from mlflow.tracking.mlflow_client import CortexMLflowClient
from lineage.tracking.lineage_tracker import LineageTracker
from intelligence.nlp.task_parser import NLTaskParser
from intelligence.rag.rag_system import CortexRAGSystem
from intelligence.automl.routing_optimizer import RoutingAutoML
from intelligence.semantic_search.search_engine import SemanticSearchEngine
from scale.monitoring.system_monitor import SystemMonitor
from scale.cost_optimization.cost_predictor import CostPredictor
from collaboration.analytics.analytics_dashboard import AnalyticsDashboard


class CortexIntelligencePlatform:
    """Unified Data Intelligence Platform for Cortex"""

    def __init__(self):
        print("🚀 Initializing Cortex Data Intelligence Platform...")

        # Phase 1: Foundation
        self.mlflow_client = CortexMLflowClient()
        self.lineage_tracker = LineageTracker()
        print("✓ Foundation layer initialized")

        # Phase 2: Intelligence
        self.task_parser = NLTaskParser()
        self.rag_system = CortexRAGSystem()
        self.routing_optimizer = RoutingAutoML()
        self.search_engine = SemanticSearchEngine()
        print("✓ Intelligence layer initialized")

        # Phase 3: Scale
        self.system_monitor = SystemMonitor()
        self.cost_predictor = CostPredictor()
        print("✓ Scale layer initialized")

        # Phase 4: Collaboration
        self.analytics_dashboard = AnalyticsDashboard()
        print("✓ Collaboration layer initialized")

        print("\n🎉 Cortex Data Intelligence Platform ready!")

    def process_task(self, natural_language_task: str) -> dict:
        """Process a task end-to-end"""
        # Parse natural language
        parsed_task = self.task_parser.parse(natural_language_task)

        # Get RAG recommendations
        recommendations = self.rag_system.get_contextual_recommendations(
            task_description=natural_language_task,
            task_type=parsed_task.get('task_type', 'development')
        )

        # Predict optimal routing
        master, confidence = self.routing_optimizer.predict(parsed_task)

        # Predict cost
        cost_prediction = self.cost_predictor.predict_cost(parsed_task)

        # Track in lineage
        lineage_id = self.lineage_tracker.record_task_created(
            task_id=f"task-{hash(natural_language_task)}",
            created_by='user',
            task_data=parsed_task
        )

        return {
            'parsed_task': parsed_task,
            'recommendations': recommendations,
            'routing': {
                'master': master,
                'confidence': confidence
            },
            'cost_prediction': cost_prediction,
            'lineage_id': lineage_id
        }


def main():
    """Main entry point"""
    platform = CortexIntelligencePlatform()

    # Example usage
    result = platform.process_task("Fix the authentication bug in the login system")
    print("\nExample Task Processing:")
    print(f"- Recommended Master: {result['routing']['master']}")
    print(f"- Confidence: {result['routing']['confidence']:.2%}")
    print(f"- Estimated Cost: ${result['cost_prediction']['estimated_cost_usd']:.4f}")
    print(f"- Lineage ID: {result['lineage_id']}")


if __name__ == '__main__':
    main()
