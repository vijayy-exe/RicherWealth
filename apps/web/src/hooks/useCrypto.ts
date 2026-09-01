"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  CryptoHoldingRow,
  CreateCryptoHoldingDto,
  PriceAlertRow,
  CreatePriceAlertDto,
  CoinSearchResult,
} from "@/types/crypto";

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

export interface CryptoPortfolioSummary {
  totalValue: number;
  totalCost: number;
  currency: string;
  count: number;
}

export function useCryptoSummary() {
  return useQuery<CryptoPortfolioSummary | null>({
    queryKey: ["crypto", "summary"],
    queryFn: () => apiFetch<CryptoPortfolioSummary | null>("/crypto/summary"),
  });
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export function useCryptoHoldings() {
  return useQuery<CryptoHoldingRow[]>({
    queryKey: ["crypto", "holdings"],
    queryFn: () => apiFetch<CryptoHoldingRow[]>("/crypto/holdings"),
    refetchInterval: 60_000, // crypto moves fast — refresh more often than mutual funds/bonds
  });
}

export function useCreateCryptoHolding() {
  const qc = useQueryClient();
  return useMutation<CryptoHoldingRow, Error, CreateCryptoHoldingDto>({
    mutationFn: (dto) => apiFetch<CryptoHoldingRow>("/crypto/holdings", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crypto"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCryptoHolding() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) => apiFetch<void>(`/crypto/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crypto"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Coin Search ────────────────────────────────────────────────────────────

export function useCoinSearch(query: string) {
  return useQuery<CoinSearchResult[]>({
    queryKey: ["crypto", "search", query],
    queryFn: () => apiFetch<CoinSearchResult[]>(`/crypto/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Price Alerts ─────────────────────────────────────────────────────────────

export function usePriceAlerts() {
  return useQuery<PriceAlertRow[]>({
    queryKey: ["crypto", "alerts"],
    queryFn: () => apiFetch<PriceAlertRow[]>("/crypto/alerts"),
  });
}

export function useCreatePriceAlert() {
  const qc = useQueryClient();
  return useMutation<PriceAlertRow, Error, CreatePriceAlertDto>({
    mutationFn: (dto) => apiFetch<PriceAlertRow>("/crypto/alerts", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["crypto", "alerts"] }),
  });
}

export function useDeletePriceAlert() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch<void>(`/crypto/alerts/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["crypto", "alerts"] }),
  });
}
