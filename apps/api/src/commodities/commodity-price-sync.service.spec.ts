import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { CommodityPriceSyncService } from "./commodity-price-sync.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const inMemoryCache = new Map<string, string>();
const mockCacheAdapter = {
  get: (key: string) => Promise.resolve(inMemoryCache.get(key) ?? null),
  set: (key: string, value: string) => { inMemoryCache.set(key, value); return Promise.resolve(); },
};

function yahooResponse(price: number) {
  return { data: { chart: { result: [{ meta: { regularMarketPrice: price } }] } } };
}

describe("CommodityPriceSyncService", () => {
  let service: CommodityPriceSyncService;

  beforeEach(async () => {
    inMemoryCache.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommodityPriceSyncService,
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
      ],
    }).compile();

    service = module.get(CommodityPriceSyncService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = mockCacheAdapter; // skip onModuleInit's real Redis connect
  });

  it("fetches oil price from Yahoo Finance without cents normalization", async () => {
    mockedAxios.get.mockResolvedValueOnce(yahooResponse(90.01));

    const price = await service.getPrice("OIL");

    expect(price?.price).toBe(90.01);
    expect(price?.provider).toBe("yahoo_finance");
    expect(String(mockedAxios.get.mock.calls[0]?.[0])).toContain("CL%3DF");
  });

  it("normalizes wheat's USX (cents) quote to whole dollars", async () => {
    mockedAxios.get.mockResolvedValueOnce(yahooResponse(783.25));

    const price = await service.getPrice("WHEAT");

    expect(price?.price).toBeCloseTo(7.8325, 4);
  });

  it("returns null when Yahoo fails and no Alpha Vantage key is configured", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));

    const price = await service.getPrice("CORN");

    expect(price).toBeNull();
  });

  it("caches the price after first fetch — second call makes no network request", async () => {
    mockedAxios.get.mockResolvedValueOnce(yahooResponse(6.5565));

    await service.getPrice("COPPER");
    const second = await service.getPrice("COPPER");

    expect(second?.price).toBe(6.5565);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
