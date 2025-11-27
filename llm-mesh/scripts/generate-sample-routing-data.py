#!/usr/bin/env python3
"""
Generate Sample Routing Performance Data

Creates realistic routing decision events for testing and demonstration
"""

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Dict


# Sample task descriptions by domain
SAMPLE_TASKS = {
    "development": [
        "Fix authentication bug in user login system",
        "Implement dark mode toggle in settings",
        "Refactor database connection pooling",
        "Add unit tests for payment processing",
        "Optimize API response time for search queries",
        "Debug memory leak in worker process",
        "Implement OAuth2 integration with Google",
        "Update dependencies to latest versions"
    ],
    "security": [
        "Scan codebase for SQL injection vulnerabilities",
        "Audit third-party dependencies for CVEs",
        "Review security headers configuration",
        "Implement rate limiting on API endpoints",
        "Penetration test authentication system",
        "Analyze security logs for anomalies",
        "Update TLS certificates before expiration"
    ],
    "inventory": [
        "Generate API documentation from OpenAPI spec",
        "Catalog all microservices and dependencies",
        "Document database schema changes",
        "Create architectural decision records",
        "Update README with setup instructions",
        "Inventory all third-party libraries"
    ],
    "cicd": [
        "Deploy API to production environment",
        "Run integration tests on staging",
        "Build and push Docker container",
        "Configure GitHub Actions workflow",
        "Set up automated database backups",
        "Deploy hotfix to production"
    ]
}


