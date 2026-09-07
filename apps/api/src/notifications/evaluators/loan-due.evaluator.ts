import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LiabilitiesService } from "../../liabilities/liabilities.service";
import { NotificationDispatchService } from "../notification-dispatch.service";

/** "Approaching" window: due today through 7 days out (not overdue-spam territory). */
export const LOAN_DUE_WINDOW_DAYS = 7;

/**
 * Reuses LiabilitiesService.getUpcomingDues() — explicitly built in Phase 9
 * as "the data source Phase 17's alert delivery will subscribe to." This
 * evaluator adds no new query against Liability itself.
 */
@Injectable()
export class LoanDueEvaluator {
  private readonly logger = new Logger(LoanDueEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly liabilities: LiabilitiesService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const users = await this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
    const bucket = new Date().toISOString().slice(0, 10);
    let notified = 0;

    for (const { id: userId } of users) {
      const dues = await this.liabilities.getUpcomingDues(userId);
      const approaching = dues.filter((d) => d.daysUntilDue >= 0 && d.daysUntilDue <= LOAN_DUE_WINDOW_DAYS);

      for (const due of approaching) {
        const { created } = await this.dispatch.notifyOnce({
          userId,
          type: "LOAN_DUE",
          title: `${due.name} payment due in ${due.daysUntilDue} day${due.daysUntilDue === 1 ? "" : "s"}`,
          body: due.emiAmount
            ? `${due.emiAmount} ${due.currencyCode} is due on ${due.dueDate.toISOString().slice(0, 10)}.`
            : `Payment is due on ${due.dueDate.toISOString().slice(0, 10)}.`,
          data: { liabilityId: due.id, type: due.type, daysUntilDue: due.daysUntilDue, emiAmount: due.emiAmount },
          sourceEntityId: due.id,
          triggerBucket: bucket,
        });
        if (created) notified++;
      }
    }
    this.logger.log(`Loan due evaluation: ${notified} new notifications across ${users.length} users.`);
  }
}
