import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import type { CreateTransactionDto, UpdateTransactionDto, TransactionQueryDto } from "./dto/transaction.dto";
import type { Transaction, Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { categorizeMerchant, deriveKeywordFromMerchant, type UserCategoryRule } from "./categorization/category-rules";
import { detectSubscriptions, type SubscriptionCandidate } from "./subscription-detector";
import type { NormalizedBankTransaction } from "../bank-sync/providers/normalized-transaction";
import type { ExpenseCategory } from "@richer/shared-types";

export interface CashFlowMonth {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  net: number;
}

export interface BulkIngestResult {
  created: number;
  skippedDuplicates: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  async findAll(userId: string, query: TransactionQueryDto = {}): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        ...(query.type && { type: query.type }),
        ...(query.category && { category: query.category }),
        ...(query.needsReview !== undefined && { needsCategoryReview: query.needsReview }),
        ...((query.from || query.to) && {
          date: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) },
        }),
      },
      orderBy: { date: "desc" },
    });
  }

  async findOne(userId: string, id: string): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException("Transaction not found");
    if (transaction.userId !== userId) throw new ForbiddenException("Access denied");
    return transaction;
  }

  async create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    const { category, needsCategoryReview } = await this.resolveCategory(userId, dto.type, dto.merchant, dto.category);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        type: dto.type,
        amount: dto.amount.toString(),
        currencyCode: dto.currencyCode,
        date: new Date(dto.date),
        assetId: dto.assetId ?? null,
        liabilityId: dto.liabilityId ?? null,
        category,
        needsCategoryReview,
        merchant: dto.merchant ?? null,
        description: dto.description ?? null,
        source: dto.source ?? "manual",
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Transaction created: ${transaction.id} (${transaction.type}, ${category ?? "no category"})`);
    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    await this.findOne(userId, id);
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.amount !== undefined && { amount: dto.amount.toString() }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.category !== undefined && { category: dto.category, needsCategoryReview: false }),
        ...(dto.merchant !== undefined && { merchant: dto.merchant }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
      },
    });
  }

  /**
   * Inline re-categorization from the transaction list — sets the category
   * AND teaches the per-user rule table so the same merchant categorizes
   * correctly next time (the "use those corrections to improve the ruleset
   * over time" half of the auto-categorization spec).
   */
  async recategorize(userId: string, id: string, category: ExpenseCategory): Promise<Transaction> {
    const existing = await this.findOne(userId, id);

    if (existing.merchant) {
      await this.learnCategoryRule(userId, existing.merchant, category);
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { category, needsCategoryReview: false },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.prisma.transaction.delete({ where: { id } });
    this.logger.log(`Transaction deleted: ${id}`);
  }

  /**
   * Income vs. expense, month by month, converted to the user's base
   * currency — powers the cash-flow chart.
   */
  async getCashFlow(userId: string, monthsBack = 12): Promise<CashFlowMonth[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [transactions, user] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, type: { in: ["income", "expense"] }, date: { gte: since } },
        select: { type: true, amount: true, currencyCode: true, date: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);

    const byMonth = new Map<string, { income: Decimal; expense: Decimal }>();
    for (const t of transactions) {
      const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
      const bucket = byMonth.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) };
      const converted = await this.currency.convert(new Decimal(t.amount.toString()), t.currencyCode, user.baseCurrency);
      if (t.type === "income") bucket.income = bucket.income.add(converted);
      else bucket.expense = bucket.expense.add(converted);
      byMonth.set(key, bucket);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { income, expense }]) => ({
        month,
        income: income.toNumber(),
        expense: expense.toNumber(),
        net: income.sub(expense).toNumber(),
      }));
  }

  /**
   * Trailing N-month average of monthly expense totals, in base currency —
   * feeds NetWorthService's emergency-fund-health calculation (replacing
   * the Phase 2 hardcoded /50000 placeholder now that real expense data exists).
   * Returns null when there's no expense history yet, so the caller can
   * fall back gracefully instead of dividing by zero.
   */
  async getAverageMonthlyExpense(userId: string, monthsBack = 3): Promise<number | null> {
    const cashFlow = await this.getCashFlow(userId, monthsBack);
    const monthsWithExpense = cashFlow.filter((m) => m.expense > 0);
    if (monthsWithExpense.length === 0) return null;
    const total = monthsWithExpense.reduce((sum, m) => sum + m.expense, 0);
    return total / monthsWithExpense.length;
  }

  /** Recurring same-merchant/same-amount expense transactions, flagged automatically. */
  async getSubscriptions(userId: string, monthsBack = 18): Promise<SubscriptionCandidate[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const transactions = await this.prisma.transaction.findMany({
      where: { userId, type: "expense", date: { gte: since } },
      select: { id: true, merchant: true, amount: true, currencyCode: true, date: true },
    });

    return detectSubscriptions(
      transactions.map((t) => ({
        id: t.id,
        merchant: t.merchant,
        amount: -new Decimal(t.amount.toString()).toNumber(), // stored as a positive magnitude; detector groups on signed amount for consistency with bank-sync's convention
        currencyCode: t.currencyCode,
        date: t.date,
      })),
    );
  }

  /**
   * Ingest normalized bank-sync transactions (from any StatementImportProvider
   * or Plaid) — categorizes each expense, dedupes against existing rows, and
   * bulk-creates. Idempotent: safe to call the same statement/sync twice.
   */
  async bulkIngest(userId: string, normalized: NormalizedBankTransaction[], source: "bank_sync" | "csv_import" | "pdf_import"): Promise<BulkIngestResult> {
    if (normalized.length === 0) return { created: 0, skippedDuplicates: 0 };

    const existing = await this.prisma.transaction.findMany({
      where: { userId, source },
      select: { externalId: true, date: true, merchant: true, amount: true },
    });
    const existingExternalIds = new Set(existing.filter((e) => e.externalId).map((e) => e.externalId));
    const existingComposite = new Set(
      existing.map(
        (e) =>
          `${e.date.toISOString().slice(0, 10)}|${(e.merchant ?? "").toLowerCase()}|${new Decimal(e.amount.toString()).abs().toFixed(6)}`,
      ),
    );

    const userRules = await this.getUserCategoryRules(userId);

    let created = 0;
    let skippedDuplicates = 0;

    for (const t of normalized) {
      if (t.externalId && existingExternalIds.has(t.externalId)) {
        skippedDuplicates++;
        continue;
      }
      const compositeKey = `${t.date.toISOString().slice(0, 10)}|${t.merchant.toLowerCase()}|${Math.abs(t.amount).toFixed(6)}`;
      if (!t.externalId && existingComposite.has(compositeKey)) {
        skippedDuplicates++;
        continue;
      }

      const type = t.amount >= 0 ? "income" : "expense";
      const { category, needsCategoryReview } = type === "expense" ? this.categorize(t.merchant, userRules) : { category: null, needsCategoryReview: false };

      await this.prisma.transaction.create({
        data: {
          userId,
          type,
          amount: Math.abs(t.amount).toString(),
          currencyCode: t.currencyCode,
          date: t.date,
          merchant: t.merchant,
          description: t.description ?? null,
          source,
          externalId: t.externalId ?? null,
          category,
          needsCategoryReview,
          details: {},
        },
      });
      created++;
    }

    this.logger.log(`Bulk ingest (${source}) for user ${userId}: ${created} created, ${skippedDuplicates} duplicates skipped`);
    return { created, skippedDuplicates };
  }

  // ─── Categorization helpers ────────────────────────────────────────────

  private async resolveCategory(
    userId: string,
    type: string,
    merchant: string | undefined,
    explicitCategory: string | undefined,
  ): Promise<{ category: string | null; needsCategoryReview: boolean }> {
    if (type !== "expense") return { category: null, needsCategoryReview: false };

    if (explicitCategory) {
      if (merchant) await this.learnCategoryRule(userId, merchant, explicitCategory as ExpenseCategory);
      return { category: explicitCategory, needsCategoryReview: false };
    }

    if (!merchant) return { category: "OTHER", needsCategoryReview: true };

    const userRules = await this.getUserCategoryRules(userId);
    const result = categorizeMerchant(merchant, userRules);
    return { category: result.category, needsCategoryReview: result.needsReview };
  }

  private categorize(merchant: string, userRules: UserCategoryRule[]): { category: string; needsCategoryReview: boolean } {
    const result = categorizeMerchant(merchant, userRules);
    return { category: result.category, needsCategoryReview: result.needsReview };
  }

  private async getUserCategoryRules(userId: string): Promise<UserCategoryRule[]> {
    const rules = await this.prisma.categoryRule.findMany({
      where: { userId },
      select: { keyword: true, category: true },
      orderBy: { createdAt: "desc" },
    });
    return rules.map((r) => ({ keyword: r.keyword, category: r.category as ExpenseCategory }));
  }

  private async learnCategoryRule(userId: string, merchant: string, category: ExpenseCategory): Promise<void> {
    const keyword = deriveKeywordFromMerchant(merchant);
    if (!keyword) return;
    try {
      await this.prisma.categoryRule.upsert({
        where: { userId_keyword: { userId, keyword } },
        create: { userId, keyword, category },
        update: { category },
      });
    } catch (err) {
      // Non-fatal — the transaction's own category write already succeeded; a
      // failed rule upsert just means the next matching merchant won't benefit yet.
      this.logger.warn(`Failed to upsert category rule for user ${userId}, keyword "${keyword}"`, err);
    }
  }
}
