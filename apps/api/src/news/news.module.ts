import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService

import { NewsPublicController, NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { NewsApiProvider } from "./providers/newsapi.provider";
import { GNewsProvider } from "./providers/gnews.provider";
import { FinnhubNewsProvider } from "./providers/finnhub-news.provider";

@Module({
  imports: [PrismaModule, StocksModule],
  controllers: [NewsPublicController, NewsController],
  providers: [NewsService, NewsApiProvider, GNewsProvider, FinnhubNewsProvider],
  exports: [NewsService],
})
export class NewsModule {}
