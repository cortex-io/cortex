#!/usr/bin/env python3
"""
Business Metrics Framework
Collects and correlates technical metrics with business outcomes
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
from prometheus_client import start_http_server, Gauge, Counter, Histogram, Summary
from kubernetes import client, config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Business Metrics
business_revenue_impact = Gauge('business_revenue_impact_usd', 'Estimated revenue impact', ['service', 'impact_type'])
business_user_satisfaction = Gauge('business_user_satisfaction_score', 'User satisfaction score', ['service'])
business_conversion_rate = Gauge('business_conversion_rate', 'Conversion rate', ['service', 'funnel_stage'])
business_cost_efficiency = Gauge('business_cost_efficiency', 'Cost per transaction', ['service'])
business_customer_lifetime_value = Gauge('business_customer_lifetime_value_usd', 'Customer lifetime value', ['segment'])
business_churn_risk = Gauge('business_churn_risk_score', 'Customer churn risk', ['segment'])
business_incidents_impact = Counter('business_incidents_impact_total', 'Business impact of incidents', ['severity', 'service'])
business_sla_value = Gauge('business_sla_value_score', 'Business value of SLA compliance', ['service'])

class BusinessMetricsCollector:
    """Business Metrics Framework"""

    def __init__(self):
        self.prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus-k8s.cortex-system.svc.cluster.local:9090')

        # Business KPI definitions
        self.kpi_definitions = {
            'revenue_per_request': {
                'description': 'Average revenue per API request',
                'target': 0.05,
                'unit': 'USD'
            },
            'cost_per_request': {
                'description': 'Infrastructure cost per request',
                'target': 0.001,
                'unit': 'USD'
            },
            'user_satisfaction': {
                'description': 'User satisfaction score (1-100)',
                'target': 85,
                'unit': 'score'
            },
            'conversion_rate': {
                'description': 'User conversion rate',
                'target': 0.15,
                'unit': 'ratio'
            },
            'response_time_impact': {
                'description': 'Revenue loss per 100ms delay',
                'target': 0,
                'unit': 'USD/100ms'
            }
        }

        # Service tier mapping (business criticality)
        self.service_tiers = {
            'cortex-api': {'tier': 'critical', 'revenue_weight': 1.0},
            'cortex-chat': {'tier': 'high', 'revenue_weight': 0.8},
            'prometheus': {'tier': 'medium', 'revenue_weight': 0.3},
            'grafana': {'tier': 'medium', 'revenue_weight': 0.3}
        }

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

    def calculate_revenue_impact(self, service: str) -> Dict:
        """Calculate revenue impact for a service"""
        tier_info = self.service_tiers.get(service, {'tier': 'low', 'revenue_weight': 0.1})

        # Get request rate
        query = f'rate(http_requests_total{{service="{service}"}}[5m])'
        request_rate = self.query_prometheus(query) or 10.0

        # Get error rate
        query = f'rate(http_requests_total{{service="{service}",status=~"5.."}}[5m]) / rate(http_requests_total{{service="{service}"}}[5m])'
        error_rate = self.query_prometheus(query) or 0.0

        # Get response time (p95)
        query = f'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{{service="{service}"}}[5m]))'
        response_time = self.query_prometheus(query) or 0.1

        # Calculate business metrics
        revenue_per_request = self.kpi_definitions['revenue_per_request']['target'] * tier_info['revenue_weight']
        cost_per_request = self.kpi_definitions['cost_per_request']['target']

        # Revenue calculations
        hourly_requests = request_rate * 3600
        gross_revenue = hourly_requests * revenue_per_request
        infrastructure_cost = hourly_requests * cost_per_request

        # Impact of errors
        error_requests = hourly_requests * error_rate
        revenue_loss_errors = error_requests * revenue_per_request

        # Impact of slow response times (every 100ms over 200ms target costs 1% conversion)
        response_time_ms = response_time * 1000
        if response_time_ms > 200:
            delay_penalty = ((response_time_ms - 200) / 100) * 0.01
            revenue_loss_latency = gross_revenue * delay_penalty
        else:
            revenue_loss_latency = 0

        # Net revenue
        net_revenue = gross_revenue - infrastructure_cost - revenue_loss_errors - revenue_loss_latency

        # User satisfaction (inverse of error rate and response time)
        satisfaction_base = 100
        satisfaction_penalty = (error_rate * 100 * 5) + (max(0, response_time_ms - 200) / 10)
        user_satisfaction = max(0, satisfaction_base - satisfaction_penalty)

        # Update Prometheus metrics
        business_revenue_impact.labels(service=service, impact_type='gross').set(gross_revenue)
        business_revenue_impact.labels(service=service, impact_type='net').set(net_revenue)
        business_revenue_impact.labels(service=service, impact_type='error_loss').set(revenue_loss_errors)
        business_revenue_impact.labels(service=service, impact_type='latency_loss').set(revenue_loss_latency)
        business_user_satisfaction.labels(service=service).set(user_satisfaction)
        business_cost_efficiency.labels(service=service).set(cost_per_request)

        return {
            'service': service,
            'tier': tier_info['tier'],
            'revenue': {
                'gross_hourly': gross_revenue,
                'net_hourly': net_revenue,
                'loss_from_errors': revenue_loss_errors,
                'loss_from_latency': revenue_loss_latency,
                'infrastructure_cost': infrastructure_cost
            },
            'efficiency': {
                'revenue_per_request': revenue_per_request,
                'cost_per_request': cost_per_request,
                'profit_margin': ((gross_revenue - infrastructure_cost) / gross_revenue * 100) if gross_revenue > 0 else 0
            },
            'user_experience': {
                'satisfaction_score': user_satisfaction,
                'request_rate': request_rate,
                'error_rate': error_rate * 100,
                'response_time_ms': response_time_ms
            }
        }

    def calculate_conversion_metrics(self, service: str) -> Dict:
        """Calculate conversion funnel metrics"""
        # Simulate conversion funnel stages
        stages = ['visit', 'engage', 'convert', 'retain']
        conversion_rates = {}

        for i, stage in enumerate(stages[:-1]):
            # Base conversion rate with degradation based on performance
            base_rate = 0.5 ** (i + 1)  # 50%, 25%, 12.5%

            # Get service health
            query = f'up{{service="{service}"}}'
            availability = self.query_prometheus(query) or 1.0

            # Adjust conversion based on availability and performance
            adjusted_rate = base_rate * availability

            conversion_rates[f"{stage}_to_{stages[i+1]}"] = adjusted_rate
            business_conversion_rate.labels(service=service, funnel_stage=stage).set(adjusted_rate)

        return conversion_rates

    def calculate_customer_lifetime_value(self) -> Dict:
        """Calculate CLV for customer segments"""
        segments = ['enterprise', 'professional', 'startup', 'individual']
        clv_data = {}

        for segment in segments:
            # Base CLV varies by segment
            base_clv = {
                'enterprise': 50000,
                'professional': 10000,
                'startup': 5000,
                'individual': 500
            }[segment]

            # Calculate churn risk based on system health
            query = 'avg(up{job="kubernetes-pods"})'
            avg_availability = self.query_prometheus(query) or 0.95

            # Churn risk increases with poor availability
            churn_risk = max(0, min(1, (1 - avg_availability) * 10))

            # Adjusted CLV
            adjusted_clv = base_clv * (1 - churn_risk * 0.5)

            clv_data[segment] = {
                'base_clv': base_clv,
                'adjusted_clv': adjusted_clv,
                'churn_risk': churn_risk
            }

            business_customer_lifetime_value.labels(segment=segment).set(adjusted_clv)
            business_churn_risk.labels(segment=segment).set(churn_risk)

        return clv_data

    def calculate_sla_business_value(self, service: str) -> Dict:
        """Calculate business value of SLA compliance"""
        tier_info = self.service_tiers.get(service, {'tier': 'low', 'revenue_weight': 0.1})

        # Get current availability
        query = f'avg_over_time(up{{service="{service}"}}[1h])'
        availability = self.query_prometheus(query) or 0.99

        # SLA targets and penalties
        sla_target = 0.999  # 99.9%
        penalty_per_percent = 10000 * tier_info['revenue_weight']  # USD per percentage point

        # Calculate compliance
        if availability >= sla_target:
            compliance_score = 100
            penalty = 0
            bonus = 5000 * tier_info['revenue_weight']  # Bonus for exceeding SLA
        else:
            shortfall = (sla_target - availability) * 100
            compliance_score = max(0, 100 - (shortfall * 10))
            penalty = shortfall * penalty_per_percent
            bonus = 0

        # Business value score
        value_score = compliance_score - (penalty / 1000)

        business_sla_value.labels(service=service).set(value_score)

        return {
            'service': service,
            'availability': availability * 100,
            'sla_target': sla_target * 100,
            'compliance_score': compliance_score,
            'financial_impact': {
                'penalty': penalty,
                'bonus': bonus,
                'net_impact': bonus - penalty
            },
            'business_value_score': value_score
        }

    def get_services(self) -> List[str]:
        """Get list of services to monitor"""
        return list(self.service_tiers.keys())

    def collect_all_metrics(self) -> Dict:
        """Collect all business metrics"""
        services = self.get_services()
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'services': {},
            'customer_segments': {},
            'summary': {}
        }

        total_revenue = 0
        total_cost = 0
        avg_satisfaction = 0

        for service in services:
            try:
                service_data = {
                    'revenue_impact': self.calculate_revenue_impact(service),
                    'conversion_metrics': self.calculate_conversion_metrics(service),
                    'sla_value': self.calculate_sla_business_value(service)
                }

                results['services'][service] = service_data

                # Aggregate
                total_revenue += service_data['revenue_impact']['revenue']['gross_hourly']
                total_cost += service_data['revenue_impact']['revenue']['infrastructure_cost']
                avg_satisfaction += service_data['revenue_impact']['user_experience']['satisfaction_score']

                logger.info(f"Service: {service} | "
                          f"Revenue: ${service_data['revenue_impact']['revenue']['net_hourly']:.2f}/hr | "
                          f"Satisfaction: {service_data['revenue_impact']['user_experience']['satisfaction_score']:.1f}")

            except Exception as e:
                logger.error(f"Error collecting metrics for {service}: {e}")

        # Customer segment metrics
        results['customer_segments'] = self.calculate_customer_lifetime_value()

        # Summary
        results['summary'] = {
            'total_hourly_revenue': total_revenue,
            'total_hourly_cost': total_cost,
            'net_hourly_revenue': total_revenue - total_cost,
            'avg_user_satisfaction': avg_satisfaction / len(services) if services else 0,
            'roi': ((total_revenue - total_cost) / total_cost * 100) if total_cost > 0 else 0
        }

        logger.info(f"Summary: Revenue ${total_revenue:.2f}/hr | Cost ${total_cost:.2f}/hr | "
                   f"ROI {results['summary']['roi']:.1f}%")

        return results

    def save_metrics(self, metrics: Dict):
        """Save metrics to file"""
        output_file = '/data/business_metrics.json'
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        with open(output_file, 'w') as f:
            json.dump(metrics, f, indent=2)

        logger.info(f"Saved business metrics to {output_file}")

def main():
    """Main execution loop"""
    logger.info("Starting Business Metrics Framework")

    # Start Prometheus metrics server
    start_http_server(8001)
    logger.info("Metrics server started on port 8001")

    collector = BusinessMetricsCollector()

    # Collect metrics continuously
    import time
    interval = int(os.getenv('COLLECTION_INTERVAL', '60'))

    while True:
        try:
            metrics = collector.collect_all_metrics()
            collector.save_metrics(metrics)

        except Exception as e:
            logger.error(f"Error in collection loop: {e}")

        time.sleep(interval)

if __name__ == '__main__':
    main()
