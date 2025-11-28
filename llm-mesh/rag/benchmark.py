#!/usr/bin/env python3
"""
Benchmark RAG retrieval performance.
"""

import time
import json
from retriever import RAGRetriever

def benchmark_retrieval():
    """Benchmark retrieval operations."""
    print("Initializing RAG retriever...")
    start = time.time()
    retriever = RAGRetriever()
    init_time = (time.time() - start) * 1000
    print(f"Initialization: {init_time:.2f}ms")

    # Test queries
    queries = [
        "security vulnerability scanning",
        "authentication JWT middleware",
        "database connection pooling",
        "error handling Express",
        "async retry pattern"
    ]

    print("\nBenchmarking task retrieval (top-5):")
    times = []
    for query in queries:
        start = time.time()
        results = retriever.retrieve_similar_tasks(query, top_k=5)
        elapsed = (time.time() - start) * 1000
        times.append(elapsed)
        print(f"  '{query}': {elapsed:.2f}ms ({len(results)} results)")

    avg_time = sum(times) / len(times)
    print(f"\nAverage task retrieval: {avg_time:.2f}ms")

    print("\nBenchmarking pattern retrieval (top-3):")
    pattern_times = []
    for query in queries:
        start = time.time()
        results = retriever.retrieve_similar_patterns(query, top_k=3)
        elapsed = (time.time() - start) * 1000
        pattern_times.append(elapsed)
        print(f"  '{query}': {elapsed:.2f}ms ({len(results)} results)")

    avg_pattern_time = sum(pattern_times) / len(pattern_times)
    print(f"\nAverage pattern retrieval: {avg_pattern_time:.2f}ms")

    # Stats
    stats = retriever.get_stats()
    print("\nIndex statistics:")
    print(json.dumps(stats, indent=2))

    # Performance summary
    print("\n" + "="*60)
    print("PERFORMANCE SUMMARY")
    print("="*60)
    print(f"Model load time:            {init_time:.2f}ms")
    print(f"Avg task retrieval (top-5): {avg_time:.2f}ms")
    print(f"Avg pattern retrieval (top-3): {avg_pattern_time:.2f}ms")
    print(f"Target: <100ms")
    print(f"Task retrieval status: {'PASS ✓' if avg_time < 100 else 'FAIL ✗'}")
    print(f"Pattern retrieval status: {'PASS ✓' if avg_pattern_time < 100 else 'FAIL ✗'}")
    print("="*60)

if __name__ == '__main__':
    benchmark_retrieval()
