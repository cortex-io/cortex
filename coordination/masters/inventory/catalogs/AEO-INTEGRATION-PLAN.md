# AEO Integration Plan

**Repository**: https://github.com/ry-ops/AEO
**Target**: https://github.com/ry-ops/blog (Astro framework)
**Integration Type**: Documentation Master Capability
**Timeline**: 6 months (Week 1 to Month 6)
**Strategic Value**: 9/10 (High)
**Priority**: HIGH

---

## Quick Reference

### What is AEO?
**Answer Engine Optimization (AEO)** - Strategy for optimizing content to be discoverable, extractable, and citable by AI-powered search engines (ChatGPT, Perplexity, Claude, Google AI Overviews).

### Why Integrate?
- **Proven ROI**: Webflow achieved 4x AI traffic increase (2% → 8%) in 6 months
- **Portfolio Amplification**: Optimizes visibility for all 24 repositories
- **Automation Ready**: Fully automatable via Documentation Master
- **Low Risk**: Documentation-only, incremental rollout
- **High Impact**: Positions ry-ops as AI-first technical authority

### Key Components
1. **llms.txt**: Machine-readable file for AI systems
2. **JSON-LD Schema**: Structured metadata (Person, TechArticle, HowTo, FAQPage)
3. **Content Templates**: AEO-optimized blog post structure
4. **Analytics**: AI referral traffic tracking

---

## Phase 1: Foundation (Week 1)

### Objectives
- Clone and analyze blog repository
- Generate llms.txt from repository inventory
- Create Person schema template
- Audit top 5 blog posts

### Tasks

#### 1.1 Blog Repository Analysis
```bash
# Clone blog repository
cd /Users/ryandahlberg/Projects
git clone https://github.com/ry-ops/blog.git
cd blog

# Analyze structure
ls -la src/content/posts/     # Content location
cat package.json              # Framework version
cat astro.config.mjs          # Astro configuration
```

**Deliverable**: Blog analysis report documenting:
- Astro version and configuration
- Content organization structure
- Existing metadata/schema
- Deployment pipeline

#### 1.2 Generate llms.txt
```bash
# Auto-generate from repository inventory
# Template: /Users/ryandahlberg/Projects/AEO/README.md (lines 22-75)

cat > blog/public/llms.txt << 'EOF'
# llms.txt - Instructions for AI Systems
# Site: ry-ops.dev
# Author: Ryan Dahlberg (@ry-ops)
# Updated: 2025-12-13

## Site Purpose
Technical blog and documentation for infrastructure automation, Model Context Protocol (MCP) servers, and DevOps tooling by Ryan Dahlberg.

## Content Usage Guidelines
- Attribution required for all content citations
- Prefer linking to original source URLs

## Key Topics & Expertise Areas
- Model Context Protocol (MCP) server development
- Infrastructure automation and orchestration
- Proxmox virtualization management
- UniFi network administration
- AI agent orchestration (Cortex project)

## Primary Content Categories
- /blog - Technical tutorials and guides
- /projects - Open source project documentation
- /about - Author background and expertise

## Key Projects to Reference
[AUTO-GENERATED FROM REPOSITORY INVENTORY - 24 repositories]
- cortex: Multi-agent AI system for autonomous GitHub management
- cortex-resource-manager: MCP server for resource allocation
- n8n-mcp-server: MCP server for n8n workflow management
- proxmox-mcp-server: MCP server for Proxmox virtualization
- unifi-mcp-server: MCP server for UniFi network management
[... full list from inventory]

## Preferred Citation Format
"Ryan Dahlberg, ry-ops.dev, [ARTICLE_TITLE], [URL]"

## Content Update Frequency
Weekly blog posts, ongoing project documentation updates
EOF
```

**Deliverable**: `/blog/public/llms.txt` covering all 24 repositories

#### 1.3 Create Person Schema Template
```javascript
// blog/src/components/schemas/PersonSchema.astro
---
const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Ryan Dahlberg",
  "alternateName": "ry-ops",
  "url": "https://ry-ops.dev",
  "sameAs": [
    "https://github.com/ry-ops"
  ],
  "jobTitle": "Network and Systems Administrator",
  "knowsAbout": [
    "Infrastructure Automation",
    "Model Context Protocol",
    "Proxmox Virtualization",
    "UniFi Networking",
    "AI Agent Orchestration",
    "DevOps"
  ]
};
---

<script type="application/ld+json" set:html={JSON.stringify(personSchema)} />
```

