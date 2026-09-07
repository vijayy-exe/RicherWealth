import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ALERTS_FAST_QUEUE } from "./alerts.constants";
import { MarketCrashEvaluator } from "./evaluators/market-crash.evaluator";
import { CryptoPriceAlertEvaluator } from "./evaluators/crypto-price-alert.evaluator";
import { StockPriceAlertEvaluator } from "./evaluators/stock-price-alert.evaluator";

/** Runs the price-sensitive evaluators — market crash, crypto/stock target
 * price alerts — on the fast (15min) cadence. Job name is irrelevant; every
 * job on this queue runs the same fixed evaluator set. */
@Processor(ALERTS_FAST_QUEUE)
export class AlertsFastProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsFastProcessor.name);

  constructor(
    private readonly marketCrash: MarketCrashEvaluator,
    private readonly cryptoAlerts: CryptoPriceAlertEvaluator,
    private readonly stockAlerts: StockPriceAlertEvaluator,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.debug("Running fast alert evaluators (market crash, crypto/stock price alerts)");
    await this.marketCrash.evaluate();
    await this.cryptoAlerts.evaluate();
    await this.stockAlerts.evaluate();
  }
}
