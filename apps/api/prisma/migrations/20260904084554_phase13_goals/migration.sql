-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('HOUSE', 'MARRIAGE', 'VACATION', 'EDUCATION', 'EMERGENCY_FUND', 'RETIREMENT', 'CAR', 'CUSTOM');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(20,6) NOT NULL,
    "targetDate" DATE NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "linkedAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "standaloneProgressAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_userId_idx" ON "goals"("userId");

-- CreateIndex
CREATE INDEX "goals_userId_deletedAt_idx" ON "goals"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
