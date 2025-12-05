#!/usr/bin/env python3
"""
AI Quotient (AIQ) Training & Measurement System

Measures team's AI readiness and provides personalized training.
"""

import json
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path


class AIQAssessment:
    """Assess individual's AI quotient"""

    def __init__(self):
        self.assessment_areas = {
            'prompt_engineering': {
                'weight': 0.25,
                'description': 'Ability to write effective prompts'
            },
            'ai_limitations': {
                'weight': 0.20,
                'description': 'Understanding of AI capabilities and limitations'
            },
            'agent_collaboration': {
                'weight': 0.20,
                'description': 'Working effectively with autonomous agents'
            },
            'governance_ethics': {
                'weight': 0.15,
                'description': 'Understanding of AI governance and ethics'
            },
            'strategic_thinking': {
                'weight': 0.20,
                'description': 'Shift from operational to strategic mindset'
            }
        }

    def assess(self, user_id: str, responses: Dict) -> Dict:
        """Assess user's AIQ"""
        scores = {}
        total_score = 0

        for area, config in self.assessment_areas.items():
            area_score = responses.get(area, 0)  # 0-100
            weighted_score = (area_score / 100) * config['weight']
            scores[area] = {
                'score': area_score,
                'weighted_score': weighted_score,
                'description': config['description']
            }
            total_score += weighted_score

        aiq_score = total_score * 100  # Convert to 0-100 scale

        return {
            'user_id': user_id,
            'aiq_score': aiq_score,
            'level': self._determine_level(aiq_score),
            'area_scores': scores,
            'assessment_date': datetime.now().isoformat()
        }

    def _determine_level(self, score: float) -> str:
        """Determine AIQ level"""
        if score >= 80:
            return 'expert'
        elif score >= 60:
            return 'proficient'
        elif score >= 40:
            return 'intermediate'
        elif score >= 20:
            return 'beginner'
        else:
            return 'novice'


class TrainingModule:
    """Individual training module"""

    def __init__(self, module_id: str, title: str, content: Dict):
        self.module_id = module_id
        self.title = title
        self.content = content
        self.completion_criteria = content.get('completion_criteria', {})


