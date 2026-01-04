#!/usr/bin/env python3
"""
Automated Governance Validation Service
ITIL Stream 6 - Component #17

Automatically validates changes against governance policies, compliance requirements,
and regulatory frameworks before approval.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass, asdict
from aiohttp import web
import aiohttp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ComplianceFramework(str, Enum):
    """Supported compliance frameworks"""
    SOC2 = "soc2"
    ISO27001 = "iso27001"
    GDPR = "gdpr"
    HIPAA = "hipaa"
    PCI_DSS = "pci_dss"
    NIST = "nist"


class PolicyType(str, Enum):
    """Types of governance policies"""
    SECURITY = "security"
    COMPLIANCE = "compliance"
    OPERATIONAL = "operational"
    FINANCIAL = "financial"
    DATA_PRIVACY = "data_privacy"
    CHANGE_CONTROL = "change_control"


class ValidationStatus(str, Enum):
    """Validation result status"""
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"
    REQUIRES_REVIEW = "requires_review"


@dataclass
class GovernancePolicy:
    """Governance policy definition"""
    id: str
    name: str
    type: PolicyType
    framework: Optional[ComplianceFramework]
    rules: List[Dict[str, Any]]
    severity: str  # critical, high, medium, low
    auto_remediate: bool
    enabled: bool


@dataclass
class ValidationResult:
    """Result of a governance validation"""
    policy_id: str
    policy_name: str
    status: ValidationStatus
    findings: List[Dict[str, Any]]
    recommendations: List[str]
    compliance_impact: Optional[str]
    auto_fix_available: bool
    validation_time: str


@dataclass
class GovernanceReport:
    """Complete governance validation report"""
    change_id: str
    validation_id: str
    timestamp: str
    overall_status: ValidationStatus
    policies_evaluated: int
    policies_passed: int
    policies_failed: int
    policies_warning: int
    results: List[ValidationResult]
    compliance_score: float
    requires_manual_review: bool
    approval_recommendation: str


class GovernanceValidator:
    """Automated governance validation engine"""

    def __init__(self):
        self.policies: Dict[str, GovernancePolicy] = {}
        self.change_manager_url = os.getenv('CHANGE_MANAGER_URL', 'http://change-manager.cortex-change-mgmt.svc.cluster.local:8080')
        self.load_policies()

    def load_policies(self):
        """Load governance policies from configuration"""
        # Security policies
        self.policies['SEC-001'] = GovernancePolicy(
            id='SEC-001',
            name='Production change requires security review',
            type=PolicyType.SECURITY,
            framework=ComplianceFramework.SOC2,
            rules=[
                {'field': 'environment', 'operator': 'equals', 'value': 'production'},
                {'field': 'security_review', 'operator': 'exists', 'value': True}
            ],
            severity='critical',
            auto_remediate=False,
            enabled=True
        )

        self.policies['SEC-002'] = GovernancePolicy(
            id='SEC-002',
            name='Database changes require backup verification',
            type=PolicyType.SECURITY,
            framework=ComplianceFramework.ISO27001,
            rules=[
                {'field': 'category', 'operator': 'equals', 'value': 'database'},
                {'field': 'backup_verified', 'operator': 'equals', 'value': True}
            ],
            severity='critical',
            auto_remediate=False,
            enabled=True
        )

        # Compliance policies
        self.policies['COMP-001'] = GovernancePolicy(
            id='COMP-001',
            name='PII data changes require privacy impact assessment',
            type=PolicyType.DATA_PRIVACY,
            framework=ComplianceFramework.GDPR,
            rules=[
                {'field': 'affects_pii', 'operator': 'equals', 'value': True},
                {'field': 'privacy_assessment', 'operator': 'exists', 'value': True}
            ],
            severity='critical',
            auto_remediate=False,
            enabled=True
        )

        self.policies['COMP-002'] = GovernancePolicy(
            id='COMP-002',
            name='Changes must have documented test results',
            type=PolicyType.COMPLIANCE,
            framework=ComplianceFramework.SOC2,
            rules=[
                {'field': 'test_results', 'operator': 'exists', 'value': True},
                {'field': 'test_status', 'operator': 'equals', 'value': 'passed'}
            ],
            severity='high',
            auto_remediate=False,
            enabled=True
        )

        # Operational policies
        self.policies['OPS-001'] = GovernancePolicy(
            id='OPS-001',
            name='Emergency changes require post-implementation review',
            type=PolicyType.OPERATIONAL,
            framework=None,
            rules=[
                {'field': 'type', 'operator': 'equals', 'value': 'emergency'},
                {'field': 'post_review_scheduled', 'operator': 'equals', 'value': True}
            ],
            severity='medium',
            auto_remediate=False,
            enabled=True
        )

        self.policies['OPS-002'] = GovernancePolicy(
            id='OPS-002',
            name='Standard changes must follow approved templates',
            type=PolicyType.CHANGE_CONTROL,
            framework=None,
            rules=[
                {'field': 'type', 'operator': 'equals', 'value': 'standard'},
                {'field': 'template_validated', 'operator': 'equals', 'value': True}
            ],
            severity='medium',
            auto_remediate=True,
            enabled=True
        )

        # Financial policies
        self.policies['FIN-001'] = GovernancePolicy(
            id='FIN-001',
            name='Changes exceeding budget threshold require CFO approval',
            type=PolicyType.FINANCIAL,
            framework=None,
            rules=[
                {'field': 'estimated_cost', 'operator': 'greater_than', 'value': 10000},
                {'field': 'cfo_approval', 'operator': 'exists', 'value': True}
            ],
            severity='high',
            auto_remediate=False,
            enabled=True
        )

        logger.info(f"Loaded {len(self.policies)} governance policies")

    def evaluate_rule(self, rule: Dict[str, Any], change_data: Dict[str, Any]) -> bool:
        """Evaluate a single policy rule against change data"""
        field = rule['field']
        operator = rule['operator']
        expected_value = rule['value']

        # Get actual value from change data
        actual_value = change_data.get(field)

        if operator == 'exists':
            return (actual_value is not None) == expected_value
        elif operator == 'equals':
            return actual_value == expected_value
        elif operator == 'not_equals':
            return actual_value != expected_value
        elif operator == 'greater_than':
            return actual_value is not None and actual_value > expected_value
        elif operator == 'less_than':
            return actual_value is not None and actual_value < expected_value
        elif operator == 'contains':
            return actual_value is not None and expected_value in str(actual_value)

        return False

    async def validate_policy(self, policy: GovernancePolicy, change_data: Dict[str, Any]) -> ValidationResult:
        """Validate a change against a specific policy"""
        findings = []
        all_rules_pass = True

        for rule in policy.rules:
            passes = self.evaluate_rule(rule, change_data)

            if not passes:
                all_rules_pass = False
                findings.append({
                    'rule': rule,
                    'expected': rule['value'],
                    'actual': change_data.get(rule['field']),
                    'severity': policy.severity
                })

        # Determine status
        if all_rules_pass:
            status = ValidationStatus.PASSED
        elif policy.severity == 'critical':
            status = ValidationStatus.FAILED
        elif policy.severity == 'high':
            status = ValidationStatus.REQUIRES_REVIEW
        else:
            status = ValidationStatus.WARNING

        # Generate recommendations
        recommendations = []
        if not all_rules_pass:
            if policy.type == PolicyType.SECURITY:
                recommendations.append(f"Contact security team for review of {policy.name}")
            elif policy.type == PolicyType.COMPLIANCE:
                recommendations.append(f"Ensure compliance requirements for {policy.framework.value if policy.framework else 'policy'} are met")
            elif policy.type == PolicyType.DATA_PRIVACY:
                recommendations.append("Complete privacy impact assessment before proceeding")
            else:
                recommendations.append(f"Review and address {policy.name} requirements")

        return ValidationResult(
            policy_id=policy.id,
            policy_name=policy.name,
            status=status,
            findings=findings,
            recommendations=recommendations,
            compliance_impact=policy.framework.value if policy.framework else None,
            auto_fix_available=policy.auto_remediate and not all_rules_pass,
            validation_time=datetime.utcnow().isoformat()
        )

    async def validate_change(self, change_id: str, change_data: Dict[str, Any]) -> GovernanceReport:
        """Validate a change against all applicable governance policies"""
        validation_id = f"GOV-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{change_id}"

        results = []
        for policy in self.policies.values():
            if policy.enabled:
                result = await self.validate_policy(policy, change_data)
                results.append(result)

        # Calculate metrics
        policies_evaluated = len(results)
        policies_passed = sum(1 for r in results if r.status == ValidationStatus.PASSED)
        policies_failed = sum(1 for r in results if r.status == ValidationStatus.FAILED)
        policies_warning = sum(1 for r in results if r.status == ValidationStatus.WARNING)

        # Calculate compliance score (0-100)
        compliance_score = (policies_passed / policies_evaluated * 100) if policies_evaluated > 0 else 0

        # Determine overall status
        if policies_failed > 0:
            overall_status = ValidationStatus.FAILED
        elif any(r.status == ValidationStatus.REQUIRES_REVIEW for r in results):
            overall_status = ValidationStatus.REQUIRES_REVIEW
        elif policies_warning > 0:
            overall_status = ValidationStatus.WARNING
        else:
            overall_status = ValidationStatus.PASSED

        # Approval recommendation
        if overall_status == ValidationStatus.FAILED:
            approval_recommendation = "REJECT - Critical governance violations detected"
        elif overall_status == ValidationStatus.REQUIRES_REVIEW:
            approval_recommendation = "HOLD - Manual review required"
        elif overall_status == ValidationStatus.WARNING:
            approval_recommendation = "APPROVE WITH CONDITIONS - Address warnings"
        else:
            approval_recommendation = "APPROVE - All governance policies satisfied"

        report = GovernanceReport(
            change_id=change_id,
            validation_id=validation_id,
            timestamp=datetime.utcnow().isoformat(),
            overall_status=overall_status,
            policies_evaluated=policies_evaluated,
            policies_passed=policies_passed,
            policies_failed=policies_failed,
            policies_warning=policies_warning,
            results=results,
            compliance_score=compliance_score,
            requires_manual_review=overall_status in [ValidationStatus.FAILED, ValidationStatus.REQUIRES_REVIEW],
            approval_recommendation=approval_recommendation
        )

        # Store validation result
        await self.store_validation(report)

        logger.info(f"Governance validation {validation_id} completed: {overall_status.value} (score: {compliance_score:.1f}%)")

        return report

    async def store_validation(self, report: GovernanceReport):
        """Store validation report for audit trail"""
        # Store in file system for now (could be database in production)
        os.makedirs('/tmp/governance-validations', exist_ok=True)

        filepath = f'/tmp/governance-validations/{report.validation_id}.json'
        with open(filepath, 'w') as f:
            json.dump(asdict(report), f, indent=2, default=str)

        logger.info(f"Stored validation report: {filepath}")


class GovernanceValidatorService:
    """HTTP service for governance validation"""

    def __init__(self):
        self.validator = GovernanceValidator()
        self.app = web.Application()
        self.setup_routes()

    def setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_post('/validate', self.validate_change)
        self.app.router.add_get('/policies', self.list_policies)
        self.app.router.add_get('/validation/{validation_id}', self.get_validation)
        self.app.router.add_get('/metrics', self.get_metrics)

    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            'status': 'healthy',
            'service': 'governance-validator',
            'policies_loaded': len(self.validator.policies),
            'timestamp': datetime.utcnow().isoformat()
        })

    async def validate_change(self, request):
        """Validate a change request"""
        try:
            data = await request.json()
            change_id = data.get('change_id', 'unknown')
            change_data = data.get('change_data', {})

            report = await self.validator.validate_change(change_id, change_data)

            return web.json_response(asdict(report), status=200)
        except Exception as e:
            logger.error(f"Validation error: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def list_policies(self, request):
        """List all governance policies"""
        policies = [asdict(p) for p in self.validator.policies.values()]
        return web.json_response({
            'total': len(policies),
            'policies': policies
        })

    async def get_validation(self, request):
        """Retrieve a validation report"""
        validation_id = request.match_info['validation_id']
        filepath = f'/tmp/governance-validations/{validation_id}.json'

        try:
            with open(filepath, 'r') as f:
                report = json.load(f)
            return web.json_response(report)
        except FileNotFoundError:
            return web.json_response({'error': 'Validation not found'}, status=404)

    async def get_metrics(self, request):
        """Get service metrics"""
        # Count validations
        validations_dir = '/tmp/governance-validations'
        validation_count = 0
        if os.path.exists(validations_dir):
            validation_count = len([f for f in os.listdir(validations_dir) if f.endswith('.json')])

        return web.json_response({
            'total_validations': validation_count,
            'active_policies': len([p for p in self.validator.policies.values() if p.enabled]),
            'total_policies': len(self.validator.policies),
            'timestamp': datetime.utcnow().isoformat()
        })

    def run(self, host='0.0.0.0', port=8080):
        """Run the service"""
        logger.info(f"Starting Governance Validator Service on {host}:{port}")
        web.run_app(self.app, host=host, port=port)


if __name__ == '__main__':
    service = GovernanceValidatorService()
    service.run()
