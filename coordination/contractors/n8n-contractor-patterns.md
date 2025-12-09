# n8n Contractor Patterns & Knowledge Base

Comprehensive domain knowledge for n8n workflow automation in the cortex ecosystem.

**Version**: 1.0.0
**Last Updated**: 2025-12-09
**Contractor**: n8n-contractor
**MCP Server**: n8n-mcp-server

---

## Table of Contents

1. [Common Workflow Patterns](#common-workflow-patterns)
2. [Node Combination Best Practices](#node-combination-best-practices)
3. [Error Handling Patterns](#error-handling-patterns)
4. [Trigger Types & Usage](#trigger-types--usage)
5. [Credential Management](#credential-management)
6. [Performance Optimization](#performance-optimization)
7. [Example Workflow Structures](#example-workflow-structures)
8. [Integration Patterns](#integration-patterns)
9. [Testing & Debugging](#testing--debugging)
10. [Advanced Patterns](#advanced-patterns)

---

## Common Workflow Patterns

### 1. ETL (Extract, Transform, Load) Pattern

**Use Case**: Data pipeline from source to destination with transformation

**Structure**:
```
Trigger → Extract (HTTP/DB/File) → Transform (Code/Function) → Validate → Load (DB/API) → Notify
```

**Key Nodes**:
- **Extract**: HTTP Request, Postgres, MySQL, MongoDB, CSV, Spreadsheet File
- **Transform**: Code, Function, Set, Split In Batches, Aggregate
- **Load**: HTTP Request (POST/PUT), Database nodes, Write Binary File
- **Validate**: IF, Switch, Filter
- **Notify**: Email, Slack, Discord, Webhook

**Example Pattern**:
```json
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 6
            }
          ]
        }
      }
    },
    {
      "name": "Extract from API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.example.com/data",
        "method": "GET",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth"
      }
    },
    {
      "name": "Transform Data",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "language": "javaScript",
        "jsCode": "// Transform incoming data\nconst transformed = items.map(item => ({\n  id: item.json.id,\n  name: item.json.name.toUpperCase(),\n  timestamp: new Date().toISOString(),\n  processed: true\n}));\n\nreturn transformed.map(data => ({ json: data }));"
      }
    },
    {
      "name": "Load to Database",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "processed_data",
        "columns": "id,name,timestamp,processed"
      }
    },
    {
      "name": "Success Notification",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#monitoring",
        "text": "ETL completed: {{ $json.count }} records processed"
      }
    }
  ]
}
```

**Best Practices**:
- Use Split In Batches for large datasets (>1000 items)
- Implement error handling at each stage
- Log extraction counts for validation
- Use transactions where possible (databases)
- Store failed records for retry

---

### 2. Alert & Monitoring Pattern

**Use Case**: Monitor systems and send alerts on conditions

**Structure**:
```
Webhook/Schedule → Fetch Status → Compare Threshold → IF (Alert) → Multi-Channel Notify → Log
```

**Key Nodes**:
- **Monitors**: HTTP Request, Execute Command, Database Query
- **Conditions**: IF, Switch, Filter
- **Alerting**: Slack, Email, PagerDuty, Discord, Webhook
- **Logging**: HTTP Request (to logging API), Write to File

**Example Pattern**:
```json
{
  "nodes": [
    {
      "name": "Every 5 Minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 5
            }
          ]
        }
      }
    },
    {
      "name": "Check Service Health",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.service.com/health",
        "method": "GET",
        "timeout": 10000,
        "options": {
          "retry": {
            "maxTries": 3,
            "waitBetweenTries": 1000
          }
        }
      }
    },
    {
      "name": "Evaluate Health",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.status }}",
              "operation": "notEqual",
              "value2": "healthy"
            }
          ],
          "number": [
            {
              "value1": "={{ $json.responseTime }}",
              "operation": "larger",
              "value2": 5000
            }
          ]
        },
        "combineOperation": "any"
      }
    },
    {
      "name": "Alert to Slack",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#alerts",
        "text": "ALERT: Service unhealthy",
        "attachments": [
          {
            "color": "danger",
            "fields": {
              "item": [
                {
                  "short": true,
                  "title": "Status",
                  "value": "={{ $json.status }}"
                },
                {
                  "short": true,
                  "title": "Response Time",
                  "value": "={{ $json.responseTime }}ms"
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

**Best Practices**:
- Implement alert throttling to prevent spam
- Use severity levels (info, warning, critical)
- Include runbook links in alerts
- Store alert history for analysis
- Implement auto-remediation where safe

---

### 3. Data Synchronization Pattern

**Use Case**: Keep two systems in sync bidirectionally or unidirectionally

**Structure**:
```
Trigger → Fetch Changes → Deduplicate → Transform → Upsert Target → Update Source Status
```

**Key Nodes**:
- **Change Detection**: HTTP Request (with timestamps), Database Query (WHERE modified > last_sync)
- **Deduplication**: Remove Duplicates, Code (custom logic)
- **Sync**: Merge, Set, Code
- **Upsert**: HTTP Request (PUT/PATCH), Database Update/Insert

**Example Pattern**:
```json
{
  "nodes": [
    {
      "name": "Hourly Sync",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 1
            }
          ]
        }
      }
    },
    {
      "name": "Get Last Sync Time",
      "type": "n8n-nodes-base.readBinaryFile",
      "parameters": {
        "filePath": "/data/sync-state.json"
      }
    },
    {
      "name": "Fetch Source Changes",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://source.api.com/data",
        "method": "GET",
        "qs": {
          "modified_since": "={{ $json.lastSync }}"
        }
      }
    },
    {
      "name": "Remove Duplicates",
      "type": "n8n-nodes-base.removeDuplicates",
      "parameters": {
        "compare": "selectedFields",
        "fieldsToCompare": "id,email"
      }
    },
    {
      "name": "Transform for Target",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "language": "javaScript",
        "jsCode": "// Map source schema to target schema\nreturn items.map(item => ({\n  json: {\n    target_id: item.json.source_id,\n    full_name: `${item.json.firstName} ${item.json.lastName}`,\n    email_address: item.json.email,\n    sync_timestamp: new Date().toISOString()\n  }\n}));"
      }
    },
    {
      "name": "Upsert to Target",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://target.api.com/users",
        "method": "PUT",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "=all",
              "value": "={{ $json }}"
            }
          ]
        }
      }
    },
    {
      "name": "Update Sync State",
      "type": "n8n-nodes-base.writeBinaryFile",
      "parameters": {
        "fileName": "/data/sync-state.json",
        "dataPropertyName": "data"
      }
    }
  ]
}
```

**Best Practices**:
- Track sync state (timestamps, cursors)
- Implement conflict resolution strategy
- Use idempotent operations (upserts)
- Log sync results and errors
- Implement data validation
- Consider eventual consistency

---

### 4. API Integration Pattern

**Use Case**: Connect and orchestrate multiple APIs

**Structure**:
```
Trigger → API Call 1 → Transform → API Call 2 → Aggregate → API Call 3 → Response
```

**Key Nodes**:
- **API Calls**: HTTP Request, dedicated API nodes (GitHub, Slack, etc.)
- **Data Flow**: Set, Merge, Code
- **Orchestration**: IF, Switch, Split In Batches

**Example Pattern**:
```json
{
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "api-orchestration",
        "httpMethod": "POST",
        "responseMode": "responseNode"
      }
    },
    {
      "name": "Validate Input",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "language": "javaScript",
        "jsCode": "const required = ['userId', 'action'];\nconst missing = required.filter(f => !$input.first().json[f]);\n\nif (missing.length > 0) {\n  throw new Error(`Missing required fields: ${missing.join(', ')}`);\n}\n\nreturn [$input.first()];"
      }
    },
    {
      "name": "Fetch User Data",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api1.com/users/{{ $json.userId }}",
        "method": "GET"
      }
    },
    {
      "name": "Enrich with Permissions",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api2.com/permissions/{{ $json.userId }}",
        "method": "GET"
      }
    },
    {
      "name": "Merge Data",
      "type": "n8n-nodes-base.merge",
      "parameters": {
        "mode": "combine",
        "mergeByFields": {
          "values": [
            {
              "field1": "userId",
              "field2": "user_id"
            }
          ]
        }
      }
    },
    {
      "name": "Execute Action",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api3.com/actions",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "user",
              "value": "={{ $json }}"
            },
            {
              "name": "action",
              "value": "={{ $('Webhook Trigger').item.json.action }}"
            }
          ]
        }
      }
    },
    {
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}"
      }
    }
  ]
}
```

**Best Practices**:
- Implement request validation
- Use credential references
- Handle rate limiting
- Implement retry logic
- Cache responses where appropriate
- Use webhook responses properly

---

## Node Combination Best Practices

### Data Transformation Combinations

**Pattern 1: Extract → Code → Set → Merge**
- Use Code for complex transformations
- Use Set for simple field mapping
- Use Merge to combine data streams

**Pattern 2: Split In Batches → Loop Processing → Aggregate**
- Process large datasets in chunks
- Prevents memory issues
- Enables progress tracking

```json
{
  "nodes": [
    {
      "name": "Split In Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": {
        "batchSize": 100,
        "options": {}
      }
    },
    {
      "name": "Process Batch",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Process each batch\nreturn items.map(item => ({\n  json: {\n    ...item.json,\n    processed: true,\n    batch: $node.context.currentBatch\n  }\n}));"
      }
    },
    {
      "name": "Aggregate Results",
      "type": "n8n-nodes-base.aggregate",
      "parameters": {
        "aggregate": "aggregateAllItemData",
        "aggregationFunctions": {
          "functionName": [
            {
              "fieldToAggregate": "id",
              "function": "count"
            }
          ]
        }
      }
    }
  ]
}
```

### Conditional Flow Combinations

**Pattern 1: IF → True Path → Merge with False Path**
- Conditional branching
- Rejoin paths for consistent output

**Pattern 2: Switch → Multiple Cases → NoOp for unmatched**
- Multi-way branching
- Default fallback handling

**Pattern 3: Filter → Continue on filtered items**
- Remove unwanted items
- Cleaner than IF for simple conditions

```json
{
  "nodes": [
    {
      "name": "Filter Active Users",
      "type": "n8n-nodes-base.filter",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.active }}",
              "value2": true
            }
          ],
          "dateTime": [
            {
              "value1": "={{ $json.lastLogin }}",
              "operation": "after",
              "value2": "={{ $now.minus({ days: 30 }).toISO() }}"
            }
          ]
        }
      }
    },
    {
      "name": "Switch by Role",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "dataPropertyName": "role",
        "rules": {
          "values": [
            {
              "value": "admin",
              "outputKey": 0
            },
            {
              "value": "user",
              "outputKey": 1
            },
            {
              "value": "guest",
              "outputKey": 2
            }
          ]
        }
      }
    }
  ]
}
```

### Error Recovery Combinations

**Pattern 1: Try Node → Catch Error → Log → Notify**
- Graceful error handling
- Centralized error logging

**Pattern 2: Main Flow → Error Trigger → Remediation Workflow**
- Automatic recovery attempts
- Escalation on repeated failures

---

## Error Handling Patterns

### 1. Try-Catch Pattern

```json
{
  "nodes": [
    {
      "name": "Try",
      "type": "n8n-nodes-base.noOp",
      "parameters": {}
    },
    {
      "name": "Risky Operation",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.example.com/risky",
        "continueOnFail": true
      }
    },
    {
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "parameters": {}
    },
    {
      "name": "Log Error",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const errorData = {\n  timestamp: new Date().toISOString(),\n  workflow: $workflow.name,\n  error: $json.error,\n  node: $json.node,\n  execution: $execution.id\n};\n\nconsole.error('Workflow Error:', errorData);\n\nreturn [{ json: errorData }];"
      }
    },
    {
      "name": "Send Alert",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#errors",
        "text": "Workflow Error: {{ $json.error.message }}"
      }
    }
  ]
}
```

### 2. Retry Pattern with Exponential Backoff

```json
{
  "name": "HTTP with Retry",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "https://api.example.com/data",
    "options": {
      "retry": {
        "maxTries": 5,
        "waitBetweenTries": 1000
      },
      "timeout": 30000
    }
  }
}
```

### 3. Fallback Data Source Pattern

```json
{
  "nodes": [
    {
      "name": "Try Primary API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://primary-api.com/data",
        "continueOnFail": true
      }
    },
    {
      "name": "Check Success",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.error }}",
              "operation": "isEmpty"
            }
          ]
        }
      }
    },
    {
      "name": "Use Fallback API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://fallback-api.com/data"
      }
    }
  ]
}
```

### 4. Dead Letter Queue Pattern

```json
{
  "nodes": [
    {
      "name": "Process Item",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "continueOnFail": true,
        "jsCode": "// Processing logic that might fail"
      }
    },
    {
      "name": "Check for Errors",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.error }}",
              "operation": "isNotEmpty"
            }
          ]
        }
      }
    },
    {
      "name": "Write to DLQ",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "dead_letter_queue",
        "columns": "data,error,timestamp,workflow_id"
      }
    }
  ]
}
```

### Error Handling Best Practices

1. **Always set continueOnFail** for nodes that might fail
2. **Use Error Trigger nodes** for centralized error handling
3. **Log errors with context**: workflow name, execution ID, input data
4. **Implement retry logic** for transient failures
5. **Alert on critical errors** but avoid alert fatigue
6. **Store failed items** for manual review or retry
7. **Use timeouts** to prevent hanging workflows
8. **Validate inputs** before expensive operations

---

## Trigger Types & Usage

### 1. Webhook Trigger

**Use Cases**:
- API endpoints
- External system integrations
- Real-time event processing

**Configuration**:
```json
{
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "httpMethod": "POST",
    "path": "unique-webhook-path",
    "responseMode": "responseNode",
    "options": {
      "rawBody": false,
      "allowedOrigins": "*"
    }
  }
}
```

**Best Practices**:
- Use unique, descriptive paths
- Validate webhook signatures (HMAC)
- Implement rate limiting
- Use responseNode for synchronous responses
- Log all webhook calls

### 2. Schedule Trigger

**Use Cases**:
- Batch processing
- Regular data syncs
- Monitoring checks
- Report generation

**Configuration**:
```json
{
  "name": "Schedule",
  "type": "n8n-nodes-base.scheduleTrigger",
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "cronExpression",
          "expression": "0 */6 * * *"
        }
      ]
    },
    "triggerTimes": {
      "mode": "everyX",
      "value": 6,
      "unit": "hours"
    }
  }
}
```

**Cron Examples**:
- `0 0 * * *` - Daily at midnight
- `*/15 * * * *` - Every 15 minutes
- `0 9 * * 1-5` - Weekdays at 9 AM
- `0 0 1 * *` - First day of month

**Best Practices**:
- Use cron for complex schedules
- Consider timezone settings
- Avoid resource-intensive tasks during peak hours
- Implement execution history tracking

### 3. Manual Trigger

**Use Cases**:
- Testing workflows
- One-time operations
- Admin tasks

**Configuration**:
```json
{
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "parameters": {}
}
```

**Best Practices**:
- Use for development and testing
- Combine with other triggers for production
- Document required manual inputs

### 4. Email Trigger (IMAP)

**Use Cases**:
- Email-based automation
- Support ticket creation
- Document processing from email

**Configuration**:
```json
{
  "name": "Email Trigger",
  "type": "n8n-nodes-base.emailReadImap",
  "parameters": {
    "mailbox": "INBOX",
    "format": "resolved",
    "options": {
      "customEmailConfig": "imap.gmail.com:993:true"
    }
  }
}
```

**Best Practices**:
- Use filters to reduce noise
- Archive processed emails
- Extract attachments when needed
- Implement spam detection

### 5. File Trigger

**Use Cases**:
- File upload processing
- Directory monitoring
- Document workflows

**Configuration**:
```json
{
  "name": "File Trigger",
  "type": "n8n-nodes-base.localFileTrigger",
  "parameters": {
    "path": "/data/uploads",
    "event": "add"
  }
}
```

**Best Practices**:
- Monitor specific directories
- Move/archive processed files
- Validate file types and sizes
- Handle file locking

### 6. Custom Webhook vs API Endpoint

**Webhook**: External systems push data to n8n
**API Endpoint**: n8n exposes synchronous API

**Use Webhook when**:
- Receiving events from external systems
- Asynchronous processing is acceptable
- You need to respond quickly

**Use responseNode when**:
- Building synchronous APIs
- Need to return processed data
- Client waits for response

---

## Credential Management

### 1. Credential Types

**Pre-defined Credentials**:
- OAuth2 (GitHub, Google, Slack)
- API Keys
- Basic Auth
- Header Auth
- JWT

**Custom Credentials**:
- Database connections
- SSH keys
- TLS certificates

### 2. Credential Security Best Practices

**Storage**:
- Use n8n's built-in credential encryption
- Never hardcode credentials in workflows
- Use environment variables for sensitive config

**Access Control**:
- Limit credential sharing
- Use separate credentials per environment
- Rotate credentials regularly

**Example Credential Usage**:
```json
{
  "name": "API Call",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth"
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "1",
      "name": "Production API Key"
    }
  }
}
```

### 3. Environment-Specific Credentials

**Development**:
```json
{
  "name": "Dev Database",
  "credentials": {
    "postgres": {
      "id": "dev-db-cred",
      "name": "Dev Postgres"
    }
  }
}
```

**Production**:
```json
{
  "name": "Prod Database",
  "credentials": {
    "postgres": {
      "id": "prod-db-cred",
      "name": "Prod Postgres"
    }
  }
}
```

### 4. Credential Rotation Pattern

```json
{
  "nodes": [
    {
      "name": "Check Credential Age",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const credentialAge = Date.now() - new Date($env.CREDENTIAL_CREATED_AT).getTime();\nconst maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days\n\nreturn [{ json: { needsRotation: credentialAge > maxAge } }];"
      }
    },
    {
      "name": "Alert Admin",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#security",
        "text": "Credential rotation needed: {{ $workflow.name }}"
      }
    }
  ]
}
```

### 5. Secrets Management Integration

For cortex ecosystem:
- Use Talos secrets for Kubernetes credentials
- Use Ansible vault for infrastructure credentials
- Use n8n credential sharing for workflow credentials

---

## Performance Optimization

### 1. Batch Processing

**Problem**: Processing large datasets consumes memory

**Solution**: Use Split In Batches

```json
{
  "name": "Split In Batches",
  "type": "n8n-nodes-base.splitInBatches",
  "parameters": {
    "batchSize": 100,
    "options": {
      "reset": false
    }
  }
}
```

**Best Practices**:
- Batch size 50-200 items
- Use reset: false for streaming
- Process batches in parallel when possible

### 2. Parallel Execution

**Pattern**: Fan-out, process, fan-in

```json
{
  "nodes": [
    {
      "name": "Split Items",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": {
        "batchSize": 10
      }
    },
    {
      "name": "Process Parallel 1",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Process Parallel 2",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Merge Results",
      "type": "n8n-nodes-base.merge",
      "parameters": {
        "mode": "combine"
      }
    }
  ]
}
```

### 3. Caching Strategies

**In-memory caching**:
```javascript
// Use workflow static data for caching
const cache = $workflow.staticData;

