#!/usr/bin/env python3
"""
Ecosystem Integration Platform
ITIL Stream 6 - Component #20

Provides unified API gateway and integration hub for all ITIL components,
external tools, and third-party systems.
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


class IntegrationType(str, Enum):
    """Types of integrations"""
    REST_API = "rest_api"
    WEBHOOK = "webhook"
    EVENT_STREAM = "event_stream"
    DATABASE = "database"
    MESSAGE_QUEUE = "message_queue"
    FILE_SYSTEM = "file_system"


class IntegrationStatus(str, Enum):
    """Integration endpoint status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    DEGRADED = "degraded"


class EventType(str, Enum):
    """Types of integration events"""
    CHANGE_CREATED = "change.created"
    CHANGE_APPROVED = "change.approved"
    CHANGE_DEPLOYED = "change.deployed"
    GOVERNANCE_VALIDATED = "governance.validated"
    RISK_ASSESSED = "risk.assessed"
    STREAM_STARTED = "stream.started"
    STREAM_COMPLETED = "stream.completed"
    INCIDENT_CREATED = "incident.created"
    INCIDENT_RESOLVED = "incident.resolved"


@dataclass
class IntegrationEndpoint:
    """External integration endpoint configuration"""
    endpoint_id: str
    name: str
    type: IntegrationType
    url: Optional[str]
    status: IntegrationStatus
    authentication: Dict[str, Any]
    config: Dict[str, Any]
    subscribed_events: List[EventType]
    rate_limit: int  # requests per minute
    timeout_seconds: int
    retry_count: int
    enabled: bool
    last_success: Optional[str]
    last_error: Optional[str]
    total_requests: int
    failed_requests: int


@dataclass
class IntegrationEvent:
    """Event to be sent to integrations"""
    event_id: str
    event_type: EventType
    timestamp: str
    source: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]


@dataclass
class IntegrationRequest:
    """Request sent to integration endpoint"""
    request_id: str
    endpoint_id: str
    event: IntegrationEvent
    timestamp: str
    status: str
    response_time_ms: Optional[int]
    error: Optional[str]


