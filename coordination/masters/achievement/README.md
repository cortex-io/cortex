# Achievement Master

**Autonomous GitHub Achievement Tracking & Automation System**

The Achievement Master is commit-relay's intelligent system for tracking, planning, and automating the unlocking of GitHub profile achievements using MoE (Mixture of Experts) orchestration.

---

## Overview

Achievement Master provides:

1. **Real-Time Progress Tracking** - GitHub API integration for live achievement status
2. **Strategic Planning** - Gap analysis and opportunity scoring
3. **Automated Workflows** - Quickdraw, Pull Shark, YOLO unlocking
4. **Elastic APM Dashboard** - Visual progress monitoring in Kibana
5. **Task Orchestration** - Routes achievement tasks to appropriate masters

---

## Architecture

```
achievement-master/
├── lib/
│   ├── achievement-tracker.js    # GitHub API integration & tracking
│   ├── strategy-planner.js       # Gap analysis & task generation
│   └── automation-orchestrator.js # Workflow coordination
├── config/
│   └── achievement-definitions.json # Achievement metadata & automation strategies
├── workflows/
│   ├── quickdraw-workflow.sh     # Issue → Fix → Close < 5min
│   └── pr-automation-workflow.sh # Feature branch → PR → Merge
├── knowledge-base/
│   ├── progress.json              # Current achievement status
│   └── current-strategy.json      # Active strategic plan
└── metrics/
    ├── tracking-history.jsonl     # Achievement progress over time
    ├── plan-history.jsonl         # Strategic planning history
    ├── quickdraw-attempts.jsonl   # Quickdraw workflow results
    └── pr-automation-history.jsonl # PR automation logs
```

---

## GitHub Achievements Tracked

### ✅ Currently Earnable (8)

| Achievement | Icon | Status | Automation | Priority |
|-------------|------|--------|------------|----------|
| **Pair Extraordinaire** | 👥 | ✅ Active | Co-Authored-By commits | HIGH |
| **Pull Shark** | 🦈 | 🎯 Target | PR automation workflow | HIGH |
| **Quickdraw** | ⚡ | 🎯 Target | Instant fix workflow | HIGH |
| **YOLO** | 🎲 | 🎯 Target | Auto-merge without review | HIGH |
| **Galaxy Brain** | 🧠 | 📋 Planned | Discussion responses | MEDIUM |
| **Starstruck** | ⭐ | 📋 Planned | Organic growth | MEDIUM |
| **Public Sponsor** | 💖 | ⏸️ Manual | Manual sponsorship | LOW |
| **Achievement Unlocked** | 🏆 | ⏸️ Manual | Enable in settings | HIGH |

### 🧪 In Testing (2)
- **Heart On Your Sleeve** ❤️ - React with hearts
- **Open Sourcerer** 🔮 - Multi-repo contributions

### ❌ No Longer Earnable (2)
- **Arctic Code Vault** 🏔️ - Historical (2020)
- **Mars 2020** 🚁 - Historical (Mars mission)

---

## API Endpoints

### GET /api/achievements/progress
Get real-time achievement progress from GitHub API.

**Response**:
```json
{
  "username": "ry-ops",
  "timestamp": "2025-11-25T20:00:00Z",
  "achievements": {
    "pair_extraordinaire": {
      "count": 15,
      "current_tier": "bronze",
      "progress": {
        "current": 15,
        "next_tier": "silver",
        "next_requirement": 24,
        "percentage": 62
      }
    },
    "pull_shark": {
      "count": 8,
      "current_tier": "bronze",
      "progress": { ... }
    }
  },
  "summary": {
    "total_achievements": 8,
    "unlocked": 3,
    "in_progress": 2
  }
}
```

### GET /api/achievements/opportunities
Get opportunity scores (0-100) for each achievement.

**Response**:
```json
{
  "opportunities": [
    {
      "achievement_id": "quickdraw",
      "name": "Quickdraw",
      "icon": "⚡",
      "opportunity_score": 96,
      "automation_strategy": "instant_fix",
      "priority": "high"
    }
  ],
  "top_3": [ ... ]
}
```

