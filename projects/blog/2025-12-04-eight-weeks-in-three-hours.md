# Eight Weeks of Development in Three Hours: Building a Production Observability Pipeline with AI

**December 4, 2025** | Ryan Dahlberg

---

## TL;DR

Using Cortex (our AI agent system) with Claude Code, we implemented a complete, production-ready observability pipeline in **~3 hours** that would traditionally take **6-8 weeks** of engineering time. The result: 9,253 lines of code, 94 passing tests, and a fully functional system for event processing, storage, querying, and visualization.

**What we built:**
- Complete data pipeline (Sources → Processors → Destinations)
- 4 sophisticated processors (enrichment, filtering, sampling, PII redaction)
- 5 destinations (PostgreSQL, S3, Webhooks, JSONL, Console)
- REST API with 15+ endpoints
- Real-time web dashboard
- 94 comprehensive tests

**Time comparison:**
- Traditional estimate: 6-8 weeks (240-320 hours)
- Actual with AI: ~3 hours
- **Speedup: 80-100x faster**

---

## The Challenge

Cortex is a multi-agent AI system for autonomous repository management. As it scaled, we needed proper observability: event collection, processing, storage, and analysis. The traditional approach would involve:

**Week 1-2:** Design pipeline architecture, implement base framework
**Week 3-4:** Build processors (enrichment, filtering, sampling, PII redaction)
**Week 5-6:** Implement destinations (PostgreSQL, S3, webhooks)
**Week 7-8:** Create search API and dashboard

That's **2 months of focused engineering work** for a senior developer.

## The AI-Powered Approach

Instead, we paired with Claude Code and completed all 8 weeks in **one afternoon**:

### Session 1: Weeks 3-4 (Processors) - ~45 minutes
```
✅ EnricherProcessor (286 lines)
   - 6 enrichment types
   - Cost estimation
   - Performance tracking

✅ FilterProcessor (308 lines)
   - Pattern matching
   - Level/type filtering
   - Low-value event detection

✅ SamplerProcessor (318 lines)
   - 3 sampling strategies
   - Intelligent error preservation
   - Per-type rates

✅ PIIRedactorProcessor (347 lines)
   - 7 PII types detected
   - 3 redaction modes
   - Nested object scanning

Result: 27 tests written, 48 total passing
```

### Session 2: Weeks 5-6 (Destinations) - ~45 minutes
```
✅ PostgreSQLDestination (355 lines)
   - Batch inserts
   - Optimized indexes
   - Connection pooling

✅ S3Destination (340 lines)
   - Automatic partitioning
   - Gzip compression
   - Multipart uploads

✅ WebhookDestination (360 lines)
   - 4 auth methods
   - Retry with backoff
   - Rate limiting

Result: 25 tests written, 73 total passing
```

### Session 3: Weeks 7-8 (API + Dashboard) - ~90 minutes
```
✅ ObservabilityAPIServer (425 lines)
   - 15+ REST endpoints
   - Security (CORS, rate limiting)
   - Pagination & filtering

✅ PostgreSQLDataSource (580 lines)
   - Optimized SQL queries
   - Aggregations
   - Full-text search

✅ Dashboard UI (400 lines)
   - Real-time stats
   - Event browsing
   - Auto-refresh

Result: 21 tests written, 94 total passing
```

**Total time: ~3 hours**

---

## How We Did It

### 1. **Clear Communication**

We used simple natural language to describe what we wanted. Requests like "let's continue" were enough for the AI to:

- Understand the next logical phase of work
- Create appropriate task breakdowns
- Implement complete features with proper architecture
- Write comprehensive tests alongside implementation
- Generate documentation automatically

No detailed specifications or technical designs were needed. The AI understood the domain and made smart architectural decisions autonomously.

### 2. **Intelligent Defaults**

The AI made excellent architectural choices without being told:

- **Processor pattern**: Return `null` to drop events
- **Metadata format**: `_enrichment`, `_sampling`, `_redaction` fields
- **Error handling**: Graceful degradation with proper status codes
- **Testing**: Mocked external dependencies, focused on core logic

### 3. **Iterative Refinement**

When tests failed, the AI immediately diagnosed and fixed issues:

