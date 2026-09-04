import { calculateSlabTax, DEFAULT_INDIA_SLABS, type TaxSlab } from "./tax";

const SIMPLE_SLABS: TaxSlab[] = [
  { upTo: 10_000, ratePct: 0 },
  { upTo: 50_000, ratePct: 10 },
  { upTo: null, ratePct: 20 },
];

describe("calculateSlabTax", () => {
  it("hand-computed marginal-bracket reference across all three simple slabs", () => {
    // 0-10000 @ 0% = 0; 10000-50000 (40000) @ 10% = 4000; 50000-80000 (30000) @ 20% = 6000
    const result = calculateSlabTax(80_000, SIMPLE_SLABS);
    expect(result.totalTax).toBe(10_000);
    expect(result.effectiveRatePct).toBe(12.5);
    expect(result.netIncome).toBe(70_000);
    expect(result.breakdown).toEqual([
      { from: 0, to: 10_000, ratePct: 0, taxInBracket: 0 },
      { from: 10_000, to: 50_000, ratePct: 10, taxInBracket: 4_000 },
      { from: 50_000, to: 80_000, ratePct: 20, taxInBracket: 6_000 },
    ]);
  });

  it("taxes nothing when income falls entirely in the first (0%) slab", () => {
    const result = calculateSlabTax(5_000, SIMPLE_SLABS);
    expect(result.totalTax).toBe(0);
    expect(result.effectiveRatePct).toBe(0);
    expect(result.netIncome).toBe(5_000);
    expect(result.breakdown).toEqual([{ from: 0, to: 5_000, ratePct: 0, taxInBracket: 0 }]);
  });

  it("stops exactly at a slab boundary without an extra zero-width bracket", () => {
    const result = calculateSlabTax(10_000, SIMPLE_SLABS);
    expect(result.totalTax).toBe(0);
    expect(result.breakdown).toHaveLength(1);
  });

  it("handles zero income", () => {
    const result = calculateSlabTax(0, SIMPLE_SLABS);
    expect(result.totalTax).toBe(0);
    expect(result.effectiveRatePct).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("hand-computed reference for the default India-shaped slabs at a mid-range income", () => {
    // income 1,000,000: 0-300000@0%=0; 300000-600000(300000)@5%=15000;
    // 600000-900000(300000)@10%=30000; 900000-1000000(100000)@15%=15000
    const result = calculateSlabTax(1_000_000, DEFAULT_INDIA_SLABS);
    expect(result.totalTax).toBe(15_000 + 30_000 + 15_000);
    expect(result.breakdown).toHaveLength(4); // the 0% bracket is included with a 0 tax entry
  });

  it("applies the top uncapped slab correctly for a very high income", () => {
    const result = calculateSlabTax(5_000_000, DEFAULT_INDIA_SLABS);
    const topBracket = result.breakdown[result.breakdown.length - 1];
    expect(topBracket?.ratePct).toBe(30);
    expect(topBracket?.to).toBe(5_000_000);
  });
});