class TrainingProgram:
    """Complete training program for AI agents"""

    def __init__(self):
        self.modules = self._create_modules()
        self.user_progress = {}

    def _create_modules(self) -> List[TrainingModule]:
        """Create training modules"""
        return [
            TrainingModule('prompt-engineering', 'Effective Prompt Engineering', {
                'description': 'Learn to write clear, effective prompts for AI agents',
                'lessons': [
                    'Prompt structure and clarity',
                    'Providing context effectively',
                    'Iterative prompt refinement',
                    'Common pitfalls and how to avoid them'
                ],
                'completion_criteria': {
                    'quiz_score': 80,
                    'practice_exercises': 5
                }
            }),

            TrainingModule('agent-collaboration', 'Working with Autonomous Agents', {
                'description': 'Collaborate effectively with AI agents',
                'lessons': [
                    'Understanding agent capabilities',
                    'When to intervene vs trust the agent',
                    'Interpreting agent recommendations',
                    'Providing feedback to improve agents'
                ],
                'completion_criteria': {
                    'quiz_score': 80,
                    'supervised_tasks': 10
                }
            }),

            TrainingModule('governance-ethics', 'AI Governance & Ethics', {
                'description': 'Responsible AI agent use',
                'lessons': [
                    'Ethical considerations in AI',
                    'Data privacy and security',
                    'Bias awareness and mitigation',
                    'Regulatory compliance'
                ],
                'completion_criteria': {
                    'quiz_score': 90,  # Higher bar for governance
                    'case_studies': 3
                }
            }),

            TrainingModule('cost-optimization', 'AI Cost Optimization', {
                'description': 'Balance quality, speed, and cost',
                'lessons': [
                    'Understanding token costs',
                    'Model selection strategies',
                    'Caching and optimization techniques',
                    'ROI measurement'
                ],
                'completion_criteria': {
                    'quiz_score': 75,
                    'optimization_exercises': 5
                }
            }),

            TrainingModule('debugging-agents', 'Debugging AI Agents', {
                'description': 'Troubleshoot when agents make mistakes',
                'lessons': [
                    'Common failure modes',
                    'Reading agent logs and traces',
                    'Rollback and recovery',
                    'Improving agent performance'
                ],
                'completion_criteria': {
                    'quiz_score': 80,
                    'debug_exercises': 5
                }
            }),

            TrainingModule('strategic-mindset', 'Strategic vs Operational Thinking', {
                'description': 'Shift focus from routine to strategic work',
                'lessons': [
                    'Identifying high-value strategic work',
                    'Delegating operational tasks to agents',
                    'Measuring impact and outcomes',
                    'Continuous improvement'
                ],
                'completion_criteria': {
                    'reflection_essay': True,
                    'strategic_project': True
                }
            })
        ]

    def generate_training_plan(
        self,
        user_id: str,
        current_aiq: float,
        target_aiq: float,
        aiq_assessment: Dict
    ) -> Dict:
        """Generate personalized training plan"""
        weak_areas = self._identify_weak_areas(aiq_assessment)
        recommended_modules = self._recommend_modules(weak_areas)

        return {
            'user_id': user_id,
            'current_aiq': current_aiq,
            'target_aiq': target_aiq,
            'gap': target_aiq - current_aiq,
            'weak_areas': weak_areas,
            'recommended_modules': recommended_modules,
            'estimated_duration_weeks': len(recommended_modules) * 1,
            'plan_created': datetime.now().isoformat()
        }

    def _identify_weak_areas(self, assessment: Dict) -> List[Dict]:
        """Identify areas needing improvement"""
        weak_areas = []

        for area, scores in assessment['area_scores'].items():
            if scores['score'] < 70:  # Below proficient
                weak_areas.append({
                    'area': area,
                    'score': scores['score'],
                    'description': scores['description']
                })

        return sorted(weak_areas, key=lambda x: x['score'])

    def _recommend_modules(self, weak_areas: List[Dict]) -> List[Dict]:
        """Recommend training modules"""
        module_mapping = {
            'prompt_engineering': 'prompt-engineering',
            'agent_collaboration': 'agent-collaboration',
            'governance_ethics': 'governance-ethics',
            'strategic_thinking': 'strategic-mindset'
        }

        recommended = []

        for weak_area in weak_areas:
            module_id = module_mapping.get(weak_area['area'])
            if module_id:
                module = next((m for m in self.modules if m.module_id == module_id), None)
                if module:
                    recommended.append({
                        'module_id': module.module_id,
                        'title': module.title,
                        'reason': f"Improve {weak_area['description']}",
                        'current_score': weak_area['score']
                    })

        # Always recommend governance and ethics
        gov_module = next((m for m in self.modules if m.module_id == 'governance-ethics'), None)
        if gov_module and not any(r['module_id'] == 'governance-ethics' for r in recommended):
            recommended.append({
                'module_id': gov_module.module_id,
                'title': gov_module.title,
                'reason': 'Essential for all users',
                'current_score': 100  # Placeholder
            })

        return recommended


class AIQTracker:
    """Track AIQ progress over time"""

    def __init__(self, data_dir: Path = None):
        self.data_dir = data_dir or Path('data-intelligence/lakehouse/aiq')
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def record_assessment(self, user_id: str, assessment: Dict):
        """Record AIQ assessment"""
        user_file = self.data_dir / f'{user_id}.jsonl'

        with open(user_file, 'a') as f:
            f.write(json.dumps({
                'timestamp': datetime.now().isoformat(),
                'assessment': assessment
            }) + '\n')

    def get_progress(self, user_id: str) -> Dict:
        """Get user's AIQ progress"""
        user_file = self.data_dir / f'{user_id}.jsonl'

        if not user_file.exists():
            return {'user_id': user_id, 'assessments': []}

        assessments = []
        with open(user_file, 'r') as f:
            for line in f:
                assessments.append(json.loads(line))

        if not assessments:
            return {'user_id': user_id, 'assessments': []}

        first_score = assessments[0]['assessment']['aiq_score']
        latest_score = assessments[-1]['assessment']['aiq_score']

        return {
            'user_id': user_id,
            'assessments': assessments,
            'first_score': first_score,
            'latest_score': latest_score,
            'improvement': latest_score - first_score,
            'assessment_count': len(assessments)
        }


if __name__ == '__main__':
    # Example usage
    assessment_tool = AIQAssessment()
    training = TrainingProgram()
    tracker = AIQTracker()

    # Assess user
    user_responses = {
        'prompt_engineering': 60,
        'ai_limitations': 70,
        'agent_collaboration': 50,
        'governance_ethics': 80,
        'strategic_thinking': 55
    }

    assessment = assessment_tool.assess('user-001', user_responses)
    print(f"AIQ Score: {assessment['aiq_score']:.1f} ({assessment['level']})")

    # Generate training plan
    plan = training.generate_training_plan('user-001', assessment['aiq_score'], 80, assessment)
    print(f"\nRecommended modules: {len(plan['recommended_modules'])}")

    # Track progress
    tracker.record_assessment('user-001', assessment)
