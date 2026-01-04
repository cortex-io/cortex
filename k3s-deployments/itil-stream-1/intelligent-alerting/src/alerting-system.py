#!/usr/bin/env python3
"""
Intelligent Alerting System
ITIL Implementation - Stream 1, Component 3

Smart alert routing and suppression:
- Routes alerts based on severity, time, and escalation rules
- Suppresses duplicate and correlated alerts
- Implements alert fatigue prevention
- Manages on-call schedules and escalation chains
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, time as dt_time
from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from enum import Enum

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('intelligent-alerting')


class AlertSeverity(Enum):
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4
    INFO = 5


class AlertStatus(Enum):
    NEW = "new"
    ROUTED = "routed"
    ACKNOWLEDGED = "acknowledged"
    SUPPRESSED = "suppressed"
    ESCALATED = "escalated"
    RESOLVED = "resolved"


class EscalationLevel(Enum):
    L1 = 1  # First responders
    L2 = 2  # Senior engineers
    L3 = 3  # Team leads
    L4 = 4  # Management


@dataclass
class Alert:
    id: str
    title: str
    description: str
    severity: AlertSeverity
    source: str
    timestamp: datetime
    status: AlertStatus
    correlation_id: Optional[str]
    assigned_to: Optional[str]
    escalation_level: EscalationLevel
    metadata: Dict


@dataclass
class OnCallSchedule:
    team: str
    level: EscalationLevel
    primary: str
    secondary: str
    start_time: dt_time
    end_time: dt_time
    days: List[str]  # ['mon', 'tue', ...]


@dataclass
class EscalationPolicy:
    name: str
    severity_levels: List[AlertSeverity]
    escalation_chain: List[EscalationLevel]
    time_thresholds: Dict[int, int]  # level -> seconds
    business_hours_only: bool


class IntelligentAlertingSystem:
    """Manages intelligent alert routing, suppression, and escalation"""

    def __init__(self, data_dir: str = "/app/data"):
        self.data_dir = data_dir
        self.alerts: Dict[str, Alert] = {}
        self.suppression_rules: List[Dict] = []
        self.on_call_schedules: List[OnCallSchedule] = []
        self.escalation_policies: Dict[str, EscalationPolicy] = {}

        # Configuration
        self.alert_dedup_window = int(os.getenv('ALERT_DEDUP_WINDOW', '300'))  # 5 min
        self.max_alerts_per_hour = int(os.getenv('MAX_ALERTS_PER_HOUR', '50'))
        self.alert_fatigue_threshold = int(os.getenv('ALERT_FATIGUE_THRESHOLD', '20'))

        os.makedirs(f"{data_dir}/alerts", exist_ok=True)
        os.makedirs(f"{data_dir}/escalations", exist_ok=True)
        os.makedirs(f"{data_dir}/metrics", exist_ok=True)

        self._load_on_call_schedules()
        self._load_escalation_policies()
        self._load_suppression_rules()

        logger.info("Intelligent Alerting System initialized")

    def _load_on_call_schedules(self):
        """Load on-call rotation schedules"""
        # Default schedules - in production loaded from config
        self.on_call_schedules = [
            OnCallSchedule(
                team="sre",
                level=EscalationLevel.L1,
                primary="sre-oncall-primary",
                secondary="sre-oncall-secondary",
                start_time=dt_time(8, 0),
                end_time=dt_time(17, 0),
                days=['mon', 'tue', 'wed', 'thu', 'fri']
            ),
            OnCallSchedule(
                team="sre",
                level=EscalationLevel.L1,
                primary="sre-oncall-night",
                secondary="sre-oncall-weekend",
                start_time=dt_time(17, 0),
                end_time=dt_time(8, 0),
                days=['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            ),
            OnCallSchedule(
                team="security",
                level=EscalationLevel.L1,
                primary="security-oncall",
                secondary="security-backup",
                start_time=dt_time(0, 0),
                end_time=dt_time(23, 59),
                days=['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
            ),
            OnCallSchedule(
                team="development",
                level=EscalationLevel.L2,
                primary="dev-lead",
                secondary="senior-dev",
                start_time=dt_time(9, 0),
                end_time=dt_time(18, 0),
                days=['mon', 'tue', 'wed', 'thu', 'fri']
            )
        ]

    def _load_escalation_policies(self):
        """Load escalation policies"""
        self.escalation_policies = {
            'critical': EscalationPolicy(
                name='critical',
                severity_levels=[AlertSeverity.CRITICAL],
                escalation_chain=[EscalationLevel.L1, EscalationLevel.L2, EscalationLevel.L3, EscalationLevel.L4],
                time_thresholds={1: 300, 2: 600, 3: 900, 4: 1200},  # 5, 10, 15, 20 min
                business_hours_only=False
            ),
            'high': EscalationPolicy(
                name='high',
                severity_levels=[AlertSeverity.HIGH],
                escalation_chain=[EscalationLevel.L1, EscalationLevel.L2, EscalationLevel.L3],
                time_thresholds={1: 900, 2: 1800, 3: 3600},  # 15, 30, 60 min
                business_hours_only=False
            ),
            'medium': EscalationPolicy(
                name='medium',
                severity_levels=[AlertSeverity.MEDIUM],
                escalation_chain=[EscalationLevel.L1, EscalationLevel.L2],
                time_thresholds={1: 3600, 2: 7200},  # 1, 2 hours
                business_hours_only=True
            ),
            'low': EscalationPolicy(
                name='low',
                severity_levels=[AlertSeverity.LOW, AlertSeverity.INFO],
                escalation_chain=[EscalationLevel.L1],
                time_thresholds={1: 14400},  # 4 hours
                business_hours_only=True
            )
        }

    def _load_suppression_rules(self):
        """Load alert suppression rules"""
        self.suppression_rules = [
            {
                'name': 'maintenance_window',
                'condition': lambda alert: self._is_maintenance_window(alert),
                'severity': [AlertSeverity.LOW, AlertSeverity.MEDIUM]
            },
            {
                'name': 'known_issue',
                'condition': lambda alert: self._has_known_error(alert),
                'severity': [AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH]
            },
            {
                'name': 'alert_fatigue',
                'condition': lambda alert: self._check_alert_fatigue(alert),
                'severity': [AlertSeverity.LOW, AlertSeverity.MEDIUM]
            }
        ]

    def process_alert(self, alert: Alert) -> bool:
        """Process incoming alert through routing and suppression"""
        logger.info(f"Processing alert {alert.id} ({alert.severity.name})")

        # Check for duplicate
        if self._is_duplicate(alert):
            logger.info(f"Alert {alert.id} is duplicate, suppressing")
            alert.status = AlertStatus.SUPPRESSED
            return False

        # Apply suppression rules
        if self._should_suppress(alert):
            logger.info(f"Alert {alert.id} suppressed by rules")
            alert.status = AlertStatus.SUPPRESSED
            self._save_alert(alert)
            return False

        # Route alert
        routed = self._route_alert(alert)
        if routed:
            alert.status = AlertStatus.ROUTED
            self._save_alert(alert)
            logger.info(f"Alert {alert.id} routed to {alert.assigned_to}")
            return True

        logger.warning(f"Alert {alert.id} could not be routed")
        return False

    def _is_duplicate(self, alert: Alert) -> bool:
        """Check if alert is a duplicate"""
        cutoff = datetime.now() - timedelta(seconds=self.alert_dedup_window)

        for existing_alert in self.alerts.values():
            if existing_alert.timestamp < cutoff:
                continue

            # Same source, severity, and similar title
            if (existing_alert.source == alert.source and
                existing_alert.severity == alert.severity and
                self._similar_titles(existing_alert.title, alert.title)):
                return True

        return False

    def _similar_titles(self, title1: str, title2: str) -> bool:
        """Check if two titles are similar"""
        # Simple similarity check - can be enhanced with fuzzy matching
        words1 = set(title1.lower().split())
        words2 = set(title2.lower().split())

        if not words1 or not words2:
            return False

        intersection = words1 & words2
        union = words1 | words2

        similarity = len(intersection) / len(union)
        return similarity > 0.7

    def _should_suppress(self, alert: Alert) -> bool:
        """Check if alert should be suppressed"""
        for rule in self.suppression_rules:
            if alert.severity in rule['severity']:
                try:
                    if rule['condition'](alert):
                        logger.debug(f"Alert suppressed by rule: {rule['name']}")
                        return True
                except Exception as e:
                    logger.error(f"Error evaluating suppression rule {rule['name']}: {e}")

        return False

    def _is_maintenance_window(self, alert: Alert) -> bool:
        """Check if currently in maintenance window"""
        # Placeholder - check maintenance schedule
        return False

    def _has_known_error(self, alert: Alert) -> bool:
        """Check if alert matches a known error"""
        # Placeholder - check KEDB
        return False

    def _check_alert_fatigue(self, alert: Alert) -> bool:
        """Check for alert fatigue conditions"""
        # Count recent alerts from same source
        cutoff = datetime.now() - timedelta(hours=1)
        recent_alerts = [a for a in self.alerts.values()
                        if a.source == alert.source and a.timestamp > cutoff]

        if len(recent_alerts) > self.alert_fatigue_threshold:
            logger.warning(f"Alert fatigue detected for source {alert.source}")
            return True

        return False

    def _route_alert(self, alert: Alert) -> bool:
        """Route alert to appropriate on-call person"""
        # Get escalation policy
        policy = self._get_escalation_policy(alert.severity)
        if not policy:
            logger.error(f"No escalation policy for severity {alert.severity}")
            return False

        # Check business hours restriction
        if policy.business_hours_only and not self._is_business_hours():
            logger.info(f"Alert {alert.id} queued (outside business hours)")
            return False

        # Get on-call person for current time
        on_call = self._get_on_call(alert.severity)
        if not on_call:
            logger.error(f"No on-call person available for alert {alert.id}")
            return False

        alert.assigned_to = on_call
        alert.escalation_level = EscalationLevel.L1

        # Store alert
        self.alerts[alert.id] = alert

        return True

    def _get_escalation_policy(self, severity: AlertSeverity) -> Optional[EscalationPolicy]:
        """Get escalation policy for severity"""
        for policy in self.escalation_policies.values():
            if severity in policy.severity_levels:
                return policy
        return None

    def _is_business_hours(self) -> bool:
        """Check if current time is business hours"""
        now = datetime.now()
        current_time = now.time()
        current_day = now.strftime('%a').lower()

        # Business hours: Mon-Fri 9AM-5PM
        business_days = ['mon', 'tue', 'wed', 'thu', 'fri']
        business_start = dt_time(9, 0)
        business_end = dt_time(17, 0)

        return (current_day in business_days and
                business_start <= current_time <= business_end)

    def _get_on_call(self, severity: AlertSeverity) -> Optional[str]:
        """Get current on-call person"""
        now = datetime.now()
        current_time = now.time()
        current_day = now.strftime('%a').lower()

        # Map severity to team
        team_map = {
            AlertSeverity.CRITICAL: 'sre',
            AlertSeverity.HIGH: 'sre',
            AlertSeverity.MEDIUM: 'sre',
            AlertSeverity.LOW: 'sre',
            AlertSeverity.INFO: 'sre'
        }

        team = team_map.get(severity, 'sre')

        # Find matching schedule
        for schedule in self.on_call_schedules:
            if schedule.team != team:
                continue

            if current_day not in schedule.days:
                continue

            # Check time range (handle overnight shifts)
            if schedule.start_time < schedule.end_time:
                in_range = schedule.start_time <= current_time <= schedule.end_time
            else:
                in_range = current_time >= schedule.start_time or current_time <= schedule.end_time

            if in_range:
                return schedule.primary

        return None

    def escalate_alert(self, alert_id: str) -> bool:
        """Escalate alert to next level"""
        alert = self.alerts.get(alert_id)
        if not alert:
            return False

        policy = self._get_escalation_policy(alert.severity)
        if not policy:
            return False

        current_level = alert.escalation_level.value
        if current_level >= max(level.value for level in policy.escalation_chain):
            logger.warning(f"Alert {alert_id} already at max escalation level")
            return False

        # Escalate to next level
        next_level = EscalationLevel(current_level + 1)
        alert.escalation_level = next_level
        alert.status = AlertStatus.ESCALATED

        # Update assignment
        # In production, would look up on-call for escalation level
        alert.assigned_to = f"escalation-l{next_level.value}"

        self._save_alert(alert)
        logger.info(f"Alert {alert_id} escalated to level {next_level.name}")

        return True

    def acknowledge_alert(self, alert_id: str, acknowledged_by: str) -> bool:
        """Acknowledge an alert"""
        alert = self.alerts.get(alert_id)
        if not alert:
            return False

        alert.status = AlertStatus.ACKNOWLEDGED
        alert.metadata['acknowledged_by'] = acknowledged_by
        alert.metadata['acknowledged_at'] = datetime.now().isoformat()

        self._save_alert(alert)
        logger.info(f"Alert {alert_id} acknowledged by {acknowledged_by}")

        return True

    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve an alert"""
        alert = self.alerts.get(alert_id)
        if not alert:
            return False

        alert.status = AlertStatus.RESOLVED
        alert.metadata['resolved_at'] = datetime.now().isoformat()

        self._save_alert(alert)
        logger.info(f"Alert {alert_id} resolved")

        return True

    def _save_alert(self, alert: Alert):
        """Persist alert data"""
        alert_file = f"{self.data_dir}/alerts/{alert.id}.json"
        alert_data = {
            'id': alert.id,
            'title': alert.title,
            'description': alert.description,
            'severity': alert.severity.name,
            'source': alert.source,
            'timestamp': alert.timestamp.isoformat(),
            'status': alert.status.value,
            'correlation_id': alert.correlation_id,
            'assigned_to': alert.assigned_to,
            'escalation_level': alert.escalation_level.name,
            'metadata': alert.metadata
        }
        with open(alert_file, 'w') as f:
            json.dump(alert_data, f, indent=2)

    def get_metrics(self) -> Dict:
        """Get alerting system metrics"""
        cutoff_1h = datetime.now() - timedelta(hours=1)
        cutoff_24h = datetime.now() - timedelta(hours=24)

        recent_alerts_1h = [a for a in self.alerts.values() if a.timestamp > cutoff_1h]
        recent_alerts_24h = [a for a in self.alerts.values() if a.timestamp > cutoff_24h]

        suppressed = [a for a in recent_alerts_24h if a.status == AlertStatus.SUPPRESSED]
        escalated = [a for a in recent_alerts_24h if a.status == AlertStatus.ESCALATED]

        metrics = {
            'timestamp': datetime.now().isoformat(),
            'total_alerts': len(self.alerts),
            'alerts_1h': len(recent_alerts_1h),
            'alerts_24h': len(recent_alerts_24h),
            'suppressed_24h': len(suppressed),
            'suppression_rate': len(suppressed) / max(len(recent_alerts_24h), 1),
            'escalated_24h': len(escalated),
            'escalation_rate': len(escalated) / max(len(recent_alerts_24h), 1),
            'avg_severity': sum(a.severity.value for a in recent_alerts_24h) / max(len(recent_alerts_24h), 1)
        }

        return metrics

    async def run(self):
        """Main alerting system loop"""
        logger.info("Starting Intelligent Alerting System")

        while True:
            try:
                # Check for alerts needing escalation
                self._check_escalations()

                # Get and save metrics
                metrics = self.get_metrics()
                metrics_file = f"{self.data_dir}/metrics/alerting-metrics-{int(time.time())}.json"
                with open(metrics_file, 'w') as f:
                    json.dump(metrics, f, indent=2)

                logger.info(f"Alerts (1h): {metrics['alerts_1h']}, "
                          f"Suppression rate: {metrics['suppression_rate']:.2%}, "
                          f"Escalation rate: {metrics['escalation_rate']:.2%}")

                await asyncio.sleep(60)

            except Exception as e:
                logger.error(f"Error in alerting loop: {e}", exc_info=True)
                await asyncio.sleep(10)

    def _check_escalations(self):
        """Check for alerts that need escalation"""
        for alert in self.alerts.values():
            if alert.status not in [AlertStatus.ROUTED, AlertStatus.ESCALATED]:
                continue

            policy = self._get_escalation_policy(alert.severity)
            if not policy:
                continue

            # Check if escalation threshold exceeded
            time_since_routed = (datetime.now() - alert.timestamp).total_seconds()
            threshold = policy.time_thresholds.get(alert.escalation_level.value)

            if threshold and time_since_routed > threshold:
                self.escalate_alert(alert.id)


async def main():
    system = IntelligentAlertingSystem()
    await system.run()


if __name__ == "__main__":
    asyncio.run(main())
