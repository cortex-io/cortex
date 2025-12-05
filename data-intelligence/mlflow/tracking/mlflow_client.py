#!/usr/bin/env python3
"""
MLflow Tracking Client for Cortex

Provides integration between Cortex and MLflow for experiment tracking,
model versioning, and performance optimization.
"""

import json
import os
import yaml
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import mlflow
from mlflow.tracking import MlflowClient


class CortexMLflowClient:
    """MLflow client for Cortex experiment tracking"""

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize MLflow client with Cortex configuration

        Args:
            config_path: Path to mlflow_config.yaml
        """
        self.config_path = config_path or Path(__file__).parent.parent / 'config' / 'mlflow_config.yaml'
        self.config = self._load_config()

        # Set tracking URI
        tracking_uri = self.config['tracking']['backend_store_uri']
        mlflow.set_tracking_uri(tracking_uri)

        # Initialize MLflow client
        self.client = MlflowClient()

        # Initialize experiments
        self.experiments = self._initialize_experiments()

    def _load_config(self) -> Dict:
        """Load MLflow configuration"""
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)

    def _initialize_experiments(self) -> Dict[str, str]:
        """Initialize or get existing experiments"""
        experiments = {}

        for exp_key, exp_config in self.config['experiments'].items():
            exp_name = exp_config['name']

            # Get or create experiment
            experiment = mlflow.get_experiment_by_name(exp_name)

            if experiment is None:
                experiment_id = mlflow.create_experiment(
                    name=exp_name,
                    tags=exp_config.get('tags', {})
                )
            else:
                experiment_id = experiment.experiment_id

            experiments[exp_key] = experiment_id

        return experiments

    def track_routing_decision(
        self,
        task_id: str,
        routing_data: Dict,
        outcome_data: Optional[Dict] = None
    ) -> str:
        """
        Track a routing decision as an MLflow run

        Args:
            task_id: Unique task identifier
            routing_data: Routing decision data
            outcome_data: Task outcome data (optional, for post-execution tracking)

        Returns:
            MLflow run ID
        """
        experiment_id = self.experiments['routing_optimization']

        with mlflow.start_run(experiment_id=experiment_id, run_name=f"routing-{task_id}") as run:
            # Log routing parameters
            mlflow.log_param("task_id", task_id)
            mlflow.log_param("routing_strategy", routing_data.get('routing_strategy'))
            mlflow.log_param("routing_method", routing_data.get('routing_method'))
            mlflow.log_param("primary_expert", routing_data.get('decision', {}).get('primary_expert'))
            mlflow.log_param("task_complexity", routing_data.get('task_complexity'))

            # Log routing confidence
            confidence = routing_data.get('decision', {}).get('primary_confidence', 0)
            mlflow.log_metric("routing_confidence", confidence)

            # Log matched keywords
            if 'matched_keywords' in routing_data:
                mlflow.log_param("matched_keywords", ','.join(routing_data['matched_keywords']))

            # Log model recommendation
            model_rec = routing_data.get('decision', {}).get('model_recommendation', {})
            if model_rec:
                mlflow.log_param("recommended_model", model_rec.get('model'))
                mlflow.log_param("model_provider", model_rec.get('provider'))
                mlflow.log_param("model_tier", model_rec.get('tier'))

            # If outcome data is provided, log it
            if outcome_data:
                self._log_outcome_metrics(outcome_data)

                # Calculate routing accuracy
                actual_expert = outcome_data.get('actual_master')
                predicted_expert = routing_data.get('decision', {}).get('primary_expert')

                if actual_expert and predicted_expert:
                    routing_accuracy = 1.0 if actual_expert == predicted_expert else 0.0
                    mlflow.log_metric("routing_accuracy", routing_accuracy)

            # Log full routing data as artifact
            with open('/tmp/routing_decision.json', 'w') as f:
                json.dump(routing_data, f, indent=2, default=str)
            mlflow.log_artifact('/tmp/routing_decision.json', 'routing_decisions')

            # Add tags
            mlflow.set_tag("task_type", routing_data.get('task_type', 'unknown'))
            mlflow.set_tag("timestamp", datetime.now().isoformat())

            return run.info.run_id

    def track_model_selection(
        self,
        task_id: str,
        model_data: Dict,
        performance_data: Optional[Dict] = None
    ) -> str:
        """
        Track a model selection decision

        Args:
            task_id: Unique task identifier
            model_data: Model selection data
            performance_data: Model performance data (optional)

        Returns:
            MLflow run ID
        """
        experiment_id = self.experiments['model_selection']

        with mlflow.start_run(experiment_id=experiment_id, run_name=f"model-{task_id}") as run:
            # Log model selection parameters
            mlflow.log_param("task_id", task_id)
            mlflow.log_param("selected_model", model_data.get('selected_model'))
            mlflow.log_param("model_provider", model_data.get('model_provider'))
            mlflow.log_param("model_tier", model_data.get('model_tier'))
            mlflow.log_param("selection_reason", model_data.get('selection_reason'))

            # Log task context
            mlflow.log_param("task_type", model_data.get('task_type'))
            mlflow.log_param("task_complexity", model_data.get('task_complexity'))

            # Log token estimates
            if 'estimated_tokens' in model_data:
                mlflow.log_metric("estimated_tokens", model_data['estimated_tokens'])
            if 'token_budget' in model_data:
                mlflow.log_metric("token_budget", model_data['token_budget'])

            # If performance data is provided, log it
            if performance_data:
                if 'actual_tokens_used' in performance_data:
                    mlflow.log_metric("actual_tokens_used", performance_data['actual_tokens_used'])
                if 'actual_duration_seconds' in performance_data:
                    mlflow.log_metric("duration_seconds", performance_data['actual_duration_seconds'])
                if 'quality_score' in performance_data:
                    mlflow.log_metric("quality_score", performance_data['quality_score'])
                if 'cost_usd' in performance_data:
                    mlflow.log_metric("cost_usd", performance_data['cost_usd'])
                if 'cost_efficiency_score' in performance_data:
                    mlflow.log_metric("cost_efficiency", performance_data['cost_efficiency_score'])

                # Log task outcome
                mlflow.log_param("task_outcome", performance_data.get('task_outcome'))

                # Calculate selection accuracy
                if 'optimal_model' in performance_data:
                    selection_accuracy = 1.0 if performance_data['optimal_model'] == model_data['selected_model'] else 0.0
                    mlflow.log_metric("selection_accuracy", selection_accuracy)

            # Add tags
            mlflow.set_tag("timestamp", datetime.now().isoformat())

            return run.info.run_id

    def track_experiment_run(
        self,
        experiment_key: str,
        run_name: str,
        params: Dict[str, Any],
        metrics: Dict[str, float],
        artifacts: Optional[Dict[str, str]] = None,
        tags: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Track a generic experiment run

        Args:
            experiment_key: Key from config (e.g., 'routing_optimization')
            run_name: Name for this run
            params: Parameters to log
            metrics: Metrics to log
            artifacts: Artifacts to log (path -> artifact path)
            tags: Tags to add

        Returns:
            MLflow run ID
        """
        experiment_id = self.experiments.get(experiment_key)

        if not experiment_id:
            raise ValueError(f"Unknown experiment key: {experiment_key}")

        with mlflow.start_run(experiment_id=experiment_id, run_name=run_name) as run:
            # Log parameters
            for key, value in params.items():
                mlflow.log_param(key, value)

            # Log metrics
            for key, value in metrics.items():
                mlflow.log_metric(key, value)

            # Log artifacts
            if artifacts:
                for local_path, artifact_path in artifacts.items():
                    mlflow.log_artifact(local_path, artifact_path)

            # Add tags
            if tags:
                for key, value in tags.items():
                    mlflow.set_tag(key, value)

            mlflow.set_tag("timestamp", datetime.now().isoformat())

            return run.info.run_id

    def update_run_metrics(
        self,
        run_id: str,
        metrics: Dict[str, float],
        step: Optional[int] = None
    ):
        """
        Update metrics for an existing run

        Args:
            run_id: MLflow run ID
            metrics: Metrics to log
            step: Optional step number for time-series metrics
        """
        for key, value in metrics.items():
            self.client.log_metric(run_id, key, value, step=step)

    def get_best_run(
        self,
        experiment_key: str,
        metric: str,
        ascending: bool = False
    ) -> Optional[Dict]:
        """
        Get the best run for an experiment based on a metric

        Args:
            experiment_key: Key from config
            metric: Metric to optimize
            ascending: True for minimization, False for maximization

        Returns:
            Best run data or None
        """
        experiment_id = self.experiments.get(experiment_key)

        if not experiment_id:
            return None

        runs = self.client.search_runs(
            experiment_ids=[experiment_id],
            order_by=[f"metrics.{metric} {'ASC' if ascending else 'DESC'}"],
            max_results=1
        )

        if runs:
            run = runs[0]
            return {
                'run_id': run.info.run_id,
                'run_name': run.info.run_name,
                'metrics': run.data.metrics,
                'params': run.data.params,
                'tags': run.data.tags,
            }

        return None

    def compare_runs(
        self,
        experiment_key: str,
        run_ids: List[str]
    ) -> List[Dict]:
        """
        Compare multiple runs

        Args:
            experiment_key: Key from config
            run_ids: List of run IDs to compare

        Returns:
            List of run data
        """
        results = []

        for run_id in run_ids:
            run = self.client.get_run(run_id)
            results.append({
                'run_id': run.info.run_id,
                'run_name': run.info.run_name,
                'metrics': run.data.metrics,
                'params': run.data.params,
                'tags': run.data.tags,
                'start_time': run.info.start_time,
                'end_time': run.info.end_time,
            })

        return results

    def get_experiment_stats(self, experiment_key: str) -> Dict:
        """
        Get statistics for an experiment

        Args:
            experiment_key: Key from config

        Returns:
            Experiment statistics
        """
        experiment_id = self.experiments.get(experiment_key)

        if not experiment_id:
            return {}

        runs = self.client.search_runs(experiment_ids=[experiment_id])

        if not runs:
            return {'total_runs': 0}

        # Calculate statistics
        total_runs = len(runs)
        completed_runs = len([r for r in runs if r.info.status == 'FINISHED'])
        failed_runs = len([r for r in runs if r.info.status == 'FAILED'])

        # Get metric statistics
        metric_stats = {}
        metrics_config = self.config.get('metrics', {})

        for metric_name in metrics_config.keys():
            values = [r.data.metrics.get(metric_name) for r in runs if metric_name in r.data.metrics]
            if values:
                metric_stats[metric_name] = {
                    'count': len(values),
                    'mean': sum(values) / len(values),
                    'min': min(values),
                    'max': max(values),
                }

        return {
            'experiment_id': experiment_id,
            'total_runs': total_runs,
            'completed_runs': completed_runs,
            'failed_runs': failed_runs,
            'success_rate': completed_runs / total_runs if total_runs > 0 else 0,
            'metric_stats': metric_stats,
        }

    def _log_outcome_metrics(self, outcome_data: Dict):
        """Log task outcome metrics"""
        if 'tokens_used' in outcome_data:
            mlflow.log_metric("tokens_used", outcome_data['tokens_used'])

        if 'duration_minutes' in outcome_data:
            mlflow.log_metric("duration_minutes", outcome_data['duration_minutes'])

        if 'cost' in outcome_data:
            mlflow.log_metric("cost_usd", outcome_data['cost'])

        if 'quality_score' in outcome_data:
            mlflow.log_metric("quality_score", outcome_data['quality_score'])

        if 'success' in outcome_data:
            success = 1.0 if outcome_data['success'] else 0.0
            mlflow.log_metric("task_success", success)


def main():
    """Example usage"""
    client = CortexMLflowClient()

    # Track a routing decision
    routing_data = {
        'task_id': 'example-task-001',
        'routing_strategy': 'mixture_of_experts',
        'routing_method': 'nlp-keyword',
        'decision': {
            'primary_expert': 'development-master',
            'primary_confidence': 0.92,
            'model_recommendation': {
                'model': 'claude-sonnet-4',
                'provider': 'anthropic',
                'tier': 'balanced'
            }
        },
        'matched_keywords': ['implement', 'feature', 'code'],
        'task_complexity': 'medium',
        'task_type': 'development',
    }

    run_id = client.track_routing_decision('example-task-001', routing_data)
    print(f"Created run: {run_id}")

    # Get experiment stats
    stats = client.get_experiment_stats('routing_optimization')
    print(f"Experiment stats: {json.dumps(stats, indent=2)}")


if __name__ == '__main__':
    main()