class IntegrationHub:
    """Central hub for all integrations"""

    def __init__(self):
        self.endpoints: Dict[str, IntegrationEndpoint] = {}
        self.event_queue: List[IntegrationEvent] = []
        self.request_history: List[IntegrationRequest] = []
        self.webhooks: Dict[str, List[str]] = {}  # event_type -> list of webhook URLs
        self.setup_internal_integrations()

    def setup_internal_integrations(self):
        """Setup integrations with internal ITIL services"""

        # Governance Validator integration
        self.endpoints['governance-validator'] = IntegrationEndpoint(
            endpoint_id='governance-validator',
            name='Governance Validation Service',
            type=IntegrationType.REST_API,
            url='http://governance-validator.cortex-governance.svc.cluster.local:8080',
            status=IntegrationStatus.ACTIVE,
            authentication={'type': 'none'},
            config={'timeout': 30},
            subscribed_events=[EventType.CHANGE_CREATED],
            rate_limit=100,
            timeout_seconds=30,
            retry_count=3,
            enabled=True,
            last_success=None,
            last_error=None,
            total_requests=0,
            failed_requests=0
        )

        # Risk Authorizer integration
        self.endpoints['risk-authorizer'] = IntegrationEndpoint(
            endpoint_id='risk-authorizer',
            name='Risk-Based Authorization Service',
            type=IntegrationType.REST_API,
            url='http://risk-authorizer.cortex-governance.svc.cluster.local:8080',
            status=IntegrationStatus.ACTIVE,
            authentication={'type': 'none'},
            config={'timeout': 30},
            subscribed_events=[EventType.CHANGE_CREATED, EventType.GOVERNANCE_VALIDATED],
            rate_limit=100,
            timeout_seconds=30,
            retry_count=3,
            enabled=True,
            last_success=None,
            last_error=None,
            total_requests=0,
            failed_requests=0
        )

        # Value Chain Orchestrator integration
        self.endpoints['value-chain'] = IntegrationEndpoint(
            endpoint_id='value-chain',
            name='Value Chain Orchestrator',
            type=IntegrationType.REST_API,
            url='http://value-chain-orchestrator.cortex-governance.svc.cluster.local:8080',
            status=IntegrationStatus.ACTIVE,
            authentication={'type': 'none'},
            config={'timeout': 60},
            subscribed_events=[EventType.CHANGE_APPROVED],
            rate_limit=50,
            timeout_seconds=60,
            retry_count=3,
            enabled=True,
            last_success=None,
            last_error=None,
            total_requests=0,
            failed_requests=0
        )

        # Change Manager integration
        self.endpoints['change-manager'] = IntegrationEndpoint(
            endpoint_id='change-manager',
            name='Change Management Service',
            type=IntegrationType.REST_API,
            url='http://change-manager.cortex-change-mgmt.svc.cluster.local:8080',
            status=IntegrationStatus.ACTIVE,
            authentication={'type': 'none'},
            config={'timeout': 30},
            subscribed_events=[
                EventType.GOVERNANCE_VALIDATED,
                EventType.RISK_ASSESSED,
                EventType.STREAM_COMPLETED
            ],
            rate_limit=100,
            timeout_seconds=30,
            retry_count=3,
            enabled=True,
            last_success=None,
            last_error=None,
            total_requests=0,
            failed_requests=0
        )

        logger.info(f"Initialized {len(self.endpoints)} internal integrations")

    def register_endpoint(self, endpoint: IntegrationEndpoint) -> bool:
        """Register a new integration endpoint"""
        if endpoint.endpoint_id in self.endpoints:
            logger.warning(f"Endpoint already exists: {endpoint.endpoint_id}")
            return False

        self.endpoints[endpoint.endpoint_id] = endpoint
        logger.info(f"Registered endpoint: {endpoint.name}")
        return True

    def subscribe_webhook(self, event_type: EventType, webhook_url: str) -> bool:
        """Subscribe a webhook to an event type"""
        if event_type not in self.webhooks:
            self.webhooks[event_type] = []

        if webhook_url not in self.webhooks[event_type]:
            self.webhooks[event_type].append(webhook_url)
            logger.info(f"Subscribed webhook to {event_type}: {webhook_url}")
            return True

        return False

    async def publish_event(self, event: IntegrationEvent):
        """Publish an event to all subscribed integrations"""
        logger.info(f"Publishing event: {event.event_type} ({event.event_id})")

        # Add to queue
        self.event_queue.append(event)

        # Find all endpoints subscribed to this event
        subscribed_endpoints = [
            ep for ep in self.endpoints.values()
            if event.event_type in ep.subscribed_events and ep.enabled
        ]

        # Send to all subscribed endpoints
        tasks = []
        for endpoint in subscribed_endpoints:
            tasks.append(self.send_to_endpoint(endpoint, event))

        # Also send to webhooks
        if event.event_type in self.webhooks:
            for webhook_url in self.webhooks[event.event_type]:
                tasks.append(self.send_to_webhook(webhook_url, event))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def send_to_endpoint(self, endpoint: IntegrationEndpoint, event: IntegrationEvent):
        """Send event to specific endpoint"""
        request_id = f"REQ-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}"

        start_time = datetime.utcnow()

        try:
            # Prepare request based on endpoint type
            if endpoint.type == IntegrationType.REST_API:
                async with aiohttp.ClientSession() as session:
                    timeout = aiohttp.ClientTimeout(total=endpoint.timeout_seconds)

                    async with session.post(
                        f"{endpoint.url}/events",
                        json=asdict(event),
                        timeout=timeout
                    ) as resp:
                        if resp.status in [200, 201, 202]:
                            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)

                            endpoint.total_requests += 1
                            endpoint.last_success = datetime.utcnow().isoformat()

                            request = IntegrationRequest(
                                request_id=request_id,
                                endpoint_id=endpoint.endpoint_id,
                                event=event,
                                timestamp=start_time.isoformat(),
                                status='success',
                                response_time_ms=response_time,
                                error=None
                            )

                            self.request_history.append(request)
                            logger.debug(f"Event sent to {endpoint.name}: {response_time}ms")
                        else:
                            raise Exception(f"HTTP {resp.status}")

        except Exception as e:
            response_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            endpoint.total_requests += 1
            endpoint.failed_requests += 1
            endpoint.last_error = str(e)

            request = IntegrationRequest(
                request_id=request_id,
                endpoint_id=endpoint.endpoint_id,
                event=event,
                timestamp=start_time.isoformat(),
                status='failed',
                response_time_ms=response_time,
                error=str(e)
            )

            self.request_history.append(request)
            logger.error(f"Failed to send event to {endpoint.name}: {e}")

    async def send_to_webhook(self, webhook_url: str, event: IntegrationEvent):
        """Send event to webhook"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    webhook_url,
                    json=asdict(event),
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status in [200, 201, 202]:
                        logger.debug(f"Event sent to webhook: {webhook_url}")
        except Exception as e:
            logger.error(f"Failed to send to webhook {webhook_url}: {e}")

    async def forward_to_service(self, service: str, path: str, method: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Forward request to internal service"""
        endpoint = self.endpoints.get(service)
        if not endpoint:
            raise ValueError(f"Service not found: {service}")

        url = f"{endpoint.url}{path}"

        try:
            async with aiohttp.ClientSession() as session:
                timeout = aiohttp.ClientTimeout(total=endpoint.timeout_seconds)

                if method.upper() == 'GET':
                    async with session.get(url, timeout=timeout) as resp:
                        return await resp.json()
                elif method.upper() == 'POST':
                    async with session.post(url, json=data, timeout=timeout) as resp:
                        return await resp.json()
                elif method.upper() == 'PUT':
                    async with session.put(url, json=data, timeout=timeout) as resp:
                        return await resp.json()
                elif method.upper() == 'DELETE':
                    async with session.delete(url, timeout=timeout) as resp:
                        return await resp.json()
                else:
                    raise ValueError(f"Unsupported method: {method}")

        except Exception as e:
            logger.error(f"Failed to forward request to {service}: {e}")
            raise

    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of all integrations"""
        total_endpoints = len(self.endpoints)
        active_endpoints = len([ep for ep in self.endpoints.values() if ep.status == IntegrationStatus.ACTIVE])
        error_endpoints = len([ep for ep in self.endpoints.values() if ep.status == IntegrationStatus.ERROR])

        total_requests = sum(ep.total_requests for ep in self.endpoints.values())
        failed_requests = sum(ep.failed_requests for ep in self.endpoints.values())

        success_rate = ((total_requests - failed_requests) / total_requests * 100) if total_requests > 0 else 0

        return {
            'total_endpoints': total_endpoints,
            'active_endpoints': active_endpoints,
            'error_endpoints': error_endpoints,
            'total_requests': total_requests,
            'failed_requests': failed_requests,
            'success_rate': round(success_rate, 2),
            'event_queue_size': len(self.event_queue),
            'webhooks_registered': sum(len(urls) for urls in self.webhooks.values())
        }


class IntegrationPlatformService:
    """HTTP service for integration platform"""

    def __init__(self):
        self.hub = IntegrationHub()
        self.app = web.Application()
        self.setup_routes()

    def setup_routes(self):
        """Setup HTTP routes"""
        # Health and status
        self.app.router.add_get('/health', self.health_check)
        self.app.router.add_get('/status', self.get_status)

        # Events
        self.app.router.add_post('/events', self.publish_event)
        self.app.router.add_get('/events', self.list_events)

        # Endpoints
        self.app.router.add_post('/endpoints', self.register_endpoint)
        self.app.router.add_get('/endpoints', self.list_endpoints)
        self.app.router.add_get('/endpoints/{endpoint_id}', self.get_endpoint)

        # Webhooks
        self.app.router.add_post('/webhooks', self.subscribe_webhook)
        self.app.router.add_get('/webhooks', self.list_webhooks)

        # Service forwarding (API Gateway functionality)
        self.app.router.add_route('*', '/api/{service}/{path:.*}', self.forward_request)

        # Unified ITIL API
        self.app.router.add_post('/itil/change/create', self.create_change)
        self.app.router.add_post('/itil/change/{change_id}/validate', self.validate_change)
        self.app.router.add_post('/itil/change/{change_id}/authorize', self.authorize_change)
        self.app.router.add_post('/itil/change/{change_id}/deploy', self.deploy_change)

        # Metrics
        self.app.router.add_get('/metrics', self.get_metrics)

    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            'status': 'healthy',
            'service': 'integration-platform',
            'timestamp': datetime.utcnow().isoformat()
        })

    async def get_status(self, request):
        """Get integration platform status"""
        status = self.hub.get_health_status()
        return web.json_response(status)

    async def publish_event(self, request):
        """Publish an event"""
        try:
            data = await request.json()

            event = IntegrationEvent(
                event_id=f"EVT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}",
                event_type=EventType(data['event_type']),
                timestamp=datetime.utcnow().isoformat(),
                source=data.get('source', 'unknown'),
                data=data.get('data', {}),
                metadata=data.get('metadata', {})
            )

            await self.hub.publish_event(event)

            return web.json_response({'event_id': event.event_id}, status=202)

        except Exception as e:
            logger.error(f"Error publishing event: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def list_events(self, request):
        """List recent events"""
        limit = int(request.query.get('limit', 100))
        events = [asdict(e) for e in self.hub.event_queue[-limit:]]

        return web.json_response({
            'total': len(self.hub.event_queue),
            'events': events
        })

    async def register_endpoint(self, request):
        """Register new integration endpoint"""
        try:
            data = await request.json()

            endpoint = IntegrationEndpoint(
                endpoint_id=data['endpoint_id'],
                name=data['name'],
                type=IntegrationType(data['type']),
                url=data.get('url'),
                status=IntegrationStatus.ACTIVE,
                authentication=data.get('authentication', {}),
                config=data.get('config', {}),
                subscribed_events=[EventType(e) for e in data.get('subscribed_events', [])],
                rate_limit=data.get('rate_limit', 60),
                timeout_seconds=data.get('timeout_seconds', 30),
                retry_count=data.get('retry_count', 3),
                enabled=data.get('enabled', True),
                last_success=None,
                last_error=None,
                total_requests=0,
                failed_requests=0
            )

            success = self.hub.register_endpoint(endpoint)

            if success:
                return web.json_response({'status': 'registered'}, status=201)
            else:
                return web.json_response({'error': 'Endpoint already exists'}, status=409)

        except Exception as e:
            logger.error(f"Error registering endpoint: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def list_endpoints(self, request):
        """List all integration endpoints"""
        endpoints = [asdict(ep) for ep in self.hub.endpoints.values()]
        return web.json_response({
            'total': len(endpoints),
            'endpoints': endpoints
        })

    async def get_endpoint(self, request):
        """Get specific endpoint"""
        endpoint_id = request.match_info['endpoint_id']
        endpoint = self.hub.endpoints.get(endpoint_id)

        if endpoint:
            return web.json_response(asdict(endpoint))
        else:
            return web.json_response({'error': 'Endpoint not found'}, status=404)

    async def subscribe_webhook(self, request):
        """Subscribe webhook to events"""
        try:
            data = await request.json()
            event_type = EventType(data['event_type'])
            webhook_url = data['webhook_url']

            success = self.hub.subscribe_webhook(event_type, webhook_url)

            if success:
                return web.json_response({'status': 'subscribed'}, status=201)
            else:
                return web.json_response({'error': 'Already subscribed'}, status=409)

        except Exception as e:
            return web.json_response({'error': str(e)}, status=500)

    async def list_webhooks(self, request):
        """List all webhooks"""
        webhooks = {k.value: v for k, v in self.hub.webhooks.items()}
        return web.json_response(webhooks)

    async def forward_request(self, request):
        """Forward request to internal service (API Gateway)"""
        service = request.match_info['service']
        path = '/' + request.match_info['path']
        method = request.method

        try:
            # Get request body if present
            data = None
            if method in ['POST', 'PUT', 'PATCH']:
                data = await request.json()

            result = await self.hub.forward_to_service(service, path, method, data)

            return web.json_response(result)

        except ValueError as e:
            return web.json_response({'error': str(e)}, status=404)
        except Exception as e:
            logger.error(f"Error forwarding request: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def create_change(self, request):
        """Unified endpoint to create and process a change"""
        try:
            data = await request.json()

            # This would integrate with change manager, but for now we'll simulate
            change_id = f"CHG-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

            # Publish event
            event = IntegrationEvent(
                event_id=f"EVT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}",
                event_type=EventType.CHANGE_CREATED,
                timestamp=datetime.utcnow().isoformat(),
                source='integration-platform',
                data={'change_id': change_id, 'change_data': data},
                metadata={'created_via': 'unified_api'}
            )

            await self.hub.publish_event(event)

            return web.json_response({
                'change_id': change_id,
                'status': 'created',
                'event_id': event.event_id
            }, status=201)

        except Exception as e:
            logger.error(f"Error creating change: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def validate_change(self, request):
        """Validate a change through governance"""
        change_id = request.match_info['change_id']

        try:
            data = await request.json()

            # Forward to governance validator
            result = await self.hub.forward_to_service(
                'governance-validator',
                '/validate',
                'POST',
                {'change_id': change_id, 'change_data': data}
            )

            # Publish event
            event = IntegrationEvent(
                event_id=f"EVT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}",
                event_type=EventType.GOVERNANCE_VALIDATED,
                timestamp=datetime.utcnow().isoformat(),
                source='integration-platform',
                data={'change_id': change_id, 'validation_result': result},
                metadata={}
            )

            await self.hub.publish_event(event)

            return web.json_response(result)

        except Exception as e:
            logger.error(f"Error validating change: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def authorize_change(self, request):
        """Authorize a change through risk assessment"""
        change_id = request.match_info['change_id']

        try:
            data = await request.json()

            # Forward to risk authorizer
            result = await self.hub.forward_to_service(
                'risk-authorizer',
                '/authorize',
                'POST',
                {'change_id': change_id, 'change_data': data}
            )

            # Publish event
            event = IntegrationEvent(
                event_id=f"EVT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}",
                event_type=EventType.RISK_ASSESSED,
                timestamp=datetime.utcnow().isoformat(),
                source='integration-platform',
                data={'change_id': change_id, 'authorization_result': result},
                metadata={}
            )

            await self.hub.publish_event(event)

            return web.json_response(result)

        except Exception as e:
            logger.error(f"Error authorizing change: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def deploy_change(self, request):
        """Deploy a change through value chain"""
        change_id = request.match_info['change_id']

        try:
            data = await request.json()

            # Create value stream
            result = await self.hub.forward_to_service(
                'value-chain',
                '/stream/change',
                'POST',
                {'change_id': change_id, 'change_data': data}
            )

            stream_id = result.get('stream_id')

            # Start the stream
            if stream_id:
                await self.hub.forward_to_service(
                    'value-chain',
                    f'/stream/{stream_id}/start',
                    'POST'
                )

            # Publish event
            event = IntegrationEvent(
                event_id=f"EVT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')}",
                event_type=EventType.CHANGE_DEPLOYED,
                timestamp=datetime.utcnow().isoformat(),
                source='integration-platform',
                data={'change_id': change_id, 'stream_id': stream_id},
                metadata={}
            )

            await self.hub.publish_event(event)

            return web.json_response(result)

        except Exception as e:
            logger.error(f"Error deploying change: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def get_metrics(self, request):
        """Get integration metrics"""
        status = self.hub.get_health_status()

        return web.json_response({
            **status,
            'recent_requests': len(self.hub.request_history[-100:]),
            'timestamp': datetime.utcnow().isoformat()
        })

    def run(self, host='0.0.0.0', port=8080):
        """Run the service"""
        logger.info(f"Starting Integration Platform Service on {host}:{port}")
        web.run_app(self.app, host=host, port=port)


if __name__ == '__main__':
    service = IntegrationPlatformService()
    service.run()
