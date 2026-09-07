/**
 * Test-only helper for reading a pdfkit-generated PDF back. Deliberately
 * NOT the generic `pdf-parse` package — it throws "bad XRef entry" on
 * pdfkit output in this environment (the exact same finding Phase 15
 * documented for its ITR extraction work). Uses the same pinned
 * `pdfjs-dist@3.11.174` CJS build Phase 15 established as the fix.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;
  let full = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    full += content.items.map((it: { str: string }) => it.str).join(" ") + "\n";
  }
  return full;
}

export async function extractPdfPageCount(buffer: Buffer): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data }).promise;
  return doc.numPages;
}
