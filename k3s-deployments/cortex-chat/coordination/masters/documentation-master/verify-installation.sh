#!/bin/bash
# Verification script for Documentation Master installation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="/Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-governance"

echo "Documentation Master - Installation Verification"
echo "================================================="
echo ""

# Check directory structure
echo "1. Checking directory structure..."
directories=(
    "${SCRIPT_DIR}/lib"
    "${SCRIPT_DIR}/config"
    "${SCRIPT_DIR}/workers"
    "${SCRIPT_DIR}/knowledge-base"
    "${SCRIPT_DIR}/cache"
)

for dir in "${directories[@]}"; do
    if [[ -d "${dir}" ]]; then
        echo "   ✓ ${dir}"
    else
        echo "   ✗ ${dir} - MISSING"
        exit 1
    fi
done

echo ""
echo "2. Checking core scripts..."
scripts=(
    "${SCRIPT_DIR}/master.sh"
    "${SCRIPT_DIR}/sync-to-k8s.sh"
)

for script in "${scripts[@]}"; do
    if [[ -f "${script}" && -x "${script}" ]]; then
        echo "   ✓ ${script}"
    else
        echo "   ✗ ${script} - MISSING OR NOT EXECUTABLE"
        exit 1
    fi
done

echo ""
echo "3. Checking library scripts..."
libs=(
    "${SCRIPT_DIR}/lib/crawler.sh"
    "${SCRIPT_DIR}/lib/indexer.sh"
    "${SCRIPT_DIR}/lib/learner.sh"
    "${SCRIPT_DIR}/lib/knowledge-graph.sh"
    "${SCRIPT_DIR}/lib/query-handler.sh"
    "${SCRIPT_DIR}/lib/evolution-tracker.sh"
)

for lib in "${libs[@]}"; do
    if [[ -f "${lib}" ]]; then
        echo "   ✓ ${lib}"
    else
        echo "   ✗ ${lib} - MISSING"
        exit 1
    fi
done

echo ""
echo "4. Checking worker scripts..."
workers=(
    "${SCRIPT_DIR}/workers/crawler-worker.sh"
    "${SCRIPT_DIR}/workers/indexer-worker.sh"
    "${SCRIPT_DIR}/workers/learner-worker.sh"
)

for worker in "${workers[@]}"; do
    if [[ -f "${worker}" && -x "${worker}" ]]; then
        echo "   ✓ ${worker}"
    else
        echo "   ✗ ${worker} - MISSING OR NOT EXECUTABLE"
        exit 1
    fi
done

echo ""
echo "5. Checking configuration files..."
configs=(
    "${SCRIPT_DIR}/config/sources.json"
    "${SCRIPT_DIR}/config/crawl-policy.json"
    "${SCRIPT_DIR}/config/resource-limits.json"
    "${SCRIPT_DIR}/config/learning-policy.json"
)

for config in "${configs[@]}"; do
    if [[ -f "${config}" ]]; then
        # Validate JSON
        if jq empty "${config}" 2>/dev/null; then
            echo "   ✓ ${config} (valid JSON)"
        else
            echo "   ✗ ${config} - INVALID JSON"
            exit 1
        fi
    else
        echo "   ✗ ${config} - MISSING"
        exit 1
    fi
done

echo ""
echo "6. Checking K8s manifests..."
manifests=(
    "${K8S_DIR}/documentation-master-deployment.yaml"
    "${K8S_DIR}/documentation-master-pvc.yaml"
    "${K8S_DIR}/documentation-master-service.yaml"
    "${K8S_DIR}/documentation-master-configmap.yaml"
    "${K8S_DIR}/documentation-master-cronjob.yaml"
)

for manifest in "${manifests[@]}"; do
    if [[ -f "${manifest}" ]]; then
        echo "   ✓ ${manifest}"
    else
        echo "   ✗ ${manifest} - MISSING"
        exit 1
    fi
done

echo ""
echo "7. Checking documentation..."
docs=(
    "${SCRIPT_DIR}/README.md"
    "${SCRIPT_DIR}/IMPLEMENTATION-SUMMARY.md"
)

for doc in "${docs[@]}"; do
    if [[ -f "${doc}" ]]; then
        echo "   ✓ ${doc}"
    else
        echo "   ✗ ${doc} - MISSING"
        exit 1
    fi
done

echo ""
echo "8. Code statistics..."
total_lines=$(wc -l "${SCRIPT_DIR}"/{master.sh,lib/*.sh,workers/*.sh} | tail -1 | awk '{print $1}')
echo "   Total lines of code: ${total_lines}"

config_files=$(find "${SCRIPT_DIR}/config" -name "*.json" | wc -l)
echo "   Configuration files: ${config_files}"

lib_files=$(find "${SCRIPT_DIR}/lib" -name "*.sh" | wc -l)
echo "   Library scripts: ${lib_files}"

worker_files=$(find "${SCRIPT_DIR}/workers" -name "*.sh" | wc -l)
echo "   Worker scripts: ${worker_files}"

echo ""
echo "9. Checking Sandfly configuration..."
sandfly_enabled=$(jq -r '.sandfly.enabled' "${SCRIPT_DIR}/config/sources.json")
if [[ "${sandfly_enabled}" == "true" ]]; then
    echo "   ✓ Sandfly is enabled"

    source_count=$(jq '.sandfly.sources | length' "${SCRIPT_DIR}/config/sources.json")
    echo "   ✓ Sandfly has ${source_count} configured sources"

    entity_count=$(jq '.sandfly.knowledge_graph.entities | length' "${SCRIPT_DIR}/config/sources.json")
    echo "   ✓ Sandfly has ${entity_count} knowledge graph entities"
else
    echo "   ✗ Sandfly is NOT enabled - edit config/sources.json to enable"
fi

echo ""
echo "================================================="
echo "✓ Installation verification PASSED"
echo "================================================="
echo ""
echo "Next steps:"
echo "1. Sync to Kubernetes: ./sync-to-k8s.sh"
echo "2. Deploy: kubectl apply -f ${K8S_DIR}/documentation-master-*.yaml"
echo "3. Monitor: kubectl logs -n cortex deployment/documentation-master -f"
echo ""
echo "For detailed instructions, see README.md and IMPLEMENTATION-SUMMARY.md"
