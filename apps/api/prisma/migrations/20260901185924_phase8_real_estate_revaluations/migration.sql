-- CreateEnum
CREATE TYPE "RealEstateSubType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'RENTAL', 'LAND', 'PLOT', 'APARTMENT', 'VILLA', 'UNDER_CONSTRUCTION');

-- CreateTable
CREATE TABLE "real_estate_details" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subType" "RealEstateSubType" NOT NULL,
    "addressLine" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "purchasePrice" DECIMAL(20,6) NOT NULL,
    "purchaseDate" DATE,
    "currentEstimate" DECIMAL(20,6) NOT NULL,
    "lastAppraisalDate" DATE,
    "monthlyRentalIncome" DECIMAL(20,6),
    "annualMaintenanceCost" DECIMAL(20,6),
    "areaValue" DECIMAL(14,2),
    "areaUnit" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "linkedLiabilityId" TEXT,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "real_estate_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_revaluations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "valuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_revaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "real_estate_details_assetId_key" ON "real_estate_details"("assetId");

-- CreateIndex
CREATE INDEX "real_estate_details_userId_idx" ON "real_estate_details"("userId");

-- CreateIndex
CREATE INDEX "real_estate_details_linkedLiabilityId_idx" ON "real_estate_details"("linkedLiabilityId");

-- CreateIndex
CREATE INDEX "asset_revaluations_assetId_idx" ON "asset_revaluations"("assetId");

-- CreateIndex
CREATE INDEX "asset_revaluations_userId_idx" ON "asset_revaluations"("userId");

-- AddForeignKey
ALTER TABLE "real_estate_details" ADD CONSTRAINT "real_estate_details_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_estate_details" ADD CONSTRAINT "real_estate_details_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "real_estate_details" ADD CONSTRAINT "real_estate_details_linkedLiabilityId_fkey" FOREIGN KEY ("linkedLiabilityId") REFERENCES "liabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_revaluations" ADD CONSTRAINT "asset_revaluations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_revaluations" ADD CONSTRAINT "asset_revaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
