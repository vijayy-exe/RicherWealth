import { calculateRealEstateRoi } from "./real-estate-roi";

describe("calculateRealEstateRoi", () => {
  it("matches a hand-computed example (rented property with a mortgage)", () => {
    // Purchase price 5,000,000; current estimate 5,500,000 (appreciation 500,000).
    // Rent 25,000/mo => annual 300,000. Mortgage: principal 3,500,000 (so equity
    // invested = down payment = 1,500,000), remaining balance 3,000,000 @ 8% =>
    // annual interest 240,000. Maintenance 50,000/yr.
    // ROI = (300,000 + 500,000 - 240,000 - 50,000) / 1,500,000 * 100 = 34%.
    const roi = calculateRealEstateRoi({
      annualRentalIncome: 300_000,
      purchasePrice: 5_000_000,
      currentEstimate: 5_500_000,
      annualMortgageInterest: 240_000,
      annualMaintenanceCost: 50_000,
      equityInvested: 1_500_000,
    });

    expect(roi).toBeCloseTo(34, 5);
  });

  it("returns a negative ROI when depreciation and costs exceed income", () => {
    const roi = calculateRealEstateRoi({
      annualRentalIncome: 0,
      purchasePrice: 5_000_000,
      currentEstimate: 4_800_000,
      annualMortgageInterest: 240_000,
      annualMaintenanceCost: 50_000,
      equityInvested: 1_500_000,
    });

    // (0 + (-200,000) - 240,000 - 50,000) / 1,500,000 * 100 = -32.666...%
    expect(roi).toBeCloseTo(-32.6667, 3);
  });

  it("handles an unmortgaged, unrented property (equity = full purchase price)", () => {
    const roi = calculateRealEstateRoi({
      annualRentalIncome: 0,
      purchasePrice: 2_000_000,
      currentEstimate: 2_200_000,
      annualMortgageInterest: 0,
      annualMaintenanceCost: 10_000,
      equityInvested: 2_000_000,
    });

    // (0 + 200,000 - 0 - 10,000) / 2,000,000 * 100 = 9.5%
    expect(roi).toBeCloseTo(9.5, 5);
  });

  it("returns 0 when no equity was invested (degenerate input, avoids divide-by-zero)", () => {
    const roi = calculateRealEstateRoi({
      annualRentalIncome: 100_000,
      purchasePrice: 1_000_000,
      currentEstimate: 1_100_000,
      annualMortgageInterest: 0,
      annualMaintenanceCost: 0,
      equityInvested: 0,
    });

    expect(roi).toBe(0);
  });
});
