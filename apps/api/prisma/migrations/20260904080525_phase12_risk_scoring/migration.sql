-- CreateTable
CREATE TABLE "risk_score_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "subScores" JSONB NOT NULL,
    "snapshotDate" DATE NOT NULL,

    CONSTRAINT "risk_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_score_snapshots_userId_snapshotDate_idx" ON "risk_score_snapshots"("userId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "risk_score_snapshots_userId_snapshotDate_key" ON "risk_score_snapshots"("userId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "risk_score_snapshots" ADD CONSTRAINT "risk_score_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
