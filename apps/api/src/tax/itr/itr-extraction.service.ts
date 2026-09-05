import { Injectable, Logger } from "@nestjs/common";
import { hasTextLayer, parseItrText } from "@richer/shared-types";
import type { ParsedItrData } from "@richer/shared-types";
import * as path from "path";
import { pathToFileURL } from "url";

const MAX_OCR_PAGES = 5; // an ITR summary/acknowledgement is 1-3 pages; cap OCR cost on anything larger.
const RASTER_SCALE = 2.0; // upscale for OCR legibility — matches the scale verified during this build (see STATUS.md).

/**
 * Two pdfjs-dist installs, deliberately, for two different jobs — not
 * redundancy:
 *
 * - `pdfjs-dist` (pinned to 3.11.174, the last release with a real CJS
 *   `legacy/build/pdf.js`) does TEXT-LAYER extraction. `require()`-able,
 *   so it (and this whole PDF_TEXT path) is exercisable by Jest, which
 *   can't load ESM-only packages without deeper test-runner surgery this
 *   phase didn't take on. Verified directly: pdf-parse (already a
 *   dependency, used for bank statements) throws "bad XRef entry" on a
 *   pdfkit-generated PDF — a real, reproduced incompatibility — while this
 *   pinned pdfjs-dist parses the identical buffer correctly.
 * - `pdfjs-dist-esm` (aliased in package.json to the current pdfjs-dist
 *   6.3.289, ESM-only) does PAGE RASTERIZATION for the scanned-PDF-to-OCR
 *   fallback. This is the version actually verified to render real,
 *   OCR-readable pixels via @napi-rs/canvas in this environment; the 3.x
 *   CJS build's `page.render()` was tested against BOTH @napi-rs/canvas
 *   and the native `canvas` package here and produced a genuinely blank
 *   canvas (0 non-white pixels, confirmed by direct pixel inspection, not
 *   assumed) — a real 3.x rendering-path defect/incompatibility in this
 *   setup, not a hypothetical. Because it's ESM, this ONE method
 *   (ocrPdfPages) cannot be exercised by Jest here — see the honest gap
 *   noted in STATUS.md. The direct image-upload OCR path (extractFromImage)
 *   doesn't touch either pdfjs build and IS fully Jest-tested.
 */
const STANDARD_FONT_DATA_URL = pathToFileURL(
  path.join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + path.sep,
).href;

export type ExtractionMethod = "PDF_TEXT" | "OCR";

export interface ExtractionResult {
  method: ExtractionMethod;
  rawText: string;
  parsed: ParsedItrData;
  /** min confidence across all non-null fields — 0 if nothing was parsed at all. */
  overallConfidence: number;
}

interface PdfjsTextItem {
  str: string;
  transform: number[];
}

/**
 * Reconstructs line breaks from pdfjs's flat text-item list using each
 * item's y-transform (PDF text-content is otherwise just a bag of
 * positioned runs with no inherent newlines) — needed because our
 * label-then-amount regexes (itr-parser.ts) deliberately refuse to match
 * across a newline, to avoid a section HEADER line accidentally picking up
 * the FOLLOWING line's unrelated figure. Grouping by rounded y (same line)
 * and sorting groups top-to-bottom (PDF y grows upward) recovers real lines.
 */
function reconstructLines(items: PdfjsTextItem[]): string {
  const lines = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]! / 2) * 2; // 2pt tolerance for sub-pixel jitter on the same visual line
    const x = item.transform[4]!;
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y)!.push({ x, str: item.str });
  }
  return Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0]) // descending y = top of page first
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" "))
    .join("\n");
}

/**
 * Extraction pipeline: PDF text-layer first, falling back to OCR
 * (tesseract.js, free/self-hosted/no-API-key) when the PDF has no real
 * text layer (a flat scan) or the input is a JPG/PNG image directly.
 *
 * NEVER logs extracted text or parsed field VALUES — only metadata (method,
 * page count, character count, confidence). This is the one hard rule for
 * this whole feature: ITR documents carry PAN numbers and income figures.
 */
