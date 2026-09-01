import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import type { CreateLiabilityDto, UpdateLiabilityDto } from "./dto/liability.dto";
import type { Liability, Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export interface LiabilitiesPortfolioSummary {
  totalOutstanding: number;
  totalMonthlyEmi: number;
  weightedInterestRate: number;
  currency: string;
  count: number;
}

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

  private async triggerNetWorthUpdate(userId: string): Promise<void> {
    try {
      await this.netWorth.writeSnapshot(userId);
    } catch (err) {
      this.logger.error(`Failed to update net worth snapshot for ${userId}`, err);
    }
  }
}
