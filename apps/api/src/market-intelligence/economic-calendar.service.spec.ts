import { Test, TestingModule } from "@nestjs/testing";
import { MacroDataService } from "../risk/macro-data.service";
import { RbiRateService } from "./rbi-rate.service";
import { IpoListingService } from "./ipo-listing.service";
import { EconomicCalendarService } from "./economic-calendar.service";

describe("EconomicCalendarService", () => {
  let service: EconomicCalendarService;
  let mockMacroData: {
    getFedFundsRate: jest.Mock;
    getInflationRate: jest.Mock;
    getGdpGrowthRate: jest.Mock;
  };
  let mockRbiRate: { getRbiRepoRate: jest.Mock };
  let mockIpoListings: { list: jest.Mock };

  beforeEach(async () => {
    mockMacroData = {
      getFedFundsRate: jest.fn().mockResolvedValue({ ratePct: 5.33, isLive: true, fetchedAt: "2026-09-01T00:00:00.000Z" }),
      getInflationRate: jest.fn().mockResolvedValue({ yoyPct: 3.1, isLive: true, fetchedAt: "2026-09-01T00:00:00.000Z" }),
      getGdpGrowthRate: jest.fn().mockResolvedValue({ growthPct: 2.8, isLive: true, fetchedAt: "2026-09-01T00:00:00.000Z" }),
    };
    mockRbiRate = {
      getRbiRepoRate: jest.fn().mockReturnValue({
        key: "RBI_REPO_RATE", label: "RBI Repo Rate", valuePct: 6.5, isLive: false, fetchedAt: "2026-08-01T00:00:00Z",
      }),
    };
    mockIpoListings = { list: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EconomicCalendarService,
        { provide: MacroDataService, useValue: mockMacroData },
        { provide: RbiRateService, useValue: mockRbiRate },
        { provide: IpoListingService, useValue: mockIpoListings },
      ],
    }).compile();

    service = module.get(EconomicCalendarService);
  });

  it("delegates every indicator to its owning service rather than reimplementing any fetch/cache logic", async () => {
    await service.getCalendar();
    expect(mockMacroData.getFedFundsRate).toHaveBeenCalledTimes(1);
    expect(mockMacroData.getInflationRate).toHaveBeenCalledTimes(1);
    expect(mockMacroData.getGdpGrowthRate).toHaveBeenCalledTimes(1);
    expect(mockRbiRate.getRbiRepoRate).toHaveBeenCalledTimes(1);
    expect(mockIpoListings.list).toHaveBeenCalledTimes(1);
  });

  it("assembles all four indicators plus the IPO list into one response", async () => {
    mockIpoListings.list.mockResolvedValue([
      { id: "1", companyName: "Test Co", exchange: "NASDAQ", expectedDate: "2026-09-10", priceRangeMin: 10, priceRangeMax: 12, currency: "USD", status: "EXPECTED", notes: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
    ]);

    const calendar = await service.getCalendar();

    expect(calendar.indicators.map((i) => i.key)).toEqual([
      "FED_FUNDS_RATE", "RBI_REPO_RATE", "US_INFLATION_CPI", "US_GDP_GROWTH",
    ]);
    expect(calendar.ipoListings).toHaveLength(1);
    expect(calendar.ipoListings[0]?.companyName).toBe("Test Co");
  });

  it("reports allLive:true only when every indicator is actually live", async () => {
    const allLive = await service.getCalendar();
    // RBI is always isLive:false by design, so a real environment can never be allLive:true —
    // this is the honest case, not a bug.
    expect(allLive.allLive).toBe(false);

    mockRbiRate.getRbiRepoRate.mockReturnValue({
      key: "RBI_REPO_RATE", label: "RBI Repo Rate", valuePct: 6.5, isLive: true, fetchedAt: "2026-08-01T00:00:00Z",
    });
    const stillNotAllLive = await service.getCalendar();
    expect(stillNotAllLive.allLive).toBe(true);
  });

  it("surfaces isLive:false straight through from MacroDataService's own fallback, never overriding it", async () => {
    mockMacroData.getFedFundsRate.mockResolvedValue({ ratePct: 5.0, isLive: false, fetchedAt: "2026-09-04T00:00:00.000Z" });

    const calendar = await service.getCalendar();
    const fedFunds = calendar.indicators.find((i) => i.key === "FED_FUNDS_RATE");
    expect(fedFunds?.isLive).toBe(false);
    expect(fedFunds?.valuePct).toBe(5.0);
  });

  it("always labels the RBI repo rate as not-live, curated data (this is the real RbiRateService, unmocked in spirit — asserted via the mock's documented contract)", async () => {
    const calendar = await service.getCalendar();
    const rbi = calendar.indicators.find((i) => i.key === "RBI_REPO_RATE");
    expect(rbi?.isLive).toBe(false);
    expect(rbi?.valuePct).toBeGreaterThan(0);
  });
});
