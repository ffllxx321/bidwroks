-- CREATE TABLE statements for documents, document_versions, and parsed_document_chunks table in PostgreSQL
-- Adheres to strict version tracking without overwrite, referencing projects.

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id VARCHAR(64), -- Can reference tasks table created in later steps
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    is_sensitive BOOLEAN DEFAULT FALSE,
    allow_ai_read BOOLEAN DEFAULT TRUE,
    current_version_id VARCHAR(64),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    parse_status VARCHAR(50) DEFAULT 'unparsed',
    status VARCHAR(50) DEFAULT 'draft',
    requiresReview BOOLEAN DEFAULT FALSE,
    reviewReason TEXT,
    reviewSourceChangeId VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_versions (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    storage_path TEXT NOT NULL, -- Path on disk / container storage, NEVER store big binaries directly in DB
    file_hash VARCHAR(64),
    file_size BIGINT DEFAULT 0,
    is_latest BOOLEAN DEFAULT TRUE,
    is_final BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'uploaded',
    upload_note TEXT,
    requiresReview BOOLEAN DEFAULT FALSE,
    reviewReason TEXT,
    reviewSourceChangeId VARCHAR(64),
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parsed_document_chunks (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_document_versions_doc ON document_versions(document_id);
CREATE INDEX idx_parsed_chunks_version ON parsed_document_chunks(document_version_id);