### GET /api/achievements/plan
Get strategic achievement plan with generated tasks.

**Response**:
```json
{
  "generated_at": "2025-11-25T20:00:00Z",
  "gaps": {
    "immediate_wins": [ ... ],
    "high_priority": [ ... ]
  },
  "recommended_actions": [
    {
      "achievement": "Quickdraw",
      "strategy": "instant_fix",
      "steps": [ ... ],
      "estimated_time": "5-10 minutes"
    }
  ],
  "task_queue": [ ... ]
}
```

### POST /api/achievements/execute/:workflow
Execute achievement automation workflow.

**Workflows**:
- `quickdraw` - Create & close issue within 5 minutes
- `pr-automation` - Create feature branch, PR, and merge

**Request Body**:
```json
{
  "feature_name": "my-feature",
  "skip_review": true
}
```

---

## Usage

### CLI Usage

**Track Progress**:
```bash
node coordination/masters/achievement/lib/achievement-tracker.js
```

**Generate Strategic Plan**:
```bash
node coordination/masters/achievement/lib/strategy-planner.js
```

**Execute Quickdraw Workflow**:
```bash
bash coordination/masters/achievement/workflows/quickdraw-workflow.sh my-feature
```

**Execute PR Automation**:
```bash
bash coordination/masters/achievement/workflows/pr-automation-workflow.sh my-feature docs true
```

### API Usage

**Fetch Progress**:
```bash
curl http://localhost:5001/api/achievements/progress
```

**Get Opportunities**:
```bash
curl http://localhost:5001/api/achievements/opportunities
```

**Execute Quickdraw**:
```bash
curl -X POST http://localhost:5001/api/achievements/execute/quickdraw \
  -H "Content-Type: application/json" \
  -d '{"feature_name": "docs-improvement"}'
```

---

## Automation Strategies

### 1. Pair Extraordinaire (Co-authored Commits)
**Strategy**: Already implemented in all masters
**Implementation**: Every commit includes `Co-Authored-By: Claude <noreply@anthropic.com>`
**Status**: ✅ Active

### 2. Pull Shark (Merged PRs)
**Strategy**: Feature branch workflow
**Steps**:
1. Create feature branch
2. Implement enhancement
3. Create pull request
4. Run CI/CD tests
5. Auto-merge after tests pass

**Implementation**:
```bash
./workflows/pr-automation-workflow.sh feature-name docs false
```

### 3. Quickdraw (Fast Issue Close)
**Strategy**: Instant fix
**Steps**:
1. Create GitHub issue (via API)
2. Immediately implement fix
3. Commit and push
4. Close issue (< 5 minutes)

**Implementation**:
```bash
./workflows/quickdraw-workflow.sh feature-name
```

### 4. YOLO (Merge Without Review)
**Strategy**: Self-merge
**Steps**:
1. Create PR
2. Wait for CI tests
3. Auto-merge without review

**Implementation**: Same as Pull Shark with `skip_review: true`

### 5. Galaxy Brain (Discussion Answers)
**Strategy**: Discussion response
**Steps**:
1. Monitor GitHub Discussions
2. Identify answerable questions
3. Generate helpful response
4. Submit answer
5. Track acceptance

**Status**: 📋 Planned (requires GraphQL API)

---

## Configuration

### Environment Variables

```bash
# Required
export GITHUB_TOKEN="ghp_your_token_here"
export GITHUB_USERNAME="ry-ops"

# Optional
export GITHUB_REPO_OWNER="ry-ops"
export GITHUB_REPO_NAME="commit-relay"
export BASE_BRANCH="main"
```

### Achievement Definitions

Edit `config/achievement-definitions.json` to:
- Modify tier requirements
- Adjust automation priorities
- Update automation strategies
- Enable/disable workflows

---

## Kibana Dashboard

### Visualizations

1. **Achievement Progress Gauge**
   - Data source: `/api/achievements/progress`
   - Metric: `achievement.unlocked / achievement.total`
   - Goal: 8 (all earnable achievements)

2. **Opportunity Score Bar Chart**
   - Data source: `/api/achievements/opportunities`
   - X-axis: Achievement name
   - Y-axis: Opportunity score (0-100)
   - Color: Priority (red=high, yellow=medium, green=low)

