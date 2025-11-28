#!/bin/bash
#
# Demonstration of Cortex Evaluation Framework
#
# This creates sample evaluation results to demonstrate the framework
# without requiring actual Claude API calls.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_FILE="$SCRIPT_DIR/results/evaluation-runs.jsonl"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Cortex Evaluation Framework - Demo${NC}"
echo ""
echo "This demo creates sample evaluation results to show how the framework works."
echo ""

# Create results directory
mkdir -p "$SCRIPT_DIR/results"

# Create sample evaluation results
cat > "$RESULTS_FILE" << 'EOF'
{"overall_score": 4.4, "overall_assessment": "Excellent vulnerability detection with comprehensive remediation steps. The security master correctly identified the CVE, analyzed impact, and provided clear upgrade path.", "dimensions": {"correctness": {"score": 5, "reasoning": "Perfectly identified the vulnerable lodash package and CVE-2024-28849."}, "completeness": {"score": 5, "reasoning": "All requirements met: found vulnerability, suggested upgrade, identified impact, checked transitive deps."}, "efficiency": {"score": 4, "reasoning": "Good approach, completed in reasonable time. Could optimize dependency tree scanning."}, "code_quality": {"score": 4, "reasoning": "Well-structured output with clear remediation steps. Documentation is comprehensive."}, "best_practices": {"score": 4, "reasoning": "Follows security scanning best practices. Includes CVSS scoring and risk assessment."}}, "strengths": ["Accurate CVE identification", "Comprehensive impact analysis", "Clear remediation steps with priority"], "weaknesses": ["Could include automated fix generation", "Missing rollback procedure"], "recommendations": ["Add automated PR generation for dependency updates", "Include regression test suggestions"], "metadata": {"task_id": "security-001", "evaluated_at": "2025-11-27T19:30:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 920, "output_tokens": 380}, "run_id": "demo-001"}
{"overall_score": 4.0, "overall_assessment": "Good implementation of API endpoint with pagination. All core requirements met with solid test coverage.", "dimensions": {"correctness": {"score": 4, "reasoning": "Endpoint works correctly with proper pagination logic."}, "completeness": {"score": 4, "reasoning": "Includes pagination, validation, tests, and documentation."}, "efficiency": {"score": 4, "reasoning": "Uses efficient cursor-based pagination for large datasets."}, "code_quality": {"score": 4, "reasoning": "Clean code following project patterns. Good separation of concerns."}, "best_practices": {"score": 4, "reasoning": "Follows REST API best practices. Proper HTTP status codes."}}, "strengths": ["Cursor-based pagination", "Comprehensive tests", "Good error handling"], "weaknesses": ["Could add caching headers", "Missing rate limiting"], "recommendations": ["Add ETag support for caching", "Document pagination metadata in response"], "metadata": {"task_id": "development-001", "evaluated_at": "2025-11-27T19:32:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 850, "output_tokens": 340}, "run_id": "demo-001"}
{"overall_score": 3.8, "overall_assessment": "Good memory leak fix with proper cleanup. Could improve verification and documentation.", "dimensions": {"correctness": {"score": 4, "reasoning": "Identified and fixed the memory leak in worker cleanup."}, "completeness": {"score": 4, "reasoning": "Added cleanup logic and regression test."}, "efficiency": {"score": 3, "reasoning": "Fix is correct but could be more efficient. Some redundant checks."}, "code_quality": {"score": 4, "reasoning": "Clean implementation with good comments."}, "best_practices": {"score": 4, "reasoning": "Follows cleanup patterns. Proper resource management."}}, "strengths": ["Root cause identified", "Regression test added", "Event listeners properly removed"], "weaknesses": ["Missing memory profiling results", "Documentation could be more detailed"], "recommendations": ["Add before/after memory usage metrics", "Document the leak pattern for future reference"], "metadata": {"task_id": "development-002", "evaluated_at": "2025-11-27T19:34:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 980, "output_tokens": 360}, "run_id": "demo-001"}
{"overall_score": 4.2, "overall_assessment": "Excellent API cataloging with comprehensive OpenAPI spec generation. Well-structured and validated.", "dimensions": {"correctness": {"score": 5, "reasoning": "Generated valid OpenAPI 3.0 specification with all endpoints."}, "completeness": {"score": 4, "reasoning": "Includes all endpoints, schemas, and auth requirements. Missing some examples."}, "efficiency": {"score": 4, "reasoning": "Efficient endpoint discovery using AST parsing."}, "code_quality": {"score": 4, "reasoning": "Clean code with good documentation."}, "best_practices": {"score": 4, "reasoning": "Follows OpenAPI 3.0 standards. Proper schema validation."}}, "strengths": ["Complete endpoint coverage", "Valid OpenAPI spec", "Good schema definitions"], "weaknesses": ["Some response examples missing", "Could auto-generate from JSDoc"], "recommendations": ["Add more request/response examples", "Generate interactive API documentation"], "metadata": {"task_id": "inventory-001", "evaluated_at": "2025-11-27T19:36:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 890, "output_tokens": 350}, "run_id": "demo-001"}
{"overall_score": 2.8, "overall_assessment": "Partial routing implementation. Basic routing works but missing priority handling and context preservation.", "dimensions": {"correctness": {"score": 3, "reasoning": "Routes to security master correctly but misses some edge cases."}, "completeness": {"score": 2, "reasoning": "Missing priority assignment and some context fields."}, "efficiency": {"score": 3, "reasoning": "Routing decision is correct but could be faster."}, "code_quality": {"score": 3, "reasoning": "Code works but needs refactoring for clarity."}, "best_practices": {"score": 3, "reasoning": "Basic patterns followed but inconsistent logging."}}, "strengths": ["Basic routing works", "Task identification accurate"], "weaknesses": ["Priority not set properly", "Context preservation incomplete", "Logging inconsistent"], "recommendations": ["Implement priority matrix", "Add comprehensive context passing", "Standardize logging format"], "metadata": {"task_id": "coordinator-001", "evaluated_at": "2025-11-27T19:38:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 780, "output_tokens": 320}, "run_id": "demo-001"}
{"overall_score": 4.6, "overall_assessment": "Excellent secrets scanning implementation with comprehensive detection and good remediation guidance.", "dimensions": {"correctness": {"score": 5, "reasoning": "Correctly identifies hardcoded secrets in all file types."}, "completeness": {"score": 5, "reasoning": "Scans all relevant files, checks .env, suggests vault solution."}, "efficiency": {"score": 4, "reasoning": "Efficient pattern matching. Could optimize for large codebases."}, "code_quality": {"score": 5, "reasoning": "Well-structured code with clear regex patterns."}, "best_practices": {"score": 4, "reasoning": "Follows security scanning best practices. Good pattern library."}}, "strengths": ["Comprehensive file type coverage", "Accurate secret detection", "Clear remediation steps", "Suggests secrets management"], "weaknesses": ["Could integrate with vault directly", "No false positive filtering"], "recommendations": ["Add HashiCorp Vault integration", "Implement allowlist for false positives"], "metadata": {"task_id": "security-003", "evaluated_at": "2025-11-27T19:40:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 910, "output_tokens": 370}, "run_id": "demo-001"}
{"overall_score": 3.6, "overall_assessment": "Good refactoring with centralized config manager. Some compatibility issues need attention.", "dimensions": {"correctness": {"score": 4, "reasoning": "Config manager works correctly for most cases."}, "completeness": {"score": 3, "reasoning": "Migrated most code but some legacy patterns remain."}, "efficiency": {"score": 4, "reasoning": "Efficient config loading with caching."}, "code_quality": {"score": 4, "reasoning": "Clean implementation with good separation."}, "best_practices": {"score": 3, "reasoning": "Good patterns but backward compatibility has gaps."}}, "strengths": ["Centralized configuration", "Good validation", "Caching implemented"], "weaknesses": ["Some backward compatibility issues", "Migration incomplete", "Documentation needs update"], "recommendations": ["Complete legacy code migration", "Add migration guide", "Improve backward compatibility layer"], "metadata": {"task_id": "development-003", "evaluated_at": "2025-11-27T19:42:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 940, "output_tokens": 360}, "run_id": "demo-001"}
{"overall_score": 4.8, "overall_assessment": "Outstanding database optimization with measurable performance improvements. Excellent analysis and implementation.", "dimensions": {"correctness": {"score": 5, "reasoning": "Query optimization is correct and measurably improves performance."}, "completeness": {"score": 5, "reasoning": "Profiling, indexing, query optimization, and measurement all complete."}, "efficiency": {"score": 5, "reasoning": "Achieved 3.5x performance improvement. Excellent results."}, "code_quality": {"score": 5, "reasoning": "Clean, well-documented optimization with clear explanations."}, "best_practices": {"score": 4, "reasoning": "Follows database optimization best practices. Could add monitoring."}}, "strengths": ["Thorough profiling", "Measurable improvements", "Good index strategy", "Clear documentation"], "weaknesses": ["Could add query plan caching", "Missing automated monitoring"], "recommendations": ["Add query performance monitoring", "Implement slow query logging"], "metadata": {"task_id": "development-004", "evaluated_at": "2025-11-27T19:44:00Z", "model": "claude-3-5-sonnet-20241022", "input_tokens": 1020, "output_tokens": 390}, "run_id": "demo-001"}
EOF

echo -e "${GREEN}Created sample evaluation results${NC}"
echo ""

# Show count
COUNT=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
echo "Evaluations in database: $COUNT"
echo ""

# Display metrics
echo -e "${BLUE}Calculating metrics...${NC}"
echo ""

python3 "$SCRIPT_DIR/evaluators/metrics.py" --results "$RESULTS_FILE"

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. View the dashboard:"
echo "   ${GREEN}./evaluation/evaluation-dashboard.sh${NC}"
echo ""
echo "2. View raw results:"
echo "   ${GREEN}cat evaluation/results/evaluation-runs.jsonl | jq${NC}"
echo ""
echo "3. Run actual evaluation (requires ANTHROPIC_API_KEY):"
echo "   ${GREEN}./evaluation/run-evaluation.sh --mode light${NC}"
echo ""
echo "4. View task definitions:"
echo "   ${GREEN}ls -1 evaluation/golden-dataset/tasks/${NC}"
echo ""
