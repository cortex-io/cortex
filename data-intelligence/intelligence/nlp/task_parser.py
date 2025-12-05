#!/usr/bin/env python3
"""
Natural Language Task Parser

Uses LLM to parse natural language task descriptions into structured task specifications.
"""

import json
import re
from typing import Dict, List, Optional
from anthropic import Anthropic


class NLTaskParser:
    """Parse natural language tasks into structured specifications"""

    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key)
        self.task_schema = {
            'task_type': ['development', 'security', 'inventory', 'cicd', 'documentation'],
            'priority': ['low', 'medium', 'high', 'critical'],
            'complexity': ['low', 'medium', 'high'],
            'estimated_tokens': 'int',
            'required_capabilities': 'list[str]',
            'success_criteria': 'list[str]',
            'deliverables': 'list[str]'
        }

    def parse(self, natural_language: str) -> Dict:
        """
        Parse natural language into structured task

        Args:
            natural_language: Natural language task description

        Returns:
            Structured task specification
        """
        prompt = f"""Parse this natural language task into a structured JSON specification.

Task: {natural_language}

Extract and structure the following information:
- task_type: Choose from [development, security, inventory, cicd, documentation]
- priority: Choose from [low, medium, high, critical]
- complexity: Choose from [low, medium, high]
- estimated_tokens: Estimated tokens needed (integer)
- required_capabilities: List of required capabilities
- success_criteria: List of success criteria
- deliverables: List of expected deliverables
- recommended_master: Which master should handle this (development-master, security-master, etc.)

Return ONLY valid JSON, no explanation."""

        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())

        return {}

    def extract_intent(self, natural_language: str) -> str:
        """Extract user intent from natural language"""
        prompt = f"""What is the primary intent of this task? Choose ONE: implement, fix, refactor, document, test, analyze, scan, deploy, configure.

Task: {natural_language}

Return only the intent word."""

        message = self.client.messages.create(
            model="claude-haiku-20250319",
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text.strip().lower()

    def extract_entities(self, natural_language: str) -> Dict[str, List[str]]:
        """Extract entities (files, technologies, patterns) from task"""
        entities = {
            'files': re.findall(r'[\w\-/]+\.\w+', natural_language),
            'technologies': [],
            'patterns': []
        }

        # Common tech patterns
        tech_keywords = ['python', 'node', 'react', 'vue', 'docker', 'kubernetes', 'aws', 'gcp', 'azure']
        for tech in tech_keywords:
            if tech.lower() in natural_language.lower():
                entities['technologies'].append(tech)

        return entities


# Command-line interface
if __name__ == '__main__':
    import sys
    parser = NLTaskParser()

    if len(sys.argv) > 1:
        task = ' '.join(sys.argv[1:])
        result = parser.parse(task)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python task_parser.py 'your task description'")
