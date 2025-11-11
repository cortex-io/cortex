# JSON Validation System

## Overview

Automatic JSON validation and repair system for `dashboard-events.jsonl` to prevent parsing errors and dashboard crashes.

## Components

### 1. Bash Validator (`scripts/lib/json-validator.sh`)

Shell script library providing JSON validation and repair utilities.

**Features:**
- Validate JSON strings using `jq`
- Automatic repair of common JSON errors:
  - Trailing commas before closing braces/brackets
  - Missing commas between objects
  - Missing commas between array elements
  - Unclosed braces and brackets
- JSONL file validation and repair
- Detailed logging with debug mode

**Usage:**

```bash
# Source the library
source scripts/lib/json-validator.sh

# Validate JSON
if validate_json "$json_string"; then
    echo "Valid"
fi

# Validate and repair
if repaired=$(validate_and_repair_json "$json_string" 1); then
    echo "$repaired"
fi

# Validate JSONL file
validate_jsonl_file "/path/to/file.jsonl" 0

# Repair JSONL file
repair_jsonl_file "/path/to/file.jsonl" 1  # 1 = create backup

# CLI usage
./scripts/lib/json-validator.sh validate '{"test":"data"}'
./scripts/lib/json-validator.sh repair '{"test":"data",}'
./scripts/lib/json-validator.sh validate-file /path/to/file.jsonl
./scripts/lib/json-validator.sh repair-file /path/to/file.jsonl
```

**Environment Variables:**
- `DEBUG_JSON_VALIDATION=1` - Enable debug output
- `JSON_VALIDATION_LOG=/path/to/log` - Log validation events

### 2. Node.js Validator (`dashboard/server/utils/json-validator.js`)

Node.js module providing JSON validation and repair for the dashboard server.

**Features:**
- Same repair capabilities as bash version
- Safe write function with automatic validation
- JSONL file validation and repair
- Detailed logging and error reporting

**Usage:**

```javascript
const { validateAndRepairJSON, safeWriteJSON } = require('./utils/json-validator');

// Validate and repair
const result = validateAndRepairJSON('{"test":"data",}', true);
if (result.success) {
    console.log(result.data);
}

// Safe write with validation
const writeResult = safeWriteJSON('/path/to/file.jsonl', { test: 'data' }, true);
if (writeResult.success) {
    console.log('Written successfully');
}
```

### 3. Integrated Event Emission (`scripts/emit-event.sh`)

Updated to automatically validate and repair JSON before writing.

**Usage:**

```bash
./scripts/emit-event.sh task_created '{"task_id":"task-001","title":"Test"}' "coordinator"
```

Events are automatically validated and repaired before being written to `dashboard-events.jsonl`.

### 4. Dashboard Server Integration

The `emitDashboardEvent()` function now uses `safeWriteJSON()` to ensure all events are valid before writing.

**Location:** `dashboard/server/index.js`

```javascript
function emitDashboardEvent(type, data) {
  const event = {
    id: `evt-${Date.now()}-${process.pid}`,
    timestamp: new Date().toISOString(),
    type: type,
    data: data,
    source: 'dashboard'
  };

  const result = safeWriteJSON(FILES.dashboardEvents, event, true);
  // Handles validation automatically
}
```

## Repair Utilities

### Repair Existing dashboard-events.jsonl

```bash
./scripts/repair-dashboard-events.sh
```

This script:
1. Creates a timestamped backup
2. Repairs all JSON errors in the file
3. Reports repair statistics
4. Preserves only valid events

### Manual Repair

```bash
# Using bash validator
./scripts/lib/json-validator.sh repair-file coordination/dashboard-events.jsonl

# Using Node.js validator
node -e "
const validator = require('./dashboard/server/utils/json-validator.js');
validator.repairJSONLFile('coordination/dashboard-events.jsonl', true);
"
```

## Common JSON Errors Fixed

### 1. Trailing Commas

**Before:**
```json
{"id":"test","data":"value",}
```

**After:**
```json
{"id":"test","data":"value"}
```

