-- Cortex PostgreSQL Schema
-- Complete relational database for permanent Cortex data
-- Version: 1.0
-- Design: Optimized for task management, lineage tracking, and audit compliance

-- ============================================================================
-- SCHEMA: Core Infrastructure
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- For advanced indexing

-- ============================================================================
-- DOMAIN TYPES
-- ============================================================================

CREATE TYPE agent_type AS ENUM ('master', 'worker', 'observer');
CREATE TYPE agent_status AS ENUM ('active', 'idle', 'suspended', 'terminated');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'blocked', 'cancelled');
CREATE TYPE task_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE worker_certification AS ENUM ('certified', 'provisional', 'suspended', 'revoked');
CREATE TYPE asset_type AS ENUM ('repository', 'service', 'database', 'infrastructure', 'documentation', 'configuration');
CREATE TYPE sensitivity_level AS ENUM ('public', 'internal', 'confidential', 'restricted', 'secret');
CREATE TYPE audit_event_type AS ENUM ('task_created', 'task_completed', 'task_failed', 'agent_spawned', 'agent_terminated', 'security_event', 'compliance_check', 'budget_alert', 'system_error');

-- ============================================================================
-- TABLE: agents
-- All agents in the Cortex system (masters, workers, observers)
-- ============================================================================

CREATE TABLE agents (
    agent_id VARCHAR(100) PRIMARY KEY,
    agent_type agent_type NOT NULL,
    agent_status agent_status NOT NULL DEFAULT 'active',

    -- Agent metadata
    display_name VARCHAR(255),
    color VARCHAR(50),
    icon VARCHAR(50),
    role TEXT,
    prompt_file VARCHAR(500),

    -- Parent-child relationships
    parent_agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,
    master_agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,

    -- Token budget
    token_budget_personal INTEGER DEFAULT 0,
    token_budget_worker_pool INTEGER DEFAULT 0,
    tokens_used_today INTEGER DEFAULT 0,
    tokens_used_total BIGINT DEFAULT 0,

    -- Worker-specific fields
    certification worker_certification,
    certification_date TIMESTAMPTZ,
    certified_by VARCHAR(100) REFERENCES agents(agent_id),
    specialization VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    last_checkin TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,

    -- Metadata
    capabilities JSONB DEFAULT '[]'::jsonb,
    configuration JSONB DEFAULT '{}'::jsonb,
    repositories TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT valid_token_usage CHECK (tokens_used_today >= 0 AND tokens_used_total >= 0),
    CONSTRAINT valid_budget CHECK (token_budget_personal >= 0 AND token_budget_worker_pool >= 0)
);

-- ============================================================================
-- TABLE: tasks
-- All tasks across the Cortex system
-- ============================================================================

CREATE TABLE tasks (
    task_id VARCHAR(100) PRIMARY KEY,
    task_status task_status NOT NULL DEFAULT 'pending',
    task_priority task_priority NOT NULL DEFAULT 'medium',

    -- Task definition
    title VARCHAR(500) NOT NULL,
    description TEXT,
    task_type VARCHAR(100),
    category VARCHAR(100),

    -- Assignment
    assigned_to_agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,
    created_by_agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,
    master_agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,

    -- Parent-child task relationships
    parent_task_id VARCHAR(100) REFERENCES tasks(task_id) ON DELETE CASCADE,
    root_task_id VARCHAR(100) REFERENCES tasks(task_id) ON DELETE CASCADE,

    -- Repository context
    repository_owner VARCHAR(255),
    repository_name VARCHAR(255),
    repository_url TEXT,

    -- Execution tracking
    tokens_allocated INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    timeout_minutes INTEGER,
    sla_minutes INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,

    -- Results
    result_summary TEXT,
    result_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    error_details JSONB,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT valid_tokens CHECK (tokens_used >= 0 AND tokens_allocated >= 0),
    CONSTRAINT valid_timestamps CHECK (
        (completed_at IS NULL OR started_at IS NOT NULL) AND
        (started_at IS NULL OR created_at <= started_at)
    )
);

