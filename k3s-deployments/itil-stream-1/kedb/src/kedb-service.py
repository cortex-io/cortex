#!/usr/bin/env python3
"""
Known Error Database (KEDB)
ITIL Implementation - Stream 1, Component 5

Maintains searchable database of known errors:
- Stores known errors with workarounds and solutions
- Provides similarity search for matching incidents
- Tracks resolution effectiveness
- Auto-suggests solutions for new incidents
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import hashlib

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('kedb')


@dataclass
class KnownError:
    id: str
    title: str
    description: str
    category: str
    symptoms: List[str]
    root_cause: str
    workaround: Optional[str]
    permanent_fix: Optional[str]
    affected_components: List[str]
    created_at: datetime
    updated_at: datetime
    verified: bool
    usage_count: int
    success_rate: float
    related_problem_id: Optional[str]
    tags: List[str]


@dataclass
class Solution:
    id: str
    known_error_id: str
    solution_type: str  # workaround, fix, mitigation
    steps: List[str]
    estimated_time: int  # minutes
    success_rate: float
    prerequisites: List[str]
    created_at: datetime
    updated_at: datetime


@dataclass
class SearchResult:
    known_error: KnownError
    similarity_score: float
    matching_factors: List[str]


class KEDBService:
    """Known Error Database service"""

    def __init__(self, data_dir: str = "/app/data"):
        self.data_dir = data_dir
        self.known_errors: Dict[str, KnownError] = {}
        self.solutions: Dict[str, Solution] = {}
        self.error_index: Dict[str, Set] = {}  # Various indices for fast search

        # Configuration
        self.min_similarity_threshold = float(os.getenv('MIN_SIMILARITY', '0.6'))
        self.auto_suggest_threshold = float(os.getenv('AUTO_SUGGEST_THRESHOLD', '0.8'))

        os.makedirs(f"{data_dir}/known_errors", exist_ok=True)
        os.makedirs(f"{data_dir}/solutions", exist_ok=True)
        os.makedirs(f"{data_dir}/search_index", exist_ok=True)
        os.makedirs(f"{data_dir}/metrics", exist_ok=True)

        self._load_known_errors()
        self._build_search_index()

        logger.info("KEDB Service initialized")

    def _load_known_errors(self):
        """Load existing known errors from storage"""
        # Load sample known errors
        sample_errors = [
            KnownError(
                id="ke-001",
                title="Pod CrashLoopBackOff due to missing ConfigMap",
                description="Pods fail to start with CrashLoopBackOff when required ConfigMap is missing",
                category="kubernetes",
                symptoms=["crashloopbackoff", "pod_restart", "config_error"],
                root_cause="ConfigMap referenced in deployment not created or deleted",
                workaround="Create temporary ConfigMap with default values",
                permanent_fix="Ensure ConfigMap created before deployment, add to deployment pipeline",
                affected_components=["kubernetes", "pod"],
                created_at=datetime.now() - timedelta(days=10),
                updated_at=datetime.now() - timedelta(days=5),
                verified=True,
                usage_count=15,
                success_rate=0.95,
                related_problem_id="prob-001",
                tags=["kubernetes", "configuration", "pod"]
            ),
            KnownError(
                id="ke-002",
                title="Database connection pool exhaustion",
                description="Application fails with connection timeout when connection pool is exhausted",
                category="database",
                symptoms=["connection_timeout", "slow_response", "database_error"],
                root_cause="Connections not properly released after use, causing pool exhaustion",
                workaround="Restart application to reset connection pool",
                permanent_fix="Fix connection leak in application code, increase pool size",
                affected_components=["postgresql", "application"],
                created_at=datetime.now() - timedelta(days=20),
                updated_at=datetime.now() - timedelta(days=3),
                verified=True,
                usage_count=8,
                success_rate=0.88,
                related_problem_id="prob-002",
                tags=["database", "postgresql", "performance"]
            ),
            KnownError(
                id="ke-003",
                title="Memory leak in long-running workers",
                description="Worker processes gradually consume more memory until OOM killed",
                category="performance",
                symptoms=["high_memory", "oom_kill", "worker_restart"],
                root_cause="Memory not released after processing large objects",
                workaround="Periodically restart workers on schedule",
                permanent_fix="Fix memory leak, implement proper garbage collection",
                affected_components=["worker", "application"],
                created_at=datetime.now() - timedelta(days=30),
                updated_at=datetime.now() - timedelta(days=1),
                verified=True,
                usage_count=12,
                success_rate=0.92,
                related_problem_id="prob-003",
                tags=["memory", "performance", "worker"]
            ),
            KnownError(
                id="ke-004",
                title="Certificate expiration causing service failures",
                description="Services fail authentication when TLS certificates expire",
                category="security",
                symptoms=["tls_error", "authentication_failed", "connection_refused"],
                root_cause="TLS certificates expired, no automated renewal",
                workaround="Manually renew certificates",
                permanent_fix="Implement cert-manager for automated certificate renewal",
                affected_components=["tls", "certificates", "ingress"],
                created_at=datetime.now() - timedelta(days=15),
                updated_at=datetime.now() - timedelta(days=2),
                verified=True,
                usage_count=5,
                success_rate=1.0,
                related_problem_id="prob-004",
                tags=["security", "tls", "certificates"]
            ),
            KnownError(
                id="ke-005",
                title="DNS resolution failures in cluster",
                description="Pods unable to resolve service names, intermittent DNS failures",
                category="networking",
                symptoms=["dns_failure", "connection_timeout", "unreachable"],
                root_cause="CoreDNS pod resource limits too low, causing throttling",
                workaround="Restart CoreDNS pods",
                permanent_fix="Increase CoreDNS resource limits and replicas",
                affected_components=["coredns", "kubernetes", "networking"],
                created_at=datetime.now() - timedelta(days=25),
                updated_at=datetime.now() - timedelta(days=4),
                verified=True,
                usage_count=10,
                success_rate=0.90,
                related_problem_id="prob-005",
                tags=["networking", "dns", "kubernetes"]
            )
        ]

        for error in sample_errors:
            self.known_errors[error.id] = error

    def _build_search_index(self):
        """Build search indices for fast lookup"""
        self.error_index = {
            'category': {},
            'symptoms': {},
            'components': {},
            'tags': {}
        }

        for error in self.known_errors.values():
            # Category index
            if error.category not in self.error_index['category']:
                self.error_index['category'][error.category] = set()
            self.error_index['category'][error.category].add(error.id)

            # Symptom index
            for symptom in error.symptoms:
                if symptom not in self.error_index['symptoms']:
                    self.error_index['symptoms'][symptom] = set()
                self.error_index['symptoms'][symptom].add(error.id)

            # Component index
            for component in error.affected_components:
                if component not in self.error_index['components']:
                    self.error_index['components'][component] = set()
                self.error_index['components'][component].add(error.id)

            # Tag index
            for tag in error.tags:
                if tag not in self.error_index['tags']:
                    self.error_index['tags'][tag] = set()
                self.error_index['tags'][tag].add(error.id)

    def add_known_error(self, error: KnownError) -> str:
        """Add new known error to database"""
        self.known_errors[error.id] = error
        self._save_known_error(error)
        self._build_search_index()  # Rebuild index

        logger.info(f"Added known error: {error.id} - {error.title}")
        return error.id

    def update_known_error(self, error_id: str, updates: Dict):
        """Update existing known error"""
        if error_id not in self.known_errors:
            logger.warning(f"Known error {error_id} not found")
            return False

        error = self.known_errors[error_id]

        # Update fields
        for key, value in updates.items():
            if hasattr(error, key):
                setattr(error, key, value)

        error.updated_at = datetime.now()
        self._save_known_error(error)

        logger.info(f"Updated known error: {error_id}")
        return True

    def search(self, query: Dict) -> List[SearchResult]:
        """Search for matching known errors"""
        candidates = set()

        # Search by category
        if 'category' in query and query['category'] in self.error_index['category']:
            candidates.update(self.error_index['category'][query['category']])

        # Search by symptoms
        if 'symptoms' in query:
            symptom_matches = set()
            for symptom in query['symptoms']:
                if symptom in self.error_index['symptoms']:
                    symptom_matches.update(self.error_index['symptoms'][symptom])
            if symptom_matches:
                candidates = candidates & symptom_matches if candidates else symptom_matches

        # Search by components
        if 'components' in query:
            component_matches = set()
            for component in query['components']:
                if component in self.error_index['components']:
                    component_matches.update(self.error_index['components'][component])
            if component_matches:
                candidates = candidates & component_matches if candidates else component_matches

        # Calculate similarity for candidates
        results = []
        for error_id in candidates:
            error = self.known_errors[error_id]
            similarity, factors = self._calculate_similarity(error, query)

            if similarity >= self.min_similarity_threshold:
                results.append(SearchResult(
                    known_error=error,
                    similarity_score=similarity,
                    matching_factors=factors
                ))

        # Sort by similarity
        results.sort(key=lambda r: r.similarity_score, reverse=True)

        logger.info(f"Search returned {len(results)} results")
        return results

    def _calculate_similarity(self, error: KnownError, query: Dict) -> Tuple[float, List[str]]:
        """Calculate similarity between known error and query"""
        score = 0.0
        factors = []

        # Category match
        if 'category' in query and query['category'] == error.category:
            score += 0.3
            factors.append('category')

        # Symptom overlap
        if 'symptoms' in query:
            query_symptoms = set(query['symptoms'])
            error_symptoms = set(error.symptoms)
            overlap = query_symptoms & error_symptoms

            if overlap:
                symptom_score = len(overlap) / max(len(query_symptoms), len(error_symptoms))
                score += symptom_score * 0.4
                factors.append(f'symptoms ({len(overlap)} matched)')

        # Component overlap
        if 'components' in query:
            query_components = set(query['components'])
            error_components = set(error.affected_components)
            overlap = query_components & error_components

            if overlap:
                component_score = len(overlap) / max(len(query_components), len(error_components))
                score += component_score * 0.2
                factors.append(f'components ({len(overlap)} matched)')

        # Text similarity (simple keyword matching)
        if 'description' in query:
            query_words = set(query['description'].lower().split())
            error_words = set(error.description.lower().split())
            overlap = query_words & error_words

            if overlap and query_words:
                text_score = len(overlap) / len(query_words)
                score += text_score * 0.1
                factors.append('description')

        return min(score, 1.0), factors

    def get_solution(self, known_error_id: str) -> Optional[Solution]:
        """Get solution for a known error"""
        # In this implementation, we generate solution from known error
        if known_error_id not in self.known_errors:
            return None

        error = self.known_errors[known_error_id]

        # Generate solution from workaround/fix
        solution = Solution(
            id=f"sol-{known_error_id}",
            known_error_id=known_error_id,
            solution_type="fix" if error.permanent_fix else "workaround",
            steps=self._parse_solution_steps(error.permanent_fix or error.workaround),
            estimated_time=self._estimate_resolution_time(error),
            success_rate=error.success_rate,
            prerequisites=[],
            created_at=error.created_at,
            updated_at=error.updated_at
        )

        return solution

    def _parse_solution_steps(self, solution_text: Optional[str]) -> List[str]:
        """Parse solution text into steps"""
        if not solution_text:
            return []

        # Simple parsing - split by common delimiters
        steps = []
        for delimiter in ['. ', '; ', '\n']:
            if delimiter in solution_text:
                steps = [s.strip() for s in solution_text.split(delimiter) if s.strip()]
                break

        if not steps:
            steps = [solution_text]

        return steps

    def _estimate_resolution_time(self, error: KnownError) -> int:
        """Estimate resolution time in minutes"""
        # Simple heuristic based on category and solution type
        base_time = {
            'kubernetes': 15,
            'database': 30,
            'performance': 45,
            'security': 20,
            'networking': 25
        }

        time_estimate = base_time.get(error.category, 30)

        # Permanent fix takes longer
        if error.permanent_fix:
            time_estimate *= 2

        return time_estimate

    def record_usage(self, known_error_id: str, successful: bool):
        """Record usage of a known error solution"""
        if known_error_id not in self.known_errors:
            return

        error = self.known_errors[known_error_id]
        error.usage_count += 1

        # Update success rate using moving average
        if successful:
            error.success_rate = (error.success_rate * (error.usage_count - 1) + 1.0) / error.usage_count
        else:
            error.success_rate = (error.success_rate * (error.usage_count - 1)) / error.usage_count

        error.updated_at = datetime.now()
        self._save_known_error(error)

        logger.info(f"Recorded usage for {known_error_id}: success={successful}, "
                   f"new_rate={error.success_rate:.2f}")

    def auto_suggest(self, incident_data: Dict) -> Optional[SearchResult]:
        """Auto-suggest solution for incident if confidence is high"""
        results = self.search(incident_data)

        if results and results[0].similarity_score >= self.auto_suggest_threshold:
            logger.info(f"Auto-suggesting solution: {results[0].known_error.id} "
                       f"(confidence: {results[0].similarity_score:.2f})")
            return results[0]

        return None

    def _save_known_error(self, error: KnownError):
        """Persist known error"""
        error_file = f"{self.data_dir}/known_errors/{error.id}.json"
        error_data = {
            'id': error.id,
            'title': error.title,
            'description': error.description,
            'category': error.category,
            'symptoms': error.symptoms,
            'root_cause': error.root_cause,
            'workaround': error.workaround,
            'permanent_fix': error.permanent_fix,
            'affected_components': error.affected_components,
            'created_at': error.created_at.isoformat(),
            'updated_at': error.updated_at.isoformat(),
            'verified': error.verified,
            'usage_count': error.usage_count,
            'success_rate': error.success_rate,
            'related_problem_id': error.related_problem_id,
            'tags': error.tags
        }

        with open(error_file, 'w') as f:
            json.dump(error_data, f, indent=2)

    def get_metrics(self) -> Dict:
        """Get KEDB metrics"""
        verified_errors = [e for e in self.known_errors.values() if e.verified]
        high_usage = [e for e in self.known_errors.values() if e.usage_count > 5]
        high_success = [e for e in self.known_errors.values() if e.success_rate > 0.9]

        metrics = {
            'timestamp': datetime.now().isoformat(),
            'total_known_errors': len(self.known_errors),
            'verified_errors': len(verified_errors),
            'total_usage': sum(e.usage_count for e in self.known_errors.values()),
            'avg_success_rate': sum(e.success_rate for e in self.known_errors.values()) / max(len(self.known_errors), 1),
            'high_usage_errors': len(high_usage),
            'high_success_errors': len(high_success),
            'categories': len(self.error_index['category']),
            'indexed_symptoms': len(self.error_index['symptoms'])
        }

        return metrics

    async def run(self):
        """Main KEDB service loop"""
        logger.info("Starting KEDB Service")

        while True:
            try:
                # Get and save metrics
                metrics = self.get_metrics()
                metrics_file = f"{self.data_dir}/metrics/kedb-metrics-{int(time.time())}.json"
                with open(metrics_file, 'w') as f:
                    json.dump(metrics, f, indent=2)

                logger.info(f"KEDB: {metrics['total_known_errors']} errors, "
                          f"Success rate: {metrics['avg_success_rate']:.2%}, "
                          f"Total usage: {metrics['total_usage']}")

                await asyncio.sleep(300)  # 5 minutes

            except Exception as e:
                logger.error(f"Error in KEDB loop: {e}", exc_info=True)
                await asyncio.sleep(60)


async def main():
    kedb = KEDBService()
    await kedb.run()


if __name__ == "__main__":
    asyncio.run(main())
