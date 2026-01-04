#!/usr/bin/env python3
"""
Risk-Based Change Authorization Service
ITIL Stream 6 - Component #18

Automatically determines authorization requirements and routes approvals based on
calculated risk scores and impact assessments.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Set
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


class RiskLevel(str, Enum):
    """Risk level classifications"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    MINIMAL = "minimal"


class ApprovalType(str, Enum):
    """Types of approval required"""
    AUTO = "automatic"
    TECHNICAL = "technical_lead"
    MANAGER = "manager"
    SENIOR = "senior_management"
    CAB = "change_advisory_board"
    EMERGENCY_CAB = "emergency_cab"
    EXECUTIVE = "executive"


class ImpactArea(str, Enum):
    """Areas that can be impacted by changes"""
    PRODUCTION = "production"
    CUSTOMERS = "customers"
    REVENUE = "revenue"
    DATA = "data"
    SECURITY = "security"
    COMPLIANCE = "compliance"
    AVAILABILITY = "availability"
    PERFORMANCE = "performance"


@dataclass
class RiskFactor:
    """Individual risk factor"""
    category: str
    description: str
    score: int  # 0-10
    weight: float  # 0.0-1.0
    impact_areas: List[ImpactArea]


@dataclass
class RiskAssessment:
    """Complete risk assessment for a change"""
    change_id: str
    assessment_id: str
    timestamp: str
    risk_factors: List[RiskFactor]
    raw_score: float
    weighted_score: float
    risk_level: RiskLevel
    impact_areas: Set[ImpactArea]
    mitigation_required: bool
    rollback_plan_required: bool


@dataclass
class ApprovalRequirement:
    """Required approval for a change"""
    approval_type: ApprovalType
    approver_role: str
    approver_group: Optional[str]
    required_count: int
    timeout_hours: int
    can_parallel: bool
    reason: str


@dataclass
class AuthorizationDecision:
    """Authorization decision for a change"""
    change_id: str
    decision_id: str
    timestamp: str
    risk_assessment: RiskAssessment
    required_approvals: List[ApprovalRequirement]
    estimated_approval_time: str
    auto_approved: bool
    conditions: List[str]
    restrictions: List[str]


