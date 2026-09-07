import { isCrash, CRASH_THRESHOLD_PCT } from "./market-crash.evaluator";

describe("isCrash", () => {
  it("flags an index at exactly the threshold (-3%) — acceptance criterion", () => {
    expect(isCrash({ symbol: "^GSPC", label: "S&P 500", changePct: CRASH_THRESHOLD_PCT })).toBe(true);
  });

  it("flags a worse crash (-4%)", () => {
    expect(isCrash({ symbol: "^GSPC", label: "S&P 500", changePct: -4 })).toBe(true);
  });

  it("does NOT flag a mild move (-1%) — acceptance criterion", () => {
    expect(isCrash({ symbol: "^GSPC", label: "S&P 500", changePct: -1 })).toBe(false);
  });

  it("does not flag a gain", () => {
    expect(isCrash({ symbol: "^GSPC", label: "S&P 500", changePct: 2.5 })).toBe(false);
  });

  it("does not flag when changePct is unavailable", () => {
    expect(isCrash({ symbol: "^GSPC", label: "S&P 500", changePct: null })).toBe(false);
  });
});