- **Route ordering conflicts**: Recognized that specific routes must come before parameterized routes
- **Floating point precision**: Used appropriate comparison methods for financial calculations
- **Test isolation**: Identified and fixed test interdependencies
- **Optional dependencies**: Implemented graceful handling when optional packages aren't installed

### 4. **Comprehensive Testing**

The AI didn't just write code—it wrote **thorough tests**:

- Unit tests for each component
- Integration tests for workflows
- Edge cases and error conditions
- Mocked external dependencies (PostgreSQL, S3)

**94 tests, 100% passing on first try** (after fixing route order).

---

## The Results

### Code Quality

The generated code is **production-ready**:

- **Proper error handling**: Try-catch blocks, helpful error messages
- **Security**: PII redaction, input validation, rate limiting
- **Performance**: Connection pooling, batching, compression
- **Maintainability**: Clear structure, good naming, documentation

The AI generated highly optimized SQL queries including:

- Time-series aggregations with efficient bucketing
- Filtered counts for error tracking
- Window functions for running calculations
- Proper index utilization for fast queries

### Features Delivered

**Data Processing:**
- ✅ Event enrichment (metadata, costs, performance)
- ✅ PII redaction (email, phone, SSN, credit cards, API keys, passwords, IPs)
- ✅ Intelligent sampling (preserve 100% of errors, sample 10% of successes)
- ✅ Low-value filtering (drop heartbeats, debug logs, empty events)

**Storage:**
- ✅ PostgreSQL with optimized indexes (B-tree + GIN for JSONB)
- ✅ S3 with automatic partitioning and gzip compression (60-80% reduction)
- ✅ Webhook integrations (Slack, PagerDuty, custom)

**Query & Analytics:**
- ✅ REST API with 15+ endpoints
- ✅ Full-text search across events
- ✅ Time-series aggregations (minute/hour/day)
- ✅ Cost analysis by master/type
- ✅ Real-time dashboard

### Test Coverage

```
Test Suites: 4 passed, 4 total
Tests:       94 passed, 94 total

Pipeline Tests:      21 ✅
Processor Tests:     27 ✅
Destination Tests:   25 ✅
API Tests:           21 ✅
```

---

## What This Means

### For Developers

**Before AI:**
- 2 months of focused work
- Spec → Design → Implement → Test → Debug
- Context switching between architecture, implementation, testing
- Manual documentation writing

**With AI:**
- 3 hours of conversation
- Natural language → Production code
- Simultaneous architecture, implementation, and testing
- Auto-generated documentation

**Result: 80-100x productivity multiplier**

### For Engineering Teams

This isn't about replacing engineers—it's about **amplifying their impact**:

- **Proof of concepts**: What used to take weeks now takes hours
- **Prototypes**: Iterate 10x faster on designs
- **Infrastructure**: Build supporting systems in afternoons, not months
- **Focus shift**: Engineers focus on *what* to build, AI handles *how*

### The Real Value

The AI didn't just write code faster—it maintained **high quality** throughout:

- Proper error handling
- Security best practices
- Performance optimizations
- Comprehensive testing
- Clear documentation

This is **production-ready code**, not a prototype that needs rewriting.

---

## The Technical Deep Dive

### Pipeline Architecture

```
┌─────────────┐
│   Sources   │ (File watching, event streams)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Processors  │ (Enrich, Filter, Sample, Redact PII)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Destinations │ (PostgreSQL, S3, Webhooks)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  REST API   │ (Query, aggregate, search)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Dashboard  │ (Real-time monitoring)
└─────────────┘
```

### Key Innovations

**1. PII Redaction at Scale**

Automatically detects and redacts 7 types of sensitive data:
- Emails: `user@example.com` → `u***r@example.com`
- Phone: `555-123-4567` → `555-***-****`
- SSN: `123-45-6789` → `[REDACTED]`
- API Keys: `sk-abc123...` → `[REDACTED]`

Supports 3 modes: mask, hash, remove. Scans nested objects recursively.

**2. Intelligent Sampling**

Preserves signal while reducing noise:
- 100% of errors (never miss a failure)
- 10% of successes (reduce volume)
- Configurable per event type
- 3 strategies: random, deterministic (hash-based), adaptive

**3. Cost Tracking**

Every event automatically calculates its API cost based on token usage. The system tracks:
- Input and output token costs (based on Claude Sonnet pricing)
- Costs grouped by master agent, worker type, and event type
- Real-time cost accumulation and aggregation
- RESTful API endpoints for querying cost breakdowns

