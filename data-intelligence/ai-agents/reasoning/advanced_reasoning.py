#!/usr/bin/env python3
"""
Advanced Reasoning Patterns: Chain-of-Thought + ReAct

Enables sophisticated reasoning for complex tasks.
"""

import json
from typing import Dict, List, Optional, Tuple
from anthropic import Anthropic
from dataclasses import dataclass


@dataclass
class ReasoningStep:
    """Single reasoning step"""
    step_number: int
    thought: str
    action: Optional[str]
    observation: Optional[str]


class ChainOfThoughtReasoner:
    """Chain-of-thought reasoning for complex tasks"""

    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key)

    def reason(self, task: str, context: Dict) -> List[ReasoningStep]:
        """Apply chain-of-thought reasoning"""
        prompt = f"""Break down this task into clear reasoning steps.

Task: {task}

Context: {json.dumps(context, indent=2)}

Think through this step-by-step:
1. What is the core problem?
2. What information do I have?
3. What information do I need?
4. What are possible approaches?
5. What is the best approach and why?
6. What are the specific steps to implement?

Provide your reasoning as numbered steps."""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        reasoning_text = response.content[0].text

        # Parse reasoning steps
        steps = []
        for i, line in enumerate(reasoning_text.split('\n'), 1):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith('-')):
                steps.append(ReasoningStep(
                    step_number=i,
                    thought=line,
                    action=None,
                    observation=None
                ))

        return steps


class ReActAgent:
    """Reason + Act agent pattern"""

    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key)
        self.tools = {}
        self.max_iterations = 10

    def register_tool(self, name: str, func: callable, description: str):
        """Register tool for agent to use"""
        self.tools[name] = {
            'function': func,
            'description': description
        }

    def solve(self, task: str, context: Dict) -> Dict:
        """Solve task using ReAct pattern"""
        history = []
        thought = ""

        for iteration in range(self.max_iterations):
            # Reason: What should I do next?
            thought = self._reason(task, context, history)
            history.append({'type': 'thought', 'content': thought})

            # Act: Take an action
            action = self._decide_action(thought)

            if action['type'] == 'finish':
                return {
                    'success': True,
                    'result': action['result'],
                    'steps': len(history),
                    'history': history
                }

            history.append({'type': 'action', 'content': action})

            # Observe: See the result
            observation = self._execute_action(action)
            history.append({'type': 'observation', 'content': observation})

            # Update context with observation
            context['last_observation'] = observation

        return {
            'success': False,
            'result': 'Max iterations reached',
            'steps': len(history),
            'history': history
        }

    def _reason(self, task: str, context: Dict, history: List[Dict]) -> str:
        """Reason about what to do next"""
        prompt = f"""Task: {task}

Context: {json.dumps(context, indent=2)}

History:
{self._format_history(history)}

Available tools:
{self._format_tools()}

Think about what to do next. What action should I take?"""

        response = self.client.messages.create(
            model="claude-haiku-20250319",  # Use Haiku for speed
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.content[0].text

    def _decide_action(self, thought: str) -> Dict:
        """Decide which action to take based on reasoning"""
        # Simple action extraction (in production, use structured output)
        thought_lower = thought.lower()

        if 'search' in thought_lower:
            return {'type': 'search', 'query': thought}
        elif 'read' in thought_lower:
            return {'type': 'read', 'target': thought}
        elif 'analyze' in thought_lower:
            return {'type': 'analyze', 'subject': thought}
        elif 'finish' in thought_lower or 'done' in thought_lower:
            return {'type': 'finish', 'result': thought}
        else:
            return {'type': 'think', 'content': thought}

    def _execute_action(self, action: Dict) -> str:
        """Execute an action and return observation"""
        action_type = action['type']

        if action_type in self.tools:
            try:
                result = self.tools[action_type]['function'](action)
                return f"Tool '{action_type}' returned: {result}"
            except Exception as e:
                return f"Tool '{action_type}' failed: {str(e)}"

        return f"Simulated execution of {action_type}"

    def _format_history(self, history: List[Dict]) -> str:
        """Format history for prompt"""
        formatted = []
        for item in history[-5:]:  # Last 5 items
            formatted.append(f"{item['type'].upper()}: {str(item['content'])[:100]}")
        return '\n'.join(formatted)

    def _format_tools(self) -> str:
        """Format available tools"""
        return '\n'.join([
            f"- {name}: {tool['description']}"
            for name, tool in self.tools.items()
        ])


class PlanExecuteAgent:
    """Plan then execute pattern"""

    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key)

    def solve(self, task: str, context: Dict) -> Dict:
        """Create plan then execute"""
        # Step 1: Create high-level plan
        plan = self._create_plan(task, context)

        # Step 2: Execute plan with monitoring
        results = []
        for step in plan['steps']:
            result = self._execute_step(step, context)
            results.append(result)

            # Adapt plan if needed
            if not result['success']:
                plan = self._replan(task, context, plan, results)

        return {
            'success': all(r['success'] for r in results),
            'plan': plan,
            'results': results
        }

    def _create_plan(self, task: str, context: Dict) -> Dict:
        """Create execution plan"""
        prompt = f"""Create a detailed execution plan for this task:

Task: {task}
Context: {json.dumps(context, indent=2)}

Break it down into concrete steps. For each step specify:
1. What needs to be done
2. Expected outcome
3. Dependencies on previous steps"""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse plan (simplified)
        return {
            'task': task,
            'steps': [
                {'description': line, 'dependencies': []}
                for line in response.content[0].text.split('\n')
                if line.strip()
            ]
        }

    def _execute_step(self, step: Dict, context: Dict) -> Dict:
        """Execute single step"""
        return {
            'step': step,
            'success': True,
            'result': f"Executed: {step['description'][:50]}"
        }

    def _replan(self, task: str, context: Dict, original_plan: Dict, results: List[Dict]) -> Dict:
        """Replan based on execution results"""
        # Adapt plan based on what worked/failed
        return original_plan


if __name__ == '__main__':
    # Example: Chain of thought
    cot = ChainOfThoughtReasoner()
    steps = cot.reason(
        "Fix authentication bug causing login failures",
        {'codebase': 'cortex', 'language': 'python'}
    )

    print("Chain of Thought:")
    for step in steps:
        print(f"  {step.step_number}. {step.thought}")

    # Example: ReAct
    react = ReActAgent()
    react.register_tool('search', lambda x: "Found 5 files", "Search codebase")

    result = react.solve(
        "Find and fix the authentication bug",
        {'repo': 'cortex'}
    )

    print(f"\nReAct solved in {result['steps']} steps")
