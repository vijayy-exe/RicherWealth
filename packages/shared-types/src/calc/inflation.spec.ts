import { futureCost, presentValueOfFutureCost, realRateOfReturn } from "./inflation";

describe("futureCost", () => {
  it("matches the compound-inflation reference: 1000 today @ 6% for 10 years", () => {
    const expected = 1_000 * Math.pow(1.06, 10); // independently derived
    expect(futureCost(1_000, 6, 10)).toBeCloseTo(expected, 2);
  });

  it("is unchanged at 0% inflation", () => {
    expect(futureCost(5_000, 0, 20)).toBe(5_000);
  });
});

describe("presentValueOfFutureCost", () => {
  it("is the exact inverse of futureCost", () => {
    const fc = futureCost(1_000, 6, 10);
    expect(presentValueOfFutureCost(fc, 6, 10)).toBeCloseTo(1_000, 1);
  });
});

describe("realRateOfReturn", () => {
  it("matches the Fisher-equation reference: 10% nominal, 6% inflation", () => {
    // real = (1.10/1.06) - 1 = 0.0377358... -> 3.7736%
    const expected = ((1.10 / 1.06) - 1) * 100;
    expect(realRateOfReturn(10, 6)).toBeCloseTo(expected, 3);
  });

  it("is exactly 0% when nominal return equals inflation", () => {
    expect(realRateOfReturn(6, 6)).toBe(0);
  });

  it("is negative when inflation exceeds nominal return", () => {
    expect(realRateOfReturn(4, 6)).toBeLessThan(0);
  });
});
