-- CREATE TABLE statements for self_check_runs and self_check_issues in PostgreSQL
-- Reference constraints are strictly implemented with TIMESTAMPTZ datatypes.

CREATE TABLE IF NOT EXISTS self_check_runs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE SET NULL,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    executed_by VARCHAR(100) NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS self_check_issues (
    id VARCHAR(64) PRIMARY KEY,
    self_check_run_id VARCHAR(64) NOT NULL REFERENCES self_check_runs(id) ON DELETE CASCADE,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE SET NULL,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    issue_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    source_text_snippet TEXT,
    source_page INT,
    source_paragraph INT,
    expected_value TEXT,
    actual_value TEXT,
    status VARCHAR(50) DEFAULT 'open',
    ignored_reason TEXT,
    ignored_by VARCHAR(100),
    ignored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensitive_black_dictionary (
    id VARCHAR(64) PRIMARY KEY,
    sensitive_word VARCHAR(100) NOT NULL UNIQUE,
    replacement_hint TEXT
);

CREATE INDEX idx_self_check_runs_project ON self_check_runs(project_id);
CREATE INDEX idx_self_check_issues_run ON self_check_issues(self_check_run_id);
