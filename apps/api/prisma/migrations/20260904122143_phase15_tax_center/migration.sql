-- CreateEnum
CREATE TYPE "TaxHoldingType" AS ENUM ('STOCK', 'MUTUAL_FUND', 'CRYPTO');

-- CreateEnum
CREATE TYPE "TaxLotStatus" AS ENUM ('OPEN', 'PARTIALLY_DISPOSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CapitalGainsTerm" AS ENUM ('SHORT', 'LONG');

-- CreateTable
CREATE TABLE "tax_lots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "holdingType" "TaxHoldingType" NOT NULL,
    "assetId" TEXT,
    "ticker" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "remainingQuantity" DECIMAL(28,10) NOT NULL,
    "costBasisPerUnit" DECIMAL(20,6) NOT NULL,
    "costBasisCurrency" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "isBackfillEstimate" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaxLotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_lot_disposals" (
    "id" TEXT NOT NULL,
    "taxLotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "proceedsPerUnit" DECIMAL(20,6) NOT NULL,
    "proceedsCurrency" TEXT NOT NULL,
    "disposedAt" TIMESTAMP(3) NOT NULL,
    "holdingPeriodDays" INTEGER NOT NULL,
    "term" "CapitalGainsTerm" NOT NULL,
    "realizedGainLoss" DECIMAL(20,6) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_lot_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_lots_userId_idx" ON "tax_lots"("userId");

-- CreateIndex
CREATE INDEX "tax_lots_userId_holdingType_ticker_idx" ON "tax_lots"("userId", "holdingType", "ticker");

-- CreateIndex
CREATE INDEX "tax_lots_userId_status_idx" ON "tax_lots"("userId", "status");

-- CreateIndex
CREATE INDEX "tax_lot_disposals_userId_idx" ON "tax_lot_disposals"("userId");

-- CreateIndex
CREATE INDEX "tax_lot_disposals_userId_disposedAt_idx" ON "tax_lot_disposals"("userId", "disposedAt");

-- CreateIndex
CREATE INDEX "tax_lot_disposals_taxLotId_idx" ON "tax_lot_disposals"("taxLotId");

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lot_disposals" ADD CONSTRAINT "tax_lot_disposals_taxLotId_fkey" FOREIGN KEY ("taxLotId") REFERENCES "tax_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lot_disposals" ADD CONSTRAINT "tax_lot_disposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
