-- AlterEnum
ALTER TYPE "VaultDocumentCategory" ADD VALUE 'WILL_TRUST';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "householdId" TEXT,
ADD COLUMN     "nomineeContact" TEXT,
ADD COLUMN     "nomineeName" TEXT,
ADD COLUMN     "nomineeRelationship" TEXT;

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "liabilities" ADD COLUMN     "householdId" TEXT;

-- AlterTable
ALTER TABLE "vault_documents" ADD COLUMN     "linkedHouseholdId" TEXT;

-- CreateTable
CREATE TABLE "estate_beneficiaries" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "allocationPercent" DECIMAL(5,2) NOT NULL,
    "trustName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estate_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_transfer_checklists" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_transfer_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estate_beneficiaries_assetId_idx" ON "estate_beneficiaries"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_transfer_checklists_assetId_key" ON "asset_transfer_checklists"("assetId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "assets_householdId_idx" ON "assets"("householdId");

-- CreateIndex
CREATE INDEX "liabilities_householdId_idx" ON "liabilities"("householdId");

-- CreateIndex
CREATE INDEX "vault_documents_linkedHouseholdId_idx" ON "vault_documents"("linkedHouseholdId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_linkedHouseholdId_fkey" FOREIGN KEY ("linkedHouseholdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estate_beneficiaries" ADD CONSTRAINT "estate_beneficiaries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transfer_checklists" ADD CONSTRAINT "asset_transfer_checklists_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability guarantee: audit_logs is insert-only at the DB level, not
-- just by app-layer convention (AuditService never exposes update/delete).
-- A future bug or a direct psql session cannot silently rewrite history.
CREATE OR REPLACE FUNCTION audit_logs_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable — % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();
