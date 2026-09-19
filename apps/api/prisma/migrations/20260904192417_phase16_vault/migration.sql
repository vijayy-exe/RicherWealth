-- CreateEnum
CREATE TYPE "VaultDocumentCategory" AS ENUM ('PAN', 'AADHAAR', 'PASSPORT', 'INSURANCE', 'PROPERTY_DOCUMENTS', 'INVESTMENT_STATEMENTS', 'TAX_RETURNS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "vaultCanaryB64" TEXT,
ADD COLUMN     "vaultCanaryIvB64" TEXT,
ADD COLUMN     "vaultKeySaltB64" TEXT,
ADD COLUMN     "vaultSetupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vault_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "VaultDocumentCategory" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "encryptedFilename" TEXT NOT NULL,
    "encryptedFilenameIv" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "iv" TEXT NOT NULL,
    "linkedAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_documents_userId_idx" ON "vault_documents"("userId");

-- CreateIndex
CREATE INDEX "vault_documents_userId_category_idx" ON "vault_documents"("userId", "category");

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_linkedAssetId_fkey" FOREIGN KEY ("linkedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
