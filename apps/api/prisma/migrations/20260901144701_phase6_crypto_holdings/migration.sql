-- CreateEnum
CREATE TYPE "PriceAlertDirection" AS ENUM ('ABOVE', 'BELOW');

-- CreateTable
CREATE TABLE "crypto_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "avgBuyPrice" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "walletAddress" TEXT,
    "purchaseDate" DATE,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_price_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "targetPrice" DECIMAL(20,6) NOT NULL,
    "direction" "PriceAlertDirection" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crypto_holdings_assetId_key" ON "crypto_holdings"("assetId");

-- CreateIndex
CREATE INDEX "crypto_holdings_userId_idx" ON "crypto_holdings"("userId");

-- CreateIndex
CREATE INDEX "crypto_holdings_coinId_idx" ON "crypto_holdings"("coinId");

-- CreateIndex
CREATE INDEX "crypto_price_alerts_userId_idx" ON "crypto_price_alerts"("userId");

-- CreateIndex
CREATE INDEX "crypto_price_alerts_coinId_idx" ON "crypto_price_alerts"("coinId");

-- AddForeignKey
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_price_alerts" ADD CONSTRAINT "crypto_price_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
