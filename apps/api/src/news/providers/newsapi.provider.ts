import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type { RawNewsArticle } from "@richer/shared-types";
import type { NewsProvider } from "./news-provider.interface";

interface NewsApiArticle {
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
}

/**
 * NewsAPI.org — dev-only per the phase spec: its free tier's ToS blocks
 * use in a deployed/production application (only localhost/dev use is
 * permitted on the free "Developer" plan). This provider therefore reports
 * `isAvailable()` only when NODE_ENV !== "production", regardless of
 * whether a key is configured, so a misconfigured prod deployment can
 * never accidentally violate the free-tier ToS.
 */
@Injectable()
export class NewsApiProvider implements NewsProvider {
  readonly name = "newsapi";
  private readonly logger = new Logger(NewsApiProvider.name);

  constructor(private readonly config: ConfigService) {}

  isAvailable(): boolean {
    const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
    const key = this.config.get<string>("NEWSAPI_KEY");
    return nodeEnv !== "production" && !!key;
  }

  async fetchGeneralMarketNews(): Promise<RawNewsArticle[]> {
    const key = this.config.get<string>("NEWSAPI_KEY");
    if (!key) return [];
    try {
      const res = await axios.get<{ articles?: NewsApiArticle[] }>("https://newsapi.org/v2/everything", {
        params: {
          q: "stock market OR economy OR inflation OR federal reserve OR crypto",
          language: "en",
          sortBy: "publishedAt",
          pageSize: 20,
          apiKey: key,
        },
        timeout: 8000,
      });
      const articles = res.data.articles ?? [];
      this.logger.log(`NewsAPI ✓ ${articles.length} articles`);
      return articles.map((a) => ({
        source: this.name,
        title: a.title,
        description: a.description,
        url: a.url,
        imageUrl: a.urlToImage,
        publishedAt: a.publishedAt,
      }));
    } catch (err) {
      this.logger.warn(`NewsAPI fetch failed: ${String(err)}`);
      return [];
    }
  }
}
