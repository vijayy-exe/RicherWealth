"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CapitalGainsSummary, DividendTaxSummary, HarvestingCandidate, TaxReport, TaxLotDto } from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function useCapitalGains(financialYear: string, countryCode: string) {
  return useQuery<CapitalGainsSummary>({
    queryKey: ["tax", "capital-gains", financialYear, countryCode],
    queryFn: () => authedFetch(`/tax/capital-gains?financialYear=${encodeURIComponent(financialYear)}&countryCode=${countryCode}`),
  });
}

export function useDividends(financialYear: string, countryCode: string) {
  return useQuery<DividendTaxSummary>({
    queryKey: ["tax", "dividends", financialYear, countryCode],
    queryFn: () => authedFetch(`/tax/dividends?financialYear=${encodeURIComponent(financialYear)}&countryCode=${countryCode}`),
  });
}

export function useHarvestingCandidates(countryCode: string) {
  return useQuery<HarvestingCandidate[]>({
    queryKey: ["tax", "harvesting", countryCode],
    queryFn: () => authedFetch(`/tax/harvesting?countryCode=${countryCode}`),
  });
}

export function useTaxLots() {
  return useQuery<TaxLotDto[]>({
    queryKey: ["tax", "lots"],
    queryFn: () => authedFetch("/tax/lots"),
  });
}

export function useTaxReport(financialYear: string, countryCode: string) {
  return useQuery<TaxReport>({
    queryKey: ["tax", "report", financialYear, countryCode],
    queryFn: () => authedFetch(`/tax/report?financialYear=${encodeURIComponent(financialYear)}&countryCode=${countryCode}`),
  });
}

export function useBackfillLots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authedFetch<{ created: number; skipped: number }>("/tax/lots/backfill", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tax"] });
    },
  });
}

/** Downloads the CSV/PDF report — a plain <a href> can't carry the Bearer auth header, so this fetches the blob and triggers a save via a throwaway object URL. */
export async function downloadTaxReport(financialYear: string, countryCode: string, format: "csv" | "pdf"): Promise<void> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API}/api/tax/report/download?financialYear=${encodeURIComponent(financialYear)}&countryCode=${countryCode}&format=${format}`, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `richerwealth-tax-report-${financialYear}-${countryCode}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