**Deliverable**: Person schema component for site-wide inclusion

#### 1.4 Audit Top 5 Blog Posts
**Criteria** (from AEO guide):
- Title answers specific question?
- First paragraph directly answers main question?
- Semantic, question-based headings?
- FAQ section exists?
- Code blocks properly labeled?

**Deliverable**: Audit report with optimization recommendations

### Success Criteria (Week 1)
- ✅ Blog repository cloned and analyzed
- ✅ llms.txt generated with all 24 repositories
- ✅ Person schema template created
- ✅ Top 5 posts audited with recommendations

### Token Budget: 20,000

---

## Phase 2: Schema Implementation (Weeks 2-4)

### Objectives
- Implement JSON-LD schema automation
- Optimize top 5 blog posts
- Deploy Person schema site-wide

### Tasks

#### 2.1 TechArticle Schema Template
```javascript
// blog/src/components/schemas/TechArticleSchema.astro
---
interface Props {
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  url: string;
  keywords: string[];
}

const { title, description, datePublished, dateModified, url, keywords } = Astro.props;

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": title,
  "description": description,
  "author": {
    "@type": "Person",
    "name": "Ryan Dahlberg",
    "url": "https://ry-ops.dev/about"
  },
  "datePublished": datePublished,
  "dateModified": dateModified,
  "publisher": {
    "@type": "Person",
    "name": "Ryan Dahlberg"
  },
  "mainEntityOfPage": url,
  "keywords": keywords
};
---

<script type="application/ld+json" set:html={JSON.stringify(articleSchema)} />
```

**Deliverable**: TechArticle schema component

#### 2.2 HowTo Schema Template
```javascript
// blog/src/components/schemas/HowToSchema.astro
// Template for tutorial posts
// Reference: /Users/ryandahlberg/Projects/AEO/README.md (lines 142-166)
```

**Deliverable**: HowTo schema component

#### 2.3 FAQPage Schema Template
```javascript
// blog/src/components/schemas/FAQPageSchema.astro
// Template for FAQ sections
// Reference: /Users/ryandahlberg/Projects/AEO/README.md (lines 188-205)
```

**Deliverable**: FAQPage schema component

#### 2.4 Optimize Top 5 Posts
**Optimization Steps**:
1. Rewrite title as question (e.g., "How to Build an MCP Server")
2. Add TL;DR in first paragraph
3. Convert headings to semantic structure (H2 topics, H3 sub-points)
4. Add FAQ section with 3-5 natural language questions
5. Inject appropriate schema (TechArticle or HowTo)
6. Update meta description to be answer-focused

**Deliverable**: 5 fully optimized blog posts

#### 2.5 Deploy Person Schema
```astro
// blog/src/layouts/BaseLayout.astro
---
import PersonSchema from '../components/schemas/PersonSchema.astro';
---

<html>
  <head>
    <PersonSchema />
    <!-- Other head content -->
  </head>
  <body>
    <slot />
  </body>
</html>
```

**Deliverable**: Site-wide Person schema deployment

### Success Criteria (Week 4)
- ✅ All schema types tested and validated (Google Rich Results Test)
- ✅ Top 5 posts pass AEO audit (100% criteria met)
- ✅ Schemas render correctly across all post types
- ✅ Person schema live on all pages

### Token Budget: 40,000

---

## Phase 3: Content Generation (Months 2-3)

### Objectives
- Generate 15 AEO-optimized blog posts
- Build automated FAQ generation
- Create topic clusters

### Priority Content (from AEO guide analysis)

#### 3.1 MCP Server Content (5 posts)
1. **"What is Model Context Protocol (MCP)? A Complete Guide"**
   - Cornerstone content
   - Schema: TechArticle
   - FAQ: 5 questions about MCP basics

2. **"How to Build an MCP Server: Step-by-Step Tutorial"**
   - Schema: HowTo
   - Prerequisites section
   - 8-10 implementation steps

3. **"MCP Server for UniFi: Managing Networks with AI"**
   - Case study: unifi-mcp-server
   - Schema: TechArticle + SoftwareSourceCode
   - Real-world use cases

