#!/usr/bin/env python3
"""
Align-by-Design Governance Framework

Ensures AI agents operate within business guardrails, company values,
ethical guidelines, and regulatory requirements.
"""

import json
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass


class RiskLevel(Enum):
    """Risk levels for agent actions"""
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


class AutonomyLevel(Enum):
    """Autonomy levels for agents"""
    READ_ONLY = "read_only"
    SUGGEST = "suggest"
    EXECUTE_LOW_RISK = "execute_low_risk"
    EXECUTE_MEDIUM_RISK = "execute_medium_risk"
    FULL_AUTONOMY = "full_autonomy"


@dataclass
class ValidationResult:
    """Result of governance validation"""
    approved: bool
    risk_level: RiskLevel
    reasons: List[str]
    required_approvals: List[str]
    constraints: Dict[str, any]


class PolicyEngine:
    """Evaluate actions against policies"""

    def __init__(self, policy_dir: Path = None):
        self.policy_dir = policy_dir or Path('data-intelligence/ai-agents/governance/policies')
        self.policy_dir.mkdir(parents=True, exist_ok=True)
        self.policies = self._load_policies()

    def _load_policies(self) -> Dict:
        """Load all policy files"""
        policies = {}

        # Load default policies
        default_policy_file = self.policy_dir / 'default-policies.yaml'
        if default_policy_file.exists():
            with open(default_policy_file, 'r') as f:
                policies['default'] = yaml.safe_load(f)
        else:
            # Create default policies
            default_policies = {
                'autonomy_levels': {
                    'security-master': AutonomyLevel.EXECUTE_LOW_RISK.value,
                    'development-master': AutonomyLevel.SUGGEST.value,
                    'inventory-master': AutonomyLevel.EXECUTE_LOW_RISK.value,
                    'cicd-master': AutonomyLevel.SUGGEST.value,
                    'coordinator-master': AutonomyLevel.EXECUTE_MEDIUM_RISK.value
                },
                'action_risk_levels': {
                    'read_file': RiskLevel.NONE.value,
                    'search_code': RiskLevel.NONE.value,
                    'analyze': RiskLevel.LOW.value,
                    'suggest_change': RiskLevel.LOW.value,
                    'modify_code': RiskLevel.HIGH.value,
                    'delete_file': RiskLevel.CRITICAL.value,
                    'deploy': RiskLevel.CRITICAL.value,
                    'modify_infrastructure': RiskLevel.CRITICAL.value
                },
                'approval_requirements': {
                    RiskLevel.NONE.value: [],
                    RiskLevel.LOW.value: [],
                    RiskLevel.MEDIUM.value: ['team_lead'],
                    RiskLevel.HIGH.value: ['team_lead', 'tech_lead'],
                    RiskLevel.CRITICAL.value: ['team_lead', 'tech_lead', 'security_officer']
                },
                'constraints': {
                    'max_files_changed_per_action': 10,
                    'max_cost_per_action': 1.0,
                    'require_tests_for_code_changes': True,
                    'require_review_for_prod_changes': True
                }
            }

            with open(default_policy_file, 'w') as f:
                yaml.dump(default_policies, f)

            policies['default'] = default_policies

        return policies

    def evaluate_action(self, agent_id: str, action: Dict) -> ValidationResult:
        """Evaluate if action is allowed under current policies"""
        policies = self.policies.get('default', {})

        # Determine agent's autonomy level
        agent_type = action.get('agent_type', 'unknown')
        autonomy_level = policies.get('autonomy_levels', {}).get(
            agent_type,
            AutonomyLevel.SUGGEST.value
        )

        # Determine action risk level
        action_type = action.get('action_type', 'unknown')
        risk_level = RiskLevel(
            policies.get('action_risk_levels', {}).get(action_type, RiskLevel.MEDIUM.value)
        )

        # Check if action is within autonomy level
        reasons = []
        approved = self._check_autonomy_permission(autonomy_level, risk_level, reasons)

        # Check constraints
        constraints_met = self._check_constraints(action, policies.get('constraints', {}), reasons)
        approved = approved and constraints_met

        # Determine required approvals
        required_approvals = policies.get('approval_requirements', {}).get(risk_level.value, [])

        return ValidationResult(
            approved=approved,
            risk_level=risk_level,
            reasons=reasons,
            required_approvals=required_approvals,
            constraints=policies.get('constraints', {})
        )

    def _check_autonomy_permission(
        self,
        autonomy_level: str,
        risk_level: RiskLevel,
        reasons: List[str]
    ) -> bool:
        """Check if autonomy level permits this risk level"""
        permission_matrix = {
            AutonomyLevel.READ_ONLY.value: [RiskLevel.NONE],
            AutonomyLevel.SUGGEST.value: [RiskLevel.NONE, RiskLevel.LOW],
            AutonomyLevel.EXECUTE_LOW_RISK.value: [RiskLevel.NONE, RiskLevel.LOW],
            AutonomyLevel.EXECUTE_MEDIUM_RISK.value: [RiskLevel.NONE, RiskLevel.LOW, RiskLevel.MEDIUM],
            AutonomyLevel.FULL_AUTONOMY.value: [RiskLevel.NONE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH]
        }

        allowed_risks = permission_matrix.get(autonomy_level, [])

        if risk_level not in allowed_risks:
            reasons.append(f"Action risk level {risk_level.name} exceeds autonomy level {autonomy_level}")
            return False

        return True

    def _check_constraints(self, action: Dict, constraints: Dict, reasons: List[str]) -> bool:
        """Check action against constraints"""
        all_met = True

        # Check file count limit
        files_changed = len(action.get('files_changed', []))
        max_files = constraints.get('max_files_changed_per_action', float('inf'))
        if files_changed > max_files:
            reasons.append(f"Files changed ({files_changed}) exceeds limit ({max_files})")
            all_met = False

        # Check cost limit
        estimated_cost = action.get('estimated_cost', 0)
        max_cost = constraints.get('max_cost_per_action', float('inf'))
        if estimated_cost > max_cost:
            reasons.append(f"Estimated cost (${estimated_cost:.2f}) exceeds limit (${max_cost:.2f})")
            all_met = False

        # Check test requirement
        if constraints.get('require_tests_for_code_changes', False):
            if action.get('modifies_code', False) and not action.get('has_tests', False):
                reasons.append("Code changes require tests")
                all_met = False

        return all_met


