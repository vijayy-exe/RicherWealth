"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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

export type BondType = "GOVT" | "CORPORATE" | "MUNICIPAL" | "SGB";

// ─── Portfolio Summary (currency-correct — converted server-side) ────────────

export interface BondPortfolioSummary {
  totalValue: number;
  annualIncome: number;
  currency: string;
  count: number;
}

export function useBondSummary() {
  return useQuery<BondPortfolioSummary | null>({
    queryKey: ["bonds", "summary"],
    queryFn: () => apiFetch<BondPortfolioSummary | null>("/bonds/summary"),
  });
}

export interface BondHoldingRow {
  id: string;
  holdingId: string;
  issuer: string;
  bondType: BondType;
  faceValue: number;
  couponRate: number;
  maturityDate: string;
  quantityHeld: number;
  purchaseDate: string | null;
  purchasePrice: number | null;
  isin: string | null;
  currencyCode: string;
  analytics: {
    currentValue: number;
    annualCouponIncome: number;
    daysToMaturity: number;
    isMatured: boolean;
    ytm: number | null;
    totalCostBasis: number | null;
  };
}

export interface CreateBondHoldingDto {
  issuer: string;
  bondType: BondType;
  faceValue: number;
  couponRate: number;
  maturityDate: string;
  quantityHeld: number;
  purchaseDate?: string;
  purchasePrice?: number;
  isin?: string;
  currencyCode?: string;
}

export function useBondHoldings() {
  return useQuery<BondHoldingRow[]>({
    queryKey: ["bonds", "holdings"],
    queryFn: () => apiFetch<BondHoldingRow[]>("/bonds/holdings"),
  });
}

export function useCreateBondHolding() {
  const qc = useQueryClient();
  return useMutation<BondHoldingRow, Error, CreateBondHoldingDto>({
    mutationFn: (dto) =>
      apiFetch<BondHoldingRow>("/bonds/holdings", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonds"] });
      qc.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

export function useDeleteBondHolding() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) =>
      apiFetch<void>(`/bonds/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonds"] });
      qc.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}
