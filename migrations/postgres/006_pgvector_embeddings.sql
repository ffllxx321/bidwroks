-- ENABLING PGVECTOR EXTENSION AND SETTING UP SEMANTIC EMBEDDINGS TABLE FOR DOCUMENT CHUNKS
-- Allows project-level semantic search across multi-version documents

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
    id VARCHAR(64) PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    chunk_id VARCHAR(64) NOT NULL REFERENCES parsed_document_chunks(id) ON DELETE CASCADE,
    embedding VECTOR(1536), -- 1536 is standard for OpenAI / Gemini text embeddings
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-004',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_doc_embeddings_project ON document_embeddings(project_id);
-- HNSW index for high performance approximate nearest neighbor search
CREATE INDEX idx_doc_embeddings_vector ON document_embeddings USING hnsw (embedding vector_cosine_ops);
