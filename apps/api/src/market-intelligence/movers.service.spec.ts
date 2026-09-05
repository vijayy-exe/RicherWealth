import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { PriceSyncService, type LivePrice } from "../stocks/price-sync.service";
import { MoversService } from "./movers.service";

const mockPrisma = {
  stockHolding: { findMany: jest.fn() },
};

const mockPriceSync = {
  getPrice: jest.fn(),
};

function price(ticker: string, price: number, previousClose: number): LivePrice {
  return {
    ticker, exchange: "NASDAQ", price, previousClose,
    dayHigh: null, dayLow: null, volume: null, pe: null, eps: null, bvps: null,
    dividendYield: null, currency: "USD", provider: "yahoo_finance",
    fetchedAt: new Date().toISOString(), isStale: false,
  };
}

describe("MoversService", () => {
  let service: MoversService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoversService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PriceSyncService, useValue: mockPriceSync },
      ],
    }).compile();
    service = module.get(MoversService);
  });

  it("sorts holdings into gainers (desc) and losers (desc magnitude) by % change", async () => {
    mockPrisma.stockHolding.findMany.mockResolvedValue([
      { id: "h1", ticker: "AAPL", exchange: "NASDAQ" },
      { id: "h2", ticker: "TSLA", exchange: "NASDAQ" },
      { id: "h3", ticker: "MSFT", exchange: "NASDAQ" },
    ]);
    mockPriceSync.getPrice.mockImplementation((ticker: string) => {
      if (ticker === "AAPL") return Promise.resolve(price("AAPL", 110, 100)); // +10%
      if (ticker === "TSLA") return Promise.resolve(price("TSLA", 80, 100)); // -20%
      if (ticker === "MSFT") return Promise.resolve(price("MSFT", 103, 100)); // +3%
      return Promise.resolve(null);
    });

    const { gainers, losers } = await service.getUserMovers("user-1");

    expect(gainers.map((g) => g.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(gainers[0]!.changePct).toBeCloseTo(10, 5);
    expect(losers.map((l) => l.symbol)).toEqual(["TSLA"]);
    expect(losers[0]!.changePct).toBeCloseTo(-20, 5);
  });

  it("skips holdings with no cached/fetchable price rather than throwing", async () => {
    mockPrisma.stockHolding.findMany.mockResolvedValue([
      { id: "h1", ticker: "UNKNOWN", exchange: "NASDAQ" },
    ]);
    mockPriceSync.getPrice.mockResolvedValue(null);

    const { gainers, losers } = await service.getUserMovers("user-1");
    expect(gainers).toEqual([]);
    expect(losers).toEqual([]);
  });
});