class EthicsValidator:
    """Validate actions against ethical guidelines"""

    def __init__(self):
        self.ethical_principles = {
            'transparency': "Actions should be transparent and explainable",
            'fairness': "Actions should not discriminate or introduce bias",
            'privacy': "Actions should respect user privacy and data protection",
            'accountability': "Actions should have clear ownership and responsibility",
            'safety': "Actions should not cause harm"
        }

    def validate(self, action: Dict) -> Tuple[bool, List[str]]:
        """Validate action against ethical principles"""
        concerns = []

        # Check for PII handling
        if action.get('accesses_pii', False):
            if not action.get('has_privacy_approval', False):
                concerns.append("Action accesses PII without privacy approval")

        # Check for bias risk
        if action.get('affects_user_experience', False):
            if not action.get('has_fairness_review', False):
                concerns.append("Action affects users without fairness review")

        # Check for transparency
        if not action.get('reasoning_provided', False):
            concerns.append("Action lacks transparent reasoning")

        # Check for safety
        if action.get('risk_level', RiskLevel.NONE) == RiskLevel.CRITICAL:
            if not action.get('safety_review_complete', False):
                concerns.append("Critical action requires safety review")

        return (len(concerns) == 0, concerns)


class ComplianceTracker:
    """Track compliance with regulations"""

    def __init__(self):
        self.compliance_frameworks = {
            'SOC2': self._check_soc2,
            'GDPR': self._check_gdpr,
            'HIPAA': self._check_hipaa
        }

    def check_compliance(self, action: Dict, frameworks: List[str]) -> Tuple[bool, Dict]:
        """Check action compliance with specified frameworks"""
        results = {}

        for framework in frameworks:
            if framework in self.compliance_frameworks:
                compliant, issues = self.compliance_frameworks[framework](action)
                results[framework] = {
                    'compliant': compliant,
                    'issues': issues
                }

        all_compliant = all(r['compliant'] for r in results.values())
        return (all_compliant, results)

    def _check_soc2(self, action: Dict) -> Tuple[bool, List[str]]:
        """Check SOC2 compliance"""
        issues = []

        if not action.get('audit_logged', False):
            issues.append("Action not logged for audit trail")

        if action.get('accesses_customer_data', False):
            if not action.get('access_authorized', False):
                issues.append("Unauthorized customer data access")

        return (len(issues) == 0, issues)

    def _check_gdpr(self, action: Dict) -> Tuple[bool, List[str]]:
        """Check GDPR compliance"""
        issues = []

        if action.get('processes_eu_data', False):
            if not action.get('gdpr_compliant', False):
                issues.append("EU data processing requires GDPR compliance")

        if action.get('deletes_user_data', False):
            if not action.get('retention_policy_checked', False):
                issues.append("Data deletion must follow retention policy")

        return (len(issues) == 0, issues)

    def _check_hipaa(self, action: Dict) -> Tuple[bool, List[str]]:
        """Check HIPAA compliance"""
        issues = []

        if action.get('accesses_phi', False):  # Protected Health Information
            if not action.get('hipaa_authorized', False):
                issues.append("PHI access requires HIPAA authorization")

        return (len(issues) == 0, issues)