def generate_routing_event(
    task_domain: str,
    task_description: str,
    timestamp: datetime,
    event_num: int
) -> Dict:
    """Generate a single routing event"""

    # Determine which layer catches this (based on realistic distribution)
    layer_distribution = [0.30, 0.45, 0.18, 0.05, 0.02]  # keyword, semantic, rag, pytorch, clarification
    final_layer_idx = random.choices(range(5), weights=layer_distribution)[0]
    final_layer_names = ["keyword", "semantic", "rag", "pytorch", "clarification"]
    final_layer = final_layer_names[final_layer_idx]

    # Generate event ID
    date_str = timestamp.strftime("%Y%m%d")
    time_str = timestamp.strftime("%H%M%S")
    hash_suffix = f"{event_num:08x}"
    event_id = f"route-{date_str}-{time_str}-{hash_suffix}"

    # Build routing layers array
    routing_layers = []

    # Layer 1: Keyword
    keyword_conf = random.uniform(0.70, 0.95) if task_domain in ["cicd", "security"] else random.uniform(0.60, 0.85)
    keyword_threshold = 0.85
    keyword_success = keyword_conf >= keyword_threshold

    routing_layers.append({
        "layer_id": 1,
        "layer_name": "keyword",
        "attempted": True,
        "success": keyword_success and final_layer_idx == 0,
        "confidence": round(keyword_conf, 3),
        "threshold": keyword_threshold,
        "selected_master": f"{task_domain}-master",
        "latency_ms": round(random.uniform(2.0, 5.0), 2),
        "metadata": {
            "matched_keywords": extract_keywords(task_description)
        }
    })

    # Only try next layers if previous didn't succeed
    if not keyword_success or final_layer_idx > 0:
        # Layer 2: Semantic
        semantic_conf = random.uniform(0.75, 0.95) if task_domain in ["development", "inventory"] else random.uniform(0.65, 0.90)
        semantic_threshold = 0.70
        semantic_success = semantic_conf >= semantic_threshold

        routing_layers.append({
            "layer_id": 2,
            "layer_name": "semantic",
            "attempted": True,
            "success": semantic_success and final_layer_idx == 1,
            "confidence": round(semantic_conf, 3),
            "threshold": semantic_threshold,
            "selected_master": f"{task_domain}-master",
            "latency_ms": round(random.uniform(25.0, 55.0), 2),
            "metadata": {
                "similarity_score": round(semantic_conf, 3),
                "cluster": task_domain
            }
        })

        if not semantic_success or final_layer_idx > 1:
            # Layer 3: RAG
            rag_conf = random.uniform(0.85, 0.97)
            rag_threshold = 0.85
            rag_success = rag_conf >= rag_threshold

            routing_layers.append({
                "layer_id": 3,
                "layer_name": "rag",
                "attempted": True,
                "success": rag_success and final_layer_idx == 2,
                "confidence": round(rag_conf, 3),
                "threshold": rag_threshold,
                "selected_master": f"{task_domain}-master",
                "latency_ms": round(random.uniform(80.0, 180.0), 2),
                "metadata": {
                    "vector_similarity": round(rag_conf, 3),
                    "retrieved_docs": random.randint(3, 10)
                }
            })

            if not rag_success or final_layer_idx > 2:
                # Layer 4: PyTorch
                pytorch_conf = random.uniform(0.88, 0.98)
                pytorch_threshold = 0.90
                pytorch_success = pytorch_conf >= pytorch_threshold

                routing_layers.append({
                    "layer_id": 4,
                    "layer_name": "pytorch",
                    "attempted": True,
                    "success": pytorch_success and final_layer_idx == 3,
                    "confidence": round(pytorch_conf, 3),
                    "threshold": pytorch_threshold,
                    "selected_master": f"{task_domain}-master",
                    "latency_ms": round(random.uniform(150.0, 350.0), 2),
                    "metadata": {
                        "model_version": "v1.0",
                        "predicted_probabilities": generate_probabilities(task_domain)
                    }
                })

                if not pytorch_success or final_layer_idx > 3:
                    # Layer 5: Clarification
                    routing_layers.append({
                        "layer_id": 5,
                        "layer_name": "clarification",
                        "attempted": True,
                        "success": True,
                        "confidence": 1.0,
                        "threshold": 1.0,
                        "selected_master": f"{task_domain}-master",
                        "latency_ms": 0.0,
                        "metadata": {
                            "user_selected": True
                        }
                    })

    # Get final decision layer
    final_decision_layer = routing_layers[final_layer_idx]

    # Calculate total latency
    total_latency = sum(layer["latency_ms"] for layer in routing_layers)

    # Determine correctness (realistic error rate)
    # Earlier layers have slightly higher error rates
    error_rates = [0.08, 0.06, 0.04, 0.02, 0.00]  # per layer
    was_correct = random.random() > error_rates[final_layer_idx]

    # Sometimes user corrections happen
    user_corrected_to = None
    if not was_correct:
        # User might correct to different master
        other_domains = [d for d in SAMPLE_TASKS.keys() if d != task_domain]
        if other_domains:
            user_corrected_to = f"{random.choice(other_domains)}-master"

    # Build outcome
    outcome = {
        "task_completed": was_correct or random.random() > 0.2,  # Most complete even if misrouted
        "task_status": "completed" if was_correct else random.choice(["completed", "failed"]),
        "was_correct_master": was_correct,
        "user_corrected_to": user_corrected_to,
        "completion_time_minutes": random.randint(15, 120) if was_correct else random.randint(30, 180),
        "quality_score": random.uniform(0.85, 0.99) if was_correct else random.uniform(0.50, 0.75)
    }

    # Generate learning feedback
    learning_feedback = {
        "correct_routing": was_correct,
        "should_have_routed_to": user_corrected_to,
        "layer_should_have_caught": None,
        "threshold_too_high": False,
        "threshold_too_low": False
    }

    if not was_correct and user_corrected_to:
        # Check if an earlier layer had the right answer but threshold was too high
        for layer in routing_layers[:-1]:  # Exclude clarification
            if random.random() < 0.3:  # Sometimes threshold was the issue
                learning_feedback["layer_should_have_caught"] = layer["layer_name"]
                learning_feedback["threshold_too_high"] = True
                break

    # Build full event
    return {
        "event_id": event_id,
        "timestamp": timestamp.isoformat(),
        "task_id": f"task-{event_num:04d}",
        "task_description": task_description,
        "task_metadata": {
            "priority": random.choice(["low", "medium", "high", "critical"]),
            "source": random.choice(["user", "api", "webhook", "scheduler"])
        },
        "routing_layers": routing_layers,
        "final_decision": {
            "selected_master": final_decision_layer["selected_master"],
            "routing_layer": final_decision_layer["layer_name"],
            "confidence": final_decision_layer["confidence"],
            "all_probabilities": generate_probabilities(task_domain)
        },
        "total_latency_ms": round(total_latency, 2),
        "outcome": outcome,
        "learning_feedback": learning_feedback
    }


