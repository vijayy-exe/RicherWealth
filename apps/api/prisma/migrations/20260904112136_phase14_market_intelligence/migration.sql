-- CreateEnum
CREATE TYPE "IpoStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'LISTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ipo_listings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "expectedDate" DATE,
    "priceRangeMin" DECIMAL(20,2),
    "priceRangeMax" DECIMAL(20,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "IpoStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ipo_listings_expectedDate_idx" ON "ipo_listings"("expectedDate");

-- CreateIndex
CREATE INDEX "ipo_listings_status_idx" ON "ipo_listings"("status");

-- AddForeignKey
ALTER TABLE "ipo_listings" ADD CONSTRAINT "ipo_listings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
