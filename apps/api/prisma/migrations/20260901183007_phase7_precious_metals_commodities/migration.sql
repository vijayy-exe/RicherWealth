-- CreateEnum
CREATE TYPE "PreciousMetalType" AS ENUM ('GOLD', 'SILVER');

-- CreateEnum
CREATE TYPE "PreciousMetalSubType" AS ENUM ('PHYSICAL', 'DIGITAL', 'ETF', 'JEWELLERY');

-- CreateEnum
CREATE TYPE "CommodityType" AS ENUM ('OIL', 'NATURAL_GAS', 'WHEAT', 'COFFEE', 'CORN', 'COPPER');

-- CreateTable
CREATE TABLE "precious_metal_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metalType" "PreciousMetalType" NOT NULL,
    "subType" "PreciousMetalSubType" NOT NULL,
    "weightGrams" DECIMAL(12,3),
    "purityFraction" DECIMAL(5,4),
    "quantity" DECIMAL(20,8),
    "avgBuyPrice" DECIMAL(20,6) NOT NULL,
    "makingCharge" DECIMAL(20,6),
    "currency" TEXT NOT NULL,
    "purchaseDate" DATE,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "precious_metal_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commodity_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commodityType" "CommodityType" NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "avgBuyPrice" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "purchaseDate" DATE,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commodity_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "precious_metal_holdings_assetId_key" ON "precious_metal_holdings"("assetId");

-- CreateIndex
CREATE INDEX "precious_metal_holdings_userId_idx" ON "precious_metal_holdings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "commodity_holdings_assetId_key" ON "commodity_holdings"("assetId");

-- CreateIndex
CREATE INDEX "commodity_holdings_userId_idx" ON "commodity_holdings"("userId");

-- AddForeignKey
ALTER TABLE "precious_metal_holdings" ADD CONSTRAINT "precious_metal_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precious_metal_holdings" ADD CONSTRAINT "precious_metal_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commodity_holdings" ADD CONSTRAINT "commodity_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commodity_holdings" ADD CONSTRAINT "commodity_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
