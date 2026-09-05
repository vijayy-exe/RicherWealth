import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type { RawNewsArticle } from "@richer/shared-types";
import type { NewsProvider } from "./news-provider.interface";

interface GNewsArticle {
  title: string;
  description: string | null;
  url: string;
  image: string | null;
  publishedAt: string;
}

/**
 * GNews.io — the production-safe general-news source (its free tier's ToS
 * does not restrict deployed/production use, unlike NewsAPI.org). Primary
 * in production; also usable in dev when a key is configured, so local
 * testing can exercise the actual prod path.
 */
@Injectable()
export class GNewsProvider implements NewsProvider {
  readonly name = "gnews";
  private readonly logger = new Logger(GNewsProvider.name);

  constructor(private readonly config: ConfigService) {}

  isAvailable(): boolean {
    return !!this.config.get<string>("GNEWS_API_KEY");
  }

  async fetchGeneralMarketNews(): Promise<RawNewsArticle[]> {
    const key = this.config.get<string>("GNEWS_API_KEY");
    if (!key) return [];
    try {
      const res = await axios.get<{ articles?: GNewsArticle[] }>("https://gnews.io/api/v4/search", {
        params: {
          q: "stock market OR economy OR inflation OR federal reserve OR crypto",
          lang: "en",
          max: 20,
          apikey: key,
        },
        timeout: 8000,
      });
      const articles = res.data.articles ?? [];
      this.logger.log(`GNews ✓ ${articles.length} articles`);
      return articles.map((a) => ({
        source: this.name,
        title: a.title,
        description: a.description,
        url: a.url,
        imageUrl: a.image,
        publishedAt: a.publishedAt,
      }));
    } catch (err) {
      this.logger.warn(`GNews fetch failed: ${String(err)}`);
      return [];
    }
  }
}
