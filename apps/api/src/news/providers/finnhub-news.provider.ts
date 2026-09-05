import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type { RawNewsArticle } from "@richer/shared-types";
import type { NewsProvider } from "./news-provider.interface";

interface FinnhubNewsItem {
  headline: string;
  summary: string | null;
  url: string;
  image: string | null;
  datetime: number; // unix seconds
}

/**
 * Finnhub's `/news` endpoint — a finance-specific SECONDARY source, layered
 * in alongside whichever general provider (NewsAPI dev / GNews prod) is
 * active, per the phase spec. Reuses `FINNHUB_KEY`, already configured for
 * Phase 4's stock price fallback chain — no new key to provision.
 */
@Injectable()
export class FinnhubNewsProvider implements NewsProvider {
  readonly name = "finnhub";
  private readonly logger = new Logger(FinnhubNewsProvider.name);

  constructor(private readonly config: ConfigService) {}

  isAvailable(): boolean {
    return !!this.config.get<string>("FINNHUB_KEY");
  }

  async fetchGeneralMarketNews(): Promise<RawNewsArticle[]> {
    const key = this.config.get<string>("FINNHUB_KEY");
    if (!key) return [];
    try {
      const res = await axios.get<FinnhubNewsItem[]>("https://finnhub.io/api/v1/news", {
        params: { category: "general", token: key },
        timeout: 8000,
      });
      const items = (res.data ?? []).slice(0, 20);
      this.logger.log(`Finnhub news ✓ ${items.length} articles`);
      return items.map((a) => ({
        source: this.name,
        title: a.headline,
        description: a.summary,
        url: a.url,
        imageUrl: a.image,
        publishedAt: new Date(a.datetime * 1000).toISOString(),
      }));
    } catch (err) {
      this.logger.warn(`Finnhub news fetch failed: ${String(err)}`);
      return [];
    }
  }
}
