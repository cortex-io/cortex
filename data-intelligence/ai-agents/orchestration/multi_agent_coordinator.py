#!/usr/bin/env python3
"""
Multi-Agent Orchestration & Coordination

Enables multiple agents to work together on complex tasks.
"""

import json
from typing import Dict, List, Optional
from datetime import datetime
from collections import defaultdict


class AgentMessage:
    """Message between agents"""

    def __init__(self, from_agent: str, to_agent: str, message_type: str, content: Dict):
        self.from_agent = from_agent
        self.to_agent = to_agent
        self.message_type = message_type
        self.content = content
        self.timestamp = datetime.now().isoformat()


class MultiAgentCoordinator:
    """Coordinate multiple agents working together"""

    def __init__(self):
        self.agents = {}
        self.message_bus = []
        self.shared_context = {}
        self.task_assignments = defaultdict(list)

    def register_agent(self, agent_id: str, agent_type: str, capabilities: List[str]):
        """Register agent with coordinator"""
        self.agents[agent_id] = {
            'agent_id': agent_id,
            'agent_type': agent_type,
            'capabilities': capabilities,
            'status': 'idle',
            'current_task': None
        }

    def orchestrate_complex_task(self, task: Dict) -> Dict:
        """Orchestrate multiple agents for complex task"""
        # Decompose task into subtasks
        subtasks = self._decompose_task(task)

        # Assign subtasks to appropriate agents
        assignments = self._assign_subtasks(subtasks)

        # Execute with coordination
        results = self._execute_coordinated(assignments)

        # Synthesize results
        final_result = self._synthesize_results(results)

        return final_result

    def _decompose_task(self, task: Dict) -> List[Dict]:
        """Decompose complex task into subtasks"""
        task_type = task.get('type')

        if task_type == 'migrate_authentication':
            return [
                {'type': 'analyze', 'focus': 'current_architecture', 'agent_type': 'analysis-worker'},
                {'type': 'security_audit', 'focus': 'authentication', 'agent_type': 'security-master'},
                {'type': 'implement', 'focus': 'new_auth_system', 'agent_type': 'development-master'},
                {'type': 'test', 'focus': 'authentication_tests', 'agent_type': 'development-master'},
                {'type': 'deploy', 'focus': 'production_deployment', 'agent_type': 'cicd-master'}
            ]

        # Default: single subtask
        return [task]

    def _assign_subtasks(self, subtasks: List[Dict]) -> List[Dict]:
        """Assign subtasks to appropriate agents"""
        assignments = []

        for subtask in subtasks:
            # Find best agent for this subtask
            required_type = subtask.get('agent_type', 'development-master')
            agent = self._find_best_agent(required_type, subtask)

            if agent:
                assignments.append({
                    'subtask': subtask,
                    'agent_id': agent['agent_id'],
                    'status': 'pending'
                })
                self.task_assignments[agent['agent_id']].append(subtask)

        return assignments

    def _find_best_agent(self, agent_type: str, subtask: Dict) -> Optional[Dict]:
        """Find best available agent for subtask"""
        candidates = [
            agent for agent in self.agents.values()
            if agent['agent_type'] == agent_type and agent['status'] == 'idle'
        ]

        if candidates:
            return candidates[0]

        # Return any agent of the right type
        for agent in self.agents.values():
            if agent['agent_type'] == agent_type:
                return agent

        return None

    def _execute_coordinated(self, assignments: List[Dict]) -> List[Dict]:
        """Execute assignments with coordination"""
        results = []

        # Determine execution order (sequential vs parallel)
        sequential_required = self._requires_sequential_execution(assignments)

        if sequential_required:
            # Execute in order with context passing
            for assignment in assignments:
                result = self._execute_assignment(assignment, self.shared_context)
                results.append(result)

                # Update shared context for next agent
                self.shared_context.update(result.get('context', {}))
        else:
            # Execute in parallel
            for assignment in assignments:
                result = self._execute_assignment(assignment, self.shared_context)
                results.append(result)

        return results

    def _requires_sequential_execution(self, assignments: List[Dict]) -> bool:
        """Determine if assignments must be sequential"""
        # Check for dependencies
        for i, assignment in enumerate(assignments):
            subtask = assignment['subtask']
            if subtask.get('depends_on') and i > 0:
                return True

        # Implementation, test, deploy must be sequential
        types = [a['subtask']['type'] for a in assignments]
        if 'implement' in types and 'test' in types:
            return True

        return False

    def _execute_assignment(self, assignment: Dict, context: Dict) -> Dict:
        """Execute single assignment"""
        agent_id = assignment['agent_id']
        subtask = assignment['subtask']

        # Update agent status
        self.agents[agent_id]['status'] = 'working'
        self.agents[agent_id]['current_task'] = subtask

        # Simulate execution (in production, actually execute)
        result = {
            'assignment': assignment,
            'success': True,
            'result': f"Completed {subtask['type']}",
            'context': {
                f"{subtask['type']}_complete": True
            }
        }

        # Update agent status
        self.agents[agent_id]['status'] = 'idle'
        self.agents[agent_id]['current_task'] = None

        return result

    def _synthesize_results(self, results: List[Dict]) -> Dict:
        """Combine results from multiple agents"""
        all_success = all(r['success'] for r in results)

        return {
            'success': all_success,
            'results': results,
            'total_subtasks': len(results),
            'successful_subtasks': sum(1 for r in results if r['success'])
        }

    def enable_agent_communication(self, from_agent: str, to_agent: str, message: Dict):
        """Enable direct agent-to-agent communication"""
        msg = AgentMessage(from_agent, to_agent, message['type'], message['content'])
        self.message_bus.append(msg)

        # Notify receiving agent
        if to_agent in self.agents:
            print(f"📨 Message from {from_agent} to {to_agent}: {message['type']}")

    def get_agent_messages(self, agent_id: str) -> List[AgentMessage]:
        """Get messages for an agent"""
        return [msg for msg in self.message_bus if msg.to_agent == agent_id]


