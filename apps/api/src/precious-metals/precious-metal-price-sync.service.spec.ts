import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { PreciousMetalPriceSyncService } from "./precious-metal-price-sync.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const inMemoryCache = new Map<string, string>();
const mockCacheAdapter = {
  get: (key: string) => Promise.resolve(inMemoryCache.get(key) ?? null),
  set: (key: string, value: string) => { inMemoryCache.set(key, value); return Promise.resolve(); },
};

describe("PreciousMetalPriceSyncService", () => {
  let service: PreciousMetalPriceSyncService;

  beforeEach(async () => {
    inMemoryCache.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreciousMetalPriceSyncService,
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
      ],
    }).compile();

    service = module.get(PreciousMetalPriceSyncService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = mockCacheAdapter; // skip onModuleInit's real Redis connect
  });

  it("fetches gold spot price from gold-api.com and converts to per-gram", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { price: 4340.4, currency: "USD" } });

    const price = await service.getPrice("GOLD");

    expect(price).not.toBeNull();
    expect(price?.provider).toBe("gold-api.com");
    expect(price?.pricePerOzUsd).toBe(4340.4);
    expect(price?.pricePerGramUsd).toBeCloseTo(4340.4 / 31.1034768, 4);
    expect(String(mockedAxios.get.mock.calls[0]?.[0])).toContain("gold-api.com/price/XAU");
  });

  it("fetches silver spot price using the XAG symbol", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { price: 64.58, currency: "USD" } });

    const price = await service.getPrice("SILVER");

    expect(price?.pricePerOzUsd).toBe(64.58);
    expect(String(mockedAxios.get.mock.calls[0]?.[0])).toContain("gold-api.com/price/XAG");
  });

  it("returns null when the provider fails and no key-gated secondary is configured", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));

    const price = await service.getPrice("GOLD");

    expect(price).toBeNull();
  });

  it("caches the price after first fetch — second call makes no network request", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { price: 4340.4, currency: "USD" } });

    await service.getPrice("GOLD");
    const second = await service.getPrice("GOLD");

    expect(second?.pricePerOzUsd).toBe(4340.4);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
