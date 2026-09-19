import { classifyFundCategory } from "./fund-category-classifier";

describe("classifyFundCategory", () => {
  it.each([
    ["ICICI Prudential Liquid Fund", "Liquid / Money Market Fund"],
    ["UTI Nifty 50 Index Fund", "Index Fund"],
    ["Axis Long Term Equity Fund (ELSS)", "ELSS / Tax Saver"],
    ["Nippon India Small Cap Fund", "Small Cap Equity"],
    ["Motilal Oswal Midcap Fund", "Mid Cap Equity"],
    ["Parag Parikh Flexi Cap Fund", "Flexi Cap / Multi Cap Equity"],
    ["HDFC Bluechip Fund", "Large Cap Equity"],
    ["Motilal Oswal Nasdaq 100 Fund of Fund", "International / Global Equity"],
    ["ICICI Prudential Balanced Advantage Fund", "Balanced / Hybrid Fund"],
    ["HDFC Short Duration Debt Fund", "Debt / Income Fund"],
  ])("classifies %s as %s", (fundName, expected) => {
    expect(classifyFundCategory(fundName)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(classifyFundCategory("axis SMALL CAP fund")).toBe("Small Cap Equity");
  });

  it("returns null for a fund name matching no known keyword set, rather than guessing", () => {
    expect(classifyFundCategory("Some Obscure Thematic Fund XYZ")).toBeNull();
  });
});
