// Mock pdf-parse's text-extraction so this test exercises the line-parsing
// heuristic directly, without needing a real binary PDF fixture — PDF
// accuracy is best-effort/layout-dependent (see the provider's own doc
// comment), so what's actually worth testing here is "given a text layer
// that looks like a typical statement, do we extract the right rows."
jest.mock("pdf-parse", () => jest.fn());

import { PdfImportProvider } from "./pdf-import.provider";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockPdfParse = require("pdf-parse") as jest.Mock;

describe("PdfImportProvider", () => {
  const provider = new PdfImportProvider();

  it("extracts transaction-shaped lines from a statement's text layer", async () => {
    mockPdfParse.mockResolvedValue({
      text: [
        "RicherBank Monthly Statement",
        "Account ending 4821",
        "",
        "01/05/2026 STARBUCKS STORE 4521      -5.75      1,204.10",
        "01/06/2026 PAYROLL DEPOSIT ACME CORP  3500.00    4,704.10",
        "01/07/2026 AMAZON.COM PURCHASE        -89.99     4,614.11",
        "",
        "Page 1 of 2",
      ].join("\n"),
    });

    const result = await provider.parse(Buffer.from("fake-pdf-bytes"), "statement.pdf");

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ merchant: "STARBUCKS STORE 4521", amount: -5.75 });
    expect(result[1]).toMatchObject({ merchant: "PAYROLL DEPOSIT ACME CORP", amount: 3500 });
    expect(result[2]).toMatchObject({ merchant: "AMAZON.COM PURCHASE", amount: -89.99 });
  });

  it("supports ISO-format dates too", async () => {
    mockPdfParse.mockResolvedValue({ text: "2026-01-05 UBER TRIP   -18.40   500.00" });
    const result = await provider.parse(Buffer.from("x"), "statement.pdf");
    expect(result).toHaveLength(1);
    expect(result[0]?.date.getFullYear()).toBe(2026);
  });

  it("returns an empty array (not an error) when no lines match the heuristic", async () => {
    mockPdfParse.mockResolvedValue({ text: "This statement has no parseable transaction lines at all." });
    const result = await provider.parse(Buffer.from("x"), "statement.pdf");
    expect(result).toEqual([]);
  });

  it("wraps a pdf-parse failure in a BadRequestException", async () => {
    mockPdfParse.mockRejectedValue(new Error("not a PDF"));
    await expect(provider.parse(Buffer.from("x"), "bad.pdf")).rejects.toThrow(/Could not read/);
  });
});
