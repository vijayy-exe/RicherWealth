import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Decimal from "decimal.js";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { CurrencyService } from "./currency.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  forexRate: { findUnique: jest.fn(), upsert: jest.fn() },
};

const inMemoryCache = new Map<string, string>();
const mockCacheAdapter = {
  get: (key: string) => Promise.resolve(inMemoryCache.get(key) ?? null),
  set: (key: string, value: string) => { inMemoryCache.set(key, value); return Promise.resolve(); },
};

describe("CurrencyService", () => {
  let service: CurrencyService;

  beforeEach(async () => {
    inMemoryCache.clear();
    jest.clearAllMocks();
    mockPrisma.forexRate.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: MemoryCacheService, useValue: new MemoryCacheService() },
      ],
    }).compile();

    service = module.get(CurrencyService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).cache = mockCacheAdapter; // skip onModuleInit's real Redis connect
  });

  it("returns amount unchanged for same-currency conversion (no network call)", async () => {
    const result = await service.convert(new Decimal(100), "USD", "USD");
    expect(result.toNumber()).toBe(100);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("uses Frankfurter when it succeeds", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { rates: { INR: 83.2 } } });

    const rate = await service.getRate("USD", "INR");

    expect(rate.toNumber()).toBe(83.2);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(String(mockedAxios.get.mock.calls[0]?.[0])).toContain("frankfurter.app");
  });

  it("falls back to open.er-api.com when Frankfurter fails", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));
    mockedAxios.get.mockResolvedValueOnce({ data: { result: "success", rates: { INR: 83.4 } } });

    const rate = await service.getRate("USD", "INR");

    expect(rate.toNumber()).toBe(83.4);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(String(mockedAxios.get.mock.calls[1]?.[0])).toContain("open.er-api.com");
  });

  it("falls back to the hardcoded table when both providers fail", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));

    const rate = await service.getRate("USD", "INR");

    // Hardcoded table: INR=83.5, USD=1 -> 83.5/1 = 83.5
    expect(rate.toNumber()).toBeCloseTo(83.5, 5);
  });

  it("convert() multiplies amount by the resolved rate", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { rates: { INR: 80 } } });

    const result = await service.convert(new Decimal(50), "USD", "INR");

    expect(result.toNumber()).toBe(4000);
  });

  it("caches the rate after first fetch — second call makes no network request", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { rates: { INR: 83.0 } } });

    await service.getRate("USD", "INR");
    const second = await service.getRate("USD", "INR");

    expect(second.toNumber()).toBe(83.0);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
