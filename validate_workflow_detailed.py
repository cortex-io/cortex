#!/usr/bin/env python3
"""
Enhanced n8n Workflow JSON Validator
Identifies the specific issue: connections using names instead of IDs
"""

import json
import sys

def validate_workflow_detailed(filepath: str):
    """Detailed validation focusing on the ID vs Name issue."""

    with open(filepath, 'r') as f:
        workflow = json.load(f)

    print("="*80)
    print("N8N WORKFLOW VALIDATION REPORT")
    print("="*80)
    print(f"\nWorkflow: {workflow.get('name', 'UNNAMED')}")
    print(f"Total Nodes: {len(workflow.get('nodes', []))}")
    print(f"Connection Sources: {len(workflow.get('connections', {}))}")

    # Build lookup tables
    nodes = workflow.get('nodes', [])
    id_to_name = {node['id']: node['name'] for node in nodes if 'id' in node and 'name' in node}
    name_to_id = {node['name']: node['id'] for node in nodes if 'id' in node and 'name' in node}
    valid_ids = set(id_to_name.keys())
    valid_names = set(name_to_id.keys())

    print(f"\nNode IDs present: {len(valid_ids)}")
    print(f"Node Names present: {len(valid_names)}")

    # Analyze connections
    connections = workflow.get('connections', {})
    connection_keys = set(connections.keys())

    print("\n" + "="*80)
    print("CRITICAL ISSUE ANALYSIS: Connection Keys")
    print("="*80)

    keys_are_ids = connection_keys.intersection(valid_ids)
    keys_are_names = connection_keys.intersection(valid_names)
    keys_invalid = connection_keys - valid_ids - valid_names

    print(f"\nConnection keys that are valid node IDs: {len(keys_are_ids)}")
    print(f"Connection keys that are valid node NAMES: {len(keys_are_names)}")
    print(f"Connection keys that are invalid: {len(keys_invalid)}")

    if keys_are_names:
        print("\n>>> CRITICAL ERROR: Connections are using NODE NAMES instead of NODE IDs <<<")
        print("\nn8n requires connections to reference nodes by their 'id' field, not 'name' field.")
        print("\nExamples of connection keys using NAMES (incorrect):")
        for i, name in enumerate(sorted(keys_are_names)[:5]):
            node_id = name_to_id.get(name)
            print(f"  {i+1}. '{name}' -> should be '{node_id}'")

    if keys_are_ids:
        print("\n✓ Good: Some connections are using NODE IDs (correct)")
        print("\nExamples:")
        for i, node_id in enumerate(sorted(keys_are_ids)[:5]):
            name = id_to_name.get(node_id)
            print(f"  {i+1}. '{node_id}' (name: '{name}')")

    # Analyze target nodes in connections
    print("\n" + "="*80)
    print("CRITICAL ISSUE ANALYSIS: Connection Target Nodes")
    print("="*80)

    target_nodes_names = set()
    target_nodes_ids = set()
    target_nodes_invalid = set()

    for source, outputs in connections.items():
        for output_name, output_connections in outputs.items():
            for connection_list in output_connections:
                for connection in connection_list:
                    if isinstance(connection, dict) and 'node' in connection:
                        target = connection['node']
                        if target in valid_ids:
                            target_nodes_ids.add(target)
                        elif target in valid_names:
                            target_nodes_names.add(target)
                        else:
                            target_nodes_invalid.add(target)

    print(f"\nTarget nodes referenced by ID: {len(target_nodes_ids)}")
    print(f"Target nodes referenced by NAME: {len(target_nodes_names)}")
    print(f"Target nodes that are invalid: {len(target_nodes_invalid)}")

    if target_nodes_names:
        print("\n>>> CRITICAL ERROR: Connection targets are using NODE NAMES instead of NODE IDs <<<")
        print("\nExamples of targets using NAMES (incorrect):")
        for i, name in enumerate(sorted(target_nodes_names)[:5]):
            node_id = name_to_id.get(name)
            print(f"  {i+1}. '{name}' -> should be '{node_id}'")

    # Summary
    print("\n" + "="*80)
    print("VALIDATION SUMMARY")
    print("="*80)

    errors = []
    if keys_are_names:
        errors.append(f"Connection keys use NAMES ({len(keys_are_names)} found) - should use IDs")
    if target_nodes_names:
        errors.append(f"Connection targets use NAMES ({len(target_nodes_names)} found) - should use IDs")
    if keys_invalid:
        errors.append(f"Invalid connection keys ({len(keys_invalid)} found)")
    if target_nodes_invalid:
        errors.append(f"Invalid connection targets ({len(target_nodes_invalid)} found)")

    if errors:
        print("\n✗ WORKFLOW HAS CRITICAL STRUCTURAL ERRORS:\n")
        for i, error in enumerate(errors, 1):
            print(f"  {i}. {error}")

        print("\n" + "="*80)
        print("EXPLANATION")
        print("="*80)
        print("""
n8n workflow JSON format requires:
  1. The 'connections' object must use node IDs as keys (not names)
  2. Each connection's 'node' field must reference the target by ID (not name)

Current structure (INCORRECT):
  "connections": {
    "Tool: List All VMs": {  // ← Using NAME
      "main": [[{
        "node": "Cortex Coordinator Agent",  // ← Using NAME
        "type": "main",
        "index": 0
      }]]
    }
  }

Required structure (CORRECT):
  "connections": {
    "tool-get-vm-list": {  // ← Using ID
      "main": [[{
        "node": "cortex-coordinator",  // ← Using ID
        "type": "main",
        "index": 0
      }]]
    }
  }
        """)

        print("\n" + "="*80)
        print("REMEDIATION REQUIRED")
        print("="*80)
        print("""
To fix this workflow:
  1. Replace all connection source keys (node names) with their corresponding IDs
  2. Replace all connection target 'node' values (node names) with their corresponding IDs
  3. This requires rebuilding the entire 'connections' object
        """)

        return False
    else:
        print("\n✓ No critical structural errors found")
        return True


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python validate_workflow_detailed.py <workflow.json>")
        sys.exit(1)

    success = validate_workflow_detailed(sys.argv[1])
    sys.exit(0 if success else 1)
