import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { NewsService } from "./news.service";
import { NewsApiProvider } from "./providers/newsapi.provider";
import { GNewsProvider } from "./providers/gnews.provider";
import { FinnhubNewsProvider } from "./providers/finnhub-news.provider";

const mockPrisma = {
  stockHolding: { findMany: jest.fn() },
  cryptoHolding: { findMany: jest.fn() },
};

// NewsService.onModuleInit() lazily connects to the REAL Redis at REDIS_URL
// (localhost:6379 by default) when one is actually reachable — which it is
// in this dev environment. Letting that run for real in a unit test would
// (and did, before this fix) read/write the *live app's* Redis cache under
// the same "news:general" key the running server uses, poisoning real
// traffic with test fixtures. Every test must bypass onModuleInit and
// inject an isolated in-memory adapter instead — the same technique
// economic-calendar.service.spec.ts already uses for this exact reason.
function freshCacheAdapter() {
  const store = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  };
}

function makeProviderMock(name: string, available: boolean, articles: unknown[]) {
  return {
    name,
    isAvailable: () => available,
    fetchGeneralMarketNews: jest.fn().mockResolvedValue(articles),
  };
}

describe("NewsService", () => {
  let service: NewsService;
  let newsApiMock: ReturnType<typeof makeProviderMock>;
  let gnewsMock: ReturnType<typeof makeProviderMock>;
  let finnhubMock: ReturnType<typeof makeProviderMock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    newsApiMock = makeProviderMock("newsapi", true, [
      { source: "newsapi", title: "Apple Reports Record Quarterly Revenue", description: null, url: "https://a.com/1", imageUrl: null, publishedAt: "2026-09-04T09:00:00Z" },
    ]);
    gnewsMock = makeProviderMock("gnews", true, [
      { source: "gnews", title: "Gold Prices Rally Amid Global Uncertainty", description: null, url: "https://a.com/2", imageUrl: null, publishedAt: "2026-09-04T10:00:00Z" },
    ]);
    finnhubMock = makeProviderMock("finnhub", true, []);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
        { provide: NewsApiProvider, useValue: newsApiMock },
        { provide: GNewsProvider, useValue: gnewsMock },
        { provide: FinnhubNewsProvider, useValue: finnhubMock },
      ],
    }).compile();

    service = module.get(NewsService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = freshCacheAdapter(); // skip onModuleInit's real Redis connect — see comment above
  });

  it("returns an empty feed when no provider is available, rather than throwing", async () => {
    newsApiMock.isAvailable = () => false;
    gnewsMock.isAvailable = () => false;
    finnhubMock.isAvailable = () => false;

    const result = await service.getGeneralNews();
    expect(result).toEqual([]);
  });

  it("merges articles from every available provider into the general feed", async () => {
    const result = await service.getGeneralNews();
    expect(result).toHaveLength(2);
    expect(newsApiMock.fetchGeneralMarketNews).toHaveBeenCalled();
    expect(gnewsMock.fetchGeneralMarketNews).toHaveBeenCalled();
  });

  it("prioritizes articles mentioning the user's actual holdings in the personalized feed", async () => {
    mockPrisma.stockHolding.findMany.mockResolvedValue([
      { ticker: "AAPL", asset: { name: "Apple Inc." } },
    ]);
    mockPrisma.cryptoHolding.findMany.mockResolvedValue([]);

    const result = await service.getPersonalizedNews("user-1");

    expect(result).toHaveLength(2);
    expect(result[0]!.title).toContain("Apple");
    expect(result[0]!.isPersonalized).toBe(true);
    expect(result[0]!.matchedHoldings).toEqual(["AAPL"]);
    expect(result[1]!.isPersonalized).toBe(false);
  });
});
