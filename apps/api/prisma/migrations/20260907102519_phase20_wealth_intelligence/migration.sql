-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiSuggestionType" ADD VALUE 'DEBT_COST_ALERT';
ALTER TYPE "AiSuggestionType" ADD VALUE 'RETIREMENT_ACCELERATION';
ALTER TYPE "AiSuggestionType" ADD VALUE 'LOW_FEE_ALTERNATIVE';
ALTER TYPE "AiSuggestionType" ADD VALUE 'DIVIDEND_OPPORTUNITY';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AI_INSIGHT';

-- DropIndex
DROP INDEX "portfolio_embeddings_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "wealth_health_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "subScores" JSONB NOT NULL,
    "snapshotDate" DATE NOT NULL,

    CONSTRAINT "wealth_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wealth_dna_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "narrative" TEXT NOT NULL,
    "isLLMGenerated" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wealth_dna_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_category_benchmarks" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "typicalExpenseRatioPct" DECIMAL(6,4) NOT NULL,
    "typicalDividendYieldPct" DECIMAL(6,4) NOT NULL,
    "exampleLowCostTicker" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_category_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wealth_health_snapshots_userId_snapshotDate_idx" ON "wealth_health_snapshots"("userId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "wealth_health_snapshots_userId_snapshotDate_key" ON "wealth_health_snapshots"("userId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "wealth_dna_profiles_userId_key" ON "wealth_dna_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fund_category_benchmarks_category_key" ON "fund_category_benchmarks"("category");

-- AddForeignKey
ALTER TABLE "wealth_health_snapshots" ADD CONSTRAINT "wealth_health_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wealth_dna_profiles" ADD CONSTRAINT "wealth_dna_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
