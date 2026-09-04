import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import type { CreateIncomeDto, UpdateIncomeDto } from "./dto/income.dto";
import type { Income, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { toMonthlyAmount, type RecurringFrequency } from "@richer/shared-types";

export interface MonthlyPassiveIncomeResult {
  monthlyAmount: number;
  currency: string;
  breakdown: Array<{ sourceType: string; monthlyAmount: number }>;
}

@Injectable()
export class IncomeService {
  private readonly logger = new Logger(IncomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  async findAll(userId: string, sourceType?: string): Promise<Income[]> {
    return this.prisma.income.findMany({
      where: { userId, deletedAt: null, ...(sourceType ? { sourceType: sourceType as Income["sourceType"] } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(userId: string, id: string): Promise<Income> {
    const income = await this.prisma.income.findUnique({ where: { id } });
    if (!income || income.deletedAt) throw new NotFoundException("Income not found");
    if (income.userId !== userId) throw new ForbiddenException("Access denied");
    return income;
  }

  async create(userId: string, dto: CreateIncomeDto): Promise<Income> {
    const income = await this.prisma.income.create({
      data: {
        userId,
        sourceType: dto.sourceType as Income["sourceType"],
        name: dto.name,
        amount: dto.amount.toString(),
        frequency: dto.frequency as Income["frequency"],
        currencyCode: dto.currencyCode,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        notes: dto.notes ?? null,
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`Income created: ${income.id} (${income.sourceType})`);
    return income;
  }

  async update(userId: string, id: string, dto: UpdateIncomeDto): Promise<Income> {
    await this.findOne(userId, id);
    return this.prisma.income.update({
      where: { id },
      data: {
        ...(dto.sourceType !== undefined && { sourceType: dto.sourceType as Income["sourceType"] }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.amount !== undefined && { amount: dto.amount.toString() }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency as Income["frequency"] }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.prisma.income.update({ where: { id }, data: { deletedAt: new Date() } });
    this.logger.log(`Income soft-deleted: ${id}`);
  }

  /**
   * Sum of every active, non-one-time Income entry converted to the user's
   * baseCurrency and annualized/monthlyized by frequency — the dashboard's
   * "monthly passive income" figure. Matches the sum of recurring income
   * entries exactly (a Jest test in income.service.spec.ts asserts this).
   */
  async getMonthlyPassiveIncome(userId: string): Promise<MonthlyPassiveIncomeResult> {
    const [incomes, user] = await Promise.all([
      this.prisma.income.findMany({
        where: { userId, deletedAt: null, isActive: true },
        select: { sourceType: true, amount: true, frequency: true, currencyCode: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);

    let total = new Decimal(0);
    const byType = new Map<string, Decimal>();

    for (const income of incomes) {
      const monthly = toMonthlyAmount(new Decimal(income.amount.toString()).toNumber(), income.frequency as RecurringFrequency);
      if (monthly === 0) continue; // ONE_TIME entries
      const converted = await this.currency.convert(new Decimal(monthly), income.currencyCode, user.baseCurrency);
      total = total.add(converted);
      byType.set(income.sourceType, (byType.get(income.sourceType) ?? new Decimal(0)).add(converted));
    }

    return {
      monthlyAmount: total.toNumber(),
      currency: user.baseCurrency,
      breakdown: [...byType.entries()].map(([sourceType, amount]) => ({ sourceType, monthlyAmount: amount.toNumber() })),
    };
  }
}