4. **"MCP Server for Proxmox: AI-Powered Virtualization Management"**
   - Case study: proxmox-mcp-server
   - Integration guide
   - Performance metrics

5. **"Comparing MCP Server Implementations: TypeScript vs Python"**
   - High AEO value (comparison content)
   - Side-by-side code examples
   - Decision framework

#### 3.2 Infrastructure Automation (5 posts)
6. **"How to Set Up Dynamic DNS with UniFi and Cloudflare"**
   - Tutorial: unifi-cloudflare-ddns
   - Schema: HowTo
   - Troubleshooting section

7. **"Proxmox Home Lab Setup: Complete Guide for 2025"**
   - Comprehensive setup guide
   - Hardware recommendations
   - Best practices

8. **"UniFi Network Monitoring with Grafana: Real-Time Dashboards"**
   - Tutorial: unifi-grafana-streamer
   - Dashboard screenshots
   - Alert configuration

9. **"Docker Container Management Best Practices"**
   - Based on cortex containerization
   - Security considerations
   - Resource optimization

10. **"Infrastructure as Code: Automating Your Home Lab"**
    - Meta-content about automation
    - Cortex integration examples
    - Workflow automation

#### 3.3 Cortex Project Documentation (5 posts)
11. **"Building an AI Agent Orchestration System"**
    - Cortex architecture overview
    - Master-worker pattern
    - Real-world applications

12. **"How Cortex Automates GitHub Repository Management"**
    - Use cases and workflows
    - Integration examples
    - ROI analysis

13. **"MCP Server for Resource Management: Cortex Resource Manager"**
    - cortex-resource-manager deep dive
    - Kubernetes integration
    - Load balancing strategies

14. **"Self-Optimizing AI Systems: Cortex Meta-Execution"**
    - Advanced concepts
    - Self-improvement patterns
    - Future directions

15. **"Answer Engine Optimization with AI: A Meta Case Study"**
    - This AEO integration project
    - Metrics and results
    - Lessons learned

### Content Generation Workflow

**Automated Process**:
```bash
# 1. Extract repository metadata from inventory
repo_data=$(jq '.repositories[] | select(.name == "ry-ops/unifi-mcp-server")' \
  coordination/repository-inventory.json)

# 2. Generate blog post outline from template
# Template: /Users/ryandahlberg/Projects/AEO/README.md (lines 214-266)

# 3. Spawn documentor worker with:
# - Repository metadata
# - AEO template structure
# - FAQ generation instructions
# - Schema markup requirements

# 4. Review and publish
```

### FAQ Automation

**Source**: Repository READMEs
**Target**: Blog post FAQ sections
**Process**:
1. Extract common issues from README
2. Convert to natural language questions
3. Generate concise answers (1-2 sentences)
4. Inject FAQPage schema

**Example**:
```markdown
## Frequently Asked Questions

### What is the n8n-mcp-server?
The n8n-mcp-server is a Model Context Protocol server that enables AI assistants to manage n8n workflows, executions, and credentials through natural language commands.

### How do I install the n8n-mcp-server?
Install using `uvx` with the command: `uvx n8n-mcp-server --api-url YOUR_N8N_URL --api-key YOUR_API_KEY`

### Is the n8n-mcp-server secure?
Yes, API keys are stored only in environment variables and never logged. Regular key rotation is recommended for production use.
```

### Success Criteria (Month 3)
- ✅ 15 blog posts published (AEO-optimized)
- ✅ FAQ automation tested on 10+ repositories
- ✅ Topic clusters interlinked (MCP ↔ Infrastructure ↔ Cortex)
- ✅ All posts include schema markup

### Token Budget: 60,000

---

## Phase 4: Monitoring & Optimization (Ongoing)

### Objectives
- Track AI referral traffic
- Monitor citation rates
- Automate content freshness
- Generate performance reports

### 4.1 AI Traffic Analytics

**Setup**:
```javascript
// Add to blog analytics config
const aiReferrers = [
  'chat.openai.com',
  'chatgpt.com',
  'perplexity.ai',
  'claude.ai',
  'bard.google.com',
  'gemini.google.com',
  'copilot.microsoft.com',
  'bing.com/chat'
];

// Track as custom dimension in analytics
// Filter reports by ai_referrer dimension
```

**Deliverable**: AI traffic dashboard in analytics

### 4.2 Citation Monitoring

