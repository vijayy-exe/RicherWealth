-- HNSW index for cosine-similarity search over PortfolioEmbedding.embedding.
-- Prisma's schema DSL has no syntax for pgvector index operator classes
-- (vector_cosine_ops), so this is a hand-written migration rather than
-- schema-generated -- the standard, documented way to add a pgvector index
-- under Prisma.
CREATE INDEX IF NOT EXISTS portfolio_embeddings_embedding_hnsw_idx
  ON portfolio_embeddings
  USING hnsw (embedding vector_cosine_ops);