### 2. Missing Commas Between Objects

**Before:**
```json
{"a":1}{"b":2}
```

**After:**
```json
{"a":1},{"b":2}
```

### 3. Unclosed Braces

**Before:**
```json
{"id":"test","data":"value"
```

**After:**
```json
{"id":"test","data":"value"}
```

### 4. Multiple Issues

**Before:**
```json
{
  "id": "evt-001",
  "data": {"nested":true}},
  "source": "system"
}
```

**After:**
```json
{
  "id": "evt-001",
  "data": {"nested":true},
  "source": "system"
}
```

## Testing

### Run Test Suite

```bash
./tests/json-validation.test.sh
```

Test coverage:
- Valid JSON validation
- Invalid JSON detection
- Trailing comma repair
- Missing comma repair
- Unclosed bracket repair
- Multiple issue repair
- JSONL file validation
- JSONL file repair
- Node.js validator integration
- emit-event.sh integration
- Dashboard event structure validation

### Manual Testing

```bash
# Test bash validator
source scripts/lib/json-validator.sh
DEBUG_JSON_VALIDATION=1 validate_and_repair_json '{"test":"data",}' 1

# Test Node.js validator
node -e "
const v = require('./dashboard/server/utils/json-validator.js');
console.log(v.validateAndRepairJSON('{\"test\":\"data\",}', true));
"

# Test emit-event.sh
DEBUG_JSON_VALIDATION=1 ./scripts/emit-event.sh test_type '{"test":"data"}' test-source
```

## Logging

Validation logs are written to:
- `coordination/logs/json-validation.log` (bash)
- Configured via `JSON_VALIDATION_LOG` environment variable

Log format (JSONL):
```json
{
  "timestamp": "2025-11-11T14:00:00Z",
  "level": "INFO",
  "message": "JSON repair successful",
  "metadata": {}
}
```

## Error Recovery

If JSON cannot be repaired:
1. **emit-event.sh**: Exits with error code 1, logs error details
2. **Dashboard server**: Logs error, continues operation
3. **Repair scripts**: Skips invalid line, continues with next

## Performance

- Validation adds <10ms overhead per event
- Repair operations are O(n) where n = JSON string length
- Minimal memory footprint (streaming for large files)

## Maintenance

### Update Repair Rules

Add new repair patterns to:
1. `scripts/lib/json-validator.sh` - `repair_json()` function
2. `dashboard/server/utils/json-validator.js` - `repairJSON()` function

### Monitoring

Check validation logs for recurring errors:

```bash
# Count repair events
jq 'select(.level=="INFO" and .message | contains("repair"))' \
  coordination/logs/json-validation.log | wc -l

# Find errors
jq 'select(.level=="ERROR")' coordination/logs/json-validation.log
```

## Integration Checklist

When adding new event emission points:

- [ ] Use `emit-event.sh` for bash scripts
- [ ] Use `emitDashboardEvent()` for dashboard server
- [ ] Use `safeWriteJSON()` for direct file writes
- [ ] Test with malformed JSON
- [ ] Monitor validation logs

## Benefits

1. **Prevents Dashboard Crashes**: Invalid JSON cannot be written
2. **Eliminates Data Corruption**: All events are valid before persistence
3. **Improves Reliability**: Automatic repair of common errors
4. **Transparent Operation**: Minimal performance impact
5. **Detailed Logging**: Track and debug JSON issues
6. **Backward Compatible**: Repairs existing malformed data

## Known Limitations

1. Complex nested JSON errors may not be repairable
2. Requires `jq` for bash validation (fallback: Node.js only)
3. Repair is best-effort; some malformed JSON cannot be fixed
4. Very large JSONL files (>100MB) may be slow to repair

## Future Enhancements

- [ ] JSON schema validation for event structure
- [ ] Automatic schema migration on dashboard-events.jsonl
- [ ] Real-time monitoring dashboard for validation metrics
- [ ] Performance optimization for large file repairs
- [ ] TypeScript types for event structures