def extract_keywords(task_description: str) -> List[str]:
    """Extract keywords from task description"""
    keywords = []
    keyword_map = {
        "fix": "bug", "bug": "bug", "debug": "bug",
        "implement": "feature", "add": "feature", "create": "feature",
        "deploy": "deployment", "build": "build",
        "scan": "security", "audit": "security", "vulnerability": "security",
        "document": "documentation", "catalog": "inventory"
    }

    words = task_description.lower().split()
    for word in words:
        clean_word = word.strip(".,!?")
        if clean_word in keyword_map:
            keywords.append(keyword_map[clean_word])

    return list(set(keywords)) or ["general"]


def generate_probabilities(correct_domain: str) -> Dict[str, float]:
    """Generate probability distribution across masters"""
    masters = ["development-master", "security-master", "inventory-master", "cicd-master"]
    correct_master = f"{correct_domain}-master"

    # High probability for correct master
    probs = {master: random.uniform(0.01, 0.10) for master in masters}
    probs[correct_master] = random.uniform(0.70, 0.95)

    # Normalize
    total = sum(probs.values())
    return {k: round(v / total, 3) for k, v in probs.items()}


def generate_sample_data(num_events: int = 500, output_file: Path = None) -> None:
    """Generate sample routing performance data"""

    if output_file is None:
        cortex_root = Path(__file__).resolve().parents[2]
        output_file = cortex_root / "coordination" / "routing" / "performance.jsonl"

    # Ensure directory exists
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Generate events over last 7 days
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=7)

    events = []
    for i in range(num_events):
        # Random timestamp in range
        timestamp = start_time + timedelta(
            seconds=random.randint(0, int((end_time - start_time).total_seconds()))
        )

        # Random task domain and description
        domain = random.choice(list(SAMPLE_TASKS.keys()))
        task_desc = random.choice(SAMPLE_TASKS[domain])

        event = generate_routing_event(domain, task_desc, timestamp, i)
        events.append(event)

    # Sort by timestamp
    events.sort(key=lambda e: e["timestamp"])

    # Write to file
    with open(output_file, 'w') as f:
        for event in events:
            json.dump(event, f)
            f.write('\n')

    print(f"Generated {num_events} routing events")
    print(f"Output: {output_file}")
    print(f"\nSummary:")
    print(f"  Time range: {start_time.strftime('%Y-%m-%d')} to {end_time.strftime('%Y-%m-%d')}")

    # Calculate statistics
    layer_counts = {"keyword": 0, "semantic": 0, "rag": 0, "pytorch": 0, "clarification": 0}
    for event in events:
        layer = event["final_decision"]["routing_layer"]
        layer_counts[layer] += 1

    print(f"\n  Routing distribution:")
    for layer, count in layer_counts.items():
        pct = (count / num_events) * 100
        print(f"    {layer:15s}: {count:4d} ({pct:5.1f}%)")

    # Accuracy
    correct = sum(1 for e in events if e["outcome"]["was_correct_master"])
    accuracy = (correct / num_events) * 100
    print(f"\n  Overall accuracy: {accuracy:.1f}%")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate sample routing performance data")
    parser.add_argument("-n", "--num-events", type=int, default=500,
                       help="Number of events to generate (default: 500)")
    parser.add_argument("-o", "--output", type=str,
                       help="Output file path (default: coordination/routing/performance.jsonl)")

    args = parser.parse_args()

    output_path = Path(args.output) if args.output else None
    generate_sample_data(num_events=args.num_events, output_file=output_path)
