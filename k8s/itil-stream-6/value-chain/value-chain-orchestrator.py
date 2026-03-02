#!/usr/bin/env python3
"""
End-to-End Value Chain Automation Service
ITIL Stream 6 - Component #19

Orchestrates the complete ITIL value chain from demand through delivery,
automating handoffs and tracking value realization.
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


class ValueChainActivity(str, Enum):
    """ITIL 4 Service Value Chain activities"""
    PLAN = "plan"
    IMPROVE = "improve"
    ENGAGE = "engage"
    DESIGN_TRANSITION = "design_transition"
    OBTAIN_BUILD = "obtain_build"
    DELIVER_SUPPORT = "deliver_support"


class StageStatus(str, Enum):
    """Status of value chain stage"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"
    SKIPPED = "skipped"


class ValueStreamType(str, Enum):
    """Types of value streams"""
    FEATURE_DELIVERY = "feature_delivery"
    INCIDENT_RESOLUTION = "incident_resolution"
    CHANGE_DEPLOYMENT = "change_deployment"
    SERVICE_REQUEST = "service_request"
    PROBLEM_RESOLUTION = "problem_resolution"


@dataclass
class ValueChainStage:
    """Individual stage in the value chain"""
    stage_id: str
    activity: ValueChainActivity
    name: str
    status: StageStatus
    owner: str
    started_at: Optional[str]
    completed_at: Optional[str]
    duration_minutes: Optional[int]
    inputs: List[Dict[str, Any]]
    outputs: List[Dict[str, Any]]
    automated: bool
    automation_rate: float  # 0.0-1.0
    dependencies: List[str]
    metrics: Dict[str, Any]


@dataclass
class ValueStream:
    """Complete value stream instance"""
    stream_id: str
    stream_type: ValueStreamType
    name: str
    description: str
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]
    status: StageStatus
    stages: List[ValueChainStage]
    current_stage: Optional[str]
    value_target: Dict[str, Any]
    value_realized: Dict[str, Any]
    customer_satisfaction: Optional[float]
    total_duration_minutes: Optional[int]
    automation_percentage: float


@dataclass
class HandoffEvent:
    """Event representing a handoff between stages"""
    handoff_id: str
    timestamp: str
    from_stage: str
    to_stage: str
    artifacts: List[str]
    automated: bool
    validation_passed: bool
    delay_minutes: int


