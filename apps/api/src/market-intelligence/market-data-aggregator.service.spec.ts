import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Decimal from "decimal.js";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { PriceSyncService, type LivePrice } from "../stocks/price-sync.service";
import { CryptoPriceSyncService } from "../crypto/crypto-price-sync.service";
import { CommodityPriceSyncService } from "../commodities/commodity-price-sync.service";
import { PreciousMetalPriceSyncService } from "../precious-metals/precious-metal-price-sync.service";
import { CurrencyService } from "../forex/currency.service";
import { MarketDataAggregatorService } from "./market-data-aggregator.service";

const inMemoryCache = new Map<string, string>();
const mockCacheAdapter = {
  get: (key: string) => Promise.resolve(inMemoryCache.get(key) ?? null),
  set: (key: string, value: string) => { inMemoryCache.set(key, value); return Promise.resolve(); },
};

function livePrice(overrides: Partial<LivePrice>): LivePrice {
  return {
    ticker: "SPY", exchange: "NYSE", price: 100, previousClose: 90,
    dayHigh: null, dayLow: null, volume: null, pe: null, eps: null, bvps: null,
    dividendYield: null, currency: "USD", provider: "yahoo_finance",
    fetchedAt: new Date().toISOString(), isStale: false,
    ...overrides,
  };
}

describe("MarketDataAggregatorService", () => {
  let service: MarketDataAggregatorService;
  let mockPriceSync: { getPrice: jest.Mock };
  let mockCryptoSync: { getPrice: jest.Mock };
  let mockCommoditySync: { getPrice: jest.Mock };
  let mockMetalSync: { getPrice: jest.Mock };
  let mockCurrency: { getRate: jest.Mock };

  beforeEach(async () => {
    inMemoryCache.clear();

    mockPriceSync = { getPrice: jest.fn().mockResolvedValue(livePrice({})) };
    mockCryptoSync = { getPrice: jest.fn().mockResolvedValue({ coinId: "bitcoin", price: 60000, currency: "USD", change24hPct: 2.5, provider: "coingecko", fetchedAt: new Date().toISOString(), isStale: false }) };
    mockCommoditySync = { getPrice: jest.fn().mockResolvedValue({ commodity: "OIL", price: 80, currency: "USD", provider: "yahoo_finance", fetchedAt: new Date().toISOString(), isStale: false }) };
    mockMetalSync = { getPrice: jest.fn().mockResolvedValue({ metal: "GOLD", pricePerOzUsd: 2400, pricePerGramUsd: 77, provider: "gold-api.com", fetchedAt: new Date().toISOString(), isStale: false }) };
    mockCurrency = { getRate: jest.fn().mockResolvedValue(new Decimal(83.5)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataAggregatorService,
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
        { provide: PriceSyncService, useValue: mockPriceSync },
        { provide: CryptoPriceSyncService, useValue: mockCryptoSync },
        { provide: CommodityPriceSyncService, useValue: mockCommoditySync },
        { provide: PreciousMetalPriceSyncService, useValue: mockMetalSync },
        { provide: CurrencyService, useValue: mockCurrency },
      ],
    }).compile();

    service = module.get(MarketDataAggregatorService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = mockCacheAdapter; // skip onModuleInit's real Redis connect
  });

  it("reads every quote through the existing price-sync services (no direct provider calls)", async () => {
    await service.getOverview();
    expect(mockPriceSync.getPrice).toHaveBeenCalled();
    expect(mockCryptoSync.getPrice).toHaveBeenCalled();
    expect(mockCommoditySync.getPrice).toHaveBeenCalled();
    expect(mockMetalSync.getPrice).toHaveBeenCalled();
    expect(mockCurrency.getRate).toHaveBeenCalled();
  });

  it("labels every index quote as an ETF proxy, never a raw index value", async () => {
    const overview = await service.getOverview();
    expect(overview.indices.length).toBeGreaterThan(0);
    for (const index of overview.indices) {
      expect(index.isIndexProxy).toBe(true);
    }
  });

  it("computes changePercent from price vs previousClose for gainers/losers", async () => {
    mockPriceSync.getPrice.mockImplementation((ticker: string) =>
      Promise.resolve(livePrice({ ticker, price: 110, previousClose: 100 })),
    );
    const overview = await service.getOverview();
    expect(overview.gainers[0]?.changePercent).toBeCloseTo(10, 5);
  });

  it("sorts gainers descending and losers ascending by changePercent", async () => {
    let call = 0;
    mockPriceSync.getPrice.mockImplementation((ticker: string) => {
      call++;
      const pct = call % 2 === 0 ? 5 : -5; // alternate gain/loss
      const previousClose = 100;
      const price = previousClose * (1 + pct / 100);
      return Promise.resolve(livePrice({ ticker, price, previousClose }));
    });

    const overview = await service.getOverview();
    expect(overview.gainers.every((g) => g.changePercent > 0)).toBe(true);
    expect(overview.losers.every((l) => l.changePercent < 0)).toBe(true);
  });

  it("caches the aggregate overview response — second call makes no underlying calls", async () => {
    await service.getOverview();
    mockPriceSync.getPrice.mockClear();
    mockCryptoSync.getPrice.mockClear();

    await service.getOverview();

    expect(mockPriceSync.getPrice).not.toHaveBeenCalled();
    expect(mockCryptoSync.getPrice).not.toHaveBeenCalled();
  });

  it("degrades a single failed quote to null/isStale rather than failing the whole overview", async () => {
    mockMetalSync.getPrice.mockRejectedValue(new Error("provider down"));
    const overview = await service.getOverview();
    const gold = overview.commodities.find((c) => c.code === "GOLD");
    expect(gold?.price).toBeNull();
    expect(gold?.isStale).toBe(true);
  });
});