class AlignByDesignGovernance:
    """Main governance framework"""

    def __init__(self):
        self.policy_engine = PolicyEngine()
        self.ethics_validator = EthicsValidator()
        self.compliance_tracker = ComplianceTracker()
        self.audit_log = Path('data-intelligence/lakehouse/logs/governance-audit.jsonl')
        self.audit_log.parent.mkdir(parents=True, exist_ok=True)

    def validate_action(self, agent_id: str, action: Dict) -> Dict:
        """Comprehensive action validation"""
        # Policy evaluation
        policy_result = self.policy_engine.evaluate_action(agent_id, action)

        # Ethics validation
        ethics_valid, ethics_concerns = self.ethics_validator.validate(action)

        # Compliance check
        frameworks = action.get('compliance_frameworks', [])
        compliance_valid, compliance_results = self.compliance_tracker.check_compliance(
            action, frameworks
        )

        # Final decision
        approved = policy_result.approved and ethics_valid and compliance_valid

        result = {
            'agent_id': agent_id,
            'action_id': action.get('action_id'),
            'approved': approved,
            'policy_result': {
                'approved': policy_result.approved,
                'risk_level': policy_result.risk_level.name,
                'reasons': policy_result.reasons,
                'required_approvals': policy_result.required_approvals
            },
            'ethics_result': {
                'valid': ethics_valid,
                'concerns': ethics_concerns
            },
            'compliance_result': {
                'valid': compliance_valid,
                'frameworks': compliance_results
            }
        }

        # Audit log
        self._log_decision(agent_id, action, result)

        return result

    def _log_decision(self, agent_id: str, action: Dict, result: Dict):
        """Log governance decision"""
        with open(self.audit_log, 'a') as f:
            f.write(json.dumps({
                'timestamp': datetime.now().isoformat(),
                'agent_id': agent_id,
                'action': action,
                'decision': result
            }, default=str) + '\n')


if __name__ == '__main__':
    from datetime import datetime

    governance = AlignByDesignGovernance()

    # Test action
    action = {
        'action_id': 'test-001',
        'agent_type': 'development-master',
        'action_type': 'modify_code',
        'files_changed': ['src/auth.py'],
        'estimated_cost': 0.05,
        'modifies_code': True,
        'has_tests': True,
        'reasoning_provided': True,
        'audit_logged': True
    }

    result = governance.validate_action('agent-001', action)
    print(json.dumps(result, indent=2))
