# n8n-contractor Quick Reference

## When to Use n8n-contractor

Use the n8n-contractor when you need to:
- Build automation workflows in n8n
- Design integration architectures
- Implement event-driven systems
- Create scheduled data pipelines
- Set up webhook processing
- Optimize existing workflows

## Available Workflow Patterns

| Pattern | Use Case | Complexity |
|---------|----------|------------|
| **etl_pipeline** | Data sync, imports, warehouse loading | Medium |
| **webhook_processor** | GitHub/payment webhooks, events | Medium |
| **scheduled_automation** | Reports, cleanups, monitoring | Low |
| **bidirectional_sync** | Multi-system consistency | High |
| **data_aggregation** | Analytics, reporting, KPIs | Medium |

## Quick Start Examples

### Request a Simple Webhook Workflow
```
"Create an n8n workflow that receives GitHub issue webhooks and posts new issues to Slack #engineering channel"
```

### Request an ETL Pipeline
```
"Build a daily ETL workflow that syncs Salesforce contacts to PostgreSQL with deduplication and error alerting"
```

### Request Event Processing
```
"Design a workflow to receive Stripe payment webhooks, validate them, store in database, and trigger fulfillment workflow"
```

## Common Node Patterns

### Data Transformation
```
Simple mapping → Use Set node
JavaScript logic → Use Function node
Complex multi-step → Use Code node
Array operations → Use Item Lists node
```

### Error Handling
```
Retry API calls → Function with exponential backoff
Failed items → Dead letter queue (database table)
Critical errors → Slack/PagerDuty alerts
Validation → Function node with throw on invalid
```

### Authentication
```
API keys → HTTP Request with credentials
Webhook HMAC → Function node signature verification
OAuth → Use integration node credentials
```

## Knowledge Base Contents

The contractor knows about:
- 5 workflow architecture patterns
- 5 node recommendation categories
- 5 error handling strategies
- 5 integration pattern types
- Security best practices
- Performance optimization techniques
- Testing strategies
- Deployment patterns
- Reusable code snippets

## MCP Server Tools Available

The contractor can use these n8n-mcp-server tools:
- `create_workflow` - Build new workflows
- `get_workflow` - Inspect existing workflows
- `update_workflow` - Modify workflows
- `delete_workflow` - Remove workflows
- `list_workflows` - Discovery and inventory
- `execute_workflow` - Test execution
- `get_executions` - Debug and monitoring

## Response Format

When you request workflow design, you'll get:
1. **Architecture Design** - Overall workflow structure
2. **Node Specifications** - Detailed node configurations
3. **Error Handling** - Retry and recovery strategies
4. **Code Snippets** - Function node implementations
5. **Implementation** - MCP tool calls to create workflow
6. **Testing Plan** - How to validate the workflow

## Integration with Cortex

### Handoff Pattern
```
User Request → Development Master → n8n-contractor
                     ↓
            Workflow Implementation
                     ↓
              CI/CD Master (deploy)
                     ↓
            Inventory Master (document)
```

### Knowledge Base Updates
After successful implementations, patterns are recorded in:
`/Users/ryandahlberg/Projects/cortex/coordination/contractors/n8n-contractor-knowledge.json`

## Best Practices Checklist

Before requesting workflow:
- [ ] Define clear inputs and outputs
- [ ] Identify error scenarios
- [ ] Specify execution trigger (webhook, schedule, manual)
- [ ] Consider data volume and performance
- [ ] Plan for monitoring and alerting

Contractor will ensure:
- [ ] Descriptive node names
- [ ] Error handling on critical paths
- [ ] Credentials (not hardcoded)
- [ ] Input validation
- [ ] Logging and monitoring
- [ ] Performance optimization
- [ ] Documentation

## Common Mistakes to Avoid

The contractor prevents these anti-patterns:
- Monolithic 50+ node workflows
- Missing error handling
- Hardcoded credentials
- Inefficient data processing
- Poor naming conventions
- No monitoring or alerting
- Missing webhook security
- No input validation

## Example Interaction

**You**: "I need a workflow that polls our API every hour for new orders and creates Jira tickets for each order"

**n8n-contractor provides**:
1. Pattern: scheduled_automation + api_calls
2. Architecture: Schedule → Poll API → Filter new orders → Create Jira tickets
3. Nodes: Schedule Trigger → HTTP Request → Function (filter) → Split In Batches → Jira
4. Error handling: Retry logic, dead letter queue for failed tickets
5. Code: Polling with cursor/timestamp, deduplication logic
6. Implementation: MCP create_workflow call with full specification

## Performance Guidelines

| Data Volume | Recommendation |
|-------------|---------------|
| < 100 items | Process all at once |
| 100-1000 items | Use Split In Batches (100) |
| > 1000 items | Pagination + cursor tracking |
| Continuous stream | Webhook + async processing |

## Security Checklist

- [ ] Webhook signature validation (HMAC)
- [ ] API credentials in credential manager
- [ ] Input sanitization and validation
- [ ] Rate limiting on public endpoints
- [ ] HTTPS only
- [ ] IP whitelisting where applicable
- [ ] PII handling compliance

## Resources

- **Agent Definition**: `/Users/ryandahlberg/Projects/cortex/coordination/contractors/n8n-contractor.md`
- **Knowledge Base**: `/Users/ryandahlberg/Projects/cortex/coordination/contractors/n8n-contractor-knowledge.json`
- **n8n Docs**: https://docs.n8n.io
- **MCP Server**: n8n-mcp-server (via Claude Desktop)

## Support

For complex workflows or architectural questions:
1. Provide detailed requirements
2. Specify constraints (performance, security, compliance)
3. Mention existing systems to integrate
4. State monitoring and alerting needs

The contractor will design a production-ready solution with best practices built-in.

---

**Version**: 1.0.0
**Last Updated**: 2025-12-09