class CollaborativePatterns:
    """Common multi-agent collaboration patterns"""

    @staticmethod
    def hierarchical(coordinator: MultiAgentCoordinator, task: Dict) -> Dict:
        """Hierarchical pattern: Coordinator -> Masters -> Workers"""
        # Coordinator analyzes and assigns to masters
        # Masters coordinate workers
        return coordinator.orchestrate_complex_task(task)

    @staticmethod
    def peer_to_peer(agents: List[str], task: Dict) -> Dict:
        """Peer-to-peer: Agents collaborate directly"""
        # Agents negotiate and coordinate directly
        return {'pattern': 'peer-to-peer', 'task': task}

    @staticmethod
    def competitive(agents: List[str], task: Dict) -> Dict:
        """Competitive: Multiple agents propose solutions, best wins"""
        # Each agent proposes solution
        # Best solution selected
        return {'pattern': 'competitive', 'task': task}

    @staticmethod
    def ensemble(agents: List[str], task: Dict) -> Dict:
        """Ensemble: Combine outputs from multiple agents"""
        # Multiple agents work independently
        # Results combined/averaged
        return {'pattern': 'ensemble', 'task': task}


if __name__ == '__main__':
    coordinator = MultiAgentCoordinator()

    # Register agents
    coordinator.register_agent('analysis-001', 'analysis-worker', ['analyze', 'research'])
    coordinator.register_agent('security-001', 'security-master', ['audit', 'scan'])
    coordinator.register_agent('dev-001', 'development-master', ['implement', 'test'])
    coordinator.register_agent('cicd-001', 'cicd-master', ['deploy', 'release'])

    # Orchestrate complex task
    result = coordinator.orchestrate_complex_task({
        'type': 'migrate_authentication',
        'description': 'Migrate authentication system to OAuth2'
    })

    print(json.dumps(result, indent=2))
