CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doc_hash TEXT NOT NULL UNIQUE,
  num_pages INT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE chunks (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_hash TEXT NOT NULL,
  
  token_count INT
);

CREATE UNIQUE INDEX idx_chunks_chunk_hash ON chunks(chunk_hash);
CREATE INDEX idx_chunks_chunk_text_trgm ON chunks USING gin (chunk_text gin_trgm_ops);