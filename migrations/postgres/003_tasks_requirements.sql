-- CREATE TABLE statements for document_requirements, tasks, task_dependencies, task_status_logs, task_date_changes in PostgreSQL
-- Proper reference fields with TIMESTAMPTZ support.

CREATE TABLE IF NOT EXISTS document_requirements (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_name TEXT NOT NULL,
    requirement_type VARCHAR(100),
    source_type VARCHAR(50) NOT NULL,
    source_extraction_result_id VARCHAR(64),
    default_responsible_role VARCHAR(50),
    default_reviewer_role VARCHAR(50),
    suggested_preparation_days INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending',
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_id VARCHAR(64) REFERENCES document_requirements(id) ON DELETE SET NULL,
    task_name TEXT NOT NULL,
    task_type VARCHAR(100),
    responsible_user_id VARCHAR(64),
    reviewer_user_id VARCHAR(64),
    start_date VARCHAR(50),
    due_date VARCHAR(50),
    review_due_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'not_started',
    priority VARCHAR(20) DEFAULT 'Medium',
    risk_level VARCHAR(20) DEFAULT 'Low',
    is_date_locked BOOLEAN DEFAULT FALSE,
    requiresReview BOOLEAN DEFAULT FALSE,
    reviewReason TEXT,
    reviewSourceChangeId VARCHAR(64),
    reviewConfirmedBy VARCHAR(100),
    reviewConfirmedAt TIMESTAMPTZ,
    reviewConfirmationNote TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_dependencies (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_status_logs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS task_date_changes (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    old_value VARCHAR(50),
    new_value VARCHAR(50),
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX idx_task_deps_depends ON task_dependencies(depends_on_task_id);