class RiskCalculator:
    """Calculate risk scores for changes"""

    def __init__(self):
        self.risk_weights = {
            'environment': 0.25,
            'scope': 0.20,
            'complexity': 0.15,
            'urgency': 0.10,
            'testing': 0.15,
            'dependencies': 0.15
        }

    def assess_environment_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on environment"""
        env = change_data.get('environment', 'development')

        score_map = {
            'production': 10,
            'staging': 6,
            'qa': 4,
            'development': 2
        }

        score = score_map.get(env, 5)
        impact_areas = [ImpactArea.PRODUCTION, ImpactArea.CUSTOMERS] if env == 'production' else [ImpactArea.AVAILABILITY]

        return RiskFactor(
            category='environment',
            description=f'Change targets {env} environment',
            score=score,
            weight=self.risk_weights['environment'],
            impact_areas=impact_areas
        )

    def assess_scope_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on scope"""
        category = change_data.get('category', 'minor')
        affects_data = change_data.get('affects_data', False)
        affects_pii = change_data.get('affects_pii', False)

        base_scores = {
            'infrastructure': 8,
            'database': 9,
            'security': 10,
            'network': 8,
            'application': 6,
            'configuration': 5,
            'minor': 3
        }

        score = base_scores.get(category, 5)
        if affects_pii:
            score = min(10, score + 2)

        impact_areas = []
        if affects_data or affects_pii:
            impact_areas.extend([ImpactArea.DATA, ImpactArea.COMPLIANCE])
        if category in ['database', 'infrastructure', 'network']:
            impact_areas.append(ImpactArea.AVAILABILITY)

        return RiskFactor(
            category='scope',
            description=f'Change category: {category}',
            score=score,
            weight=self.risk_weights['scope'],
            impact_areas=impact_areas
        )

    def assess_complexity_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on complexity"""
        lines_changed = change_data.get('lines_changed', 0)
        files_changed = change_data.get('files_changed', 0)
        systems_affected = change_data.get('systems_affected', 1)

        # Calculate complexity score
        score = 0
        if lines_changed > 1000:
            score += 4
        elif lines_changed > 500:
            score += 3
        elif lines_changed > 100:
            score += 2
        else:
            score += 1

        if files_changed > 20:
            score += 3
        elif files_changed > 10:
            score += 2
        elif files_changed > 5:
            score += 1

        score += min(3, systems_affected - 1)

        return RiskFactor(
            category='complexity',
            description=f'{lines_changed} lines in {files_changed} files, {systems_affected} systems',
            score=min(10, score),
            weight=self.risk_weights['complexity'],
            impact_areas=[ImpactArea.PERFORMANCE]
        )

    def assess_urgency_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on urgency"""
        change_type = change_data.get('type', 'standard')

        urgency_scores = {
            'emergency': 9,
            'expedited': 7,
            'standard': 3,
            'scheduled': 1
        }

        score = urgency_scores.get(change_type, 5)

        impact_areas = [ImpactArea.AVAILABILITY] if change_type == 'emergency' else []

        return RiskFactor(
            category='urgency',
            description=f'Change type: {change_type}',
            score=score,
            weight=self.risk_weights['urgency'],
            impact_areas=impact_areas
        )

    def assess_testing_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on testing"""
        test_coverage = change_data.get('test_coverage', 0)
        tests_passed = change_data.get('test_status') == 'passed'
        has_rollback = change_data.get('rollback_plan', False)

        # Lower score is better for testing
        score = 10
        if tests_passed:
            score -= 4
        if test_coverage > 80:
            score -= 3
        elif test_coverage > 50:
            score -= 2
        elif test_coverage > 30:
            score -= 1

        if has_rollback:
            score -= 2

        score = max(0, score)

        return RiskFactor(
            category='testing',
            description=f'Test coverage: {test_coverage}%, passed: {tests_passed}',
            score=score,
            weight=self.risk_weights['testing'],
            impact_areas=[ImpactArea.AVAILABILITY, ImpactArea.PERFORMANCE]
        )

    def assess_dependencies_risk(self, change_data: Dict[str, Any]) -> RiskFactor:
        """Assess risk based on dependencies"""
        dependencies = change_data.get('dependencies', [])
        breaking_changes = change_data.get('breaking_changes', False)

        score = len(dependencies)
        if breaking_changes:
            score += 5

        score = min(10, score)

        impact_areas = [ImpactArea.AVAILABILITY] if breaking_changes else []

        return RiskFactor(
            category='dependencies',
            description=f'{len(dependencies)} dependencies, breaking: {breaking_changes}',
            score=score,
            weight=self.risk_weights['dependencies'],
            impact_areas=impact_areas
        )

    async def calculate_risk(self, change_id: str, change_data: Dict[str, Any]) -> RiskAssessment:
        """Calculate comprehensive risk assessment"""
        assessment_id = f"RISK-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{change_id}"

        # Assess all risk factors
        risk_factors = [
            self.assess_environment_risk(change_data),
            self.assess_scope_risk(change_data),
            self.assess_complexity_risk(change_data),
            self.assess_urgency_risk(change_data),
            self.assess_testing_risk(change_data),
            self.assess_dependencies_risk(change_data)
        ]

        # Calculate scores
        raw_score = sum(f.score for f in risk_factors) / len(risk_factors)
        weighted_score = sum(f.score * f.weight for f in risk_factors)

        # Determine risk level
        if weighted_score >= 8.0:
            risk_level = RiskLevel.CRITICAL
        elif weighted_score >= 6.0:
            risk_level = RiskLevel.HIGH
        elif weighted_score >= 4.0:
            risk_level = RiskLevel.MEDIUM
        elif weighted_score >= 2.0:
            risk_level = RiskLevel.LOW
        else:
            risk_level = RiskLevel.MINIMAL

        # Collect all impact areas
        impact_areas = set()
        for factor in risk_factors:
            impact_areas.update(factor.impact_areas)

        # Determine requirements
        mitigation_required = risk_level in [RiskLevel.CRITICAL, RiskLevel.HIGH]
        rollback_plan_required = risk_level in [RiskLevel.CRITICAL, RiskLevel.HIGH, RiskLevel.MEDIUM]

        assessment = RiskAssessment(
            change_id=change_id,
            assessment_id=assessment_id,
            timestamp=datetime.utcnow().isoformat(),
            risk_factors=risk_factors,
            raw_score=raw_score,
            weighted_score=weighted_score,
            risk_level=risk_level,
            impact_areas=impact_areas,
            mitigation_required=mitigation_required,
            rollback_plan_required=rollback_plan_required
        )

        logger.info(f"Risk assessment {assessment_id}: {risk_level.value} (score: {weighted_score:.2f})")

        return assessment


class AuthorizationEngine:
    """Determine required approvals based on risk"""

    def __init__(self):
        self.risk_calculator = RiskCalculator()

    def determine_approvals(self, risk_assessment: RiskAssessment, change_data: Dict[str, Any]) -> List[ApprovalRequirement]:
        """Determine required approvals based on risk level"""
        approvals = []

        risk_level = risk_assessment.risk_level

        # Auto-approval for minimal risk
        if risk_level == RiskLevel.MINIMAL:
            approvals.append(ApprovalRequirement(
                approval_type=ApprovalType.AUTO,
                approver_role='system',
                approver_group=None,
                required_count=1,
                timeout_hours=0,
                can_parallel=True,
                reason='Low risk change with automated validation'
            ))
            return approvals

        # Technical lead approval for low risk
        if risk_level == RiskLevel.LOW:
            approvals.append(ApprovalRequirement(
                approval_type=ApprovalType.TECHNICAL,
                approver_role='technical_lead',
                approver_group='engineering',
                required_count=1,
                timeout_hours=24,
                can_parallel=True,
                reason='Technical review for low risk change'
            ))

        # Manager approval for medium risk
        if risk_level == RiskLevel.MEDIUM:
            approvals.extend([
                ApprovalRequirement(
                    approval_type=ApprovalType.TECHNICAL,
                    approver_role='technical_lead',
                    approver_group='engineering',
                    required_count=1,
                    timeout_hours=24,
                    can_parallel=True,
                    reason='Technical review required'
                ),
                ApprovalRequirement(
                    approval_type=ApprovalType.MANAGER,
                    approver_role='engineering_manager',
                    approver_group='engineering',
                    required_count=1,
                    timeout_hours=48,
                    can_parallel=True,
                    reason='Management approval for medium risk'
                )
            ])

        # CAB approval for high risk
        if risk_level == RiskLevel.HIGH:
            approvals.extend([
                ApprovalRequirement(
                    approval_type=ApprovalType.TECHNICAL,
                    approver_role='technical_lead',
                    approver_group='engineering',
                    required_count=2,
                    timeout_hours=24,
                    can_parallel=True,
                    reason='Multiple technical reviews required'
                ),
                ApprovalRequirement(
                    approval_type=ApprovalType.CAB,
                    approver_role='cab_member',
                    approver_group='change_advisory_board',
                    required_count=3,
                    timeout_hours=72,
                    can_parallel=False,
                    reason='CAB review for high risk change'
                )
            ])

        # Executive approval for critical risk
        if risk_level == RiskLevel.CRITICAL:
            if change_data.get('type') == 'emergency':
                approvals.extend([
                    ApprovalRequirement(
                        approval_type=ApprovalType.EMERGENCY_CAB,
                        approver_role='emergency_cab_member',
                        approver_group='emergency_change_board',
                        required_count=2,
                        timeout_hours=4,
                        can_parallel=True,
                        reason='Emergency CAB approval for critical emergency'
                    ),
                    ApprovalRequirement(
                        approval_type=ApprovalType.EXECUTIVE,
                        approver_role='cto',
                        approver_group='executive',
                        required_count=1,
                        timeout_hours=6,
                        can_parallel=False,
                        reason='Executive approval for critical emergency change'
                    )
                ])
            else:
                approvals.extend([
                    ApprovalRequirement(
                        approval_type=ApprovalType.SENIOR,
                        approver_role='senior_engineering_manager',
                        approver_group='senior_management',
                        required_count=1,
                        timeout_hours=48,
                        can_parallel=True,
                        reason='Senior management approval required'
                    ),
                    ApprovalRequirement(
                        approval_type=ApprovalType.CAB,
                        approver_role='cab_member',
                        approver_group='change_advisory_board',
                        required_count=5,
                        timeout_hours=96,
                        can_parallel=False,
                        reason='Full CAB review for critical change'
                    ),
                    ApprovalRequirement(
                        approval_type=ApprovalType.EXECUTIVE,
                        approver_role='cto',
                        approver_group='executive',
                        required_count=1,
                        timeout_hours=120,
                        can_parallel=False,
                        reason='Executive sign-off required'
                    )
                ])

        # Additional approvals based on impact areas
        if ImpactArea.SECURITY in risk_assessment.impact_areas:
            approvals.append(ApprovalRequirement(
                approval_type=ApprovalType.TECHNICAL,
                approver_role='security_lead',
                approver_group='security',
                required_count=1,
                timeout_hours=48,
                can_parallel=True,
                reason='Security review required'
            ))

        if ImpactArea.COMPLIANCE in risk_assessment.impact_areas:
            approvals.append(ApprovalRequirement(
                approval_type=ApprovalType.TECHNICAL,
                approver_role='compliance_officer',
                approver_group='compliance',
                required_count=1,
                timeout_hours=48,
                can_parallel=True,
                reason='Compliance review required'
            ))

        if ImpactArea.DATA in risk_assessment.impact_areas:
            approvals.append(ApprovalRequirement(
                approval_type=ApprovalType.TECHNICAL,
                approver_role='data_protection_officer',
                approver_group='privacy',
                required_count=1,
                timeout_hours=48,
                can_parallel=True,
                reason='Data protection review required'
            ))

        return approvals

    def determine_conditions(self, risk_assessment: RiskAssessment, change_data: Dict[str, Any]) -> List[str]:
        """Determine conditions for approval"""
        conditions = []

        if risk_assessment.rollback_plan_required and not change_data.get('rollback_plan'):
            conditions.append('Rollback plan must be documented and tested')

        if risk_assessment.mitigation_required:
            conditions.append('Risk mitigation strategies must be documented')

        if ImpactArea.CUSTOMERS in risk_assessment.impact_areas:
            conditions.append('Customer communication plan required')

        if risk_assessment.risk_level in [RiskLevel.CRITICAL, RiskLevel.HIGH]:
            conditions.append('Post-implementation review must be scheduled')
            conditions.append('Real-time monitoring during deployment')

        if change_data.get('type') == 'emergency':
            conditions.append('Post-mortem analysis required within 48 hours')

        return conditions

    def determine_restrictions(self, risk_assessment: RiskAssessment, change_data: Dict[str, Any]) -> List[str]:
        """Determine restrictions for the change"""
        restrictions = []

        if risk_assessment.risk_level == RiskLevel.CRITICAL:
            restrictions.append('Must be deployed during maintenance window')
            restrictions.append('Requires on-call engineer present')
            restrictions.append('Cannot be deployed on Fridays or before holidays')

        if risk_assessment.risk_level == RiskLevel.HIGH:
            restrictions.append('Should be deployed during low-traffic periods')
            restrictions.append('Phased rollout required (canary deployment)')

        if ImpactArea.PRODUCTION in risk_assessment.impact_areas:
            restrictions.append('Must have tested rollback procedure')

        return restrictions

    async def authorize_change(self, change_id: str, change_data: Dict[str, Any]) -> AuthorizationDecision:
        """Make authorization decision for a change"""
        # Calculate risk
        risk_assessment = await self.risk_calculator.calculate_risk(change_id, change_data)

        # Determine approvals
        required_approvals = self.determine_approvals(risk_assessment, change_data)

        # Determine conditions and restrictions
        conditions = self.determine_conditions(risk_assessment, change_data)
        restrictions = self.determine_restrictions(risk_assessment, change_data)

        # Calculate estimated approval time
        max_timeout = max([a.timeout_hours for a in required_approvals]) if required_approvals else 0
        estimated_time = f"{max_timeout} hours"

        # Check if auto-approved
        auto_approved = any(a.approval_type == ApprovalType.AUTO for a in required_approvals)

        decision_id = f"AUTH-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{change_id}"

        decision = AuthorizationDecision(
            change_id=change_id,
            decision_id=decision_id,
            timestamp=datetime.utcnow().isoformat(),
            risk_assessment=risk_assessment,
            required_approvals=required_approvals,
            estimated_approval_time=estimated_time,
            auto_approved=auto_approved,
            conditions=conditions,
            restrictions=restrictions
        )

        # Store decision
        await self.store_decision(decision)

        logger.info(f"Authorization decision {decision_id}: {'AUTO-APPROVED' if auto_approved else f'{len(required_approvals)} approvals required'}")

        return decision

    async def store_decision(self, decision: AuthorizationDecision):
        """Store authorization decision"""
        os.makedirs('/tmp/authorization-decisions', exist_ok=True)

        filepath = f'/tmp/authorization-decisions/{decision.decision_id}.json'
        with open(filepath, 'w') as f:
            json.dump(asdict(decision), f, indent=2, default=str)


class RiskAuthorizerService:
    """HTTP service for risk-based authorization"""

    def __init__(self):
        self.authorizer = AuthorizationEngine()
        self.app = web.Application()
        self.setup_routes()

    def setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_post('/authorize', self.authorize_change)
        self.app.router.add_post('/assess-risk', self.assess_risk)
        self.app.router.add_get('/decision/{decision_id}', self.get_decision)
        self.app.router.add_get('/metrics', self.get_metrics)

    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            'status': 'healthy',
            'service': 'risk-authorizer',
            'timestamp': datetime.utcnow().isoformat()
        })

    async def authorize_change(self, request):
        """Authorize a change request"""
        try:
            data = await request.json()
            change_id = data.get('change_id', 'unknown')
            change_data = data.get('change_data', {})

            decision = await self.authorizer.authorize_change(change_id, change_data)

            return web.json_response(asdict(decision), status=200)
        except Exception as e:
            logger.error(f"Authorization error: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def assess_risk(self, request):
        """Assess risk for a change"""
        try:
            data = await request.json()
            change_id = data.get('change_id', 'unknown')
            change_data = data.get('change_data', {})

            assessment = await self.authorizer.risk_calculator.calculate_risk(change_id, change_data)

            return web.json_response(asdict(assessment), status=200)
        except Exception as e:
            logger.error(f"Risk assessment error: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def get_decision(self, request):
        """Retrieve an authorization decision"""
        decision_id = request.match_info['decision_id']
        filepath = f'/tmp/authorization-decisions/{decision_id}.json'

        try:
            with open(filepath, 'r') as f:
                decision = json.load(f)
            return web.json_response(decision)
        except FileNotFoundError:
            return web.json_response({'error': 'Decision not found'}, status=404)

    async def get_metrics(self, request):
        """Get service metrics"""
        decisions_dir = '/tmp/authorization-decisions'
        decision_count = 0
        if os.path.exists(decisions_dir):
            decision_count = len([f for f in os.listdir(decisions_dir) if f.endswith('.json')])

        return web.json_response({
            'total_decisions': decision_count,
            'timestamp': datetime.utcnow().isoformat()
        })

    def run(self, host='0.0.0.0', port=8080):
        """Run the service"""
        logger.info(f"Starting Risk Authorizer Service on {host}:{port}")
        web.run_app(self.app, host=host, port=port)


if __name__ == '__main__':
    service = RiskAuthorizerService()
    service.run()
