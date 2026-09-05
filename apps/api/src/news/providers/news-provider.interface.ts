import type { RawNewsArticle } from "@richer/shared-types";

/**
 * Mirrors Phase 10 bank-sync's `StatementImportProvider` abstraction
 * (apps/api/src/bank-sync/providers/statement-import-provider.interface.ts):
 * provider selection is a strategy NewsService iterates over, not an
 * if/else scattered through the service. Every provider normalizes to the
 * same `RawNewsArticle[]` shape before dedup/relevance ever runs, so
 * adding a fourth source later is a drop-in provider, not a rewrite.
 */
export interface NewsProvider {
  readonly name: string;
  /** True only when this provider has what it needs (API key, environment) to be called. */
  isAvailable(): boolean;
  fetchGeneralMarketNews(): Promise<RawNewsArticle[]>;
}
