import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AssetsService } from "../../assets/assets.service";
import { TransactionsService } from "../../transactions/transactions.service";
import { GoalsService } from "../../goals/goals.service";
import { NetWorthService } from "../../net-worth/net-worth.service";
import { EmbeddingService } from "./embedding.service";
import { EmbeddingRepository } from "./embedding.repository";

/**
 * Builds one plain-English sentence per real row (an asset, a transaction,
 * a goal, the latest analytics snapshot) and embeds it — this text, not
 * any LLM's paraphrase of it, is what retrieval hands back as "ground
 * truth" later. Re-indexing a user is idempotent: `EmbeddingRepository
 * .upsert` keys on (userId, sourceType, sourceId), so re-running this after
 * a new transaction just adds one row rather than rebuilding everything.
 */
@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly transactions: TransactionsService,
    private readonly goals: GoalsService,
    private readonly netWorth: NetWorthService,
    private readonly embedding: EmbeddingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async reindexUser(userId: string): Promise<{ indexed: number; skipped: number }> {
    let indexed = 0;
    let skipped = 0;

    const record = async (sourceType: "ASSET" | "LIABILITY" | "TRANSACTION" | "GOAL" | "ANALYTICS_SNAPSHOT" | "INCOME", sourceId: string, content: string) => {
      const vector = await this.embedding.embed(content);
      if (!vector) {
        skipped++;
        return;
      }
      await this.repo.upsert({ userId, sourceType, sourceId, content, embedding: vector });
      indexed++;
    };

    // Assets
    const assets = await this.assets.findAll(userId);
    for (const a of assets) {
      const content = `Asset: ${a.name} (${a.type}). Current value: ${a.currentValue.toString()} ${a.currencyCode}. Added ${a.createdAt.toDateString()}.`;
      await record("ASSET", a.id, content);
    }

    // Liabilities
    const liabilities = await this.prisma.liability.findMany({ where: { userId, deletedAt: null } });
    for (const l of liabilities) {
      const content = `Liability: ${l.name} (${l.type}). Remaining balance: ${l.remainingBalance.toString()} ${l.currencyCode}, interest rate ${l.interestRate.toString()}%, EMI ${l.emiAmount?.toString() ?? "N/A"}.`;
      await record("LIABILITY", l.id, content);
    }

    // Transactions (most recent 500 — a long enough window for "what did I spend on X" questions without indexing years of history on every run)
    const transactions = await this.transactions.findAll(userId, {});
    for (const t of transactions.slice(0, 500)) {
      const content = `Transaction on ${t.date.toDateString()}: ${t.type} of ${t.amount.toString()} ${t.currencyCode}${t.category ? ` in category ${t.category}` : ""}${t.merchant ? ` at ${t.merchant}` : ""}${t.description ? ` (${t.description})` : ""}.`;
      await record("TRANSACTION", t.id, content);
    }

    // Goals
    const goals = await this.goals.findAll(userId);
    for (const g of goals) {
      const content = `Goal: ${g.name} (${g.type}). Target ${g.targetAmount} ${g.currencyCode} by ${new Date(g.targetDate).toDateString()}. Current progress: ${g.currentProgress} (${g.percentComplete.toFixed(1)}%).`;
      await record("GOAL", g.id, content);
    }

    // Latest analytics/net-worth snapshot — one row, always overwritten (sourceId is a constant), so chat always grounds against the CURRENT figure, not a stale one from last index run.
    const summary = await this.netWorth.getDashboardSummary(userId);
    const allocationLines = summary.assetAllocation.map((a) => `${a.category}: ${a.valueInBase.toFixed(0)} ${summary.baseCurrency} (${a.percentage.toFixed(1)}%)`).join("; ");
    const snapshotContent = `Current portfolio snapshot: total net worth ${summary.totalNetWorth.toFixed(2)} ${summary.baseCurrency}. Asset allocation: ${allocationLines || "no assets yet"}. Emergency fund covers ${summary.emergencyFundHealth.toFixed(1)} months of expenses. Debt ratio ${(summary.debtRatio * 100).toFixed(1)}%.`;
    await record("ANALYTICS_SNAPSHOT", "current", snapshotContent);

    this.logger.log(`Reindexed user ${userId}: ${indexed} chunks embedded, ${skipped} skipped (embedding service unavailable).`);
    return { indexed, skipped };
  }
}