if (!cache.userData || Date.now() - cache.lastFetch > 3600000) {
  // Fetch fresh data
  const userData = await fetchUserData();
  cache.userData = userData;
  cache.lastFetch = Date.now();
}

return [{ json: cache.userData }];
```

**Redis caching**:
```json
{
  "name": "Check Cache",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "get",
    "key": "cache:{{ $json.userId }}"
  }
}
```

### 4. Query Optimization

**Database queries**:
- Use indexes on filtered columns
- Limit result sets
- Use pagination
- Avoid SELECT *

```json
{
  "name": "Optimized Query",
  "type": "n8n-nodes-base.postgres",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT id, name, email FROM users WHERE created_at > $1 LIMIT 1000",
    "additionalFields": {
      "queryParameters": "={{ $now.minus({ days: 7 }).toISO() }}"
    }
  }
}
```

### 5. HTTP Request Optimization

**Best Practices**:
- Use connection pooling
- Implement timeouts
- Enable compression
- Use HTTP/2 when available

```json
{
  "name": "Optimized HTTP",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "url": "https://api.example.com/data",
    "options": {
      "timeout": 30000,
      "retry": {
        "maxTries": 3,
        "waitBetweenTries": 1000
      },
      "batching": {
        "batch": {
          "batchSize": 10,
          "batchInterval": 1000
        }
      }
    }
  }
}
```

### 6. Memory Management

**Avoid**:
- Loading entire files into memory
- Storing large binaries in JSON
- Accumulating data in loops

**Instead**:
- Stream file processing
- Use binary data type
- Clear data after processing

```javascript
// Good: Stream processing
const stream = require('stream');
const fs = require('fs');