@Injectable()
export class ItrExtractionService {
  private readonly logger = new Logger(ItrExtractionService.name);

  async extract(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
    if (mimeType === "application/pdf") {
      return this.extractFromPdf(buffer);
    }
    if (mimeType === "image/jpeg" || mimeType === "image/png") {
      return this.extractFromImage(buffer);
    }
    throw new Error(`Unsupported ITR document mime type: ${mimeType}`);
  }

  private async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    // verbosity: 0 silences pdfjs's internal console warnings (e.g. a benign
    // "failed to fetch standard font" notice that doesn't affect text
    // extraction — getTextContent() doesn't need glyph outlines, only the
    // text-run/position data already embedded in the PDF).
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: STANDARD_FONT_DATA_URL, verbosity: 0 }).promise;

    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(reconstructLines(content.items as PdfjsTextItem[]));
    }
    const text = pageTexts.join("\n");

    if (hasTextLayer(text, doc.numPages)) {
      this.logger.log(`ITR PDF has a real text layer (${doc.numPages} page(s), ${text.replace(/\s/g, "").length} chars) — using pdfjs-dist text.`);
      return this.finalize("PDF_TEXT", text);
    }

    this.logger.log(`ITR PDF has no usable text layer (${doc.numPages} page(s)) — falling back to OCR via page rasterization.`);
    const rasterText = await this.ocrPdfPages(buffer, doc.numPages);
    return this.finalize("OCR", rasterText);
  }

  private async extractFromImage(buffer: Buffer): Promise<ExtractionResult> {
    const text = await this.ocrImageBuffer(buffer);
    return this.finalize("OCR", text);
  }

  /** Uses the ESM-aliased pdfjs-dist-esm build — see the header comment for why. */
  private async ocrPdfPages(buffer: Buffer, numpagesHint: number): Promise<string> {
    const pdfjs = await import("pdfjs-dist-esm/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");

    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageCount = Math.min(numpagesHint, MAX_OCR_PAGES);
    const texts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: RASTER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      // @napi-rs/canvas's canvas/2D-context pair is API-compatible with what pdfjs-dist-esm
      // (6.x) expects for rendering — verified end-to-end in this environment (real,
      // OCR-readable pixels) before this service was built on top of it, not assumed.
      // Cast through `any`: pdfjs's types are browser-oriented (HTMLCanvasElement).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx as any, canvas: canvas as any, viewport }).promise;
      const pageText = await this.ocrImageBuffer(canvas.toBuffer("image/png"));
      texts.push(pageText);
    }

    if (numpagesHint > MAX_OCR_PAGES) {
      this.logger.warn(`ITR PDF has ${numpagesHint} pages — OCR'd only the first ${MAX_OCR_PAGES} (ITR summaries are normally 1-3 pages).`);
    }
    return texts.join("\n");
  }

  private async ocrImageBuffer(buffer: Buffer): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(buffer);
      this.logger.log(`OCR complete: ${data.text.replace(/\s/g, "").length} chars extracted, tesseract mean confidence ${data.confidence}.`);
      return data.text;
    } finally {
      await worker.terminate();
    }
  }

  private finalize(method: ExtractionMethod, rawText: string): ExtractionResult {
    const parsed = parseItrText(rawText);
    const confidences: number[] = [];
    const collect = (f: { value: unknown; confidence: number }) => { if (f.value !== null) confidences.push(f.confidence); };
    collect(parsed.assessmentYear);
    collect(parsed.grossTotalIncome);
    collect(parsed.totalTaxPaid);
    Object.values(parsed.incomeByHead).forEach(collect);
    Object.values(parsed.deductions).forEach(collect);
    collect(parsed.capitalGainsSchedule.stcg);
    collect(parsed.capitalGainsSchedule.ltcg);
    const overallConfidence = confidences.length > 0 ? Math.min(...confidences) : 0;

    this.logger.log(`ITR parse complete via ${method}: overall confidence ${overallConfidence.toFixed(2)} (never logging extracted values).`);
    return { method, rawText, parsed, overallConfidence };
  }
}
