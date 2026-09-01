"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export type CommodityType = "OIL" | "NATURAL_GAS" | "WHEAT" | "COFFEE" | "CORN" | "COPPER";

export interface CommodityAnalytics {
  livePrice: number | null;
  currency: string;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface CommodityRow {
  id: string;
  holdingId: string;
  commodityType: CommodityType;
  name: string;
  quantity: number;
  unit: string;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: CommodityAnalytics;
}

export interface CreateCommodityDto {
  commodityType: CommodityType;
  name: string;
  quantity: number;
  unit: string;
  avgBuyPrice: number;
  currency: string;
  purchaseDate?: string;
}

export interface CommodityPortfolioSummary {
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

export function useCommodityHoldings() {
  return useQuery<CommodityRow[]>({
    queryKey: ["commodities", "holdings"],
    queryFn: () => apiFetch<CommodityRow[]>("/commodities/holdings"),
    staleTime: 15_000,
  });
}

export function useCommoditySummary() {
  return useQuery<CommodityPortfolioSummary | null>({
    queryKey: ["commodities", "summary"],
    queryFn: () => apiFetch<CommodityPortfolioSummary | null>("/commodities/summary"),
    staleTime: 15_000,
  });
}

export function useCreateCommodity() {
  const qc = useQueryClient();
  return useMutation<CommodityRow, Error, CreateCommodityDto>({
    mutationFn: (dto) => apiFetch<CommodityRow>("/commodities/holdings", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["commodities"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteCommodity() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) => apiFetch<void>(`/commodities/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["commodities"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
