-- CreateEnum
CREATE TYPE "LoanPaymentFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- AlterTable
ALTER TABLE "liabilities" ADD COLUMN     "minPaymentFlat" DECIMAL(20,6),
ADD COLUMN     "minPaymentPercent" DECIMAL(5,2),
ADD COLUMN     "paymentFrequency" "LoanPaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "tenureMonths" INTEGER;
