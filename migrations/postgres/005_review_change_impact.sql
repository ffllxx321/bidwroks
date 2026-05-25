-- CREATE TABLE statements for review_comments, review_comment_replies, review_status_logs, change_impact_records, and notifications in PostgreSQL
-- Fully compatible with TIMESTAMPTZ, foreign constraints, schema indices.

CREATE TABLE IF NOT EXISTS review_comments (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    taskId VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    documentId VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    documentVersionId VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    commentType VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sourcePage INTEGER,
    sourceParagraph INTEGER,
    sourceTextSnippet TEXT,
    assignedTo VARCHAR(64) NOT NULL,
    createdBy VARCHAR(100) NOT NULL,
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'open',
    closedBy VARCHAR(100),
    closedAt TIMESTAMPTZ,
    closeReason TEXT,
    updatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_comment_replies (
    id VARCHAR(64) PRIMARY KEY,
    commentId VARCHAR(64) NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
    projectId VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    taskId VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    documentId VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    documentVersionId VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    newDocumentVersionId VARCHAR(64) REFERENCES document_versions(id) ON DELETE SET NULL,
    replyContent TEXT NOT NULL,
    repliedBy VARCHAR(100) NOT NULL,
    repliedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_status_logs (
    id VARCHAR(64) PRIMARY KEY,
    commentId VARCHAR(64) NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
    oldStatus VARCHAR(50),
    newStatus VARCHAR(50) NOT NULL,
    changedBy VARCHAR(100) NOT NULL,
    changedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS change_impact_records (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    masterDataChangeId VARCHAR(64),
    fieldName VARCHAR(100) NOT NULL,
    oldValue TEXT,
    newValue TEXT,
    impactLevel VARCHAR(20) DEFAULT 'low',
    affectedType VARCHAR(50) NOT NULL, -- task, document, document_version, review_comment, document_requirement, self_check_issue
    affectedId VARCHAR(64) NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'open',
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolvedBy VARCHAR(100),
    resolvedAt TIMESTAMPTZ,
    resolutionNote TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    projectId VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId VARCHAR(64) NOT NULL,
    notificationType VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sourceType VARCHAR(50),
    sourceId VARCHAR(64),
    isRead BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    readAt TIMESTAMPTZ
);

CREATE INDEX idx_review_comments_project ON review_comments(projectId);
CREATE INDEX idx_review_replies_comment ON review_comment_replies(commentId);
CREATE INDEX idx_change_impact_project ON change_impact_records(projectId);
CREATE INDEX idx_notifications_user ON notifications(userId);
