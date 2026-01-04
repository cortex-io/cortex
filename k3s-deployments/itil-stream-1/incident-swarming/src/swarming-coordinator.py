#!/usr/bin/env python3
"""
Intelligent Incident Swarming Coordinator
ITIL Implementation - Stream 1, Component 1

Automatically assembles expert teams based on:
- Incident category and severity
- Required skill sets
- Agent availability and expertise
- Historical performance metrics
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, asdict
from enum import Enum

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('incident-swarming')


class IncidentSeverity(Enum):
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


class SwarmStatus(Enum):
    FORMING = "forming"
    ACTIVE = "active"
    RESOLVING = "resolving"
    RESOLVED = "resolved"
    DISBANDED = "disbanded"


@dataclass
class Agent:
    id: str
    name: str
    skills: List[str]
    availability: bool
    current_incidents: int
    max_concurrent: int
    expertise_score: float
    response_time_avg: float  # seconds
    resolution_rate: float  # 0.0-1.0


@dataclass
class Incident:
    id: str
    title: str
    description: str
    severity: IncidentSeverity
    category: str
    required_skills: List[str]
    created_at: datetime
    updated_at: datetime
    status: str
    assigned_agents: List[str]
    swarm_id: Optional[str] = None


@dataclass
class Swarm:
    id: str
    incident_id: str
    agents: List[str]
    lead_agent: str
    status: SwarmStatus
    created_at: datetime
    updated_at: datetime
    metrics: Dict[str, any]


class IncidentSwarmingCoordinator:
    """Coordinates intelligent swarming for incident response"""

    def __init__(self, data_dir: str = "/app/data"):
        self.data_dir = data_dir
        self.agents: Dict[str, Agent] = {}
        self.incidents: Dict[str, Incident] = {}
        self.swarms: Dict[str, Swarm] = {}
        self.skill_index: Dict[str, Set[str]] = {}  # skill -> agent_ids

        # Configuration
        self.min_swarm_size = int(os.getenv('MIN_SWARM_SIZE', '2'))
        self.max_swarm_size = int(os.getenv('MAX_SWARM_SIZE', '5'))
        self.critical_response_time = int(os.getenv('CRITICAL_RESPONSE_TIME', '300'))  # 5 min
        self.high_response_time = int(os.getenv('HIGH_RESPONSE_TIME', '900'))  # 15 min

        os.makedirs(f"{data_dir}/swarms", exist_ok=True)
        os.makedirs(f"{data_dir}/incidents", exist_ok=True)
        os.makedirs(f"{data_dir}/metrics", exist_ok=True)

        self._load_agents()
        self._build_skill_index()
        logger.info("Incident Swarming Coordinator initialized")

    def _load_agents(self):
        """Load available agents from configuration"""
        # Default agent pool - in production this would be dynamically loaded
        default_agents = [
            Agent("agent-001", "security-specialist", ["security", "incident-response", "forensics"],
                  True, 0, 3, 0.95, 120, 0.92),
            Agent("agent-002", "network-engineer", ["networking", "infrastructure", "dns"],
                  True, 0, 5, 0.88, 180, 0.87),
            Agent("agent-003", "app-developer", ["python", "api", "debugging"],
                  True, 0, 4, 0.90, 150, 0.89),
            Agent("agent-004", "database-admin", ["postgresql", "mysql", "performance"],
                  True, 0, 3, 0.93, 140, 0.91),
            Agent("agent-005", "k8s-specialist", ["kubernetes", "containers", "orchestration"],
                  True, 0, 5, 0.91, 130, 0.88),
            Agent("agent-006", "devops-engineer", ["cicd", "automation", "monitoring"],
                  True, 0, 4, 0.89, 160, 0.86),
            Agent("agent-007", "security-analyst", ["security", "compliance", "audit"],
                  True, 0, 3, 0.94, 125, 0.93),
            Agent("agent-008", "sre-engineer", ["reliability", "monitoring", "incident-response"],
                  True, 0, 5, 0.92, 135, 0.90),
        ]

        for agent in default_agents:
            self.agents[agent.id] = agent

    def _build_skill_index(self):
        """Build reverse index of skills to agents"""
        for agent_id, agent in self.agents.items():
            for skill in agent.skills:
                if skill not in self.skill_index:
                    self.skill_index[skill] = set()
                self.skill_index[skill].add(agent_id)

    def _calculate_agent_score(self, agent: Agent, required_skills: List[str],
                               severity: IncidentSeverity) -> float:
        """Calculate agent suitability score for an incident"""
        if not agent.availability:
            return 0.0

        if agent.current_incidents >= agent.max_concurrent:
            return 0.0

        # Skill match score
        matched_skills = len(set(agent.skills) & set(required_skills))
        skill_score = matched_skills / max(len(required_skills), 1)

        # Availability score (prefer agents with fewer current incidents)
        availability_score = 1.0 - (agent.current_incidents / agent.max_concurrent)

        # Expertise and performance scores
        expertise_score = agent.expertise_score
        resolution_score = agent.resolution_rate

        # Response time score (lower is better)
        response_score = max(0, 1.0 - (agent.response_time_avg / 300))

        # Weight factors based on severity
        if severity == IncidentSeverity.CRITICAL:
            weights = {
                'skill': 0.25,
                'availability': 0.15,
                'expertise': 0.25,
                'resolution': 0.20,
                'response': 0.15
            }
        elif severity == IncidentSeverity.HIGH:
            weights = {
                'skill': 0.30,
                'availability': 0.20,
                'expertise': 0.20,
                'resolution': 0.15,
                'response': 0.15
            }
        else:
            weights = {
                'skill': 0.35,
                'availability': 0.25,
                'expertise': 0.15,
                'resolution': 0.15,
                'response': 0.10
            }

        total_score = (
            skill_score * weights['skill'] +
            availability_score * weights['availability'] +
            expertise_score * weights['expertise'] +
            resolution_score * weights['resolution'] +
            response_score * weights['response']
        )

        return total_score

    def assemble_swarm(self, incident: Incident) -> Swarm:
        """Assemble an optimal swarm team for an incident"""
        logger.info(f"Assembling swarm for incident {incident.id} ({incident.severity.name})")

        # Determine swarm size based on severity
        if incident.severity == IncidentSeverity.CRITICAL:
            target_size = self.max_swarm_size
        elif incident.severity == IncidentSeverity.HIGH:
            target_size = max(3, self.min_swarm_size)
        else:
            target_size = self.min_swarm_size

        # Score all agents
        agent_scores = []
        for agent_id, agent in self.agents.items():
            score = self._calculate_agent_score(agent, incident.required_skills, incident.severity)
            if score > 0:
                agent_scores.append((agent_id, score))

        # Sort by score descending
        agent_scores.sort(key=lambda x: x[1], reverse=True)

        # Select top agents
        selected_agents = [agent_id for agent_id, _ in agent_scores[:target_size]]

        if not selected_agents:
            logger.error(f"No available agents for incident {incident.id}")
            raise ValueError("No available agents for swarm")

        # First agent is the lead
        lead_agent = selected_agents[0]

        # Create swarm
        swarm_id = f"swarm-{incident.id}-{int(time.time())}"
        swarm = Swarm(
            id=swarm_id,
            incident_id=incident.id,
            agents=selected_agents,
            lead_agent=lead_agent,
            status=SwarmStatus.FORMING,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            metrics={
                'response_time_sla': self._get_response_sla(incident.severity),
                'agents_requested': target_size,
                'agents_assigned': len(selected_agents),
                'avg_expertise': sum(self.agents[a].expertise_score for a in selected_agents) / len(selected_agents)
            }
        )

        # Update agent assignments
        for agent_id in selected_agents:
            self.agents[agent_id].current_incidents += 1

        # Update incident
        incident.swarm_id = swarm_id
        incident.assigned_agents = selected_agents

        # Store swarm
        self.swarms[swarm_id] = swarm
        self._save_swarm(swarm)

        logger.info(f"Swarm {swarm_id} assembled with {len(selected_agents)} agents, lead: {lead_agent}")
        return swarm

    def _get_response_sla(self, severity: IncidentSeverity) -> int:
        """Get response time SLA in seconds for severity"""
        sla_map = {
            IncidentSeverity.CRITICAL: self.critical_response_time,
            IncidentSeverity.HIGH: self.high_response_time,
            IncidentSeverity.MEDIUM: 3600,  # 1 hour
            IncidentSeverity.LOW: 14400  # 4 hours
        }
        return sla_map.get(severity, 3600)

    def update_swarm_status(self, swarm_id: str, status: SwarmStatus):
        """Update swarm status"""
        if swarm_id not in self.swarms:
            logger.warning(f"Swarm {swarm_id} not found")
            return

        swarm = self.swarms[swarm_id]
        old_status = swarm.status
        swarm.status = status
        swarm.updated_at = datetime.now()

        if status == SwarmStatus.DISBANDED:
            # Release agents
            for agent_id in swarm.agents:
                if agent_id in self.agents:
                    self.agents[agent_id].current_incidents = max(0, self.agents[agent_id].current_incidents - 1)

        self._save_swarm(swarm)
        logger.info(f"Swarm {swarm_id} status: {old_status.value} -> {status.value}")

    def add_agent_to_swarm(self, swarm_id: str, agent_id: str):
        """Add an agent to an existing swarm (escalation)"""
        if swarm_id not in self.swarms:
            logger.warning(f"Swarm {swarm_id} not found")
            return

        if agent_id not in self.agents:
            logger.warning(f"Agent {agent_id} not found")
            return

        swarm = self.swarms[swarm_id]
        if agent_id in swarm.agents:
            logger.info(f"Agent {agent_id} already in swarm {swarm_id}")
            return

        swarm.agents.append(agent_id)
        swarm.updated_at = datetime.now()
        self.agents[agent_id].current_incidents += 1

        self._save_swarm(swarm)
        logger.info(f"Added agent {agent_id} to swarm {swarm_id}")

    def _save_swarm(self, swarm: Swarm):
        """Persist swarm data"""
        swarm_file = f"{self.data_dir}/swarms/{swarm.id}.json"
        swarm_data = {
            'id': swarm.id,
            'incident_id': swarm.incident_id,
            'agents': swarm.agents,
            'lead_agent': swarm.lead_agent,
            'status': swarm.status.value,
            'created_at': swarm.created_at.isoformat(),
            'updated_at': swarm.updated_at.isoformat(),
            'metrics': swarm.metrics
        }
        with open(swarm_file, 'w') as f:
            json.dump(swarm_data, f, indent=2)

    def get_swarm_metrics(self) -> Dict:
        """Get current swarming metrics"""
        active_swarms = [s for s in self.swarms.values() if s.status in [SwarmStatus.FORMING, SwarmStatus.ACTIVE]]

        metrics = {
            'timestamp': datetime.now().isoformat(),
            'total_swarms': len(self.swarms),
            'active_swarms': len(active_swarms),
            'available_agents': sum(1 for a in self.agents.values() if a.availability),
            'busy_agents': sum(1 for a in self.agents.values() if a.current_incidents > 0),
            'avg_swarm_size': sum(len(s.agents) for s in active_swarms) / max(len(active_swarms), 1),
            'agent_utilization': sum(a.current_incidents for a in self.agents.values()) / sum(a.max_concurrent for a in self.agents.values())
        }

        return metrics

    async def run(self):
        """Main coordinator loop"""
        logger.info("Starting Incident Swarming Coordinator")

        while True:
            try:
                # Monitor and update swarm statuses
                metrics = self.get_swarm_metrics()

                # Save metrics
                metrics_file = f"{self.data_dir}/metrics/swarming-metrics-{int(time.time())}.json"
                with open(metrics_file, 'w') as f:
                    json.dump(metrics, f, indent=2)

                logger.info(f"Active swarms: {metrics['active_swarms']}, "
                          f"Available agents: {metrics['available_agents']}, "
                          f"Utilization: {metrics['agent_utilization']:.2%}")

                await asyncio.sleep(30)

            except Exception as e:
                logger.error(f"Error in coordinator loop: {e}", exc_info=True)
                await asyncio.sleep(10)


async def main():
    coordinator = IncidentSwarmingCoordinator()
    await coordinator.run()


if __name__ == "__main__":
    asyncio.run(main())
