-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
