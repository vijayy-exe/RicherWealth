import { convertCurrency } from "./currency";

describe("convertCurrency", () => {
  it("multiplies amount by rate, rounded to the cent", () => {
    expect(convertCurrency(100, 83.12345)).toBe(8_312.35);
  });

  it("returns 0 for a 0 amount", () => {
    expect(convertCurrency(0, 83.12)).toBe(0);
  });
});
