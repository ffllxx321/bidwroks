-- CREATE TABLE statements for users, roles, user_roles, projects, project_members, project_master_data, master_data_changes, audit_logs in PostgreSQL
-- PostgreSQL TIMESTAMPTZ, BOOLEAN, NUMERIC, JSONB, etc.

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(64) PRIMARY KEY,
    role_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(64) REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

CREATE VIEW project_member_details AS
    SELECT pm.project_id, pm.user_id, pm.role_name, u.username, u.email
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id;

CREATE TABLE IF NOT EXISTS project_master_data (
    project_id VARCHAR(64) PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    client_name TEXT,
    project_address TEXT,
    building_type TEXT,
    
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
    
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS master_data_changes (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(100) NOT NULL,
    impact_level VARCHAR(20) DEFAULT 'Low'
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
    operator VARCHAR(100) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45)
);

CREATE INDEX idx_audit_logs_project ON audit_logs(project_id);
CREATE INDEX idx_master_data_changes_project ON master_data_changes(project_id);
