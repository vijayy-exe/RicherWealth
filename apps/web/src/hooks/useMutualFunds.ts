"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MfHoldingRow, CreateMfHoldingDto, AddSipInstallmentDto, NavPoint } from "../types/mutual-funds";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ─── Portfolio Summary (currency-correct — converted server-side) ────────────

export interface MfPortfolioSummary {
  totalValue: number;
  totalInvested: number;
  currency: string;
  count: number;
}

export function useMutualFundSummary() {
  return useQuery<MfPortfolioSummary | null>({
    queryKey: ["mutual-funds", "summary"],
    queryFn: () => apiFetch<MfPortfolioSummary | null>("/mutual-funds/summary"),
  });
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export function useMutualFundHoldings() {
  return useQuery<MfHoldingRow[]>({
    queryKey: ["mutual-funds", "holdings"],
    queryFn: () => apiFetch<MfHoldingRow[]>("/mutual-funds/holdings"),
  });
}

export function useCreateMutualFundHolding() {
  const qc = useQueryClient();
  return useMutation<MfHoldingRow, Error, CreateMfHoldingDto>({
    mutationFn: (dto) =>
      apiFetch<MfHoldingRow>("/mutual-funds/holdings", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mutual-funds"] }),
  });
}

export function useDeleteMutualFundHolding() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) =>
      apiFetch<void>(`/mutual-funds/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mutual-funds"] });
      qc.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

// ─── SIP Installments ─────────────────────────────────────────────────────────

export function useAddSipInstallment() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { assetId: string; dto: AddSipInstallmentDto }>({
    mutationFn: ({ assetId, dto }) =>
      apiFetch(`/mutual-funds/holdings/${assetId}/sip`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mutual-funds"] }),
  });
}

// ─── NAV History (sparkline data) ─────────────────────────────────────────────

export function useNavHistory(assetId: string, days = 365) {
  return useQuery<NavPoint[]>({
    queryKey: ["mutual-funds", "nav-history", assetId, days],
    queryFn: () =>
      apiFetch<NavPoint[]>(`/mutual-funds/holdings/${assetId}/nav-history?days=${days}`),
    enabled: !!assetId,
  });
}

// ─── Scheme Search ─────────────────────────────────────────────────────────────

export interface SchemeSearchResult {
  schemeCode: string;
  schemeName: string;
}

export function useSchemeSearch(query: string) {
  return useQuery<SchemeSearchResult[]>({
    queryKey: ["mutual-funds", "search", query],
    queryFn: () =>
      apiFetch<SchemeSearchResult[]>(`/mutual-funds/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}
