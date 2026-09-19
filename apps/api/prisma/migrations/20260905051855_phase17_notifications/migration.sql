-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MARKET_CRASH', 'DIVIDEND_RECEIVED', 'LOAN_DUE', 'SIP_DUE', 'STOCK_PRICE_ALERT', 'CRYPTO_PRICE_ALERT', 'PROPERTY_PRICE_CHANGE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyQuietHoursEnd" TEXT,
ADD COLUMN     "notifyQuietHoursStart" TEXT,
ADD COLUMN     "notifyQuietHoursTimezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "stock_price_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "targetPrice" DECIMAL(20,6) NOT NULL,
    "direction" "PriceAlertDirection" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "sourceEntityId" TEXT NOT NULL,
    "triggerBucket" TEXT NOT NULL,
    "deliveryResult" JSONB NOT NULL DEFAULT '{}',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertType" "NotificationType" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_price_alerts_userId_idx" ON "stock_price_alerts"("userId");

-- CreateIndex
CREATE INDEX "stock_price_alerts_ticker_exchange_idx" ON "stock_price_alerts"("ticker", "exchange");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_type_sourceEntityId_triggerBucket_key" ON "notifications"("userId", "type", "sourceEntityId", "triggerBucket");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_alertType_key" ON "notification_preferences"("userId", "alertType");

-- AddForeignKey
ALTER TABLE "stock_price_alerts" ADD CONSTRAINT "stock_price_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
