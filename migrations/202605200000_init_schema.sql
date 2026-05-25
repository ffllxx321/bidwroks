-- ============================================================================
-- BidWorks MVP Initial DB Migration Schema (Local/PostgreSQL compatible)
-- Enforcing strict Rule 1 (Numeric Splitting) & Rule 2 (Version Archiving)
-- ============================================================================

-- 1. Users & RBAC Roles Tables
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(64) PRIMARY KEY,
    role_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(64),
    role_id VARCHAR(64),
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 2. Project Table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id VARCHAR(64),
    user_id VARCHAR(64),
    role_name VARCHAR(50) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Project Master Data table (Rule 1: Numerical Unit Separation)
CREATE TABLE IF NOT EXISTS project_master_data (
    project_id VARCHAR(64) PRIMARY KEY,
    project_name TEXT NOT NULL,
    client_name TEXT,
    project_address TEXT,
    building_type TEXT,
    
    -- RULE 1: Separate Value and Unit
    gross_floor_area_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    gross_floor_area_unit VARCHAR(20) NOT NULL DEFAULT '㎡',
    
    total_duration_value INTEGER NOT NULL DEFAULT 0,
    total_duration_unit VARCHAR(20) NOT NULL DEFAULT '日历天',
    
    bid_closing_date VARCHAR(50),
    clarification_due VARCHAR(50),
    site_visit_date VARCHAR(50),
    
    tender_scope TEXT,
    construct_scope TEXT,
    design_scope TEXT,
    payment_terms TEXT,
    bim_requirements TEXT,
    green_buildings TEXT,
    safety_level TEXT,
    quality_goal TEXT,
    vecd_constraints TEXT,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 4. Master Data Change Logs
CREATE TABLE IF NOT EXISTS master_data_changes (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(100) NOT NULL, -- e.g. 'Manual Update', 'AI Confirmation'
    impact_level VARCHAR(20) DEFAULT 'Low', -- Low, Medium, High
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 5. Security & Audits Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64),
    operator VARCHAR(100) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL, -- Upload, Download, Login, AI_Call
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 6. Document & Iterative version tables (Rule 2: Never Physically Overwrite)
DROP TABLE IF EXISTS review_comment_replies;
DROP TABLE IF EXISTS review_status_logs;
DROP TABLE IF EXISTS review_comments;
DROP TABLE IF EXISTS change_impact_records;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS self_check_issues;
DROP TABLE IF EXISTS self_check_runs;
DROP TABLE IF EXISTS parsed_document_chunks;
DROP TABLE IF EXISTS ai_extraction_results;
DROP TABLE IF EXISTS ai_call_logs;
DROP TABLE IF EXISTS document_versions;
DROP TABLE IF EXISTS documents;

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- e.g. 'pdf', 'docx'
    document_type VARCHAR(100) NOT NULL, -- e.g. 'tender_document'
    is_sensitive BOOLEAN DEFAULT FALSE,
    allow_ai_read BOOLEAN DEFAULT TRUE,
    current_version_id VARCHAR(64),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parse_status VARCHAR(50) DEFAULT 'unparsed', -- unparsed, parsing, parsed, failed
    status VARCHAR(50) DEFAULT 'draft',
    requiresReview BOOLEAN DEFAULT FALSE,
    reviewReason TEXT,
    reviewSourceChangeId VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    version_number INTEGER NOT NULL, -- e.g. 1, 2, 3
    storage_path TEXT NOT NULL, -- e.g. uploads/proj-1/v1.docx
    file_hash VARCHAR(64),
    file_size INTEGER DEFAULT 0,
    is_latest BOOLEAN DEFAULT TRUE,
    is_final BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'uploaded',
    upload_note TEXT,
    requiresReview BOOLEAN DEFAULT FALSE,
    reviewReason TEXT,
    reviewSourceChangeId VARCHAR(64),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS self_check_runs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    document_id VARCHAR(64) NOT NULL,
    document_version_id VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL, -- e.g. running, passed, failed, completed_with_ignored_issues
    executed_by VARCHAR(100) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(document_version_id) REFERENCES document_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS self_check_issues (
    id VARCHAR(64) PRIMARY KEY,
    self_check_run_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64),
    document_id VARCHAR(64) NOT NULL,
    document_version_id VARCHAR(64) NOT NULL,
    issue_type VARCHAR(100) NOT NULL, -- e.g. project_name_mismatch, old_project_name, gross_floor_area_mismatch, duration_mismatch, tender_requirement_missing, manual_review_required
    severity VARCHAR(20) NOT NULL, -- e.g. high, medium, low
    message TEXT NOT NULL,
    source_text_snippet TEXT,
    source_page INT,
    source_paragraph INT,
    expected_value TEXT,
    actual_value TEXT,
    status VARCHAR(50) DEFAULT 'open', -- e.g. open, ignored, resolved, false_positive
    ignored_reason TEXT,
    ignored_by VARCHAR(100),
    ignored_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(self_check_run_id) REFERENCES self_check_runs(id) ON DELETE CASCADE,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(document_version_id) REFERENCES document_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensitive_black_dictionary (
    id VARCHAR(64) PRIMARY KEY,
    sensitive_word VARCHAR(100) NOT NULL UNIQUE,
    replacement_hint TEXT
);

-- 7. Document Parser Chunks
CREATE TABLE IF NOT EXISTS parsed_document_chunks (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    document_version_id VARCHAR(64) NOT NULL,
    page_number INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(document_version_id) REFERENCES document_versions(id) ON DELETE CASCADE
);

-- 8. AI Extraction Results
CREATE TABLE IF NOT EXISTS ai_extraction_results (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    document_id VARCHAR(64) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(255) NOT NULL,
    extracted_value TEXT,
    normalized_value TEXT,
    source_page VARCHAR(50),
    source_paragraph VARCHAR(50),
    source_text_snippet TEXT,
    confidence NUMERIC(5, 2) DEFAULT 1.0,
    status VARCHAR(50) DEFAULT 'pending_confirmation', -- pending_confirmation, confirmed, ignored, needs_review
    requires_human_confirmation BOOLEAN DEFAULT TRUE,
    confirmed_by VARCHAR(100),
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 9. AI Call Logs (Secured and audit logged)
CREATE TABLE IF NOT EXISTS ai_call_logs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64),
    document_id VARCHAR(64),
    actor_id VARCHAR(100),
    provider VARCHAR(100),
    action VARCHAR(100),
    result TEXT,
    permission_result VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 10. Document Requirements Table (Iteration 3)
DROP TABLE IF EXISTS document_requirements;
CREATE TABLE IF NOT EXISTS document_requirements (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    requirement_name TEXT NOT NULL,
    requirement_type VARCHAR(100),
    source_type VARCHAR(50) NOT NULL, -- e.g. 'common_template', 'tender_extraction', 'manual'
    source_extraction_result_id VARCHAR(64),
    default_responsible_role VARCHAR(50),
    default_reviewer_role VARCHAR(50),
    suggested_preparation_days INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'ignored', 'converted_to_task'
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 11. Tasks Table (Iteration 3)
DROP TABLE IF EXISTS tasks;
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    requirement_id VARCHAR(64),
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
    reviewConfirmedAt TIMESTAMP,
    reviewConfirmationNote TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(requirement_id) REFERENCES document_requirements(id) ON DELETE SET NULL
);

-- 12. Task Dependencies (Iteration 3)
DROP TABLE IF EXISTS task_dependencies;
CREATE TABLE IF NOT EXISTS task_dependencies (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    depends_on_task_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 13. Task Status Logs (Iteration 3)
DROP TABLE IF EXISTS task_status_logs;
CREATE TABLE IF NOT EXISTS task_status_logs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 14. Task Date Changes (Iteration 3)
DROP TABLE IF EXISTS task_date_changes;
CREATE TABLE IF NOT EXISTS task_date_changes (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(100) NOT NULL, -- 'start_date', 'due_date', 'review_due_date'
    old_value VARCHAR(50),
    new_value VARCHAR(50),
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 15. Review Comments (Iteration 5)
CREATE TABLE IF NOT EXISTS review_comments (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL,
    taskId VARCHAR(64) NOT NULL,
    documentId VARCHAR(64) NOT NULL,
    documentVersionId VARCHAR(64) NOT NULL,
    commentType VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sourcePage INTEGER,
    sourceParagraph INTEGER,
    sourceTextSnippet TEXT,
    assignedTo VARCHAR(64) NOT NULL,
    createdBy VARCHAR(100) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'open',
    closedBy VARCHAR(100),
    closedAt TIMESTAMP,
    closeReason TEXT,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(documentId) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(documentVersionId) REFERENCES document_versions(id) ON DELETE CASCADE
);

-- 16. Review Comment Replies (Iteration 5)
CREATE TABLE IF NOT EXISTS review_comment_replies (
    id VARCHAR(64) PRIMARY KEY,
    commentId VARCHAR(64) NOT NULL,
    projectId VARCHAR(64) NOT NULL,
    taskId VARCHAR(64) NOT NULL,
    documentId VARCHAR(64) NOT NULL,
    documentVersionId VARCHAR(64) NOT NULL,
    newDocumentVersionId VARCHAR(64),
    replyContent TEXT NOT NULL,
    repliedBy VARCHAR(100) NOT NULL,
    repliedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(commentId) REFERENCES review_comments(id) ON DELETE CASCADE,
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(documentId) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(documentVersionId) REFERENCES document_versions(id) ON DELETE CASCADE,
    FOREIGN KEY(newDocumentVersionId) REFERENCES document_versions(id) ON DELETE SET NULL
);

-- 17. Review Status Logs (Iteration 5)
CREATE TABLE IF NOT EXISTS review_status_logs (
    id VARCHAR(64) PRIMARY KEY,
    commentId VARCHAR(64) NOT NULL,
    oldStatus VARCHAR(50),
    newStatus VARCHAR(50) NOT NULL,
    changedBy VARCHAR(100) NOT NULL,
    changedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY(commentId) REFERENCES review_comments(id) ON DELETE CASCADE
);

-- 18. Change Impact Records (Iteration 5)
CREATE TABLE IF NOT EXISTS change_impact_records (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL,
    masterDataChangeId VARCHAR(64),
    fieldName VARCHAR(100) NOT NULL,
    oldValue TEXT,
    newValue TEXT,
    impactLevel VARCHAR(20) DEFAULT 'low',
    affectedType VARCHAR(50) NOT NULL, -- task, document, document_version, review_comment, document_requirement, self_check_issue
    affectedId VARCHAR(64) NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'open', -- open, marked_requires_review, confirmed, ignored
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolvedBy VARCHAR(100),
    resolvedAt TIMESTAMP,
    resolutionNote TEXT,
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);

-- 19. Notifications (Iteration 5)
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL,
    userId VARCHAR(64) NOT NULL,
    notificationType VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sourceType VARCHAR(50),
    sourceId VARCHAR(64),
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    readAt TIMESTAMP,
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);
