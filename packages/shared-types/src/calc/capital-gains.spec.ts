import {
  classifyHoldingTerm,
  planFifoConsumption,
  computeRealizedGainLoss,
  capitalGainsRateForTerm,
  scanForHarvestCandidates,
} from "./capital-gains";
import { US_TAX_CONFIG, INDIA_TAX_CONFIG } from "../tax-config";

describe("classifyHoldingTerm", () => {
  it("classifies exactly 365 days held as SHORT (strictly greater-than threshold, matching 'held for more than a year')", () => {
    const acquired = new Date("2024-01-01");
    const disposed = new Date("2025-01-01"); // 366 days (2024 is a leap year) - 365 = LONG boundary check below
    const result = classifyHoldingTerm(acquired, disposed, 365);
    expect(result.holdingPeriodDays).toBe(366);
    expect(result.term).toBe("LONG");
  });

  it("classifies a holding period at exactly the threshold as SHORT", () => {
    const acquired = new Date("2024-03-01");
    const disposed = new Date("2025-02-28"); // exactly 364 days
    const result = classifyHoldingTerm(acquired, disposed, 365);
    expect(result.holdingPeriodDays).toBe(364);
    expect(result.term).toBe("SHORT");
  });

  it("classifies a 6-month hold as SHORT under a 365-day threshold", () => {
    const result = classifyHoldingTerm(new Date("2026-01-01"), new Date("2026-07-01"), 365);
    expect(result.term).toBe("SHORT");
    expect(result.holdingPeriodDays).toBe(181);
  });

  it("throws when disposedAt precedes acquiredAt", () => {
    expect(() => classifyHoldingTerm(new Date("2026-06-01"), new Date("2026-01-01"), 365)).toThrow();
  });
});

describe("planFifoConsumption", () => {
  const lots = [
    { id: "lot-2", remainingQuantity: 10, costBasisPerUnit: 150, acquiredAt: new Date("2025-06-01") },
    { id: "lot-1", remainingQuantity: 5, costBasisPerUnit: 100, acquiredAt: new Date("2025-01-01") }, // oldest, should be consumed first
    { id: "lot-3", remainingQuantity: 20, costBasisPerUnit: 200, acquiredAt: new Date("2025-09-01") },
  ];

  it("consumes the oldest lot first, fully, before touching a newer one", () => {
    const result = planFifoConsumption(lots, 8);
    expect(result).toEqual([
      { lotId: "lot-1", quantityConsumed: 5, costBasisPerUnit: 100, acquiredAt: new Date("2025-01-01") },
      { lotId: "lot-2", quantityConsumed: 3, costBasisPerUnit: 150, acquiredAt: new Date("2025-06-01") },
    ]);
  });

  it("spans all three lots in acquisition order when selling more than the two oldest hold", () => {
    const result = planFifoConsumption(lots, 30);
    expect(result.map((c) => c.lotId)).toEqual(["lot-1", "lot-2", "lot-3"]);
    expect(result.map((c) => c.quantityConsumed)).toEqual([5, 10, 15]);
  });

  it("throws when selling more than the total remaining quantity", () => {
    expect(() => planFifoConsumption(lots, 1000)).toThrow(/insufficient lot quantity/);
  });
});

describe("computeRealizedGainLoss", () => {
  it("computes a real gain: 10 units bought at 100, sold at 150 = 500 gain", () => {
    expect(computeRealizedGainLoss(10, 100, 150)).toBe(500);
  });

  it("computes a real loss: 10 units bought at 200, sold at 150 = -500", () => {
    expect(computeRealizedGainLoss(10, 200, 150)).toBe(-500);
  });
});

