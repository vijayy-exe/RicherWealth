import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationDispatchService } from "../notification-dispatch.service";
import { inferSipCadence, isSipApproaching } from "../sip-cadence.util";

/**
 * SIP due dates aren't stored anywhere (SipInstallment only records history,
 * no schedule) — see sip-cadence.util.ts. Holdings with fewer than 2
 * installments are skipped outright (logged, not guessed).
 */
@Injectable()
export class SipDueEvaluator {
  private readonly logger = new Logger(SipDueEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const holdings = await this.prisma.mutualFundHolding.findMany({
      where: { investmentType: "SIP" },
      select: {
        id: true,
        userId: true,
        fundName: true,
        sipInstallments: { orderBy: { date: "desc" }, take: 4, select: { date: true } },
      },
    });

    let notified = 0;
    let skippedInsufficientHistory = 0;

    for (const holding of holdings) {
      const dates = holding.sipInstallments.map((i) => i.date);
      const cadence = inferSipCadence(dates);
      if (!cadence) {
        skippedInsufficientHistory++;
        continue;
      }
      if (!isSipApproaching(cadence)) continue;

      const bucket = cadence.expectedNextDate.toISOString().slice(0, 10);
      const { created } = await this.dispatch.notifyOnce({
        userId: holding.userId,
        type: "SIP_DUE",
        title: `SIP installment due soon: ${holding.fundName}`,
        body: `Based on your recent installment pattern (~every ${cadence.inferredCadenceDays} days), your next SIP for ${holding.fundName} is expected around ${bucket}.`,
        data: { holdingId: holding.id, expectedNextDate: bucket, inferredCadenceDays: cadence.inferredCadenceDays },
        sourceEntityId: holding.id,
        triggerBucket: bucket,
      });
      if (created) notified++;
    }
    this.logger.log(`SIP due evaluation: ${notified} notified, ${skippedInsufficientHistory}/${holdings.length} skipped for insufficient installment history.`);
  }
}
