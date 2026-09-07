import PDFDocument from "pdfkit";

/**
 * Shared institutional-report drawing primitives, built for Phase 18.
 * Deliberately NOT reused by Phase 15's existing tax-report PDF
 * (report.service.ts:buildPdf) — that report stays as-is (a plainer, older
 * layout) rather than risking a regression to a shipped feature just to
 * unify libraries; the new tax-report PDF built on top of these primitives
 * (tax-report.pdf.ts) is an additional, better-designed alternative that
 * reads the exact same TaxReport data.
 *
 * pdfkit was chosen over Puppeteer/@react-pdf/renderer: it's already
 * installed and proven working in this sandboxed dev environment (Phase 15
 * used it with zero native-dependency friction), whereas Puppeteer needs a
 * bundled Chromium binary — a real risk given this same session already
 * had to work around missing Docker and a native-canvas rasterization gap
 * elsewhere today. The tradeoff is real: pdfkit's drawing API is lower-level
 * than @react-pdf/renderer's flexbox layout, so these primitives exist
 * specifically to make achieving a genuinely "institutional" look
 * (letterhead header, ruled tables, consistent typography) tractable
 * without hand-positioning every report from scratch.
 */

export const BRAND_ACCENT = "#3D83FF"; // matches --color-accent in design-tokens.css
export const INK = "#1A1F2E";
export const MUTED = "#6B7280";
export const RULE = "#E2E5EB";
export const PAGE_MARGIN = 48;

export interface PdfDoc extends PDFKit.PDFDocument {}

export function newDocument(): { doc: PdfDoc; finish: () => Promise<Buffer> } {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true }) as PdfDoc;
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finish = () =>
    new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      drawFooterOnAllPages(doc);
      doc.end();
    });
  return { doc, finish };
}

/** Letterhead: wordmark, report title, generated-at, and the account holder's name. */
export function drawLetterhead(doc: PdfDoc, opts: { reportTitle: string; userName?: string | null; subtitle?: string }): void {
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND_ACCENT);
  doc.moveDown(1.2);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text("RicherWealth", PAGE_MARGIN, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Your AI Wealth Operating System", PAGE_MARGIN, doc.y);
  doc.moveDown(1);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(15).text(opts.reportTitle);
  if (opts.subtitle) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(opts.subtitle);
  }
  doc.moveDown(0.3);

  const generatedLine = `Generated ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}${opts.userName ? `  •  Prepared for ${opts.userName}` : ""}`;
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(generatedLine);

  doc.moveDown(0.6);
  drawRule(doc);
  doc.moveDown(0.8);
}

export function drawRule(doc: PdfDoc): void {
  const y = doc.y;
  doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).strokeColor(RULE).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

export function drawSectionTitle(doc: PdfDoc, title: string): void {
  ensureSpace(doc, 30);
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(INK).text(title);
  doc.moveDown(0.3);
}

export function drawKeyValueRow(doc: PdfDoc, pairs: Array<{ label: string; value: string; accent?: boolean }>): void {
  ensureSpace(doc, 40);
  const colWidth = (doc.page.width - PAGE_MARGIN * 2) / pairs.length;
  const startY = doc.y;
  pairs.forEach((p, i) => {
    const x = PAGE_MARGIN + i * colWidth;
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(p.label.toUpperCase(), x, startY, { width: colWidth - 10 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(p.accent ? BRAND_ACCENT : INK).text(p.value, x, startY + 12, { width: colWidth - 10 });
  });
  doc.y = startY + 40;
  doc.moveDown(0.4);
}

export interface TableColumn {
  header: string;
  width: number; // fraction of available width, columns should sum to ~1
  align?: "left" | "right" | "center";
}

/** A real ruled table — header row, alternating row shading, right-aligned numeric columns — not a plain text dump. */
export function drawTable(doc: PdfDoc, columns: TableColumn[], rows: string[][]): void {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidths = columns.map((c) => c.width * usableWidth);
  const rowHeight = 18;

  const drawHeader = () => {
    ensureSpace(doc, rowHeight + 4);
    let x = PAGE_MARGIN;
    const headerY = doc.y;
    doc.rect(PAGE_MARGIN, headerY, usableWidth, rowHeight).fill("#F3F5F9");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK);
    columns.forEach((col, i) => {
      doc.text(col.header, x + 4, headerY + 5, { width: colWidths[i]! - 8, align: col.align ?? "left" });
      x += colWidths[i]!;
    });
    doc.y = headerY + rowHeight;
  };

  drawHeader();

  rows.forEach((row, rIdx) => {
    if (doc.y + rowHeight > doc.page.height - PAGE_MARGIN - 30) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      drawHeader();
    }
    const rowY = doc.y;
    if (rIdx % 2 === 1) {
      doc.rect(PAGE_MARGIN, rowY, usableWidth, rowHeight).fill("#FAFBFC");
    }
    let x = PAGE_MARGIN;
    doc.font("Helvetica").fontSize(8.5).fillColor(INK);
    row.forEach((cell, i) => {
      doc.text(cell, x + 4, rowY + 5, { width: colWidths[i]! - 8, align: columns[i]!.align ?? "left" });
      x += colWidths[i]!;
    });
    doc.y = rowY + rowHeight;
  });

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + usableWidth, doc.y).strokeColor(RULE).lineWidth(1).stroke();
  doc.moveDown(0.6);
}

/** A visibly-labeled placeholder — see executive-summary.provider.ts. Never presented as real AI output. */
export function drawExecutiveSummary(doc: PdfDoc, summary: string, isPlaceholder: boolean): void {
  drawSectionTitle(doc, "Executive Summary");
  if (isPlaceholder) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(`[PLACEHOLDER — AI summary unavailable right now] ${summary}`);
  } else {
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(summary);
  }
  doc.moveDown(0.8);
}

function ensureSpace(doc: PdfDoc, needed: number): void {
  if (doc.y + needed > doc.page.height - PAGE_MARGIN - 30) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

function drawFooterOnAllPages(doc: PdfDoc): void {
  // The real cause of a genuinely observed bug: writing at `page.height - 36`
  // sits INSIDE the document's configured 48pt bottom margin, and pdfkit's
  // auto-page-break check is `y + lineHeight > page.height - margins.bottom`
  // — true here regardless of `lineBreak: false` (that flag only stops
  // in-box word-wrap, not the page-overflow check). Every footer .text()
  // call was silently starting a brand-new page to "safely" place itself,
  // turning a 1-page report into 3. Confirmed by generating a real PDF and
  // reading it back page-by-page with pdfjs-dist 3.11.174 (the pinned build
  // Phase 15 established for reading pdfkit output — plain pdf-parse throws
  // "bad XRef entry" on pdfkit PDFs, same finding as then): real content
  // was entirely on page 1, and pages 2-3 contained nothing but the two
  // footer .text() calls, one page each. Fix: zero out the bottom margin
  // for the duration of the footer write so the overflow check can't fire.
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = range.start; i < range.start + totalPages; i++) {
    doc.switchToPage(i);
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(
      "RicherWealth — for informational purposes only, not financial or tax advice.",
      PAGE_MARGIN,
      y,
      { width: doc.page.width - PAGE_MARGIN * 2 - 80, align: "left", lineBreak: false },
    );
    doc.text(`Page ${i - range.start + 1} of ${totalPages}`, doc.page.width - PAGE_MARGIN - 80, y, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottomMargin;
  }
}