describe("capitalGainsRateForTerm", () => {
  it("US stock long-term: 15%", () => {
    const rule = US_TAX_CONFIG.capitalGainsRates.find((r) => r.holdingType === "STOCK")!;
    expect(capitalGainsRateForTerm(rule, "LONG")).toBe(15);
  });

  it("US stock short-term: null (ordinary income, not a flat rate)", () => {
    const rule = US_TAX_CONFIG.capitalGainsRates.find((r) => r.holdingType === "STOCK")!;
    expect(capitalGainsRateForTerm(rule, "SHORT")).toBeNull();
  });

  it("India stock short-term: 20%, long-term: 12.5%", () => {
    const rule = INDIA_TAX_CONFIG.capitalGainsRates.find((r) => r.holdingType === "STOCK")!;
    expect(capitalGainsRateForTerm(rule, "SHORT")).toBe(20);
    expect(capitalGainsRateForTerm(rule, "LONG")).toBe(12.5);
  });

  it("India crypto: flat 30% regardless of term", () => {
    const rule = INDIA_TAX_CONFIG.capitalGainsRates.find((r) => r.holdingType === "CRYPTO")!;
    expect(capitalGainsRateForTerm(rule, "SHORT")).toBe(30);
    expect(capitalGainsRateForTerm(rule, "LONG")).toBe(30);
  });
});

describe("scanForHarvestCandidates", () => {
  it("identifies a synthetic underwater holding as a harvesting candidate", () => {
    const lots = [
      {
        lotId: "underwater-1",
        holdingType: "STOCK" as const,
        ticker: "ACME",
        displayName: "Acme Corp",
        remainingQuantity: 100,
        costBasisPerUnit: 50,
        currentPricePerUnit: 30, // bought at 50, now worth 30 -> underwater
        acquiredAt: new Date("2025-01-01"),
      },
    ];
    const candidates = scanForHarvestCandidates(lots, US_TAX_CONFIG, 0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.lotId).toBe("underwater-1");
    expect(candidates[0]!.unrealizedLossPerUnit).toBe(20);
    expect(candidates[0]!.unrealizedLossTotal).toBe(2000);
  });

  it("excludes a holding that is currently at a gain", () => {
    const lots = [
      { lotId: "gain-1", holdingType: "STOCK" as const, ticker: "WIN", displayName: "Winner Inc", remainingQuantity: 10, costBasisPerUnit: 50, currentPricePerUnit: 80, acquiredAt: new Date("2025-01-01") },
    ];
    expect(scanForHarvestCandidates(lots, US_TAX_CONFIG, 0)).toHaveLength(0);
  });

  it("excludes India crypto entirely even when underwater, because Section 115BBH disallows loss offset", () => {
    const lots = [
      { lotId: "crypto-loss-1", holdingType: "CRYPTO" as const, ticker: "BTC", displayName: "Bitcoin", remainingQuantity: 1, costBasisPerUnit: 90000, currentPricePerUnit: 60000, acquiredAt: new Date("2025-01-01") },
    ];
    expect(scanForHarvestCandidates(lots, INDIA_TAX_CONFIG, 100000)).toHaveLength(0);
  });

  it("ranks biggest loss first and allocates available realized gains greedily, capping at zero once exhausted", () => {
    const lots = [
      { lotId: "small-loss", holdingType: "STOCK" as const, ticker: "A", displayName: "A Corp", remainingQuantity: 10, costBasisPerUnit: 100, currentPricePerUnit: 90, acquiredAt: new Date("2025-01-01") }, // loss 100
      { lotId: "big-loss", holdingType: "STOCK" as const, ticker: "B", displayName: "B Corp", remainingQuantity: 10, costBasisPerUnit: 200, currentPricePerUnit: 100, acquiredAt: new Date("2025-01-01") }, // loss 1000
    ];
    const candidates = scanForHarvestCandidates(lots, US_TAX_CONFIG, 1050);
    expect(candidates.map((c) => c.lotId)).toEqual(["big-loss", "small-loss"]);
    expect(candidates[0]!.offsetsRealizedGains).toBe(1000); // fully offset by the 1050 available
    expect(candidates[1]!.offsetsRealizedGains).toBe(50); // only 50 of the 1050 remained
  });
});