-- ============================================================================
-- TABLE: task_lineage
-- Track task dependencies and execution flow
-- ============================================================================

CREATE TABLE task_lineage (
    id SERIAL PRIMARY KEY,
    parent_task_id VARCHAR(100) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    child_task_id VARCHAR(100) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'spawned',  -- spawned, depends_on, blocks
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(parent_task_id, child_task_id, relationship_type)
);

-- ============================================================================
-- TABLE: task_handoffs
-- Track task handoffs between agents
-- ============================================================================

CREATE TABLE task_handoffs (
    handoff_id SERIAL PRIMARY KEY,
    task_id VARCHAR(100) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    from_agent_id VARCHAR(100) NOT NULL REFERENCES agents(agent_id),
    to_agent_id VARCHAR(100) NOT NULL REFERENCES agents(agent_id),
    handoff_reason TEXT,
    context_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

-- ============================================================================
-- TABLE: assets
-- Catalog of all Cortex assets (repositories, services, etc.)
-- ============================================================================

CREATE TABLE assets (
    asset_id VARCHAR(100) PRIMARY KEY,
    asset_type asset_type NOT NULL,

    -- Asset identification
    name VARCHAR(500) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    namespace VARCHAR(100),

    -- Asset location
    file_path TEXT,
    url TEXT,

    -- Asset metadata
    description TEXT,
    owner VARCHAR(255),
    sensitivity sensitivity_level DEFAULT 'internal',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    health_status JSONB DEFAULT '{}'::jsonb,

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(category, '')), 'C')
    ) STORED
);

-- ============================================================================
-- TABLE: asset_lineage
-- Track data lineage between assets
-- ============================================================================

