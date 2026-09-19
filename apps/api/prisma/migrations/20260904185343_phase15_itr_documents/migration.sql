-- CreateEnum
CREATE TYPE "ItrExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXTRACTED_AWAITING_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItrExtractionMethod" AS ENUM ('PDF_TEXT', 'OCR');

-- CreateTable
CREATE TABLE "itr_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentYear" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "extractionStatus" "ItrExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractionMethod" "ItrExtractionMethod",
    "confidenceScore" DECIMAL(4,3),
    "parsedData" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itr_documents_userId_idx" ON "itr_documents"("userId");

-- CreateIndex
CREATE INDEX "itr_documents_userId_assessmentYear_idx" ON "itr_documents"("userId", "assessmentYear");

-- AddForeignKey
ALTER TABLE "itr_documents" ADD CONSTRAINT "itr_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
