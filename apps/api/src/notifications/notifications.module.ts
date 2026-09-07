import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";

import { StocksModule } from "../stocks/stocks.module"; // for PriceSyncService
import { CryptoModule } from "../crypto/crypto.module"; // for CryptoPriceSyncService
import { MarketIntelligenceModule } from "../market-intelligence/market-intelligence.module"; // for IndicesService
import { LiabilitiesModule } from "../liabilities/liabilities.module"; // for LiabilitiesService

import { ALERTS_FAST_QUEUE, ALERTS_DAILY_QUEUE } from "./alerts.constants";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationPushService } from "./delivery/push.service";
import { NotificationEmailService } from "./delivery/email.service";

import { MarketCrashEvaluator } from "./evaluators/market-crash.evaluator";
import { CryptoPriceAlertEvaluator } from "./evaluators/crypto-price-alert.evaluator";
import { StockPriceAlertEvaluator } from "./evaluators/stock-price-alert.evaluator";
import { LoanDueEvaluator } from "./evaluators/loan-due.evaluator";
import { SipDueEvaluator } from "./evaluators/sip-due.evaluator";
import { DividendEvaluator } from "./evaluators/dividend.evaluator";
import { PropertyRevaluationEvaluator } from "./evaluators/property-revaluation.evaluator";

import { AlertsFastProcessor } from "./alerts-fast.processor";
import { AlertsDailyProcessor } from "./alerts-daily.processor";
import { AlertsScheduler } from "./alerts.scheduler";

@Module({
  imports: [
    ConfigModule,
    StocksModule,
    CryptoModule,
    MarketIntelligenceModule,
    LiabilitiesModule,
    BullModule.registerQueue({ name: ALERTS_FAST_QUEUE }, { name: ALERTS_DAILY_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    NotificationDispatchService,
    NotificationPushService,
    NotificationEmailService,
    MarketCrashEvaluator,
    CryptoPriceAlertEvaluator,
    StockPriceAlertEvaluator,
    LoanDueEvaluator,
    SipDueEvaluator,
    DividendEvaluator,
    PropertyRevaluationEvaluator,
    AlertsFastProcessor,
    AlertsDailyProcessor,
    AlertsScheduler,
  ],
  exports: [NotificationDispatchService],
})
export class NotificationsModule {}
