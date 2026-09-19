"use client";

import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API}/api${path}`, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ReportType = "net-worth-statement" | "portfolio-analytics" | "tax-report" | "financial-snapshot" | "health-audit";

export async function downloadReport(type: ReportType, params?: Record<string, string>): Promise<void> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  await downloadFile(`/reports/${type}${query}`, `richerwealth-${type}.pdf`);
}

/** The one export call every AG Grid page's Export button uses — same
 * pattern as `downloadTaxReport` in useTax.ts, generalized across datasets. */
export type ExportDataset = "assets" | "liabilities" | "transactions" | "stocks";

export async function exportTable(dataset: ExportDataset, format: "xlsx" | "csv"): Promise<void> {
  await downloadFile(`/reports/export/${dataset}?format=${format}`, `richerwealth-${dataset}.${format}`);
}
