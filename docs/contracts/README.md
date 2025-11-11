# Agent Contracts Documentation

This directory contains formal contracts defining the interface specifications, data formats, and behavioral expectations for all agents in the commit-relay system.

## Purpose

Agent contracts serve as:

1. **API Specifications**: Define exact input/output formats for agent interactions
2. **Data Integrity Guarantees**: Ensure all coordination files conform to schemas
3. **Behavioral Contracts**: Document expected agent behaviors and responsibilities
4. **Integration Points**: Specify how agents communicate via handoffs
5. **Control Loop Definitions**: Define the feedback and control mechanisms

## Contract Types

### Master Agent Contracts
- **coordinator-master-contracts.md** - Task routing and coordination
- **development-master-contracts.md** - Development work orchestration
- **security-master-contracts.md** - Security scanning and auditing
- **inventory-master-contracts.md** - Documentation and asset management
- **cicd-master-contracts.md** - CI/CD and deployment automation

### System Contracts
- **worker-contracts.md** - Worker agent specifications
- **handoff-protocol.md** - Inter-agent handoff protocol
- **moe-routing-contracts.md** - MoE routing system contracts
- **dashboard-api-contracts.md** - Dashboard data contracts

## Schema Validation

All contracts are backed by JSON Schema definitions in `/coordination/schemas/`. Every data structure has:

- **Strict validation**: All fields validated on read/write
- **Type safety**: Enum values, patterns, and formats enforced
- **Required fields**: No optional critical data
- **Auto-repair**: Common errors automatically fixed

## Using Contracts

### In Code

```javascript
const { safeReadJSON, safeWriteJSON } = require('../lib/safe-json');

// Read with validation
const result = safeReadJSON('/path/to/master-state.json', 'master-state');
if (!result.success) {
  console.error('Validation failed:', result.errors);
}

// Write with validation
const writeResult = safeWriteJSON(
  '/path/to/handoff.json',
  handoffData,
  'handoff',
  { backup: true, repair: true }
);
```

### In Scripts

```bash
# Use safe JSON operations in all coordination scripts
node -e "
  const { safeReadJSON } = require('./lib/safe-json');
  const result = safeReadJSON('./coordination/task-queue.json', 'task-queue');
  console.log(JSON.stringify(result.data, null, 2));
"
```

## Contract Guarantees

When you use validated operations, you get these guarantees:

1. **Type Safety**: All fields have correct types (string, number, enum, etc.)
2. **Completeness**: All required fields are present with valid values
3. **Format Compliance**: IDs, timestamps, URIs follow defined patterns
4. **No Corruption**: Atomic writes with backup/rollback on failure
5. **Auto-Healing**: Common errors automatically repaired when possible

## Versioning

Contracts follow semantic versioning:
- **Major**: Breaking changes to contract structure
- **Minor**: Backward-compatible additions
- **Patch**: Documentation updates and clarifications

Current version: **1.0.0** (Phase 1 - Contract Definition)

## Phase 1 Deliverables

- [x] 18 JSON schemas covering all coordination file types
- [x] Schema validator library with AJV
- [x] Safe JSON wrappers with validation
- [x] Complete agent contract documentation
- [x] Validation testing suite

## Next Phases

- **Phase 2**: Control Loops - Define feedback mechanisms
- **Phase 3**: Observability - Metrics, tracing, logging contracts
- **Phase 4**: Error Handling - Comprehensive error taxonomy
- **Phase 5**: Performance - SLAs and resource contracts
- **Phase 6**: Integration Testing - End-to-end contract validation
