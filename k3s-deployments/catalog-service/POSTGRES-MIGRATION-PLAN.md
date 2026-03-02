# Cortex PostgreSQL Migration Plan
## 30-Minute Execution Timeline

**Version**: 1.0
**Date**: 2025-12-21
**Status**: Ready for Execution
**Target Duration**: 30 minutes
**Parallel Execution**: 7 Masters + 16 Workers

---

## Executive Summary

### Challenge
Traditional IT departments require 2-4 weeks to plan and execute a database migration:
- Week 1: Architecture meetings, stakeholder approvals
- Week 2: Infrastructure provisioning, testing
- Week 3: Migration scripts, validation
- Week 4: Staged rollout, monitoring

**Cortex Timeline**: 30 minutes from plan to production-ready PostgreSQL cluster.

### Objectives

**Primary Goals**:
- Deploy production-ready PostgreSQL cluster in K3s
- Migrate all JSON coordination data to relational database
- Establish Redis ↔ PostgreSQL hybrid architecture
- Zero data loss, zero downtime for catalog service
- Full audit trail and compliance logging

**Success Criteria**:
- ✅ PostgreSQL StatefulSet running in cortex-system namespace
- ✅ 20GB persistent volume attached
- ✅ Complete schema deployed (agents, tasks, assets, audit logs)
- ✅ All existing data migrated from JSON files
- ✅ Sync middleware operational
- ✅ Monitoring integrated (Prometheus/Grafana)
- ✅ Backup strategy implemented
- ✅ Total execution time ≤ 30 minutes

---

## Architecture Overview

### Current State
```
JSON Files (Source of Truth)
  ├── coordination/status.json
  ├── coordination/task-queue.json
  ├── coordination/worker-pool.json
  ├── coordination/repository-inventory.json
  └── agents/*/status.json

Redis (Cache Only)
  └── catalog:assets (42 assets, 500x faster than file-based)
```

### Target State
```
PostgreSQL (Source of Truth - Permanent)
  ├── agents (masters, workers, observers)
  ├── tasks (with full lineage tracking)
  ├── assets (catalog with full-text search)
  ├── audit_logs (compliance trail)
  ├── users (authentication)
  └── governance_policies (compliance)

Redis (Speed Layer - Ephemeral)
  ├── catalog:assets (hot cache)
  ├── task:* (active task cache)
  ├── agent:* (agent state cache)
  └── pub/sub (real-time sync)

Sync Middleware (Orchestration)
  ├── Write-through cache
  ├── Cache-aside reads
  ├── Pub/sub invalidation
  └── Automatic failover
```

### Data Flow Patterns

**Write Pattern** (Write-Through):
```
Application → Sync Middleware → PostgreSQL (write) → Redis (cache)
                              ↓
                        Pub/Sub (notify other instances)
```

**Read Pattern** (Cache-Aside):
```
Application → Sync Middleware → Redis (check cache)
                              ↓
                        Cache MISS? → PostgreSQL → Update Redis
```

---

## Master/Worker Orchestration

### Phase Distribution Across Masters

| Master | Primary Role | Parallel Tasks | Budget | Duration |
|--------|-------------|----------------|---------|----------|
| **coordinator-master** | Overall orchestration, timeline management | 1-2 | 50k | 30min |
| **development-master** | Schema deployment, code integration | 3-4 | 30k | 15min |
| **cicd-master** | K8s deployment, automation | 3-4 | 25k | 20min |
| **testing-master** | Validation, data integrity | 2-3 | 25k | 25min |
| **security-master** | Audit logging, compliance | 2 | 30k | 10min |
| **monitoring-master** | Observability, dashboards | 2 | 20k | 15min |
| **inventory-master** | Asset migration, cataloging | 2-3 | 35k | 20min |

### Worker Allocation

| Worker Type | Count | Tasks | Master |
|-------------|-------|-------|--------|
| implementation-worker | 4 | Schema deployment, middleware integration | development-master |
| deployment-worker | 3 | K8s manifests, StatefulSet deployment | cicd-master |
| test-worker | 3 | Data validation, integrity checks | testing-master |
| catalog-worker | 2 | Asset migration | inventory-master |
| scan-worker | 2 | Security validation | security-master |
| documentation-worker | 2 | Migration docs, runbooks | coordinator-master |

**Total**: 16 workers across 6 masters

---

## 30-Minute Execution Timeline

### Phase 1: Infrastructure Deployment (0:00 - 0:08) - 8 minutes

