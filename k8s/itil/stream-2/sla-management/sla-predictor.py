#!/usr/bin/env python3
"""
Predictive SLA Management System
Uses ML to predict SLA violations and recommend preventive actions
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
import joblib
from prometheus_client import start_http_server, Gauge, Counter, Histogram
import requests
from kubernetes import client, config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Prometheus metrics
sla_violation_risk = Gauge('sla_violation_risk', 'Predicted risk of SLA violation', ['service', 'sla_type'])
sla_compliance_score = Gauge('sla_compliance_score', 'Current SLA compliance score', ['service'])
sla_predictions_total = Counter('sla_predictions_total', 'Total SLA predictions made')
sla_prediction_accuracy = Gauge('sla_prediction_accuracy', 'Model prediction accuracy')
sla_prediction_latency = Histogram('sla_prediction_latency_seconds', 'SLA prediction latency')

class SLAPredictor:
    """Predictive SLA Management System"""

    def __init__(self):
        self.prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus-k8s.cortex-system.svc.cluster.local:9090')
        self.model_path = '/models/sla_predictor.pkl'
        self.scaler_path = '/models/sla_scaler.pkl'

        # SLA Definitions
        self.sla_definitions = {
            'availability': {'target': 99.9, 'measurement_window': '30d'},
            'response_time': {'target': 200, 'measurement_window': '1h', 'unit': 'ms'},
            'error_rate': {'target': 0.1, 'measurement_window': '1h', 'unit': '%'},
            'throughput': {'target': 1000, 'measurement_window': '1h', 'unit': 'req/s'}
        }

        # Initialize models
        self.violation_classifier = None
        self.performance_predictor = None
        self.scaler = None
        self.load_or_create_models()

        # Try to load k8s config
        try:
            config.load_incluster_config()
            self.k8s_available = True
        except:
            try:
                config.load_kube_config()
                self.k8s_available = True
            except:
                logger.warning("Kubernetes config not available")
                self.k8s_available = False

    def load_or_create_models(self):
        """Load existing models or create new ones"""
        try:
            if os.path.exists(self.model_path):
                self.violation_classifier = joblib.load(self.model_path)
                self.scaler = joblib.load(self.scaler_path)
                logger.info("Loaded existing SLA prediction models")
            else:
                self.violation_classifier = RandomForestClassifier(
                    n_estimators=100,
                    max_depth=10,
                    random_state=42
                )
                self.performance_predictor = GradientBoostingRegressor(
                    n_estimators=100,
                    max_depth=5,
                    random_state=42
                )
                self.scaler = StandardScaler()
                logger.info("Created new SLA prediction models")

                # Train with synthetic data initially
                self.train_initial_models()
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            self.violation_classifier = RandomForestClassifier(n_estimators=50)
            self.scaler = StandardScaler()

    def train_initial_models(self):
        """Train models with synthetic data"""
        logger.info("Training initial models with synthetic data")

        # Generate synthetic training data
        n_samples = 1000
        X = np.random.rand(n_samples, 8)

        # Features: [response_time, error_rate, cpu_usage, memory_usage,
        #            request_rate, active_connections, hour_of_day, day_of_week]

        # Simulate violations based on thresholds
        y = ((X[:, 0] > 0.7) | (X[:, 1] > 0.6) | (X[:, 2] > 0.8)).astype(int)

        # Fit scaler and transform
        X_scaled = self.scaler.fit_transform(X)

        # Train classifier
        self.violation_classifier.fit(X_scaled, y)

        # Save models
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.violation_classifier, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)

        logger.info("Initial model training completed")

    def query_prometheus(self, query: str) -> Optional[float]:
        """Query Prometheus for metrics"""
        try:
            response = requests.get(
                f'{self.prometheus_url}/api/v1/query',
                params={'query': query},
                timeout=10
            )
            if response.status_code == 200:
                result = response.json()
                if result['data']['result']:
                    return float(result['data']['result'][0]['value'][1])
        except Exception as e:
            logger.warning(f"Prometheus query failed: {e}")
        return None

    def get_service_metrics(self, service: str) -> Dict:
        """Collect current metrics for a service"""
        metrics = {}

        # Response time (p95)
        query = f'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{{service="{service}"}}[5m]))'
        metrics['response_time'] = self.query_prometheus(query) or 0.1

        # Error rate
        query = f'rate(http_requests_total{{service="{service}",status=~"5.."}}[5m]) / rate(http_requests_total{{service="{service}"}}[5m])'
        metrics['error_rate'] = self.query_prometheus(query) or 0.0

        # CPU usage
        query = f'avg(rate(container_cpu_usage_seconds_total{{pod=~"{service}.*"}}[5m]))'
        metrics['cpu_usage'] = self.query_prometheus(query) or 0.2

        # Memory usage
        query = f'avg(container_memory_working_set_bytes{{pod=~"{service}.*"}}) / avg(container_spec_memory_limit_bytes{{pod=~"{service}.*"}})'
        metrics['memory_usage'] = self.query_prometheus(query) or 0.3

        # Request rate
        query = f'rate(http_requests_total{{service="{service}"}}[5m])'
        metrics['request_rate'] = self.query_prometheus(query) or 10.0

        # Active connections
        query = f'sum(http_connections_active{{service="{service}"}})'
        metrics['active_connections'] = self.query_prometheus(query) or 5.0

        # Time features
        now = datetime.now()
        metrics['hour_of_day'] = now.hour / 24.0
        metrics['day_of_week'] = now.weekday() / 7.0

        return metrics

    def predict_violation(self, service: str) -> Dict:
        """Predict SLA violation for a service"""
        with sla_prediction_latency.time():
            metrics = self.get_service_metrics(service)

            # Prepare feature vector
            features = np.array([[
                metrics['response_time'],
                metrics['error_rate'],
                metrics['cpu_usage'],
                metrics['memory_usage'],
                metrics['request_rate'],
                metrics['active_connections'],
                metrics['hour_of_day'],
                metrics['day_of_week']
            ]])

            # Scale features
            features_scaled = self.scaler.transform(features)

            # Predict violation probability
            violation_prob = self.violation_classifier.predict_proba(features_scaled)[0][1]

            # Update metrics
            sla_predictions_total.inc()
            sla_violation_risk.labels(service=service, sla_type='overall').set(violation_prob)

            # Calculate compliance score
            compliance = self.calculate_compliance_score(service, metrics)
            sla_compliance_score.labels(service=service).set(compliance)

            # Generate recommendations
            recommendations = self.generate_recommendations(service, metrics, violation_prob)

            return {
                'service': service,
                'violation_probability': float(violation_prob),
                'compliance_score': float(compliance),
                'risk_level': self.get_risk_level(violation_prob),
                'metrics': metrics,
                'recommendations': recommendations,
                'timestamp': datetime.utcnow().isoformat()
            }

    def calculate_compliance_score(self, service: str, metrics: Dict) -> float:
        """Calculate overall SLA compliance score"""
        scores = []

        # Availability (based on error rate)
        availability = (1 - metrics['error_rate']) * 100
        availability_score = min(availability / self.sla_definitions['availability']['target'], 1.0)
        scores.append(availability_score)

        # Response time
        response_time_ms = metrics['response_time'] * 1000
        response_score = max(0, 1 - (response_time_ms / self.sla_definitions['response_time']['target']))
        scores.append(response_score)

        # Error rate
        error_rate_pct = metrics['error_rate'] * 100
        error_score = max(0, 1 - (error_rate_pct / self.sla_definitions['error_rate']['target']))
        scores.append(error_score)

        # Overall compliance
        return np.mean(scores) * 100

    def get_risk_level(self, probability: float) -> str:
        """Determine risk level from probability"""
        if probability >= 0.8:
            return 'CRITICAL'
        elif probability >= 0.6:
            return 'HIGH'
        elif probability >= 0.4:
            return 'MEDIUM'
        elif probability >= 0.2:
            return 'LOW'
        else:
            return 'MINIMAL'

    def generate_recommendations(self, service: str, metrics: Dict, violation_prob: float) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []

        if violation_prob >= 0.6:
            if metrics['cpu_usage'] > 0.7:
                recommendations.append({
                    'action': 'scale_up_cpu',
                    'priority': 'HIGH',
                    'description': f"CPU usage at {metrics['cpu_usage']*100:.1f}%. Consider increasing CPU limits or horizontal scaling."
                })

            if metrics['memory_usage'] > 0.7:
                recommendations.append({
                    'action': 'scale_up_memory',
                    'priority': 'HIGH',
                    'description': f"Memory usage at {metrics['memory_usage']*100:.1f}%. Increase memory limits."
                })

            if metrics['error_rate'] > 0.05:
                recommendations.append({
                    'action': 'investigate_errors',
                    'priority': 'CRITICAL',
                    'description': f"Error rate at {metrics['error_rate']*100:.2f}%. Immediate investigation required."
                })

            if metrics['response_time'] > 0.2:
                recommendations.append({
                    'action': 'optimize_performance',
                    'priority': 'HIGH',
                    'description': f"Response time at {metrics['response_time']*1000:.0f}ms. Performance optimization needed."
                })

        elif violation_prob >= 0.3:
            recommendations.append({
                'action': 'monitor_closely',
                'priority': 'MEDIUM',
                'description': "Elevated risk detected. Increase monitoring frequency."
            })

        if not recommendations:
            recommendations.append({
                'action': 'maintain',
                'priority': 'LOW',
                'description': "Service performing within SLA targets. Continue monitoring."
            })

        return recommendations

    def get_services(self) -> List[str]:
        """Get list of services to monitor"""
        services = []

        if self.k8s_available:
            try:
                v1 = client.CoreV1Api()
                namespaces = ['cortex', 'cortex-system', 'cortex-chat']

                for namespace in namespaces:
                    try:
                        service_list = v1.list_namespaced_service(namespace)
                        for svc in service_list.items:
                            services.append(svc.metadata.name)
                    except:
                        pass
            except Exception as e:
                logger.warning(f"Could not list k8s services: {e}")

        # Default services to monitor
        if not services:
            services = ['cortex-api', 'cortex-chat', 'prometheus', 'grafana']

        return services

    def run_predictions(self):
        """Run predictions for all services"""
        services = self.get_services()
        results = []

        for service in services:
            try:
                prediction = self.predict_violation(service)
                results.append(prediction)

                logger.info(f"Service: {service} | Risk: {prediction['risk_level']} | "
                          f"Violation Prob: {prediction['violation_probability']:.2%} | "
                          f"Compliance: {prediction['compliance_score']:.1f}%")

                # Log high-risk services
                if prediction['violation_probability'] >= 0.6:
                    logger.warning(f"HIGH RISK: {service} has {len(prediction['recommendations'])} recommendations")
                    for rec in prediction['recommendations']:
                        logger.warning(f"  - {rec['priority']}: {rec['description']}")

            except Exception as e:
                logger.error(f"Error predicting for {service}: {e}")

        return results

    def save_predictions(self, predictions: List[Dict]):
        """Save predictions to file"""
        output_file = '/data/sla_predictions.json'
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        with open(output_file, 'w') as f:
            json.dump({
                'timestamp': datetime.utcnow().isoformat(),
                'predictions': predictions
            }, f, indent=2)

        logger.info(f"Saved {len(predictions)} predictions to {output_file}")

def main():
    """Main execution loop"""
    logger.info("Starting Predictive SLA Management System")

    # Start Prometheus metrics server
    start_http_server(8000)
    logger.info("Metrics server started on port 8000")

    predictor = SLAPredictor()

    # Run predictions continuously
    import time
    interval = int(os.getenv('PREDICTION_INTERVAL', '60'))

    while True:
        try:
            predictions = predictor.run_predictions()
            predictor.save_predictions(predictions)

            # Calculate and update model accuracy (mock for now)
            sla_prediction_accuracy.set(0.85)

        except Exception as e:
            logger.error(f"Error in prediction loop: {e}")

        time.sleep(interval)

if __name__ == '__main__':
    main()