const readStream = fs.createReadStream('/large-file.csv');
const processStream = new stream.Transform({
  transform(chunk, encoding, callback) {
    // Process chunk
    callback(null, processedChunk);
  }
});

readStream.pipe(processStream);
```

### 7. Execution Timeouts

Set appropriate timeouts:
- HTTP requests: 30 seconds
- Database queries: 60 seconds
- Long-running processes: 5-10 minutes

```json
{
  "settings": {
    "executionTimeout": 300,
    "saveExecutionProgress": true
  }
}
```

---

## Example Workflow Structures

### 1. Complete ETL Workflow

```json
{
  "name": "ETL Pipeline - Sales Data",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{"field": "hours", "hoursInterval": 6}]
        }
      },
      "name": "Every 6 Hours",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "https://api.salesystem.com/sales",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "qs": {
          "start_date": "={{ $now.minus({ hours: 6 }).toISO() }}",
          "end_date": "={{ $now.toISO() }}"
        }
      },
      "name": "Fetch Sales Data",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [450, 300]
    },
    {
      "parameters": {
        "batchSize": 100
      },
      "name": "Split In Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 1,
      "position": [650, 300]
    },
    {
      "parameters": {
        "mode": "runOnceForEachItem",
        "language": "javaScript",
        "jsCode": "const sale = $input.item.json;\n\nreturn {\n  json: {\n    sale_id: sale.id,\n    amount: parseFloat(sale.total),\n    customer_id: sale.customer.id,\n    customer_name: `${sale.customer.first_name} ${sale.customer.last_name}`,\n    product_ids: sale.items.map(i => i.product_id),\n    sale_date: new Date(sale.created_at).toISOString(),\n    processed_at: new Date().toISOString(),\n    source: 'api'\n  }\n};"
      },
      "name": "Transform Sale",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [850, 300]
    },
    {
      "parameters": {
        "operation": "insert",
        "table": "sales",
        "columns": "sale_id,amount,customer_id,customer_name,product_ids,sale_date,processed_at,source",
        "options": {
          "onConflict": "doNothing"
        }
      },
      "name": "Insert to Database",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2,
      "position": [1050, 300],
      "credentials": {
        "postgres": {
          "id": "1",
          "name": "Analytics DB"
        }
      }
    },
    {
      "parameters": {
        "aggregate": "aggregateAllItemData",
        "fieldsToAggregate": {
          "fieldToAggregate": [
            {
              "fieldToAggregate": "amount",
              "aggregation": "sum",
              "outputFieldName": "total_amount"
            },
            {
              "fieldToAggregate": "sale_id",
              "aggregation": "count",
              "outputFieldName": "total_sales"
            }
          ]
        }
      },
      "name": "Aggregate Metrics",
      "type": "n8n-nodes-base.aggregate",
      "typeVersion": 1,
      "position": [1250, 300]
    },
    {
      "parameters": {
        "channel": "#sales-metrics",
        "text": "ETL Complete",
        "attachments": [
          {
            "color": "#00cc00",
            "fields": {
              "item": [
                {
                  "short": true,
                  "title": "Total Sales",
                  "value": "={{ $json.total_sales }}"
                },
                {
                  "short": true,
                  "title": "Total Amount",
                  "value": "$={{ $json.total_amount.toFixed(2) }}"
                }
              ]
            }
          }
        ]
      },
      "name": "Notify Success",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1450, 300]
    },
    {
      "parameters": {},
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "typeVersion": 1,
      "position": [850, 500]
    },
    {
      "parameters": {
        "channel": "#alerts",
        "text": "ETL FAILED",
        "attachments": [
          {
            "color": "#cc0000",
            "fields": {
              "item": [
                {
                  "short": false,
                  "title": "Error",
                  "value": "={{ $json.error.message }}"
                },
                {
                  "short": false,
                  "title": "Node",
                  "value": "={{ $json.node.name }}"
                }
              ]
            }
          }
        ]
      },
      "name": "Alert Failure",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1050, 500]
    }
  ],
  "connections": {
    "Every 6 Hours": {
      "main": [[{"node": "Fetch Sales Data", "type": "main", "index": 0}]]
    },
    "Fetch Sales Data": {
      "main": [[{"node": "Split In Batches", "type": "main", "index": 0}]]
    },
    "Split In Batches": {
      "main": [[{"node": "Transform Sale", "type": "main", "index": 0}]]
    },
    "Transform Sale": {
      "main": [[{"node": "Insert to Database", "type": "main", "index": 0}]]
    },
    "Insert to Database": {
      "main": [[{"node": "Split In Batches", "type": "main", "index": 0}]]
    },
    "Split In Batches": {
      "main": [null, [{"node": "Aggregate Metrics", "type": "main", "index": 0}]]
    },
    "Aggregate Metrics": {
      "main": [[{"node": "Notify Success", "type": "main", "index": 0}]]
    },
    "Error Trigger": {
      "main": [[{"node": "Alert Failure", "type": "main", "index": 0}]]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

### 2. Multi-Channel Alert System

```json
{
  "name": "Infrastructure Monitoring & Alerts",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{"field": "minutes", "minutesInterval": 5}]
        }
      },
      "name": "Every 5 Minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "http://prometheus:9090/api/v1/query",
        "qs": {
          "query": "up{job='node-exporter'}"
        }
      },
      "name": "Check Node Status",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300]
    },
    {
      "parameters": {
        "conditions": {
          "number": [
            {
              "value1": "={{ $json.data.result.length }}",
              "operation": "smaller",
              "value2": 3
            }
          ]
        }
      },
      "name": "Nodes Down?",
      "type": "n8n-nodes-base.if",
      "position": [650, 300]
    },
    {
      "parameters": {
        "channel": "#critical-alerts",
        "text": "CRITICAL: Infrastructure nodes down"
      },
      "name": "Slack Alert",
      "type": "n8n-nodes-base.slack",
      "position": [850, 200]
    },
    {
      "parameters": {
        "to": "oncall@company.com",
        "subject": "CRITICAL: Infrastructure Alert",
        "text": "Multiple nodes down. Investigate immediately."
      },
      "name": "Email Alert",
      "type": "n8n-nodes-base.emailSend",
      "position": [850, 300]
    },
    {
      "parameters": {
        "service_key": "={{ $env.PAGERDUTY_KEY }}",
        "event_action": "trigger",
        "description": "Infrastructure nodes down"
      },
      "name": "PagerDuty",
      "type": "n8n-nodes-base.httpRequest",
      "position": [850, 400]
    }
  ]
}
```

### 3. Data Sync with Conflict Resolution

```json
{
  "name": "Bidirectional User Sync",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{"field": "hours", "hoursInterval": 1}]
        }
      },
      "name": "Hourly Sync",
      "type": "n8n-nodes-base.scheduleTrigger",
      "position": [250, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM sync_state WHERE sync_type = 'users' ORDER BY last_sync DESC LIMIT 1"
      },
      "name": "Get Last Sync",
      "type": "n8n-nodes-base.postgres",
      "position": [450, 300]
    },
    {
      "parameters": {
        "url": "https://system-a.com/api/users",
        "qs": {
          "updated_since": "={{ $json.last_sync }}"
        }
      },
      "name": "Fetch System A Changes",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 200]
    },
    {
      "parameters": {
        "url": "https://system-b.com/api/users",
        "qs": {
          "updated_since": "={{ $('Get Last Sync').item.json.last_sync }}"
        }
      },
      "name": "Fetch System B Changes",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 400]
    },
    {
      "parameters": {
        "mode": "combine",
        "combineBy": "combineByPosition"
      },
      "name": "Merge Changes",
      "type": "n8n-nodes-base.merge",
      "position": [850, 300]
    },
    {
      "parameters": {
        "jsCode": "// Conflict resolution logic\nconst systemA = $input.item.json[0];\nconst systemB = $input.item.json[1];\n\nif (systemA.updated_at > systemB.updated_at) {\n  return { json: { winner: 'A', data: systemA, loser: systemB } };\n} else {\n  return { json: { winner: 'B', data: systemB, loser: systemA } };\n}"
      },
      "name": "Resolve Conflicts",
      "type": "n8n-nodes-base.code",
      "position": [1050, 300]
    },
    {
      "parameters": {
        "operation": "insert",
        "table": "sync_state",
        "columns": "sync_type,last_sync,records_synced"
      },
      "name": "Update Sync State",
      "type": "n8n-nodes-base.postgres",
      "position": [1250, 300]
    }
  ]
}
```

---

## Integration Patterns

### 1. Talos Kubernetes Integration

**Use Case**: Deploy applications, manage nodes, update configurations

**Pattern**: n8n → Talos MCP → Kubernetes API

```json
{
  "nodes": [
    {
      "name": "Deploy to Kubernetes",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://talos-mcp-server:3000/apply-manifest",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "manifest",
              "value": "={{ $json.k8s_manifest }}"
            },
            {
              "name": "namespace",
              "value": "production"
            }
          ]
        }
      }
    },
    {
      "name": "Check Deployment Status",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://talos-mcp-server:3000/get-deployment",
        "qs": {
          "name": "{{ $json.deployment_name }}",
          "namespace": "production"
        }
      }
    },
    {
      "name": "Wait for Ready",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 30,
        "unit": "seconds"
      }
    }
  ]
}
```

**Common Talos Operations**:
- Apply manifests
- Scale deployments
- Update node configurations
- Manage secrets
- Monitor cluster health

### 2. Proxmox VM Management Integration

**Use Case**: Automate VM provisioning and management

**Pattern**: n8n → Proxmox MCP → Proxmox API

```json
{
  "nodes": [
    {
      "name": "Create VM",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://proxmox-mcp-server:3000/create-vm",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "vmid",
              "value": "={{ $json.vm_id }}"
            },
            {
              "name": "name",
              "value": "{{ $json.vm_name }}"
            },
            {
              "name": "cores",
              "value": 4
            },
            {
              "name": "memory",
              "value": 8192
            },
            {
              "name": "disk",
              "value": "50G"
            }
          ]
        }
      }
    },
    {
      "name": "Start VM",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://proxmox-mcp-server:3000/start-vm/{{ $json.vmid }}"
      }
    },
    {
      "name": "Wait for Boot",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 60
      }
    },
    {
      "name": "Configure with Ansible",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://ansible-mcp-server:3000/run-playbook",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "playbook",
              "value": "configure-vm.yml"
            },
            {
              "name": "inventory",
              "value": "={{ $json.vm_ip }}"
            }
          ]
        }
      }
    }
  ]
}
```

### 3. Ansible Configuration Management Integration

**Use Case**: Run playbooks, manage inventory, configure systems

**Pattern**: n8n → Ansible MCP → Ansible Engine

```json
{
  "nodes": [
    {
      "name": "Run Ansible Playbook",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://ansible-mcp-server:3000/run-playbook",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "playbook",
              "value": "site.yml"
            },
            {
              "name": "inventory",
              "value": "production"
            },
            {
              "name": "extra_vars",
              "value": "={{ JSON.stringify($json.variables) }}"
            },
            {
              "name": "tags",
              "value": "deploy,configure"
            }
          ]
        }
      }
    },
    {
      "name": "Check Playbook Status",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://ansible-mcp-server:3000/playbook-status/{{ $json.run_id }}"
      }
    },
    {
      "name": "Parse Results",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const results = $input.item.json;\n\nreturn {\n  json: {\n    success: results.stats.failures === 0,\n    changed: results.stats.changed,\n    failed: results.stats.failures,\n    tasks: results.tasks.map(t => ({\n      name: t.name,\n      status: t.status,\n      changed: t.changed\n    }))\n  }\n};"
      }
    }
  ]
}
```

### 4. Unified Infrastructure Workflow

**Complete automation**: Provision VM → Configure OS → Deploy K8s → Deploy App

```json
{
  "name": "Complete Infrastructure Deployment",
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "deploy-infrastructure"
      }
    },
    {
      "name": "Validate Request",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const required = ['app_name', 'vm_count', 'environment'];\nconst missing = required.filter(f => !$input.first().json[f]);\n\nif (missing.length > 0) {\n  throw new Error(`Missing: ${missing.join(', ')}`);\n}\n\nreturn [$input.first()];"
      }
    },
    {
      "name": "Create VMs (Proxmox)",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://proxmox-mcp:3000/create-vms",
        "method": "POST"
      }
    },
    {
      "name": "Wait for VMs",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 120
      }
    },
    {
      "name": "Configure OS (Ansible)",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://ansible-mcp:3000/run-playbook",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "playbook",
              "value": "bootstrap-nodes.yml"
            }
          ]
        }
      }
    },
    {
      "name": "Bootstrap Kubernetes (Talos)",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://talos-mcp:3000/bootstrap-cluster",
        "method": "POST"
      }
    },
    {
      "name": "Wait for Cluster Ready",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 300
      }
    },
    {
      "name": "Deploy Application",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://talos-mcp:3000/apply-manifest",
        "method": "POST"
      }
    },
    {
      "name": "Verify Deployment",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://talos-mcp:3000/get-pods",
        "qs": {
          "namespace": "{{ $json.environment }}"
        }
      }
    },
    {
      "name": "Notify Success",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#deployments",
        "text": "Deployment complete: {{ $('Webhook Trigger').item.json.app_name }}"
      }
    },
    {
      "name": "Error Handler",
      "type": "n8n-nodes-base.errorTrigger"
    },
    {
      "name": "Rollback",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Implement rollback logic\n// 1. Delete K8s resources\n// 2. Destroy VMs\n// 3. Clean up DNS/networking"
      }
    },
    {
      "name": "Alert Failure",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#alerts",
        "text": "Deployment FAILED"
      }
    }
  ]
}
```

### 5. MCP Server Communication Patterns

**Request/Response**:
```javascript
// n8n to MCP server
const response = await fetch('http://mcp-server:3000/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'deploy',
    params: { ... }
  })
});

const result = await response.json();
return [{ json: result }];
```

**Async Operations with Status Polling**:
```json
{
  "nodes": [
    {
      "name": "Start Long Operation",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://mcp-server:3000/start-operation"
      }
    },
    {
      "name": "Poll Status",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://mcp-server:3000/operation-status/{{ $json.operation_id }}"
      }
    },
    {
      "name": "Wait",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 10
      }
    },
    {
      "name": "Check Complete",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.status }}",
              "operation": "notEqual",
              "value2": "complete"
            }
          ]
        }
      }
    }
  ]
}
```

---

## Testing & Debugging

### 1. Workflow Testing Strategies

**Unit Testing Individual Nodes**:
```json
{
  "name": "Test Transform Logic",
  "nodes": [
    {
      "name": "Test Data",
      "type": "n8n-nodes-base.manualTrigger",
      "parameters": {}
    },
    {
      "name": "Mock Input",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "return [\n  { json: { id: 1, name: 'Test User', email: 'test@example.com' } },\n  { json: { id: 2, name: 'Another User', email: 'another@example.com' } }\n];"
      }
    },
    {
      "name": "Transform Under Test",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Your transformation logic"
      }
    },
    {
      "name": "Assert Results",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const results = $input.all();\n\nif (results.length !== 2) {\n  throw new Error(`Expected 2 items, got ${results.length}`);\n}\n\nif (!results[0].json.full_name) {\n  throw new Error('Missing full_name field');\n}\n\nreturn [{ json: { test: 'PASSED' } }];"
      }
    }
  ]
}
```

### 2. Debugging Techniques

**Logging**:
```javascript
// Detailed logging
console.log('Processing item:', JSON.stringify($input.item, null, 2));
console.log('Workflow context:', {
  workflowName: $workflow.name,
  executionId: $execution.id,
  nodeName: $node.name
});

// Log to external service
await fetch('http://logging-service/log', {
  method: 'POST',
  body: JSON.stringify({
    level: 'debug',
    workflow: $workflow.name,
    data: $json
  })
});
```

**Breakpoints (NoOp nodes)**:
```json
{
  "name": "DEBUG CHECKPOINT",
  "type": "n8n-nodes-base.noOp",
  "parameters": {}
}
```

**Data Inspection**:
```javascript
// Pretty print data
const inspect = require('util').inspect;
console.log(inspect($input.all(), { depth: null, colors: true }));

// Count items at each stage
console.log(`Items received: ${$input.all().length}`);
console.log(`First item keys: ${Object.keys($input.first().json)}`);
```

### 3. Error Reproduction

```json
{
  "name": "Error Replay",
  "nodes": [
    {
      "name": "Load Failed Execution",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://n8n:5678/api/v1/executions/{{ $json.execution_id }}"
      }
    },
    {
      "name": "Extract Failed Input",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const execution = $input.item.json;\nconst failedNode = execution.data.resultData.error.node;\nconst failedInput = execution.data.resultData.runData[failedNode];\n\nreturn [{ json: failedInput }];"
      }
    },
    {
      "name": "Replay Failed Node",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Replicate the failed node logic here"
      }
    }
  ]
}
```

### 4. Performance Profiling

```javascript
// Measure execution time
const startTime = Date.now();

// Your processing logic here
const results = await processData($input.all());

const duration = Date.now() - startTime;

console.log(`Processing took ${duration}ms for ${$input.all().length} items`);
console.log(`Average: ${(duration / $input.all().length).toFixed(2)}ms per item`);

return results;
```

### 5. Integration Testing

```json
{
  "name": "End-to-End Test",
  "nodes": [
    {
      "name": "Setup Test Data",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Trigger Workflow Under Test",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://n8n:5678/webhook/workflow-under-test",
        "method": "POST"
      }
    },
    {
      "name": "Wait for Completion",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 30
      }
    },
    {
      "name": "Verify Results",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM results WHERE test_id = $1"
      }
    },
    {
      "name": "Cleanup Test Data",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "DELETE FROM test_data WHERE test_id = $1"
      }
    }
  ]
}
```

---

## Advanced Patterns

### 1. State Machine Workflow

```json
{
  "name": "Order Processing State Machine",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook"
    },
    {
      "name": "Load Current State",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT state FROM orders WHERE id = $1"
      }
    },
    {
      "name": "State Router",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "dataPropertyName": "state",
        "rules": {
          "values": [
            {"value": "pending", "outputKey": 0},
            {"value": "processing", "outputKey": 1},
            {"value": "shipped", "outputKey": 2},
            {"value": "delivered", "outputKey": 3}
          ]
        }
      }
    },
    {
      "name": "Process Pending",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Process Processing",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Process Shipped",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Process Delivered",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Update State",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "update",
        "table": "orders",
        "where": "id = {{ $json.order_id }}",
        "columns": "state,updated_at"
      }
    }
  ]
}
```

### 2. Event Sourcing Pattern

```json
{
  "name": "Event Sourced Order System",
  "nodes": [
    {
      "name": "Receive Event",
      "type": "n8n-nodes-base.webhook"
    },
    {
      "name": "Validate Event",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const event = $input.item.json;\nconst required = ['event_type', 'aggregate_id', 'data'];\n\nif (!required.every(f => event[f])) {\n  throw new Error('Invalid event structure');\n}\n\nreturn [{\n  json: {\n    ...event,\n    event_id: $workflow.id + '-' + Date.now(),\n    timestamp: new Date().toISOString()\n  }\n}];"
      }
    },
    {
      "name": "Append to Event Store",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "events",
        "columns": "event_id,event_type,aggregate_id,data,timestamp"
      }
    },
    {
      "name": "Project to Read Model",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Update read model based on event type\nconst event = $input.item.json;\n\nswitch(event.event_type) {\n  case 'OrderCreated':\n    return [{ json: { operation: 'insert', table: 'orders', data: event.data } }];\n  case 'OrderUpdated':\n    return [{ json: { operation: 'update', table: 'orders', data: event.data } }];\n  case 'OrderCancelled':\n    return [{ json: { operation: 'delete', table: 'orders', id: event.aggregate_id } }];\n  default:\n    throw new Error(`Unknown event type: ${event.event_type}`);\n}"
      }
    },
    {
      "name": "Update Read Model",
      "type": "n8n-nodes-base.postgres"
    }
  ]
}
```

### 3. SAGA Pattern (Distributed Transactions)

```json
{
  "name": "Order SAGA",
  "nodes": [
    {
      "name": "Start SAGA",
      "type": "n8n-nodes-base.webhook"
    },
    {
      "name": "Reserve Inventory",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "continueOnFail": true
      }
    },
    {
      "name": "Check Inventory Result",
      "type": "n8n-nodes-base.if"
    },
    {
      "name": "Process Payment",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "continueOnFail": true
      }
    },
    {
      "name": "Check Payment Result",
      "type": "n8n-nodes-base.if"
    },
    {
      "name": "Create Shipment",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "name": "SAGA Success",
      "type": "n8n-nodes-base.code"
    },
    {
      "name": "Compensate Payment",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://payment-service/refund"
      }
    },
    {
      "name": "Compensate Inventory",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://inventory-service/release"
      }
    },
    {
      "name": "SAGA Failed",
      "type": "n8n-nodes-base.code"
    }
  ]
}
```

### 4. Circuit Breaker Pattern

```javascript
// Circuit breaker implementation in Code node
const circuitState = $workflow.staticData.circuitBreaker || {
  state: 'closed',
  failures: 0,
  lastFailTime: null,
  threshold: 5,
  timeout: 60000 // 1 minute
};

if (circuitState.state === 'open') {
  const timeSinceLastFail = Date.now() - circuitState.lastFailTime;

  if (timeSinceLastFail > circuitState.timeout) {
    circuitState.state = 'half-open';
  } else {
    throw new Error('Circuit breaker is OPEN - rejecting request');
  }
}

try {
  // Attempt the operation
  const result = await makeApiCall();

  // Success - reset circuit breaker
  circuitState.failures = 0;
  circuitState.state = 'closed';

  $workflow.staticData.circuitBreaker = circuitState;

  return [{ json: result }];

} catch (error) {
  // Failure - increment counter
  circuitState.failures++;
  circuitState.lastFailTime = Date.now();

  if (circuitState.failures >= circuitState.threshold) {
    circuitState.state = 'open';
  }

  $workflow.staticData.circuitBreaker = circuitState;

  throw error;
}
```

### 5. Rate Limiting Pattern

```javascript
// Token bucket rate limiter
const rateLimiter = $workflow.staticData.rateLimiter || {
  tokens: 100,
  maxTokens: 100,
  refillRate: 10, // tokens per second
  lastRefill: Date.now()
};

// Refill tokens
const now = Date.now();
const timePassed = (now - rateLimiter.lastRefill) / 1000;
const tokensToAdd = timePassed * rateLimiter.refillRate;

rateLimiter.tokens = Math.min(
  rateLimiter.maxTokens,
  rateLimiter.tokens + tokensToAdd
);
rateLimiter.lastRefill = now;

// Check if request can proceed
if (rateLimiter.tokens < 1) {
  throw new Error('Rate limit exceeded - please retry later');
}

// Consume token
rateLimiter.tokens -= 1;

$workflow.staticData.rateLimiter = rateLimiter;

// Proceed with request
return [$input.first()];
```

---

## Best Practices Summary

### Workflow Design
1. Keep workflows focused on single responsibilities
2. Use descriptive node names
3. Document complex logic with NoOp nodes
4. Implement proper error handling
5. Use workflow settings appropriately

### Performance
1. Batch large datasets (100-200 items)
2. Use parallel execution where possible
3. Implement caching for repeated data access
4. Set appropriate timeouts
5. Monitor workflow execution times

### Security
1. Use credential management - never hardcode secrets
2. Validate all external inputs
3. Implement authentication on webhooks
4. Rotate credentials regularly
5. Use HTTPS for external communications

### Maintainability
1. Version control workflow JSON
2. Document workflow purpose and dependencies
3. Use consistent naming conventions
4. Implement comprehensive logging
5. Create reusable sub-workflows

### Testing
1. Test with production-like data volumes
2. Implement error scenarios testing
3. Validate all edge cases
4. Use manual triggers for testing
5. Monitor workflow executions

---

## Conclusion

This knowledge base provides comprehensive patterns and practices for building robust n8n workflows in the cortex ecosystem. Use these patterns as templates and adapt them to your specific use cases.

**Key Takeaways**:
- Always implement error handling
- Design for scalability with batching
- Integrate with MCP servers for infrastructure automation
- Test thoroughly before production deployment
- Monitor and log all workflow executions
- Keep credentials secure
- Document complex workflows

For additional support:
- n8n Documentation: https://docs.n8n.io
- MCP Specifications: See coordination/contractors/
- Cortex Architecture: See coordination/divisions/

**Version Control**: Track this knowledge base in git and update as new patterns emerge.
