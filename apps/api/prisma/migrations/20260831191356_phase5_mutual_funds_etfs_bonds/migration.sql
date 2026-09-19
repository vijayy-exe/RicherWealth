-- CreateEnum
CREATE TYPE "BondType" AS ENUM ('GOVT', 'CORPORATE', 'MUNICIPAL', 'SGB');

-- CreateEnum
CREATE TYPE "MfInvestmentType" AS ENUM ('SIP', 'LUMPSUM');

-- CreateTable
CREATE TABLE "mutual_fund_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "fundName" TEXT NOT NULL,
    "investmentType" "MfInvestmentType" NOT NULL DEFAULT 'LUMPSUM',
    "unitsHeld" DECIMAL(20,8) NOT NULL,
    "avgNAV" DECIMAL(20,6) NOT NULL,
    "expenseRatio" DECIMAL(6,4),
    "isin" TEXT,
    "lastNavSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mutual_fund_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sip_installments" (
    "id" TEXT NOT NULL,
    "mutualFundHoldingId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "units" DECIMAL(20,8) NOT NULL,
    "nav" DECIMAL(20,6) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sip_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nav_history" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nav" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nav_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etf_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "unitsHeld" DECIMAL(20,8) NOT NULL,
    "avgBuyPrice" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etf_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bond_holdings" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "bondType" "BondType" NOT NULL DEFAULT 'CORPORATE',
    "faceValue" DECIMAL(20,6) NOT NULL,
    "couponRate" DECIMAL(8,4) NOT NULL,
    "maturityDate" DATE NOT NULL,
    "quantityHeld" INTEGER NOT NULL,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(20,6),
    "isin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bond_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mutual_fund_holdings_assetId_key" ON "mutual_fund_holdings"("assetId");

-- CreateIndex
CREATE INDEX "mutual_fund_holdings_userId_idx" ON "mutual_fund_holdings"("userId");

-- CreateIndex
CREATE INDEX "mutual_fund_holdings_schemeCode_idx" ON "mutual_fund_holdings"("schemeCode");

-- CreateIndex
CREATE INDEX "sip_installments_mutualFundHoldingId_idx" ON "sip_installments"("mutualFundHoldingId");

-- CreateIndex
CREATE INDEX "sip_installments_date_idx" ON "sip_installments"("date");

-- CreateIndex
CREATE INDEX "nav_history_schemeCode_date_idx" ON "nav_history"("schemeCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "nav_history_schemeCode_date_key" ON "nav_history"("schemeCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "etf_holdings_assetId_key" ON "etf_holdings"("assetId");

-- CreateIndex
CREATE INDEX "etf_holdings_userId_idx" ON "etf_holdings"("userId");

-- CreateIndex
CREATE INDEX "etf_holdings_ticker_exchange_idx" ON "etf_holdings"("ticker", "exchange");

-- CreateIndex
CREATE UNIQUE INDEX "bond_holdings_assetId_key" ON "bond_holdings"("assetId");

-- CreateIndex
CREATE INDEX "bond_holdings_userId_idx" ON "bond_holdings"("userId");

-- CreateIndex
CREATE INDEX "bond_holdings_maturityDate_idx" ON "bond_holdings"("maturityDate");

-- AddForeignKey
ALTER TABLE "mutual_fund_holdings" ADD CONSTRAINT "mutual_fund_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutual_fund_holdings" ADD CONSTRAINT "mutual_fund_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sip_installments" ADD CONSTRAINT "sip_installments_mutualFundHoldingId_fkey" FOREIGN KEY ("mutualFundHoldingId") REFERENCES "mutual_fund_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etf_holdings" ADD CONSTRAINT "etf_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etf_holdings" ADD CONSTRAINT "etf_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_holdings" ADD CONSTRAINT "bond_holdings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bond_holdings" ADD CONSTRAINT "bond_holdings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