class ValueChainOrchestrator:
    """Orchestrate end-to-end value chain execution"""

    def __init__(self):
        self.active_streams: Dict[str, ValueStream] = {}
        self.governance_url = os.getenv('GOVERNANCE_URL', 'http://governance-validator.cortex-governance.svc.cluster.local:8080')
        self.risk_url = os.getenv('RISK_URL', 'http://risk-authorizer.cortex-governance.svc.cluster.local:8080')
        self.change_manager_url = os.getenv('CHANGE_MANAGER_URL', 'http://change-manager.cortex-change-mgmt.svc.cluster.local:8080')

    def create_feature_delivery_stream(self, feature_id: str, feature_data: Dict[str, Any]) -> ValueStream:
        """Create a feature delivery value stream"""
        stream_id = f"VS-FEATURE-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

        stages = [
            ValueChainStage(
                stage_id=f"{stream_id}-PLAN",
                activity=ValueChainActivity.PLAN,
                name="Feature Planning",
                status=StageStatus.PENDING,
                owner="product_management",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[{'type': 'feature_request', 'id': feature_id}],
                outputs=[],
                automated=False,
                automation_rate=0.3,
                dependencies=[],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-DESIGN",
                activity=ValueChainActivity.DESIGN_TRANSITION,
                name="Design & Architecture",
                status=StageStatus.PENDING,
                owner="engineering",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=False,
                automation_rate=0.4,
                dependencies=[f"{stream_id}-PLAN"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-BUILD",
                activity=ValueChainActivity.OBTAIN_BUILD,
                name="Development & Testing",
                status=StageStatus.PENDING,
                owner="engineering",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.8,
                dependencies=[f"{stream_id}-DESIGN"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-DEPLOY",
                activity=ValueChainActivity.DELIVER_SUPPORT,
                name="Deployment",
                status=StageStatus.PENDING,
                owner="sre",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.9,
                dependencies=[f"{stream_id}-BUILD"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-MONITOR",
                activity=ValueChainActivity.DELIVER_SUPPORT,
                name="Monitoring & Support",
                status=StageStatus.PENDING,
                owner="sre",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.95,
                dependencies=[f"{stream_id}-DEPLOY"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-IMPROVE",
                activity=ValueChainActivity.IMPROVE,
                name="Feedback & Improvement",
                status=StageStatus.PENDING,
                owner="product_management",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=False,
                automation_rate=0.5,
                dependencies=[f"{stream_id}-MONITOR"],
                metrics={}
            )
        ]

        # Calculate overall automation percentage
        automation_percentage = sum(s.automation_rate for s in stages) / len(stages) * 100

        stream = ValueStream(
            stream_id=stream_id,
            stream_type=ValueStreamType.FEATURE_DELIVERY,
            name=f"Feature Delivery: {feature_data.get('name', feature_id)}",
            description=feature_data.get('description', ''),
            created_at=datetime.utcnow().isoformat(),
            started_at=None,
            completed_at=None,
            status=StageStatus.PENDING,
            stages=stages,
            current_stage=None,
            value_target={
                'customer_value': feature_data.get('customer_value', 'medium'),
                'business_value': feature_data.get('business_value', 'medium'),
                'target_adoption_rate': 0.8
            },
            value_realized={},
            customer_satisfaction=None,
            total_duration_minutes=None,
            automation_percentage=automation_percentage
        )

        self.active_streams[stream_id] = stream
        logger.info(f"Created feature delivery stream: {stream_id}")

        return stream

    def create_change_deployment_stream(self, change_id: str, change_data: Dict[str, Any]) -> ValueStream:
        """Create a change deployment value stream"""
        stream_id = f"VS-CHANGE-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

        stages = [
            ValueChainStage(
                stage_id=f"{stream_id}-ASSESS",
                activity=ValueChainActivity.PLAN,
                name="Risk Assessment",
                status=StageStatus.PENDING,
                owner="change_management",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[{'type': 'change_request', 'id': change_id}],
                outputs=[],
                automated=True,
                automation_rate=1.0,
                dependencies=[],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-AUTHORIZE",
                activity=ValueChainActivity.ENGAGE,
                name="Authorization",
                status=StageStatus.PENDING,
                owner="approvers",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.7,
                dependencies=[f"{stream_id}-ASSESS"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-IMPLEMENT",
                activity=ValueChainActivity.DELIVER_SUPPORT,
                name="Implementation",
                status=StageStatus.PENDING,
                owner="implementation_team",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.85,
                dependencies=[f"{stream_id}-AUTHORIZE"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-VERIFY",
                activity=ValueChainActivity.DELIVER_SUPPORT,
                name="Verification",
                status=StageStatus.PENDING,
                owner="qa_team",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=True,
                automation_rate=0.9,
                dependencies=[f"{stream_id}-IMPLEMENT"],
                metrics={}
            ),
            ValueChainStage(
                stage_id=f"{stream_id}-REVIEW",
                activity=ValueChainActivity.IMPROVE,
                name="Post-Implementation Review",
                status=StageStatus.PENDING,
                owner="change_management",
                started_at=None,
                completed_at=None,
                duration_minutes=None,
                inputs=[],
                outputs=[],
                automated=False,
                automation_rate=0.6,
                dependencies=[f"{stream_id}-VERIFY"],
                metrics={}
            )
        ]

        automation_percentage = sum(s.automation_rate for s in stages) / len(stages) * 100

        stream = ValueStream(
            stream_id=stream_id,
            stream_type=ValueStreamType.CHANGE_DEPLOYMENT,
            name=f"Change Deployment: {change_id}",
            description=change_data.get('description', ''),
            created_at=datetime.utcnow().isoformat(),
            started_at=None,
            completed_at=None,
            status=StageStatus.PENDING,
            stages=stages,
            current_stage=None,
            value_target={
                'success_criteria': change_data.get('success_criteria', []),
                'target_completion_hours': 24
            },
            value_realized={},
            customer_satisfaction=None,
            total_duration_minutes=None,
            automation_percentage=automation_percentage
        )

        self.active_streams[stream_id] = stream
        logger.info(f"Created change deployment stream: {stream_id}")

        return stream

    async def execute_stage(self, stream_id: str, stage_id: str) -> bool:
        """Execute a specific stage in the value stream"""
        stream = self.active_streams.get(stream_id)
        if not stream:
            logger.error(f"Stream not found: {stream_id}")
            return False

        # Find the stage
        stage = next((s for s in stream.stages if s.stage_id == stage_id), None)
        if not stage:
            logger.error(f"Stage not found: {stage_id}")
            return False

        # Check dependencies
        for dep_id in stage.dependencies:
            dep_stage = next((s for s in stream.stages if s.stage_id == dep_id), None)
            if not dep_stage or dep_stage.status != StageStatus.COMPLETED:
                logger.warning(f"Dependency not met: {dep_id}")
                stage.status = StageStatus.BLOCKED
                return False

        # Start stage execution
        stage.status = StageStatus.IN_PROGRESS
        stage.started_at = datetime.utcnow().isoformat()
        stream.current_stage = stage_id

        logger.info(f"Executing stage {stage.name} in stream {stream_id}")

        try:
            # Execute based on activity type
            if stage.activity == ValueChainActivity.PLAN:
                success = await self.execute_plan_stage(stream, stage)
            elif stage.activity == ValueChainActivity.DESIGN_TRANSITION:
                success = await self.execute_design_stage(stream, stage)
            elif stage.activity == ValueChainActivity.OBTAIN_BUILD:
                success = await self.execute_build_stage(stream, stage)
            elif stage.activity == ValueChainActivity.DELIVER_SUPPORT:
                success = await self.execute_deliver_stage(stream, stage)
            elif stage.activity == ValueChainActivity.IMPROVE:
                success = await self.execute_improve_stage(stream, stage)
            else:
                success = True

            if success:
                stage.status = StageStatus.COMPLETED
                stage.completed_at = datetime.utcnow().isoformat()

                # Calculate duration
                if stage.started_at and stage.completed_at:
                    start = datetime.fromisoformat(stage.started_at)
                    end = datetime.fromisoformat(stage.completed_at)
                    stage.duration_minutes = int((end - start).total_seconds() / 60)

                logger.info(f"Completed stage {stage.name} in {stage.duration_minutes} minutes")

                # Check if all stages are complete
                if all(s.status == StageStatus.COMPLETED for s in stream.stages):
                    await self.complete_stream(stream)

            else:
                stage.status = StageStatus.FAILED
                logger.error(f"Stage execution failed: {stage.name}")

            return success

        except Exception as e:
            logger.error(f"Error executing stage {stage_id}: {e}")
            stage.status = StageStatus.FAILED
            return False

    async def execute_plan_stage(self, stream: ValueStream, stage: ValueChainStage) -> bool:
        """Execute planning stage"""
        # Simulate planning activities
        await asyncio.sleep(0.1)

        stage.outputs.append({
            'type': 'plan',
            'created_at': datetime.utcnow().isoformat(),
            'automated': stage.automated
        })

        stage.metrics['planning_tasks_completed'] = 5
        return True

    async def execute_design_stage(self, stream: ValueStream, stage: ValueChainStage) -> bool:
        """Execute design stage"""
        await asyncio.sleep(0.1)

        stage.outputs.append({
            'type': 'design_document',
            'created_at': datetime.utcnow().isoformat(),
            'automated': stage.automated
        })

        stage.metrics['design_reviews'] = 2
        return True

    async def execute_build_stage(self, stream: ValueStream, stage: ValueChainStage) -> bool:
        """Execute build stage"""
        await asyncio.sleep(0.1)

        stage.outputs.append({
            'type': 'build_artifact',
            'created_at': datetime.utcnow().isoformat(),
            'automated': stage.automated
        })

        stage.metrics['tests_passed'] = 150
        stage.metrics['code_coverage'] = 85.5
        return True

    async def execute_deliver_stage(self, stream: ValueStream, stage: ValueChainStage) -> bool:
        """Execute delivery/support stage"""
        await asyncio.sleep(0.1)

        # For change deployment streams, integrate with governance
        if stream.stream_type == ValueStreamType.CHANGE_DEPLOYMENT:
            if 'ASSESS' in stage.stage_id:
                # Call risk authorizer
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.post(
                            f"{self.risk_url}/assess-risk",
                            json={'change_id': stream.stream_id, 'change_data': {}},
                            timeout=aiohttp.ClientTimeout(total=5)
                        ) as resp:
                            if resp.status == 200:
                                risk_data = await resp.json()
                                stage.metrics['risk_assessment'] = risk_data
                except Exception as e:
                    logger.warning(f"Could not reach risk authorizer: {e}")

        stage.outputs.append({
            'type': 'deployment_record',
            'created_at': datetime.utcnow().isoformat(),
            'automated': stage.automated
        })

        return True

    async def execute_improve_stage(self, stream: ValueStream, stage: ValueChainStage) -> bool:
        """Execute improvement stage"""
        await asyncio.sleep(0.1)

        stage.outputs.append({
            'type': 'improvement_recommendations',
            'created_at': datetime.utcnow().isoformat(),
            'automated': stage.automated
        })

        stage.metrics['improvements_identified'] = 3
        return True

    async def complete_stream(self, stream: ValueStream):
        """Complete a value stream"""
        stream.status = StageStatus.COMPLETED
        stream.completed_at = datetime.utcnow().isoformat()

        # Calculate total duration
        if stream.started_at and stream.completed_at:
            start = datetime.fromisoformat(stream.started_at)
            end = datetime.fromisoformat(stream.completed_at)
            stream.total_duration_minutes = int((end - start).total_seconds() / 60)

        # Calculate value realized
        stream.value_realized = {
            'completed_at': stream.completed_at,
            'total_duration_minutes': stream.total_duration_minutes,
            'automation_percentage': stream.automation_percentage,
            'stages_completed': len([s for s in stream.stages if s.status == StageStatus.COMPLETED])
        }

        # Simulated customer satisfaction
        stream.customer_satisfaction = 4.5  # out of 5

        logger.info(f"Completed value stream {stream.stream_id} in {stream.total_duration_minutes} minutes")

        # Store completed stream
        await self.store_stream(stream)

    async def start_stream(self, stream_id: str) -> bool:
        """Start executing a value stream"""
        stream = self.active_streams.get(stream_id)
        if not stream:
            return False

        stream.started_at = datetime.utcnow().isoformat()
        stream.status = StageStatus.IN_PROGRESS

        logger.info(f"Started value stream: {stream_id}")

        # Execute first stage (one without dependencies)
        first_stage = next((s for s in stream.stages if not s.dependencies), None)
        if first_stage:
            await self.execute_stage(stream_id, first_stage.stage_id)

        return True

    async def progress_stream(self, stream_id: str) -> bool:
        """Progress to next stage in value stream"""
        stream = self.active_streams.get(stream_id)
        if not stream:
            return False

        # Find next pending stage with met dependencies
        for stage in stream.stages:
            if stage.status == StageStatus.PENDING:
                # Check if dependencies are met
                deps_met = all(
                    any(s.stage_id == dep_id and s.status == StageStatus.COMPLETED
                        for s in stream.stages)
                    for dep_id in stage.dependencies
                )

                if deps_met or not stage.dependencies:
                    await self.execute_stage(stream_id, stage.stage_id)
                    return True

        return False

    async def store_stream(self, stream: ValueStream):
        """Store completed value stream"""
        os.makedirs('/tmp/value-streams', exist_ok=True)

        filepath = f'/tmp/value-streams/{stream.stream_id}.json'
        with open(filepath, 'w') as f:
            json.dump(asdict(stream), f, indent=2, default=str)


class ValueChainService:
    """HTTP service for value chain orchestration"""

    def __init__(self):
        self.orchestrator = ValueChainOrchestrator()
        self.app = web.Application()
        self.setup_routes()

    def setup_routes(self):
        """Setup HTTP routes"""
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_post('/stream/feature', self.create_feature_stream)
        self.app.router.add_post('/stream/change', self.create_change_stream)
        self.app.router.add_post('/stream/{stream_id}/start', self.start_stream)
        self.app.router.add_post('/stream/{stream_id}/progress', self.progress_stream)
        self.app.router.add_get('/stream/{stream_id}', self.get_stream)
        self.app.router.add_get('/streams', self.list_streams)
        self.app.router.add_get('/metrics', self.get_metrics)

    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            'status': 'healthy',
            'service': 'value-chain-orchestrator',
            'active_streams': len(self.orchestrator.active_streams),
            'timestamp': datetime.utcnow().isoformat()
        })

    async def create_feature_stream(self, request):
        """Create a feature delivery value stream"""
        try:
            data = await request.json()
            feature_id = data.get('feature_id', 'unknown')
            feature_data = data.get('feature_data', {})

            stream = self.orchestrator.create_feature_delivery_stream(feature_id, feature_data)

            return web.json_response(asdict(stream), status=201)
        except Exception as e:
            logger.error(f"Error creating feature stream: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def create_change_stream(self, request):
        """Create a change deployment value stream"""
        try:
            data = await request.json()
            change_id = data.get('change_id', 'unknown')
            change_data = data.get('change_data', {})

            stream = self.orchestrator.create_change_deployment_stream(change_id, change_data)

            return web.json_response(asdict(stream), status=201)
        except Exception as e:
            logger.error(f"Error creating change stream: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def start_stream(self, request):
        """Start a value stream"""
        stream_id = request.match_info['stream_id']

        success = await self.orchestrator.start_stream(stream_id)

        if success:
            stream = self.orchestrator.active_streams[stream_id]
            return web.json_response(asdict(stream))
        else:
            return web.json_response({'error': 'Stream not found'}, status=404)

    async def progress_stream(self, request):
        """Progress a value stream to next stage"""
        stream_id = request.match_info['stream_id']

        success = await self.orchestrator.progress_stream(stream_id)

        if success:
            stream = self.orchestrator.active_streams[stream_id]
            return web.json_response(asdict(stream))
        else:
            return web.json_response({'error': 'Could not progress stream'}, status=400)

    async def get_stream(self, request):
        """Get a specific value stream"""
        stream_id = request.match_info['stream_id']

        stream = self.orchestrator.active_streams.get(stream_id)
        if stream:
            return web.json_response(asdict(stream))

        # Check stored streams
        filepath = f'/tmp/value-streams/{stream_id}.json'
        try:
            with open(filepath, 'r') as f:
                stream_data = json.load(f)
            return web.json_response(stream_data)
        except FileNotFoundError:
            return web.json_response({'error': 'Stream not found'}, status=404)

    async def list_streams(self, request):
        """List all active streams"""
        streams = [asdict(s) for s in self.orchestrator.active_streams.values()]
        return web.json_response({
            'total': len(streams),
            'streams': streams
        })

    async def get_metrics(self, request):
        """Get service metrics"""
        streams_dir = '/tmp/value-streams'
        completed_count = 0
        if os.path.exists(streams_dir):
            completed_count = len([f for f in os.listdir(streams_dir) if f.endswith('.json')])

        return web.json_response({
            'active_streams': len(self.orchestrator.active_streams),
            'completed_streams': completed_count,
            'timestamp': datetime.utcnow().isoformat()
        })

    def run(self, host='0.0.0.0', port=8080):
        """Run the service"""
        logger.info(f"Starting Value Chain Orchestrator Service on {host}:{port}")
        web.run_app(self.app, host=host, port=port)


if __name__ == '__main__':
    service = ValueChainService()
    service.run()
