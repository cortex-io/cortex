#!/usr/bin/env python3
"""
Availability Risk Engine
Advanced risk scoring and predictive availability management
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import numpy as np
from sklearn.ensemble import IsolationForest
import requests
from prometheus_client import start_http_server, Gauge, Counter, Histogram
from kubernetes import client, config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Prometheus metrics
availability_risk_score = Gauge('availability_risk_score', 'Overall availability risk score', ['service', 'component'])
availability_predicted = Gauge('availability_predicted_percentage', 'Predicted availability', ['service', 'timeframe'])
availability_current = Gauge('availability_current_percentage', 'Current availability', ['service'])
availability_incidents_predicted = Gauge('availability_incidents_predicted', 'Predicted incidents in next period', ['service'])
availability_mtbf = Gauge('availability_mtbf_hours', 'Mean time between failures', ['service'])
availability_mttr = Gauge('availability_mttr_minutes', 'Mean time to recovery', ['service'])
availability_risk_factors = Gauge('availability_risk_factors', 'Individual risk factor scores', ['service', 'factor'])

class AvailabilityRiskEngine:
    """Advanced Availability Risk Engine"""

    def __init__(self):
        self.prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus-k8s.cortex-system.svc.cluster.local:9090')

        # Risk factor weights
        self.risk_weights = {
            'resource_exhaustion': 0.25,
            'error_rate': 0.20,
            'dependency_health': 0.20,
            'historical_incidents': 0.15,
            'deployment_risk': 0.10,
            'anomaly_detection': 0.10
        }

        # Availability targets by tier
        self.availability_targets = {
            'critical': 99.99,    # 4 nines
            'high': 99.9,         # 3 nines
            'medium': 99.5,       # 2.5 nines
            'low': 99.0           # 2 nines
        }

        # Anomaly detection model
        self.anomaly_detector = IsolationForest(
            contamination=0.1,
            random_state=42
        )

        # Historical incident tracking
        self.incident_history = []
        self.load_incident_history()

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

    def load_incident_history(self):
        """Load historical incident data"""
        history_file = '/data/incident_history.json'
        if os.path.exists(history_file):
            try:
                with open(history_file, 'r') as f:
                    data = json.load(f)
                    self.incident_history = data.get('incidents', [])
                    logger.info(f"Loaded {len(self.incident_history)} historical incidents")
            except Exception as e:
                logger.warning(f"Could not load incident history: {e}")

    def save_incident_history(self):
        """Save incident history"""
        history_file = '/data/incident_history.json'
        os.makedirs(os.path.dirname(history_file), exist_ok=True)

        with open(history_file, 'w') as f:
            json.dump({
                'timestamp': datetime.utcnow().isoformat(),
                'incidents': self.incident_history[-1000:]  # Keep last 1000
            }, f, indent=2)

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
            logger.debug(f"Prometheus query failed: {e}")
        return None

    def query_prometheus_range(self, query: str, hours: int = 24) -> List[Tuple[float, float]]:
        """Query Prometheus for time series data"""
        try:
            end_time = datetime.now()
            start_time = end_time - timedelta(hours=hours)

            response = requests.get(
                f'{self.prometheus_url}/api/v1/query_range',
                params={
                    'query': query,
                    'start': start_time.timestamp(),
                    'end': end_time.timestamp(),
                    'step': '300'  # 5 minute steps
                },
                timeout=30
            )
            if response.status_code == 200:
                result = response.json()
                if result['data']['result']:
                    values = result['data']['result'][0]['values']
                    return [(float(v[0]), float(v[1])) for v in values]
        except Exception as e:
            logger.debug(f"Prometheus range query failed: {e}")
        return []

    def assess_resource_exhaustion_risk(self, service: str) -> float:
        """Assess risk of resource exhaustion"""
        risks = []

        # CPU risk
        query = f'avg(rate(container_cpu_usage_seconds_total{{pod=~"{service}.*"}}[5m])) / avg(container_spec_cpu_quota{{pod=~"{service}.*"}})'
        cpu_usage = self.query_prometheus(query) or 0.3
        cpu_risk = min(1.0, max(0, (cpu_usage - 0.5) / 0.4))  # Risk starts at 50%, maxes at 90%
        risks.append(cpu_risk)

        # Memory risk
        query = f'avg(container_memory_working_set_bytes{{pod=~"{service}.*"}}) / avg(container_spec_memory_limit_bytes{{pod=~"{service}.*"}})'
        memory_usage = self.query_prometheus(query) or 0.4
        memory_risk = min(1.0, max(0, (memory_usage - 0.6) / 0.3))  # Risk starts at 60%, maxes at 90%
        risks.append(memory_risk)

        # Disk risk
        query = f'(sum(node_filesystem_size_bytes) - sum(node_filesystem_avail_bytes)) / sum(node_filesystem_size_bytes)'
        disk_usage = self.query_prometheus(query) or 0.5
        disk_risk = min(1.0, max(0, (disk_usage - 0.7) / 0.2))  # Risk starts at 70%, maxes at 90%
        risks.append(disk_risk)

        # Pod limit risk
        if self.k8s_available:
            try:
                v1 = client.CoreV1Api()
                pods = v1.list_pod_for_all_namespaces(label_selector=f"app={service}")
                pod_count = len(pods.items)
                pod_limit = 10  # Assumed limit
                pod_risk = min(1.0, pod_count / pod_limit)
                risks.append(pod_risk)
            except:
                pass

        return np.mean(risks) if risks else 0.0

    def assess_error_rate_risk(self, service: str) -> float:
        """Assess risk from error rates"""
        # Current error rate
        query = f'rate(http_requests_total{{service="{service}",status=~"5.."}}[5m]) / rate(http_requests_total{{service="{service}"}}[5m])'
        error_rate = self.query_prometheus(query) or 0.0

        # Error rate trend (increasing errors = higher risk)
        query = f'deriv(rate(http_requests_total{{service="{service}",status=~"5.."}}[5m])[30m:1m])'
        error_trend = self.query_prometheus(query) or 0.0

        # Combined risk
        base_risk = min(1.0, error_rate / 0.05)  # 5% error rate = max risk
        trend_risk = min(1.0, max(0, error_trend * 100))  # Increasing trend adds risk

        return (base_risk * 0.7) + (trend_risk * 0.3)

    def assess_dependency_health_risk(self, service: str) -> float:
        """Assess risk from unhealthy dependencies"""
        risks = []

        # Check upstream services (mocked - would query service mesh)
        dependencies = {
            'cortex-api': ['prometheus', 'grafana'],
            'cortex-chat': ['cortex-api'],
            'prometheus': [],
            'grafana': ['prometheus']
        }

        service_deps = dependencies.get(service, [])

        for dep in service_deps:
            query = f'up{{service="{dep}"}}'
            dep_health = self.query_prometheus(query)

            if dep_health is not None:
                dep_risk = 1.0 - dep_health  # 0 = healthy, 1 = down
                risks.append(dep_risk)

        return np.mean(risks) if risks else 0.0

    def assess_historical_incident_risk(self, service: str) -> float:
        """Assess risk based on historical incident patterns"""
        # Filter incidents for this service
        service_incidents = [
            i for i in self.incident_history
            if i.get('service') == service
        ]

        if not service_incidents:
            return 0.0

        # Calculate incident frequency
        now = datetime.utcnow()
        recent_incidents = [
            i for i in service_incidents
            if (now - datetime.fromisoformat(i['timestamp'])).days <= 30
        ]

        incident_rate = len(recent_incidents) / 30  # Incidents per day

        # Calculate MTBF
        if len(service_incidents) > 1:
            time_diffs = []
            for i in range(1, len(service_incidents)):
                t1 = datetime.fromisoformat(service_incidents[i-1]['timestamp'])
                t2 = datetime.fromisoformat(service_incidents[i]['timestamp'])
                time_diffs.append((t2 - t1).total_seconds() / 3600)  # Hours

            mtbf = np.mean(time_diffs) if time_diffs else 720  # Default 30 days
        else:
            mtbf = 720

        availability_mtbf.labels(service=service).set(mtbf)

        # Risk increases with higher incident rate and lower MTBF
        frequency_risk = min(1.0, incident_rate / 0.5)  # 0.5 incidents/day = max risk
        mtbf_risk = min(1.0, max(0, (720 - mtbf) / 720))  # Less than 30 days = risk

        return (frequency_risk * 0.6) + (mtbf_risk * 0.4)

    def assess_deployment_risk(self, service: str) -> float:
        """Assess risk from recent deployments"""
        # Check for recent deployments (higher risk in first 24h)
        if self.k8s_available:
            try:
                apps_v1 = client.AppsV1Api()
                deployments = apps_v1.list_deployment_for_all_namespaces(
                    label_selector=f"app={service}"
                )

                for deploy in deployments.items:
                    if deploy.status.conditions:
                        for condition in deploy.status.conditions:
                            if condition.type == 'Progressing':
                                last_update = condition.last_update_time
                                if last_update:
                                    age = (datetime.now(last_update.tzinfo) - last_update).total_seconds() / 3600

                                    # Risk decreases over 24 hours
                                    if age < 24:
                                        return 1.0 - (age / 24)

            except Exception as e:
                logger.debug(f"Could not check deployment status: {e}")

        return 0.0

    def detect_anomalies(self, service: str) -> float:
        """Detect anomalies in service behavior"""
        # Get time series data for multiple metrics
        metrics_queries = [
            f'rate(http_requests_total{{service="{service}"}}[5m])',
            f'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{{service="{service}"}}[5m]))',
            f'rate(http_requests_total{{service="{service}",status=~"5.."}}[5m])'
        ]

        features = []
        for query in metrics_queries:
            data = self.query_prometheus_range(query, hours=24)
            if data:
                values = [v[1] for v in data]
                if values:
                    features.append(values)

        if not features or len(features[0]) < 10:
            return 0.0

        # Transpose and prepare for anomaly detection
        try:
            X = np.array(features).T

            # Fit and predict
            self.anomaly_detector.fit(X)
            predictions = self.anomaly_detector.predict(X)

            # Calculate anomaly ratio in recent window (last 10% of data)
            recent_window = max(1, len(predictions) // 10)
            recent_anomalies = np.sum(predictions[-recent_window:] == -1)
            anomaly_ratio = recent_anomalies / recent_window

            return min(1.0, anomaly_ratio)

        except Exception as e:
            logger.debug(f"Anomaly detection failed: {e}")
            return 0.0

    def calculate_composite_risk_score(self, service: str) -> Dict:
        """Calculate composite risk score from all factors"""
        risk_factors = {
            'resource_exhaustion': self.assess_resource_exhaustion_risk(service),
            'error_rate': self.assess_error_rate_risk(service),
            'dependency_health': self.assess_dependency_health_risk(service),
            'historical_incidents': self.assess_historical_incident_risk(service),
            'deployment_risk': self.assess_deployment_risk(service),
            'anomaly_detection': self.detect_anomalies(service)
        }

        # Calculate weighted composite score
        composite_score = sum(
            risk_factors[factor] * self.risk_weights[factor]
            for factor in risk_factors
        )

        # Update individual factor metrics
        for factor, score in risk_factors.items():
            availability_risk_factors.labels(service=service, factor=factor).set(score)

        # Determine risk level
        if composite_score >= 0.8:
            risk_level = 'CRITICAL'
        elif composite_score >= 0.6:
            risk_level = 'HIGH'
        elif composite_score >= 0.4:
            risk_level = 'MEDIUM'
        elif composite_score >= 0.2:
            risk_level = 'LOW'
        else:
            risk_level = 'MINIMAL'

        return {
            'composite_score': composite_score,
            'risk_level': risk_level,
            'risk_factors': risk_factors,
            'dominant_factors': sorted(
                risk_factors.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]
        }

    def predict_availability(self, service: str) -> Dict:
        """Predict future availability"""
        # Get current availability
        query = f'avg_over_time(up{{service="{service}"}}[1h])'
        current_availability = (self.query_prometheus(query) or 0.99) * 100

        availability_current.labels(service=service).set(current_availability)

        # Get risk score
        risk_assessment = self.calculate_composite_risk_score(service)
        risk_score = risk_assessment['composite_score']

        # Predict availability degradation
        # Higher risk = more degradation
        degradation_24h = risk_score * 0.5  # Up to 0.5% degradation
        degradation_7d = risk_score * 1.5   # Up to 1.5% degradation

        predicted_24h = max(95.0, current_availability - degradation_24h)
        predicted_7d = max(90.0, current_availability - degradation_7d)

        # Predict incidents
        incident_probability = risk_score
        predicted_incidents_24h = incident_probability * 2  # Up to 2 incidents
        predicted_incidents_7d = incident_probability * 10  # Up to 10 incidents

        # Update metrics
        availability_predicted.labels(service=service, timeframe='24h').set(predicted_24h)
        availability_predicted.labels(service=service, timeframe='7d').set(predicted_7d)
        availability_incidents_predicted.labels(service=service).set(predicted_incidents_24h)
        availability_risk_score.labels(service=service, component='overall').set(risk_score * 100)

        return {
            'current_availability': current_availability,
            'predicted_availability': {
                '24h': predicted_24h,
                '7d': predicted_7d
            },
            'predicted_incidents': {
                '24h': predicted_incidents_24h,
                '7d': predicted_incidents_7d
            },
            'risk_assessment': risk_assessment
        }

    def generate_recommendations(self, service: str, risk_data: Dict) -> List[Dict]:
        """Generate actionable recommendations"""
        recommendations = []
        risk_level = risk_data['risk_assessment']['risk_level']
        factors = risk_data['risk_assessment']['risk_factors']

        if risk_level in ['CRITICAL', 'HIGH']:
            # Resource exhaustion
            if factors['resource_exhaustion'] >= 0.6:
                recommendations.append({
                    'priority': 'CRITICAL',
                    'action': 'scale_resources',
                    'description': 'Resource exhaustion risk detected. Scale up CPU/memory or add replicas.',
                    'estimated_impact': 'Reduces risk by 40-60%'
                })

            # Error rate
            if factors['error_rate'] >= 0.6:
                recommendations.append({
                    'priority': 'CRITICAL',
                    'action': 'investigate_errors',
                    'description': 'High error rate detected. Immediate investigation required.',
                    'estimated_impact': 'Reduces risk by 30-50%'
                })

            # Dependency health
            if factors['dependency_health'] >= 0.6:
                recommendations.append({
                    'priority': 'HIGH',
                    'action': 'check_dependencies',
                    'description': 'Unhealthy dependencies detected. Check upstream services.',
                    'estimated_impact': 'Reduces risk by 20-40%'
                })

            # Recent deployment
            if factors['deployment_risk'] >= 0.6:
                recommendations.append({
                    'priority': 'HIGH',
                    'action': 'monitor_deployment',
                    'description': 'Recent deployment detected. Monitor closely for issues.',
                    'estimated_impact': 'Early detection of deployment issues'
                })

        elif risk_level == 'MEDIUM':
            recommendations.append({
                'priority': 'MEDIUM',
                'action': 'increase_monitoring',
                'description': 'Elevated risk detected. Increase monitoring frequency.',
                'estimated_impact': 'Early warning of issues'
            })

        if not recommendations:
            recommendations.append({
                'priority': 'LOW',
                'action': 'maintain',
                'description': 'Service health is good. Continue normal monitoring.',
                'estimated_impact': 'N/A'
            })

        return recommendations

    def assess_all_services(self) -> Dict:
        """Assess availability risk for all services"""
        services = ['cortex-api', 'cortex-chat', 'prometheus', 'grafana']
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'services': {}
        }

        for service in services:
            try:
                prediction = self.predict_availability(service)
                recommendations = self.generate_recommendations(service, prediction)

                results['services'][service] = {
                    'availability': prediction,
                    'recommendations': recommendations
                }

                logger.info(f"Service: {service} | "
                          f"Current: {prediction['current_availability']:.2f}% | "
                          f"Risk: {prediction['risk_assessment']['risk_level']} | "
                          f"Predicted 24h: {prediction['predicted_availability']['24h']:.2f}%")

                if prediction['risk_assessment']['risk_level'] in ['CRITICAL', 'HIGH']:
                    logger.warning(f"HIGH RISK: {service}")
                    for rec in recommendations:
                        logger.warning(f"  - {rec['priority']}: {rec['description']}")

            except Exception as e:
                logger.error(f"Error assessing {service}: {e}")

        return results

    def save_assessment(self, assessment: Dict):
        """Save risk assessment to file"""
        output_file = '/data/availability_risk_assessment.json'
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        with open(output_file, 'w') as f:
            json.dump(assessment, f, indent=2)

        logger.info(f"Saved risk assessment to {output_file}")

def main():
    """Main execution loop"""
    logger.info("Starting Availability Risk Engine")

    # Start Prometheus metrics server
    start_http_server(8002)
    logger.info("Metrics server started on port 8002")

    engine = AvailabilityRiskEngine()

    # Run assessments continuously
    import time
    interval = int(os.getenv('ASSESSMENT_INTERVAL', '60'))

    while True:
        try:
            assessment = engine.assess_all_services()
            engine.save_assessment(assessment)

        except Exception as e:
            logger.error(f"Error in assessment loop: {e}")

        time.sleep(interval)

if __name__ == '__main__':
    main()