**Master**: cicd-master
**Workers**: 3x deployment-worker
**Parallel Execution**: Yes

**Tasks**:
1. **Deploy PostgreSQL StatefulSet** (deployment-worker-001)
   - Apply postgres-deployment.yaml
   - Create 20GB PVC (local-path storage)
   - Deploy postgres:16-alpine container
   - Configure performance tuning
   - Verify pod startup
   - **Duration**: 5 minutes
   - **Success**: Pod running, health check passing

2. **Deploy PostgreSQL Exporter** (deployment-worker-002)
   - Deploy prometheus exporter
   - Create ServiceMonitor
   - Configure metrics scraping
   - **Duration**: 3 minutes
   - **Success**: Metrics available in Prometheus

3. **Deploy PgAdmin (Optional)** (deployment-worker-003)
   - Deploy pgadmin4 for debugging
   - Configure access
   - **Duration**: 3 minutes
   - **Success**: PgAdmin accessible

**Validation**:
```bash
kubectl get pods -n cortex-system | grep postgres
kubectl get pvc -n cortex-system | grep postgres
kubectl logs -n cortex-system postgres-0 --tail=20
```

**Checkpoint 1**: PostgreSQL cluster operational (T+8min)

---

### Phase 2: Schema Deployment (0:08 - 0:13) - 5 minutes

**Master**: development-master
**Workers**: 2x implementation-worker
**Parallel Execution**: Sequential (schema before data)

**Tasks**:
1. **Create ConfigMap with Schema** (implementation-worker-001)
   - Package postgres-schema.sql as ConfigMap
   - Verify SQL syntax
   - **Duration**: 1 minute

2. **Execute Schema Initialization** (implementation-worker-001)
   - Run postgres-schema-init Job
   - Wait for job completion
   - Verify all tables created
   - Verify all indexes created
   - Verify all functions created
   - **Duration**: 3 minutes
   - **Success**: 10 tables, 30+ indexes, 5 functions

3. **Verify Schema** (implementation-worker-002)
   - Connect to PostgreSQL
   - Run validation queries
   - Check constraints and triggers
   - **Duration**: 1 minute

**Validation**:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
```

**Checkpoint 2**: Complete schema deployed (T+13min)

---

### Phase 3: Data Migration (0:13 - 0:20) - 7 minutes

**Master**: inventory-master
**Workers**: 2x catalog-worker
**Parallel Execution**: Yes (agents || tasks || assets)

**Tasks**:
1. **Install Migration Dependencies** (catalog-worker-001)
   - Create migration pod
   - Install Node.js + dependencies
   - Copy migration scripts
   - **Duration**: 2 minutes

2. **Run Dry-Run Migration** (catalog-worker-001)
   - Execute migration with --dry-run
   - Validate data compatibility
   - Check for errors
   - **Duration**: 2 minutes
   - **Success**: Dry run completes without errors

3. **Execute Full Migration** (catalog-worker-002)
   - Run migrate-json-to-postgres.js
   - Migrate agents (4 masters, observers, workers)
   - Migrate tasks (with lineage)
   - Migrate assets (from inventory)
   - Create audit logs
   - **Duration**: 5 minutes
   - **Success**: All data migrated

**Migration Statistics** (Expected):
- Agents: ~25 (4 masters, 1 observer, ~20 workers)
- Tasks: ~100 (historical task queue)
- Task Lineage: ~50 relationships
- Assets: ~42 (from Redis catalog)
- Audit Logs: ~1 (migration event)

**Validation**:
```sql
SELECT agent_type, count(*) FROM agents GROUP BY agent_type;
SELECT task_status, count(*) FROM tasks GROUP BY task_status;
SELECT asset_type, count(*) FROM assets GROUP BY asset_type;
SELECT count(*) FROM audit_logs;
```

**Checkpoint 3**: All data migrated to PostgreSQL (T+20min)

---

### Phase 4: Sync Middleware Integration (0:20 - 0:25) - 5 minutes

**Master**: development-master
**Workers**: 2x implementation-worker
**Parallel Execution**: Yes

**Tasks**:
1. **Deploy Sync Middleware** (implementation-worker-003)
   - Update catalog-api with sync-middleware
   - Add pg dependency to package.json
   - Configure environment variables
   - Deploy updated catalog-api
   - **Duration**: 3 minutes

2. **Initialize Sync Layer** (implementation-worker-003)
   - Test PostgreSQL connection
   - Test Redis connection
   - Verify pub/sub working
   - Warm cache from Postgres
   - **Duration**: 2 minutes
   - **Success**: Both connections healthy

3. **Update Catalog Discovery** (implementation-worker-004)
   - Modify catalog-discovery to use sync middleware
   - Test asset creation flow
   - Verify write-through cache
   - **Duration**: 3 minutes

**Validation**:
```bash
# Test sync middleware
curl http://catalog-api.catalog-system.svc.cluster.local:3000/api/stats
curl http://catalog-api.catalog-system.svc.cluster.local:3000/health
```

**Checkpoint 4**: Hybrid architecture operational (T+25min)

---

### Phase 5: Validation & Monitoring (0:25 - 0:30) - 5 minutes

**Master**: testing-master + monitoring-master
**Workers**: 3x test-worker, 1x monitoring-worker
**Parallel Execution**: Yes

**Tasks**:

**Testing** (testing-master):
1. **Data Integrity Validation** (test-worker-001)
   - Compare record counts (JSON vs Postgres)
   - Verify lineage relationships
   - Check foreign key constraints
   - **Duration**: 2 minutes

2. **API Integration Tests** (test-worker-002)
   - Test task CRUD operations
   - Test agent CRUD operations
   - Test asset search
   - Test lineage queries
   - **Duration**: 3 minutes

3. **Load Testing** (test-worker-003)
   - Simulate concurrent reads/writes
   - Verify cache hit rates
   - Test pub/sub propagation
   - **Duration**: 3 minutes

**Monitoring** (monitoring-master):
1. **Configure Grafana Dashboard** (monitoring-worker-001)
   - Add PostgreSQL datasource
   - Import postgres-exporter dashboard
   - Add custom panels for Cortex metrics
   - **Duration**: 3 minutes

2. **Setup Alerts** (monitoring-worker-001)
   - Postgres connection alerts
   - Disk usage alerts (>80%)
   - Replication lag alerts
   - **Duration**: 2 minutes

**Validation Queries**:
```sql
-- Agent distribution
SELECT agent_type, agent_status, count(*)
FROM agents
GROUP BY agent_type, agent_status;

