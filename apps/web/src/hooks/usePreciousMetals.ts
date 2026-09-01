"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export type MetalType = "GOLD" | "SILVER";
export type MetalSubType = "PHYSICAL" | "DIGITAL" | "ETF" | "JEWELLERY";

export interface PreciousMetalAnalytics {
  spotPricePerGram: number | null;
  currency: string;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface PreciousMetalRow {
  id: string;
  holdingId: string;
  metalType: MetalType;
  subType: MetalSubType;
  name: string;
  weightGrams: number | null;
  purityFraction: number | null;
  quantity: number | null;
  avgBuyPrice: number;
  makingCharge: number | null;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: PreciousMetalAnalytics;
}

export interface CreatePreciousMetalDto {
  metalType: MetalType;
  subType: MetalSubType;
  name: string;
  weightGrams?: number;
  purityFraction?: number;
  quantity?: number;
  avgBuyPrice: number;
  makingCharge?: number;
  currency: string;
  purchaseDate?: string;
}

export interface PreciousMetalPortfolioSummary {
  totalValue: number;
  totalCost: number;
  currency: string;
  count: number;
}

async function getToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? "API error");
  }
  return res.json() as Promise<T>;
}

export function usePreciousMetalHoldings() {
  return useQuery<PreciousMetalRow[]>({
    queryKey: ["precious-metals", "holdings"],
    queryFn: () => apiFetch<PreciousMetalRow[]>("/precious-metals/holdings"),
    staleTime: 15_000,
  });
}

export function usePreciousMetalSummary() {
  return useQuery<PreciousMetalPortfolioSummary | null>({
    queryKey: ["precious-metals", "summary"],
    queryFn: () => apiFetch<PreciousMetalPortfolioSummary | null>("/precious-metals/summary"),
    staleTime: 15_000,
  });
}

export function useCreatePreciousMetal() {
  const qc = useQueryClient();
  return useMutation<PreciousMetalRow, Error, CreatePreciousMetalDto>({
    mutationFn: (dto) => apiFetch<PreciousMetalRow>("/precious-metals/holdings", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["precious-metals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePreciousMetal() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) => apiFetch<void>(`/precious-metals/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["precious-metals"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
