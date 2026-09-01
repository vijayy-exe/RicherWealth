import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { CryptoPriceSyncService } from "./crypto-price-sync.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  cryptoHolding: { updateMany: jest.fn(), findMany: jest.fn() },
};

// Bypass onModuleInit's real Redis/ioredis dance — tests stub `cache` directly.
const inMemoryCache = new Map<string, string>();
const mockCacheAdapter = {
  get: (key: string) => Promise.resolve(inMemoryCache.get(key) ?? null),
  set: (key: string, value: string) => { inMemoryCache.set(key, value); return Promise.resolve(); },
};

describe("CryptoPriceSyncService — provider fallback", () => {
  let service: CryptoPriceSyncService;
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    inMemoryCache.clear();
    mockConfig = { get: jest.fn(() => undefined) }; // no COINCAP_API_KEY by default

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoPriceSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
      ],
    }).compile();

    service = module.get(CryptoPriceSyncService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = mockCacheAdapter; // skip onModuleInit's real Redis connect
    jest.clearAllMocks();
  });

  it("uses CoinGecko when it succeeds", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { bitcoin: { usd: 78000, usd_24h_change: -0.5, last_updated_at: Date.now() / 1000 } },
    });

    const result = await service.refreshPrice("bitcoin", "USD");

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("coingecko");
    expect(result?.price).toBe(78000);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(String(mockedAxios.get.mock.calls[0]?.[0])).toContain("coingecko.com");
  });

  it("falls back to Binance when CoinGecko returns no data for the coin and no CoinCap key is configured", async () => {
    // CoinGecko bulk call "succeeds" (200 OK) but returns an empty object —
    // the documented shape of a miss, not a network error.
    mockedAxios.get.mockResolvedValueOnce({ data: {} });
    // Binance ticker call
    mockedAxios.get.mockResolvedValueOnce({
      data: { lastPrice: "78404.00000000", priceChangePercent: "-0.42" },
    });

    const result = await service.refreshPrice("bitcoin", "USD");

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("binance");
    expect(result?.price).toBe(78404);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(String(mockedAxios.get.mock.calls[1]?.[0])).toContain("binance.com");
  });

  it("falls back to Binance when CoinGecko's request itself throws (network error / rate limit)", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Request failed with status code 429"));
    mockedAxios.get.mockResolvedValueOnce({
      data: { lastPrice: "2450.00", priceChangePercent: "1.2" },
    });

    const result = await service.refreshPrice("ethereum", "USD");

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("binance");
    expect(result?.price).toBe(2450);
  });

  it("tries CoinCap before Binance when a COINCAP_API_KEY is configured", async () => {
    mockConfig.get.mockImplementation((key: string) => (key === "COINCAP_API_KEY" ? "test-key-123" : undefined));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoPriceSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
      ],
    }).compile();
    const keyedService = module.get(CryptoPriceSyncService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (keyedService as any).cache = { get: () => Promise.resolve(null), set: () => Promise.resolve() };

    mockedAxios.get.mockResolvedValueOnce({ data: {} }); // CoinGecko miss
    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { priceUsd: "78500.5", changePercent24Hr: "0.3" } },
    }); // CoinCap hit

    const result = await keyedService.refreshPrice("bitcoin", "USD");

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("coincap");
    expect(result?.price).toBeCloseTo(78500.5);
    expect(String(mockedAxios.get.mock.calls[1]?.[0])).toContain("rest.coincap.io");
    expect(mockedAxios.get.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer test-key-123" },
    });
  });

  it("returns null when every provider fails (unknown coin, no Binance mapping)", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: {} }); // CoinGecko miss

    const result = await service.refreshPrice("some-obscure-coin-not-on-binance", "USD");

    expect(result).toBeNull();
  });
});
