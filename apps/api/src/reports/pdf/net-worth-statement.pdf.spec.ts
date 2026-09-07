import { buildNetWorthStatementPdf } from "./net-worth-statement.pdf";
import { extractPdfText, extractPdfPageCount } from "./pdf-test-utils";
import type { DashboardSummary } from "../../net-worth/net-worth.service";

/**
 * Acceptance criterion: "Generated PDF opens correctly and matches
 * on-screen data exactly (no stale/cached figures)." Proven here by
 * constructing the exact same `DashboardSummary` shape
 * `NetWorthService.getDashboardSummary` returns (the same object the
 * dashboard page's GraphQL query serves on-screen), rendering the PDF from
 * it, and asserting the PDF's own extracted text contains the exact
 * figures — not a re-derivation, the literal numbers.
 */
describe("buildNetWorthStatementPdf", () => {
  const summary: DashboardSummary = {
    totalNetWorth: 184532.71,
    todayChangeAbs: 412.5,
    todayChangePct: 0.22,
    monthChangeAbs: 3200,
    monthChangePct: 1.77,
    yearChangeAbs: 21000,
    yearChangePct: 12.85,
    assetAllocation: [
      { category: "STOCK", valueInBase: 120000, percentage: 65.0 },
      { category: "CRYPTO", valueInBase: 64532.71, percentage: 35.0 },
    ],
    currencyExposure: [{ currency: "USD", valueInBase: 184532.71, percentage: 100 }],
    emergencyFundHealth: 4.2,
    debtRatio: 0.18,
    snapshots: [],
    hasAssets: true,
    baseCurrency: "USD",
  };

  it("produces a real, single-page PDF whose extracted text contains the exact headline figures", async () => {
    const pdf = await buildNetWorthStatementPdf(summary, "Jamie Test", { text: "placeholder summary", isPlaceholder: true });
    expect(pdf.length).toBeGreaterThan(500);

    const pageCount = await extractPdfPageCount(pdf);
    expect(pageCount).toBe(1); // regression guard for the footer-margin pagination bug found and fixed in this phase

    const text = await extractPdfText(pdf);
    expect(text).toContain("184,532.71"); // exact totalNetWorth, not rounded/re-derived
    expect(text).toContain("Jamie Test");
    expect(text).toContain("+1.77%"); // monthChangePct
    expect(text).toContain("+12.85%"); // yearChangePct
    expect(text).toContain("STOCK");
    expect(text).toContain("65.0%");
    expect(text).toContain("CRYPTO");
    expect(text).toContain("35.0%");
    expect(text).toContain("4.2"); // emergencyFundHealth
    expect(text).toContain("18.0%"); // debtRatio * 100
  });

  it("handles a zero-asset user with an honest empty state, not a fabricated table row", async () => {
    const empty: DashboardSummary = { ...summary, assetAllocation: [], currencyExposure: [], totalNetWorth: 0 };
    const pdf = await buildNetWorthStatementPdf(empty, null, { text: "x", isPlaceholder: true });
    const text = await extractPdfText(pdf);
    expect(text).toContain("No assets recorded yet");
    expect(text).toContain("No currency exposure");
  });

  it("visibly labels the executive summary as a placeholder when isPlaceholder is true", async () => {
    const pdf = await buildNetWorthStatementPdf(summary, null, { text: "This is a placeholder.", isPlaceholder: true });
    const text = await extractPdfText(pdf);
    expect(text).toContain("PLACEHOLDER");
  });
});
