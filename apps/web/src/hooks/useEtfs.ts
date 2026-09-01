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

export interface EtfHoldingRow {
  id: string;
  holdingId: string;
  name: string;
  ticker: string;
  exchange: string;
  unitsHeld: number;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: {
    livePrice: number;
    currency: string;
    dayChangePct: number | null;
    dayChangeAbs: number | null;
    totalGainAbs: number;
    totalGainPct: number;
    cagr: number | null;
    marketValue: number;
    costBasis: number;
    isStale: boolean;
    provider: string;
  } | null;
  priceError: boolean;
}

export interface CreateEtfHoldingDto {
  ticker: string;
  exchange: string;
  unitsHeld: number;
  avgBuyPrice: number;
  currency: string;
  name?: string;
  purchaseDate?: string;
}

export function useEtfHoldings() {
  return useQuery<EtfHoldingRow[]>({
    queryKey: ["etfs", "holdings"],
    queryFn: () => apiFetch<EtfHoldingRow[]>("/etfs/holdings"),
  });
}

export function useCreateEtfHolding() {
  const qc = useQueryClient();
  return useMutation<EtfHoldingRow, Error, CreateEtfHoldingDto>({
    mutationFn: (dto) =>
      apiFetch<EtfHoldingRow>("/etfs/holdings", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etfs"] });
      qc.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}

export function useDeleteEtfHolding() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) =>
      apiFetch<void>(`/etfs/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etfs"] });
      qc.invalidateQueries({ queryKey: ["net-worth"] });
    },
  });
}