CREATE TABLE asset_lineage (
    id SERIAL PRIMARY KEY,
    upstream_asset_id VARCHAR(100) NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    downstream_asset_id VARCHAR(100) NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    lineage_type VARCHAR(50) DEFAULT 'depends_on',  -- depends_on, generates, transforms
    confidence DECIMAL(3,2) DEFAULT 1.0,  -- 0.00 to 1.00
    discovered_by VARCHAR(100) REFERENCES agents(agent_id),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,

    UNIQUE(upstream_asset_id, downstream_asset_id, lineage_type),
    CONSTRAINT valid_confidence CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

-- ============================================================================
-- TABLE: audit_logs
-- Comprehensive audit trail for compliance and security
-- ============================================================================

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type audit_event_type NOT NULL,

    -- Event context
    agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,
    task_id VARCHAR(100) REFERENCES tasks(task_id) ON DELETE SET NULL,
    asset_id VARCHAR(100) REFERENCES assets(asset_id) ON DELETE SET NULL,
    user_id VARCHAR(100),

    -- Event details
    event_summary TEXT NOT NULL,
    event_details JSONB DEFAULT '{}'::jsonb,

    -- Security context
    severity VARCHAR(20) DEFAULT 'info',  -- debug, info, warning, error, critical
    security_impact VARCHAR(20),  -- none, low, medium, high, critical
    compliance_tags TEXT[] DEFAULT ARRAY[]::TEXT[],

    -- IP and user agent (for API calls)
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- TABLE: users
-- User accounts for Cortex system access
-- ============================================================================

CREATE TABLE users (
    user_id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,

    -- Authentication
    password_hash VARCHAR(255),  -- bcrypt hash
    api_key_hash VARCHAR(255),

    -- User info
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',  -- admin, user, readonly

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,

    -- Metadata
    preferences JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- TABLE: governance_policies
-- Governance policies and rules
-- ============================================================================

CREATE TABLE governance_policies (
    policy_id VARCHAR(100) PRIMARY KEY,
    policy_name VARCHAR(255) NOT NULL,
    policy_type VARCHAR(100) NOT NULL,  -- security, compliance, data_quality, etc.

    -- Policy definition
    description TEXT,
    policy_rules JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100) REFERENCES users(user_id),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,

    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- TABLE: policy_violations
-- Track policy violations for compliance
-- ============================================================================

CREATE TABLE policy_violations (
    violation_id BIGSERIAL PRIMARY KEY,
    policy_id VARCHAR(100) NOT NULL REFERENCES governance_policies(policy_id),

    -- Violation context
    asset_id VARCHAR(100) REFERENCES assets(asset_id) ON DELETE SET NULL,
    task_id VARCHAR(100) REFERENCES tasks(task_id) ON DELETE SET NULL,
    agent_id VARCHAR(100) REFERENCES agents(agent_id) ON DELETE SET NULL,

    -- Violation details
    violation_summary TEXT NOT NULL,
    violation_details JSONB DEFAULT '{}'::jsonb,
    severity VARCHAR(20) DEFAULT 'medium',

    -- Resolution
    status VARCHAR(50) DEFAULT 'open',  -- open, acknowledged, resolved, false_positive
    resolved_by VARCHAR(100) REFERENCES users(user_id),
    resolution_notes TEXT,

    -- Timestamps
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- TABLE: token_budget_history
-- Track token budget usage over time
-- ============================================================================

CREATE TABLE token_budget_history (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    task_id VARCHAR(100) REFERENCES tasks(task_id) ON DELETE SET NULL,

    -- Token usage
    tokens_used INTEGER NOT NULL,
    tokens_remaining INTEGER NOT NULL,
    budget_type VARCHAR(20) NOT NULL,  -- personal, worker_pool

    -- Context
    operation VARCHAR(100),

    -- Timestamp
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_token_counts CHECK (tokens_used >= 0 AND tokens_remaining >= 0)
);

-- ============================================================================
-- INDEXES: Performance optimization
-- ============================================================================

-- Agent indexes
CREATE INDEX idx_agents_type_status ON agents(agent_type, agent_status);
CREATE INDEX idx_agents_parent ON agents(parent_agent_id) WHERE parent_agent_id IS NOT NULL;
CREATE INDEX idx_agents_master ON agents(master_agent_id) WHERE master_agent_id IS NOT NULL;
CREATE INDEX idx_agents_last_checkin ON agents(last_checkin);

-- Task indexes
CREATE INDEX idx_tasks_status ON tasks(task_status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX idx_tasks_created_by ON tasks(created_by_agent_id);
CREATE INDEX idx_tasks_master ON tasks(master_agent_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_root ON tasks(root_task_id) WHERE root_task_id IS NOT NULL;
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_priority_status ON tasks(task_priority, task_status);
CREATE INDEX idx_tasks_repository ON tasks(repository_owner, repository_name);

-- Task lineage indexes
CREATE INDEX idx_task_lineage_parent ON task_lineage(parent_task_id);
CREATE INDEX idx_task_lineage_child ON task_lineage(child_task_id);

-- Asset indexes
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_owner ON assets(owner);
CREATE INDEX idx_assets_namespace ON assets(namespace);
CREATE INDEX idx_assets_category ON assets(category, subcategory);
CREATE INDEX idx_assets_sensitivity ON assets(sensitivity);
CREATE INDEX idx_assets_search ON assets USING GIN(search_vector);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);

-- Asset lineage indexes
CREATE INDEX idx_asset_lineage_upstream ON asset_lineage(upstream_asset_id);
CREATE INDEX idx_asset_lineage_downstream ON asset_lineage(downstream_asset_id);

-- Audit log indexes
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_agent ON audit_logs(agent_id);
CREATE INDEX idx_audit_logs_task ON audit_logs(task_id);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_compliance ON audit_logs USING GIN(compliance_tags);

-- Policy violation indexes
CREATE INDEX idx_violations_policy ON policy_violations(policy_id);
CREATE INDEX idx_violations_asset ON policy_violations(asset_id);
CREATE INDEX idx_violations_status ON policy_violations(status);
CREATE INDEX idx_violations_detected ON policy_violations(detected_at DESC);

-- Token budget history indexes
CREATE INDEX idx_token_history_agent ON token_budget_history(agent_id, recorded_at DESC);
CREATE INDEX idx_token_history_task ON token_budget_history(task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- VIEWS: Convenient data access
-- ============================================================================

-- Active tasks by master
CREATE VIEW v_active_tasks_by_master AS
SELECT
    m.agent_id as master_id,
    m.display_name as master_name,
    t.task_status,
    COUNT(*) as task_count,
    SUM(t.tokens_allocated) as total_tokens_allocated,
    SUM(t.tokens_used) as total_tokens_used
FROM agents m
LEFT JOIN tasks t ON t.master_agent_id = m.agent_id
WHERE m.agent_type = 'master' AND m.agent_status = 'active'
GROUP BY m.agent_id, m.display_name, t.task_status;

-- Worker efficiency metrics
CREATE VIEW v_worker_efficiency AS
SELECT
    w.agent_id,
    w.display_name,
    w.specialization,
    COUNT(t.task_id) as tasks_completed,
    AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))/60) as avg_completion_minutes,
    SUM(t.tokens_used) as total_tokens_used,
    AVG(t.tokens_used) as avg_tokens_per_task
FROM agents w
LEFT JOIN tasks t ON t.assigned_to_agent_id = w.agent_id AND t.task_status = 'completed'
WHERE w.agent_type = 'worker'
GROUP BY w.agent_id, w.display_name, w.specialization;

-- Asset catalog summary
CREATE VIEW v_asset_catalog_summary AS
SELECT
    asset_type,
    category,
    sensitivity,
    COUNT(*) as asset_count,
    COUNT(DISTINCT owner) as unique_owners,
    COUNT(DISTINCT namespace) as unique_namespaces
FROM assets
GROUP BY asset_type, category, sensitivity;

-- Recent security events
CREATE VIEW v_recent_security_events AS
SELECT
    al.id,
    al.event_type,
    al.event_summary,
    al.severity,
    al.security_impact,
    al.agent_id,
    a.display_name as agent_name,
    al.occurred_at
FROM audit_logs al
LEFT JOIN agents a ON a.agent_id = al.agent_id
WHERE al.security_impact IN ('high', 'critical')
ORDER BY al.occurred_at DESC
LIMIT 100;

-- ============================================================================
-- FUNCTIONS: Business logic
-- ============================================================================

-- Function to get task hierarchy
CREATE OR REPLACE FUNCTION get_task_hierarchy(root_task VARCHAR(100))
RETURNS TABLE (
    task_id VARCHAR(100),
    parent_task_id VARCHAR(100),
    title VARCHAR(500),
    task_status task_status,
    level INTEGER
) AS $$
WITH RECURSIVE task_tree AS (
    -- Base case: root task
    SELECT
        t.task_id,
        t.parent_task_id,
        t.title,
        t.task_status,
        0 as level
    FROM tasks t
    WHERE t.task_id = root_task

    UNION ALL

    -- Recursive case: child tasks
    SELECT
        t.task_id,
        t.parent_task_id,
        t.title,
        t.task_status,
        tt.level + 1
    FROM tasks t
    INNER JOIN task_tree tt ON t.parent_task_id = tt.task_id
)
SELECT * FROM task_tree ORDER BY level, task_id;
$$ LANGUAGE SQL STABLE;

-- Function to calculate agent utilization
CREATE OR REPLACE FUNCTION get_agent_utilization(agent VARCHAR(100))
RETURNS TABLE (
    tokens_used_today INTEGER,
    token_budget_total INTEGER,
    utilization_percent DECIMAL(5,2),
    tasks_in_progress INTEGER,
    tasks_completed_today INTEGER
) AS $$
SELECT
    a.tokens_used_today,
    a.token_budget_personal + a.token_budget_worker_pool as token_budget_total,
    CASE
        WHEN (a.token_budget_personal + a.token_budget_worker_pool) > 0
        THEN ROUND((a.tokens_used_today::DECIMAL / (a.token_budget_personal + a.token_budget_worker_pool)::DECIMAL * 100), 2)
        ELSE 0.00
    END as utilization_percent,
    (SELECT COUNT(*) FROM tasks WHERE assigned_to_agent_id = agent AND task_status = 'in_progress') as tasks_in_progress,
    (SELECT COUNT(*) FROM tasks WHERE assigned_to_agent_id = agent AND task_status = 'completed' AND completed_at >= CURRENT_DATE) as tasks_completed_today
FROM agents a
WHERE a.agent_id = agent;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- TRIGGERS: Automated actions
-- ============================================================================

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_governance_policies_updated_at
    BEFORE UPDATE ON governance_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-create audit log on task completion
CREATE OR REPLACE FUNCTION log_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.task_status = 'completed' AND OLD.task_status != 'completed' THEN
        INSERT INTO audit_logs (event_type, agent_id, task_id, event_summary, event_details)
        VALUES (
            'task_completed',
            NEW.assigned_to_agent_id,
            NEW.task_id,
            'Task completed: ' || NEW.title,
            jsonb_build_object(
                'tokens_used', NEW.tokens_used,
                'duration_seconds', EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))
            )
        );
    ELSIF NEW.task_status = 'failed' AND OLD.task_status != 'failed' THEN
        INSERT INTO audit_logs (event_type, agent_id, task_id, event_summary, event_details, severity)
        VALUES (
            'task_failed',
            NEW.assigned_to_agent_id,
            NEW.task_id,
            'Task failed: ' || NEW.title,
            jsonb_build_object(
                'error_message', NEW.error_message,
                'error_details', NEW.error_details
            ),
            'error'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_completion_audit
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_completion();

-- ============================================================================
-- INITIAL DATA: System bootstrap
-- ============================================================================

-- Insert system user
INSERT INTO users (user_id, username, email, full_name, role, is_active, is_verified)
VALUES
    ('system', 'system', 'system@cortex.local', 'System User', 'admin', true, true)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- GRANTS: Security permissions
-- ============================================================================

-- Create roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_api') THEN
        CREATE ROLE cortex_api WITH LOGIN PASSWORD 'cortex_api_password_change_me';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_readonly') THEN
        CREATE ROLE cortex_readonly WITH LOGIN PASSWORD 'cortex_readonly_password';
    END IF;
END
$$;

-- Grant permissions to API role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cortex_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cortex_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cortex_api;

-- Grant read-only permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cortex_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO cortex_readonly;

-- ============================================================================
-- MAINTENANCE: Periodic cleanup
-- ============================================================================

-- Function to archive old audit logs (keep 90 days)
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    rows_deleted INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE occurred_at < NOW() - INTERVAL '90 days'
    AND severity IN ('debug', 'info');

    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RETURN rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE agents IS 'All agents in the Cortex system (masters, workers, observers)';
COMMENT ON TABLE tasks IS 'Task management and execution tracking';
COMMENT ON TABLE task_lineage IS 'Parent-child task relationships and dependencies';
COMMENT ON TABLE assets IS 'Catalog of all Cortex assets with full-text search';
COMMENT ON TABLE asset_lineage IS 'Data lineage and dependencies between assets';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for compliance and security';
COMMENT ON TABLE users IS 'User accounts for Cortex system access';
COMMENT ON TABLE governance_policies IS 'Governance policies and compliance rules';
COMMENT ON TABLE policy_violations IS 'Tracked policy violations for compliance';
COMMENT ON TABLE token_budget_history IS 'Historical token budget usage tracking';

-- Schema version tracking
CREATE TABLE schema_version (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT
);

INSERT INTO schema_version (version, description)
VALUES ('1.0.0', 'Initial Cortex PostgreSQL schema with full agent, task, asset, and audit support');