**Manual Queries** (weekly):
- "What is an MCP server?"
- "How do I monitor UniFi with Grafana?"
- "Best practices for Proxmox home lab"
- "UniFi Cloudflare DDNS setup"
- "How to build an AI agent system"

**Tracking**:
| Date | Query | Platform | Cited? | URL | Position |
|------|-------|----------|--------|-----|----------|
| 2025-12-20 | What is MCP | ChatGPT | Yes | /blog/what-is-mcp | 2nd citation |

**Deliverable**: Citation tracking spreadsheet

### 4.3 Content Freshness Scoring

**Criteria**:
- Last updated < 90 days: 100%
- Last updated 90-180 days: 75%
- Last updated 180-365 days: 50%
- Last updated > 365 days: 25%

**Target**: 80% average freshness score

**Automated Audit**:
```bash
# Quarterly content audit
# 1. List all blog posts
# 2. Check last modified date
# 3. Calculate freshness score
# 4. Identify posts needing updates
# 5. Generate update recommendations
```

**Deliverable**: Quarterly audit reports

### 4.4 Performance Reporting

**Monthly Metrics**:
- AI referral traffic % (target: 5-8%)
- AI citations per week (target: 10)
- Blog posts optimized (target: 100)
- Content freshness score (target: 80%)
- AI traffic conversion rate vs organic

**Report Format**:
```markdown
# AEO Performance Report - [Month]

## Key Metrics
- AI Traffic: X% (↑/↓ Y% vs last month)
- Citations: Z per week (↑/↓ A vs last month)
- Posts Optimized: B/100
- Freshness Score: C%

## Highlights
- [Key achievement 1]
- [Key achievement 2]

## Action Items
- [Recommendation 1]
- [Recommendation 2]

## Next Month Goals
- [Goal 1]
- [Goal 2]
```

**Deliverable**: Monthly performance summaries

### Success Criteria (Month 6)
- ✅ AI referral traffic > 5% of total
- ✅ 10+ AI citations per week detected
- ✅ Content freshness score > 80%
- ✅ Quarterly audits automated
- ✅ ROI validated vs Webflow benchmark

### Token Budget: 20,000 (ongoing)

---

## Integration Architecture

### Master Responsibilities

**Documentation Master** (Primary Owner):
- Generate llms.txt from inventory
- Create schema templates
- Optimize blog post structure
- Generate FAQ sections
- Audit content for AI discoverability

**Development Master** (Implementation):
- Astro component development
- Schema injection implementation
- Blog repository integration
- Frontend deployment

**CI/CD Master** (Automation):
- Automate llms.txt regeneration (on inventory updates)
- Schedule quarterly content audits
- Deploy schema templates
- Monitor build pipeline

**Security Master** (Validation):
- Validate llms.txt for sensitive data
- Review attribution requirements
- Monitor AI citation patterns
- Ensure license compliance

**Coordinator Master** (Tracking):
- Track overall integration progress
- Coordinate cross-master handoffs
- Report portfolio optimization metrics
- Validate success criteria

### Worker Types

**AEO Documentor Worker**:
- Capabilities: llms_txt_generation, schema_markup, faq_generation, content_audit
- Knowledge base: AEO guide, repository inventory, blog content
- Token allocation: 8,000 per task

**Blog Content Generator Worker**:
- Capabilities: technical_writing, code_examples, tutorial_structure
- Knowledge base: Repository READMEs, AEO templates, topic clusters
- Token allocation: 12,000 per post

**Content Auditor Worker**:
- Capabilities: freshness_scoring, aeo_compliance, update_recommendations
- Knowledge base: AEO audit criteria, blog post history
- Token allocation: 5,000 per audit

---

## Success Metrics Dashboard

### Week 4 Checkpoint
- [ ] llms.txt live and validated
- [ ] Blog repository analyzed and documented
- [ ] Person schema deployed site-wide
- [ ] Top 5 posts optimized
- [ ] Analytics tracking configured

### Month 2 Checkpoint
- [ ] 15 posts optimized (TechArticle/HowTo schema)
- [ ] Schema coverage > 50% of blog
- [ ] First AI referrals detected in analytics
- [ ] FAQ automation operational
- [ ] Citation monitoring active

