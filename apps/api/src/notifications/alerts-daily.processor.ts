import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ALERTS_DAILY_QUEUE } from "./alerts.constants";
import { LoanDueEvaluator } from "./evaluators/loan-due.evaluator";
import { SipDueEvaluator } from "./evaluators/sip-due.evaluator";
import { DividendEvaluator } from "./evaluators/dividend.evaluator";
import { PropertyRevaluationEvaluator } from "./evaluators/property-revaluation.evaluator";

/** Runs the due-date and event-scan evaluators — loan/EMI due, SIP due,
 * dividends, property revaluation deltas — once a day. */
@Processor(ALERTS_DAILY_QUEUE)
export class AlertsDailyProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsDailyProcessor.name);

  constructor(
    private readonly loanDue: LoanDueEvaluator,
    private readonly sipDue: SipDueEvaluator,
    private readonly dividend: DividendEvaluator,
    private readonly propertyRevaluation: PropertyRevaluationEvaluator,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.debug("Running daily alert evaluators (loan due, SIP due, dividends, property revaluation)");
    await this.loanDue.evaluate();
    await this.sipDue.evaluate();
    await this.dividend.evaluate();
    await this.propertyRevaluation.evaluate();
  }
}