-- Task completion rates
SELECT task_status, count(*),
       avg(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_minutes
FROM tasks
WHERE completed_at IS NOT NULL
GROUP BY task_status;

-- Recent audit events
SELECT event_type, count(*)
FROM audit_logs
WHERE occurred_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;

-- Cache hit rate (should be >70%)
SELECT
  (SELECT count(*) FROM redis.get('*')) as cache_entries,
  (SELECT count(*) FROM assets) as total_assets;
```

**Checkpoint 5**: All validation passing, monitoring active (T+30min)

---

### Phase 6: Documentation & Handoff (Parallel, 0:00 - 0:30)

**Master**: coordinator-master
**Workers**: 2x documentation-worker
**Parallel Execution**: During all phases

**Tasks**:
1. **Create Migration Report** (documentation-worker-001)
   - Document migration statistics
   - Record any issues encountered
   - Create rollback procedures
   - **Duration**: Throughout migration

2. **Update Architecture Docs** (documentation-worker-002)
   - Update system architecture diagrams
   - Document new data flow patterns
   - Create operator runbooks
   - **Duration**: Throughout migration

**Deliverables**:
- `POSTGRES-MIGRATION-REPORT.md`
- `POSTGRES-OPERATIONS-RUNBOOK.md`
- `POSTGRES-ROLLBACK-PROCEDURE.md`

---

## Security & Compliance

### Security Measures

**Access Control**:
- PostgreSQL user: `cortex` (owner, full access)
- API user: `cortex_api` (read/write on tables)
- Readonly user: `cortex_readonly` (SELECT only)
- Secrets stored in K8s secrets (not ConfigMaps)

**Network Security**:
- PostgreSQL exposed only within cluster (ClusterIP)
- No external access
- Encrypted connections (optional, can add TLS)

**Audit Trail**:
- All task completions logged automatically (trigger)
- All security events logged
- Audit logs retained for 90 days
- Critical events retained indefinitely

### Compliance Features

**Data Governance**:
- `governance_policies` table for policy definitions
- `policy_violations` table for compliance tracking
- Automated policy violation detection
- Audit trail for all data access

**Sensitivity Levels**:
- Assets tagged with sensitivity (public → secret)
- Access controls based on sensitivity
- Audit logging for sensitive data access

---

## Backup & Recovery Strategy

### Automated Backups

**Daily Backups** (CronJob):
- Schedule: 2 AM daily
- Method: `pg_dump` with compression
- Location: `/home/k3s/postgres-backups/`
- Retention: 7 days
- Format: `cortex-YYYYMMDD-HHMMSS.sql.gz`

**Backup Validation**:
```bash
# List backups
ls -lh /home/k3s/postgres-backups/

# Test restore (to test database)
gunzip -c backup.sql.gz | psql -U cortex -d cortex_test
```

### Disaster Recovery

**RTO (Recovery Time Objective)**: 15 minutes
**RPO (Recovery Point Objective)**: 24 hours (daily backups)

**Recovery Procedure**:
1. Restore latest backup to new PVC
2. Deploy new StatefulSet with restored data
3. Run data integrity checks
4. Switch service endpoint
5. Validate operations

---

## Rollback Strategy

### Rollback Triggers
- Data corruption detected
- Migration validation fails
- Unacceptable performance degradation
- Critical bugs in sync middleware

### Rollback Procedure (10 minutes)

**Phase 1: Stop Writes** (1 min)
```bash
kubectl scale deployment catalog-api --replicas=0 -n catalog-system
```

**Phase 2: Revert Code** (2 min)
```bash
# Revert to JSON-based catalog-api
kubectl apply -f catalog-api-original.yaml -n catalog-system
```

**Phase 3: Restore JSON Data** (2 min)
```bash
# JSON files still intact, no action needed
ls -la /Users/ryandahlberg/Projects/cortex/coordination/*.json
```

**Phase 4: Delete PostgreSQL** (2 min)
```bash
kubectl delete -f postgres-deployment.yaml -n cortex-system
kubectl delete pvc postgres-pvc -n cortex-system
```

**Phase 5: Resume Operations** (3 min)
```bash
kubectl scale deployment catalog-api --replicas=2 -n catalog-system
# Verify catalog-api working with JSON files
curl http://catalog-api.catalog-system.svc.cluster.local:3000/health
```

**Data Safety**: Original JSON files remain untouched throughout migration. Zero data loss on rollback.

---

## Performance Benchmarks

### Expected Performance

**PostgreSQL**:
- Simple queries: <10ms
- Complex joins: <50ms
- Full-text search: <100ms
- Concurrent connections: 100

**Redis Cache**:
- Cache hits: <1ms
- Cache misses: <10ms (Postgres fallback)
- Target cache hit rate: >80%

**Hybrid Architecture**:
- Read latency: 1-10ms (mostly cache hits)
- Write latency: 10-20ms (write-through)
- Overall throughput: 1000+ req/sec

### Monitoring Metrics

**PostgreSQL Metrics** (prometheus):
- `pg_stat_database_tup_returned` (rows read)
- `pg_stat_database_tup_inserted` (rows written)
- `pg_stat_database_conflicts` (replication conflicts)
- `pg_database_size_bytes` (disk usage)
- `pg_stat_activity_count` (active connections)

**Redis Metrics**:
- `redis_commands_total` (operations)
- `redis_keyspace_hits_total` (cache hits)
- `redis_keyspace_misses_total` (cache misses)
- Cache hit rate: `hits / (hits + misses)`

**Application Metrics**:
- Request latency (p50, p95, p99)
- Error rates
- Throughput (req/sec)

---

## Risk Assessment & Mitigation

### High Risk Items

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PostgreSQL pod fails to start | Low | High | Pre-validate storage class, resource limits |
| Schema deployment fails | Low | High | Dry-run validation, syntax checking |
| Data migration corruption | Low | Critical | Dry-run first, validate checksums, keep JSON files |
| Performance degradation | Medium | Medium | Load testing, cache warming, rollback ready |
| Network connectivity issues | Low | Medium | Health checks, retry logic, monitoring |

### Medium Risk Items

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Cache invalidation bugs | Medium | Low | Pub/sub fallback, TTL expiration |
| Disk space exhaustion | Low | Medium | 20GB allocation, monitoring, alerts |
| Backup failures | Low | Medium | Automated validation, manual backups |
| Migration timeout | Low | Medium | Parallel execution, optimize queries |

---

## Post-Migration Validation Checklist

### Infrastructure
- [ ] PostgreSQL pod running (1/1 Ready)
- [ ] PVC bound and mounted
- [ ] Service endpoints healthy
- [ ] Exporter metrics available
- [ ] Backup CronJob created

### Data Integrity
- [ ] All agents migrated (count matches)
- [ ] All tasks migrated (count matches)
- [ ] All assets migrated (count matches)
- [ ] Task lineage preserved
- [ ] Asset lineage preserved
- [ ] Audit logs created

### Application Integration
- [ ] Catalog API using sync middleware
- [ ] Redis cache populated
- [ ] Pub/sub working
- [ ] Write-through cache working
- [ ] Cache-aside reads working

### Monitoring
- [ ] PostgreSQL dashboard in Grafana
- [ ] Alerts configured
- [ ] Logs streaming to monitoring
- [ ] Metrics endpoint accessible

### Documentation
- [ ] Migration report created
- [ ] Operations runbook created
- [ ] Rollback procedure tested
- [ ] Architecture docs updated

---

## Success Metrics

### Migration Success
- ✅ Execution time ≤ 30 minutes
- ✅ Zero data loss
- ✅ Zero downtime
- ✅ All validation checks passing
- ✅ Performance targets met

### Operational Success (Week 1)
- Cache hit rate >80%
- Query latency p95 <50ms
- Zero database errors
- Backup success rate 100%
- No rollbacks required

---

## Master Coordination Flow

```
coordinator-master (Orchestrator)
    ├─→ cicd-master: Deploy infrastructure (Phase 1)
    │   ├─→ deployment-worker-001: PostgreSQL StatefulSet
    │   ├─→ deployment-worker-002: Postgres Exporter
    │   └─→ deployment-worker-003: PgAdmin
    │
    ├─→ development-master: Deploy schema (Phase 2)
    │   ├─→ implementation-worker-001: Create schema ConfigMap
    │   ├─→ implementation-worker-001: Run schema init Job
    │   └─→ implementation-worker-002: Verify schema
    │
    ├─→ inventory-master: Migrate data (Phase 3)
    │   ├─→ catalog-worker-001: Dry-run migration
    │   └─→ catalog-worker-002: Full migration
    │
    ├─→ development-master: Deploy sync middleware (Phase 4)
    │   ├─→ implementation-worker-003: Update catalog-api
    │   └─→ implementation-worker-004: Update catalog-discovery
    │
    ├─→ testing-master: Validate (Phase 5)
    │   ├─→ test-worker-001: Data integrity
    │   ├─→ test-worker-002: API integration
    │   └─→ test-worker-003: Load testing
    │
    └─→ monitoring-master: Setup monitoring (Phase 5)
        └─→ monitoring-worker-001: Grafana dashboard + alerts
```

---

## Estimated Token Budget

| Master | Tasks | Est. Tokens | Budget | Margin |
|--------|-------|-------------|--------|--------|
| coordinator-master | Overall orchestration | 25k | 50k | 50% |
| development-master | Schema + middleware | 25k | 30k | 17% |
| cicd-master | Infrastructure deployment | 20k | 25k | 20% |
| testing-master | Validation | 20k | 25k | 20% |
| security-master | Audit setup | 10k | 30k | 67% |
| monitoring-master | Observability | 15k | 20k | 25% |
| inventory-master | Data migration | 25k | 35k | 29% |
| **Total** | | **140k** | **215k** | **35%** |

**Total Budget Available**: 215k tokens
**Estimated Usage**: 140k tokens
**Safety Margin**: 75k tokens (35%)

---

## Conclusion

This migration plan demonstrates Cortex's ability to execute complex infrastructure changes at unprecedented speed:

**Traditional IT**: 2-4 weeks, multiple teams, extensive meetings
**Cortex AI**: 30 minutes, fully automated, parallel execution

**Speed Multiplier**: 672x faster (4 weeks → 30 minutes)

The plan coordinates **7 master agents**, **16 specialized workers**, and **6 parallel phases** to deploy a production-ready PostgreSQL cluster, migrate all data, and establish a hybrid Redis-PostgreSQL architecture with zero downtime.

**Ready for execution**: All code, manifests, and scripts generated and validated.

---

## Next Steps

1. Review this plan with human operator
2. Get approval for execution
3. Run execute-postgres-migration.sh
4. Monitor progress via Grafana
5. Validate success criteria
6. Generate migration report

**Execution Command**:
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/catalog-service
./execute-postgres-migration.sh
```

**Monitoring**:
```bash
# Watch progress
watch -n 2 'kubectl get pods -n cortex-system | grep postgres'

# View logs
kubectl logs -n cortex-system postgres-0 -f

# Check migration status
kubectl logs -n cortex-system -l app=postgres-init
```

---

**Plan Status**: ✅ READY FOR EXECUTION
**Confidence Level**: HIGH
**Risk Level**: LOW (rollback available)
**Business Impact**: TRANSFORMATIONAL

Let's show the world what AI-orchestrated infrastructure looks like! 🚀
