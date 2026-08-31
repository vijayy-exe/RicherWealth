-- RicherWealth PostgreSQL initialization script
-- Runs once when the container is first created

-- Enable pgvector for RAG/embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search (useful for ticker/company search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