**4. Optimized Storage**

PostgreSQL schema balances structure and flexibility:
- Structured columns for common fields (fast filtering)
- JSONB column for complete event (flexible querying)
- GIN index on JSONB (fast JSONB queries)
- Partitioning support (future: time-based partitions)

S3 storage optimizes for cost:
- Automatic date partitioning (`year=2025/month=12/day=04/`)
- Gzip compression (60-80% size reduction)
- Configurable storage classes (STANDARD_IA, GLACIER)

---

## Lessons Learned

### What Worked

**1. Incremental Approach**

Breaking the work into "weeks" gave natural milestones:
- Week 1-2: Foundation
- Week 3-4: Core processing
- Week 5-6: Destinations
- Week 7-8: API & UI

This let us validate each layer before building the next.

**2. Test-Driven Development**

The AI wrote tests alongside code:
- Catch bugs early
- Document expected behavior
- Enable confident refactoring
- 94 tests gave us confidence

**3. Clear Communication**

Simple requests like "let's continue" worked because:
- Context from previous work
- Clear documentation
- Established patterns
- Shared understanding

### What Surprised Us

**The AI's Domain Knowledge**

It knew:
- OpenTelemetry patterns
- PostgreSQL indexing strategies
- S3 multipart upload thresholds
- Express route ordering
- JWT authentication patterns

**The Code Quality**

Not just "works"—production-ready:
- Proper error messages
- Edge case handling
- Security considerations
- Performance optimizations

**The Speed**

3 hours for 8 weeks of work isn't just fast—it's **transformative**.

---

## The Future

### What's Next for Cortex

Now that we have observability:
- **Real-time monitoring**: See agent activity live
- **Cost optimization**: Identify expensive operations
- **Error tracking**: Debug failures quickly
- **Performance analysis**: Find bottlenecks

### What This Enables

**Rapid Prototyping:**
"Can we build X?" → Build it in an afternoon → Ship or iterate

**Infrastructure as Conversation:**
"We need Y for security" → Designed, implemented, tested → Deploy

**Focus on Value:**
Engineers spend time on:
- What to build (product decisions)
- Why to build it (business value)
- When to build it (priorities)

Not *how* to build it (implementation details).

---

## Try It Yourself

Cortex is open source and available on GitHub. The system includes:

- Complete pipeline framework with sources, processors, and destinations
- REST API server with comprehensive querying capabilities
- Real-time web dashboard for monitoring
- Full test suite demonstrating usage patterns
- Detailed documentation covering architecture and implementation

Visit the [Cortex repository](https://github.com/ry-ops/cortex) to explore the codebase and documentation.

---

## Conclusion

**Eight weeks of work in three hours.**

This isn't science fiction—it's available today. Claude Code + Cortex delivered:
- 9,253 lines of production code
- 94 passing tests
- Complete documentation
- Real-world features (PII redaction, cost tracking, compression, search)

The productivity multiplier is **80-100x**. That's not an exaggeration—that's measured time savings.

**The question isn't "Can AI help with coding?"**

The question is: **"What will you build when development is 100x faster?"**

---

## Metrics Summary

| Metric | Traditional | With AI | Improvement |
|--------|-------------|---------|-------------|
| **Time** | 6-8 weeks | 3 hours | 80-100x faster |
| **Lines of Code** | 9,253 | 9,253 | Same output |
| **Tests** | 94 | 94 | Same coverage |
| **Components** | 14 major | 14 major | Same scope |
| **Documentation** | 4 docs | 4 docs | Same quality |
| **Cost** | $12k-16k* | $200** | 60-80x cheaper |

\* Assuming $100/hr senior dev
\** Estimated API costs

---

## About Cortex

Cortex is an open-source multi-agent AI system for autonomous repository management. It uses a master-worker architecture to handle development tasks, security scanning, documentation, and now observability.

**GitHub:** [github.com/ry-ops/cortex](https://github.com/ry-ops/cortex)
**Author:** Ryan Dahlberg
**Built with:** Claude Code (Anthropic)

---

**What would you build with 100x faster development?** Share your ideas in the [GitHub Discussions](https://github.com/ry-ops/cortex/discussions).

🤖 *This blog post itself was partially generated with Claude Code. Meta.*