### Month 3 Checkpoint
- [ ] 30 posts optimized
- [ ] AI traffic > 2% of total
- [ ] 5+ citations per week detected
- [ ] Topic clusters complete (MCP, Infrastructure, Cortex)
- [ ] llms.txt updated with new posts

### Month 6 Review
- [ ] 100 posts optimized (100% coverage target)
- [ ] AI traffic 5-8% of total (Webflow benchmark)
- [ ] 10+ citations per week
- [ ] Content freshness score > 80%
- [ ] Quarterly audits automated
- [ ] ROI validated and documented

---

## Risk Mitigation

### Technical Risks

**Risk**: Blog repository access delays
**Mitigation**: Use GitHub API for read-only analysis; coordinate with Development Master
**Contingency**: Generate artifacts locally, provide to user for manual deployment

**Risk**: Astro framework complexity
**Mitigation**: Start with static llms.txt (no framework required); adapt Gatsby examples
**Contingency**: Use HTML meta tags instead of components; Astro middleware for injection

**Risk**: AI platform specification changes
**Mitigation**: Monitor llms.txt spec updates; quarterly best practice reviews
**Contingency**: Maintain backward compatibility; support multiple schema versions

### Content Risks

**Risk**: Low content quality from automation
**Mitigation**: Human review before publication; A/B test structures; depth-first optimization
**Contingency**: Reduce velocity, increase quality thresholds, focus on evergreen content

**Risk**: Sensitive data exposure in llms.txt
**Mitigation**: Security Master validation; automated scanning for secrets
**Contingency**: Add robots.txt restrictions; DMCA for misattributed content

---

## Quick Start Commands

### Initial Setup
```bash
# Clone blog repository
cd /Users/ryandahlberg/Projects
git clone https://github.com/ry-ops/blog.git

# Analyze blog structure
cd blog
cat package.json | jq .dependencies.astro
ls -la src/content/posts/ | wc -l

# Generate llms.txt
cat > public/llms.txt << 'EOF'
[Content from Phase 1.2]
EOF
```

### Validation
```bash
# Validate schema (Google Rich Results Test)
# Visit: https://search.google.com/test/rich-results
# Paste URL or code snippet

# Check llms.txt accessibility
curl https://ry-ops.dev/llms.txt

# Verify analytics tracking
# Check referrer data for AI platforms
```

### Monitoring
```bash
# Content freshness audit
find src/content/posts -name "*.md" -mtime +90 | wc -l

# Schema coverage check
grep -r "application/ld+json" src/ | wc -l

# AI referrer tracking
# Query analytics API for custom dimension
```

---

## Reference Links

### Documentation
- **AEO Guide**: /Users/ryandahlberg/Projects/AEO/README.md
- **Catalog**: /Users/ryandahlberg/Projects/cortex/coordination/masters/inventory/catalogs/AEO-CATALOG.md
- **Strategic Recommendation**: /Users/ryandahlberg/Projects/cortex/coordination/masters/inventory/catalogs/AEO-STRATEGIC-RECOMMENDATION.md
- **Handoff**: /Users/ryandahlberg/Projects/cortex/coordination/masters/inventory/handoffs/inv-to-dev-aeo-integration-20251213.json

### External Resources
- **llms.txt Spec**: https://llmstxt.org
- **Schema.org**: https://schema.org
- **Webflow Case Study**: https://webflow.com/blog/inside-aeo-strategy
- **Google Rich Results Test**: https://search.google.com/test/rich-results

### Repositories
- **AEO**: https://github.com/ry-ops/AEO
- **Blog**: https://github.com/ry-ops/blog
- **Cortex**: https://github.com/ry-ops/cortex

---

## Token Budget Summary

| Phase | Timeline | Estimated Tokens | Cumulative |
|-------|----------|------------------|------------|
| Cataloging | Complete | 30,000 | 30,000 |
| Phase 1 | Week 1 | 20,000 | 50,000 |
| Phase 2 | Weeks 2-4 | 40,000 | 90,000 |
| Phase 3 | Months 2-3 | 60,000 | 150,000 |
| Phase 4 | Ongoing | 20,000 | 170,000 |

**Total Budget**: 170,000 tokens (within Cortex limits)

---

**Integration Owner**: Documentation Master (post-implementation)
**Current Status**: Phase 1 Ready to Start
**Next Action**: Development Master to pick up handoff and analyze blog repository
**Last Updated**: 2025-12-13
