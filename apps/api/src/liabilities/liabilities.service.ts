import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import type { CreateLiabilityDto, UpdateLiabilityDto, CalculateAmortizationDto } from "./dto/liability.dto";
import type { Liability, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import {
  generateAmortizationSchedule,
  calculatePrepaymentSavings,
  calculateCreditCardMinimumPayment,
  projectCreditCardMinimumPayoff,
  type AmortizationResult,
  type PrepaymentSavingsResult,
  type PaymentFrequency,
} from "@richer/shared-types";

export interface LiabilitiesPortfolioSummary {
  totalOutstanding: number;
  totalMonthlyEmi: number;
  weightedInterestRate: number;
  currency: string;
  count: number;
}

export interface CreditCardPayoffSummary {
  monthlyInterest: number;
  minimumPayment: number;
  principalPortion: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  neverPaysOff: boolean;
  months: ReturnType<typeof projectCreditCardMinimumPayoff>["months"];
}

export interface UpcomingDue {
  id: string;
  name: string;
  type: Liability["type"];
  dueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
  emiAmount: number | null;
  currencyCode: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

@Injectable()
export class LiabilitiesService {
  private readonly logger = new Logger(LiabilitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly currency: CurrencyService,
  ) {}

  /**
   * Currency-correct totals — same bug/fix as assets.service.ts's
   * getPortfolioSummary. weightedInterestRate is weighted by each
   * liability's balance CONVERTED to baseCurrency, not raw remainingBalance
   * — otherwise a mixed-currency portfolio would silently skew the average.
   */
  async getPortfolioSummary(userId: string, type?: string): Promise<LiabilitiesPortfolioSummary | null> {
    const [liabilities, user] = await Promise.all([
      this.prisma.liability.findMany({
        where: { userId, deletedAt: null, ...(type ? { type: type as Liability["type"] } : {}) },
        select: { remainingBalance: true, emiAmount: true, interestRate: true, currencyCode: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (liabilities.length === 0) return null;

    let totalOutstanding = new Decimal(0);
    let totalMonthlyEmi = new Decimal(0);
    let weightedRateSum = new Decimal(0);
    for (const l of liabilities) {
      const convertedBalance = await this.currency.convert(new Decimal(l.remainingBalance.toString()), l.currencyCode, user.baseCurrency);
      totalOutstanding = totalOutstanding.add(convertedBalance);
      weightedRateSum = weightedRateSum.add(convertedBalance.mul(l.interestRate.toString()));
      if (l.emiAmount) {
        totalMonthlyEmi = totalMonthlyEmi.add(await this.currency.convert(new Decimal(l.emiAmount.toString()), l.currencyCode, user.baseCurrency));
      }
    }
    const weightedInterestRate = totalOutstanding.gt(0) ? weightedRateSum.div(totalOutstanding).toNumber() : 0;
    return {
      totalOutstanding: totalOutstanding.toNumber(),
      totalMonthlyEmi: totalMonthlyEmi.toNumber(),
      weightedInterestRate,
      currency: user.baseCurrency,
      count: liabilities.length,
    };
  }

  async findAll(userId: string, type?: string): Promise<Liability[]> {
    return this.prisma.liability.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(type ? { type: type as Liability["type"] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(userId: string, id: string): Promise<Liability> {
    const liability = await this.prisma.liability.findUnique({ where: { id } });
    if (!liability || liability.deletedAt) throw new NotFoundException("Liability not found");
    if (liability.userId !== userId) throw new ForbiddenException("Access denied");
    return liability;
  }

  async create(userId: string, dto: CreateLiabilityDto): Promise<Liability> {
    const liability = await this.prisma.liability.create({
      data: {
        userId,
        type: dto.type as Liability["type"],
        name: dto.name,
        principalAmount: dto.principalAmount.toString(),
        remainingBalance: dto.remainingBalance.toString(),
        interestRate: dto.interestRate.toString(),
        currencyCode: dto.currencyCode,
        ...(dto.emiAmount !== undefined && { emiAmount: dto.emiAmount?.toString() ?? null }),
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.maturityDate && { maturityDate: new Date(dto.maturityDate) }),
        ...(dto.paymentFrequency !== undefined && { paymentFrequency: dto.paymentFrequency as Liability["paymentFrequency"] }),
        ...(dto.tenureMonths !== undefined && { tenureMonths: dto.tenureMonths }),
        ...(dto.minPaymentPercent !== undefined && { minPaymentPercent: dto.minPaymentPercent?.toString() ?? null }),
        ...(dto.minPaymentFlat !== undefined && { minPaymentFlat: dto.minPaymentFlat?.toString() ?? null }),
        notes: dto.notes ?? null,
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Liability created: ${liability.id} (${liability.type})`);
    await this.triggerNetWorthUpdate(userId);
    return liability;
  }

  async update(userId: string, id: string, dto: UpdateLiabilityDto): Promise<Liability> {
    await this.findOne(userId, id);

    const liability = await this.prisma.liability.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type as Liability["type"] }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.principalAmount !== undefined && { principalAmount: dto.principalAmount.toString() }),
        ...(dto.remainingBalance !== undefined && { remainingBalance: dto.remainingBalance.toString() }),
        ...(dto.interestRate !== undefined && { interestRate: dto.interestRate.toString() }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.emiAmount !== undefined && { emiAmount: dto.emiAmount?.toString() ?? null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.maturityDate !== undefined && { maturityDate: dto.maturityDate ? new Date(dto.maturityDate) : null }),
        ...(dto.paymentFrequency !== undefined && { paymentFrequency: dto.paymentFrequency as Liability["paymentFrequency"] }),
        ...(dto.tenureMonths !== undefined && { tenureMonths: dto.tenureMonths }),
        ...(dto.minPaymentPercent !== undefined && { minPaymentPercent: dto.minPaymentPercent?.toString() ?? null }),
        ...(dto.minPaymentFlat !== undefined && { minPaymentFlat: dto.minPaymentFlat?.toString() ?? null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
      },
    });

    await this.triggerNetWorthUpdate(userId);
    return liability;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.prisma.liability.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Liability soft-deleted: ${id}`);
    await this.triggerNetWorthUpdate(userId);
  }

  // ─── Loan Intelligence (Phase 9) ────────────────────────────────────────

  /**
   * Full amortization schedule for a saved, amortized loan (mortgage/car/
   * education/personal — not credit cards, which are revolving). Uses the
   * loan's original principal so the schedule matches what the borrower
   * agreed to at origination.
   */
  async getAmortizationSchedule(userId: string, id: string): Promise<AmortizationResult> {
    const liability = await this.findOne(userId, id);
    this.assertAmortizable(liability);

    return generateAmortizationSchedule({
      principal: new Decimal(liability.principalAmount.toString()).toNumber(),
      annualRatePct: new Decimal(liability.interestRate.toString()).toNumber(),
      tenureMonths: liability.tenureMonths as number,
      paymentFrequency: liability.paymentFrequency as PaymentFrequency,
    });
  }

  /**
   * Prepayment-savings suggestion: interest saved and tenure reduction for a
   * hypothetical extra payment, computed from where the loan actually stands
   * today (remaining balance, remaining tenure) rather than from origination.
   */
  async getPrepaymentSavings(userId: string, id: string, extraPayment: number): Promise<PrepaymentSavingsResult> {
    if (!Number.isFinite(extraPayment) || extraPayment <= 0) {
      throw new BadRequestException("extraPayment must be a positive number");
    }
    const liability = await this.findOne(userId, id);
    this.assertAmortizable(liability);

    return calculatePrepaymentSavings({
      principal: new Decimal(liability.remainingBalance.toString()).toNumber(),
      annualRatePct: new Decimal(liability.interestRate.toString()).toNumber(),
      tenureMonths: this.remainingTenureMonths(liability),
      paymentFrequency: liability.paymentFrequency as PaymentFrequency,
      extraPaymentPerPeriod: extraPayment,
    });
  }

  /**
   * Revolving-balance math for a credit card: current minimum payment plus a
   * "pay only the minimum every month" payoff projection (the classic
   * minimum-payment-trap chart) — fundamentally different from an
   * amortization schedule since there's no fixed tenure.
   */
  async getCreditCardPayoff(userId: string, id: string): Promise<CreditCardPayoffSummary> {
    const liability = await this.findOne(userId, id);
    if (liability.type !== "CREDIT_CARD") {
      throw new BadRequestException("Credit-card payoff projection only applies to CREDIT_CARD liabilities");
    }

    const balance = new Decimal(liability.remainingBalance.toString()).toNumber();
    const apr = new Decimal(liability.interestRate.toString()).toNumber();

    const ccInput = {
      balance,
      apr,
      ...(liability.minPaymentPercent && { minPaymentPercent: new Decimal(liability.minPaymentPercent.toString()).toNumber() }),
      ...(liability.minPaymentFlat && { minPaymentFlat: new Decimal(liability.minPaymentFlat.toString()).toNumber() }),
    };

    const current = calculateCreditCardMinimumPayment(ccInput);
    const payoff = projectCreditCardMinimumPayoff(ccInput);

    return { ...current, ...payoff };
  }

  /**
   * Standalone calculator — no persisted liability required. This is what
   * the Phase 13 EMI/Mortgage calculators call directly.
   */
  calculateStandalone(dto: CalculateAmortizationDto): AmortizationResult {
    return generateAmortizationSchedule({
      principal: dto.principal,
      annualRatePct: dto.interestRate,
      tenureMonths: dto.tenureMonths,
      ...(dto.paymentFrequency && { paymentFrequency: dto.paymentFrequency as PaymentFrequency }),
      ...(dto.extraPaymentPerPeriod !== undefined && { extraPaymentPerPeriod: dto.extraPaymentPerPeriod }),
    });
  }

  /**
   * Liabilities with a due date, soonest first — feeds due-date tracking on
   * the frontend and is the data source Phase 17's alert delivery will
   * subscribe to (this phase only computes/exposes it, no notifications yet).
   */
  async getUpcomingDues(userId: string): Promise<UpcomingDue[]> {
    const liabilities = await this.prisma.liability.findMany({
      where: { userId, deletedAt: null, dueDate: { not: null } },
      select: { id: true, name: true, type: true, dueDate: true, emiAmount: true, currencyCode: true },
      orderBy: { dueDate: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return liabilities
      .filter((l): l is typeof l & { dueDate: Date } => l.dueDate !== null)
      .map((l) => {
        const due = new Date(l.dueDate);
        due.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
        return {
          id: l.id,
          name: l.name,
          type: l.type,
          dueDate: l.dueDate,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          emiAmount: l.emiAmount ? new Decimal(l.emiAmount.toString()).toNumber() : null,
          currencyCode: l.currencyCode,
        };
      });
  }

  private assertAmortizable(liability: Liability): void {
    if (liability.type === "CREDIT_CARD") {
      throw new BadRequestException("Credit cards use revolving-balance math — see /credit-card-payoff instead of /amortization");
    }
    if (!liability.tenureMonths) {
      throw new BadRequestException("This liability has no tenureMonths set — edit it to add a loan tenure before generating a schedule");
    }
  }

  /**
   * tenureMonths minus however many months have elapsed since startDate,
   * clamped to at least 1 period. Falls back to the full tenure when
   * startDate isn't set (best available approximation for a "what if"
   * calculation on an incompletely-dated record).
   */
  private remainingTenureMonths(liability: Liability): number {
    const tenureMonths = liability.tenureMonths as number;
    if (!liability.startDate) return tenureMonths;

    const now = new Date();
    const elapsedMonths =
      (now.getFullYear() - liability.startDate.getFullYear()) * 12 + (now.getMonth() - liability.startDate.getMonth());

    return Math.min(tenureMonths, Math.max(1, tenureMonths - elapsedMonths));
  }

  private async triggerNetWorthUpdate(userId: string): Promise<void> {
    try {
      await this.netWorth.writeSnapshot(userId);
    } catch (err) {
      this.logger.error(`Failed to update net worth snapshot for ${userId}`, err);
    }
  }
}
