import { isAlertHit } from "./crypto-price-alert.evaluator";

describe("isAlertHit", () => {
  it("ABOVE alert fires once price is at or above target", () => {
    expect(isAlertHit({ targetPrice: 100, direction: "ABOVE" }, 100)).toBe(true);
    expect(isAlertHit({ targetPrice: 100, direction: "ABOVE" }, 105)).toBe(true);
    expect(isAlertHit({ targetPrice: 100, direction: "ABOVE" }, 99.99)).toBe(false);
  });

  it("BELOW alert fires once price is at or below target", () => {
    expect(isAlertHit({ targetPrice: 100, direction: "BELOW" }, 100)).toBe(true);
    expect(isAlertHit({ targetPrice: 100, direction: "BELOW" }, 95)).toBe(true);
    expect(isAlertHit({ targetPrice: 100, direction: "BELOW" }, 100.01)).toBe(false);
  });
});