3. **Tier Progress Table**
   - Data source: `/api/achievements/progress`
   - Columns: Achievement, Current Tier, Progress %, Next Requirement

4. **Workflow Execution Timeline**
   - Data source: `metrics/*-history.jsonl`
   - Timeline of workflow executions
   - Success/failure indicators

5. **Achievement Unlock Events**
   - Data source: `metrics/tracking-history.jsonl`
   - Event stream of achievement unlocks
   - Filters: By achievement type, date range

### Setup Guide

See [KIBANA-ACHIEVEMENT-DASHBOARD.md](../../../docs/KIBANA-ACHIEVEMENT-DASHBOARD.md) for detailed setup instructions.

---

## MoE Integration

Achievement Master integrates with commit-relay's MoE (Mixture of Experts) system:

### Task Routing

```
Achievement Master
├── Analyzes gaps
├── Creates tasks
└── Routes to appropriate master:
    ├── Development Master → Feature PRs, Quickdraw fixes
    ├── CI/CD Master → PR merging, YOLO workflow
    ├── Coordinator Master → Task orchestration
    └── Achievement Master → Discussion responses
```

### Workflow Example

```
1. User wants Pull Shark achievement
2. Achievement Master:
   - Checks current progress (8/16 PRs)
   - Calculates opportunity score (85/100)
   - Generates task: "Create 8 feature PRs"
   - Routes to Development Master
3. Development Master:
   - Spawns implementation workers
   - Creates feature branches
   - Implements enhancements
4. CI/CD Master:
   - Runs tests
   - Auto-merges PRs
5. Achievement Master:
   - Tracks progress (16/16 PRs)
   - Achievement unlocked! 🦈
```

---

## Metrics & Monitoring

### APM Labels

All achievement endpoints include custom APM labels:

```javascript
{
  'achievement.total': 8,
  'achievement.unlocked': 3,
  'achievement.in_progress': 2,
  'achievement.top_opportunity': 'Quickdraw',
  'achievement.top_score': 96,
  'achievement.plan_tasks': 3
}
```

### Monitoring Queries

**Kibana Query**: Achievement progress over time
```
labels.achievement.unlocked > 0
```

**Kibana Query**: High-opportunity achievements
```
labels.achievement.top_score >= 80
```

---

## Development

### Adding New Workflows

1. Create workflow script in `workflows/`
2. Make executable: `chmod +x workflow-name.sh`
3. Add to API endpoint mapping in `api-server/server/index.js`
4. Update `achievement-definitions.json` with strategy
5. Test workflow execution

### Testing

```bash
# Test GitHub API integration
node lib/achievement-tracker.js

# Test strategy planner
node lib/strategy-planner.js

# Test quickdraw workflow (dry run)
bash workflows/quickdraw-workflow.sh test-feature

# Test PR automation
bash workflows/pr-automation-workflow.sh test-feature docs true
```

---

## Roadmap

### Phase 1: Core Tracking ✅
- [x] GitHub API integration
- [x] Real-time progress tracking
- [x] Opportunity scoring
- [x] Strategic planning

### Phase 2: Automation ✅
- [x] Quickdraw workflow
- [x] PR automation workflow
- [x] API endpoints
- [x] APM integration

### Phase 3: Advanced Features 📋
- [ ] GraphQL API for Galaxy Brain
- [ ] Discussion response automation
- [ ] Multi-repo tracking
- [ ] Achievement prediction (ML-based)

### Phase 4: Gamification 🎯
- [ ] Leaderboard integration
- [ ] Daily/weekly challenges
- [ ] Achievement streak tracking
- [ ] Notification system

---

## License

Part of commit-relay - MIT License

---

## Contributing

Achievement Master is designed to be extensible. To add new automation strategies:

1. Define strategy in `config/achievement-definitions.json`
2. Implement workflow script
3. Add API endpoint
4. Update documentation
5. Test thoroughly

---

**Built with commit-relay's MoE architecture** 🤖

For questions or issues, see: [commit-relay README](../../../README.md)
