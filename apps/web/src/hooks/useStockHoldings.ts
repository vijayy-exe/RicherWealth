"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HoldingAnalytics {
  livePrice: number;
  currency: string;
  dayChangePct: number | null;
  dayChangeAbs: number | null;
  totalGainAbs: number;
  totalGainPct: number;
  cagr: number | null;
  dividendYield: number | null;
  pe: number | null;
  eps: number | null;
  grahamValue: number | null;
  fairValueFlag: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "NO_DATA";
  marketValue: number;
  costBasis: number;
  isStale: boolean;
  provider: string;
}

export interface HoldingRow {
  id: string;
  holdingId: string;
  name: string;
  ticker: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: HoldingAnalytics | null;
  priceError: boolean;
}

export interface CreateHoldingInput {
  ticker: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  name?: string | undefined;
  purchaseDate?: string | undefined;
}

export interface WatchlistItemRow {
  id: string;
  ticker: string;
  exchange: string;
  livePrice: number | null;
  dayChangePct: number | null;
  isStale: boolean;
}

export interface WatchlistWithItems {
  id: string;
  name: string;
  items: WatchlistItemRow[];
}

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  type?: string;
}

// ─── Holdings Hooks ───────────────────────────────────────────────────────────

export function useHoldings() {
  return useQuery<HoldingRow[]>({
    queryKey: ["holdings"],
    queryFn: () => apiFetch("/api/stocks/holdings"),
    staleTime: 30_000, // 30s — WebSocket handles realtime updates
    refetchInterval: 60_000,
  });
}

export function useCreateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateHoldingInput) =>
      apiFetch<HoldingRow>("/api/stocks/holdings", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["holdings"] }); },
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      apiFetch<void>(`/api/stocks/holdings/${assetId}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["holdings"] }); },
  });
}

// ─── Watchlist Hooks ──────────────────────────────────────────────────────────

export function useWatchlists() {
  return useQuery<WatchlistWithItems[]>({
    queryKey: ["watchlists"],
    queryFn: () => apiFetch("/api/stocks/watchlists"),
    staleTime: 30_000,
  });
}

export function useCreateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ id: string; name: string }>("/api/stocks/watchlists", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["watchlists"] }); },
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ watchlistId, ticker, exchange }: { watchlistId: string; ticker: string; exchange: string }) =>
      apiFetch<void>(`/api/stocks/watchlists/${watchlistId}/items`, { method: "POST", body: JSON.stringify({ ticker, exchange }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["watchlists"] }); },
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ watchlistId, itemId }: { watchlistId: string; itemId: string }) =>
      apiFetch<void>(`/api/stocks/watchlists/${watchlistId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["watchlists"] }); },
  });
}

// ─── Ticker Search Hook ───────────────────────────────────────────────────────

export function useTickerSearch(query: string) {
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Show spinner immediately
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      try {
        // Search is a public endpoint — no auth token needed
        const res = await fetch(`${API}/api/stocks/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json() as TickerSearchResult[];
        setResults(data);
      } catch (err) {
        console.error("Ticker search error:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timeout);
    };
  }, [query]);

  return { results, isLoading };
}
