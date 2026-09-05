"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MarketQuote, HoldingMoverQuote, EconomicIndicator, IpoListingDto } from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

async function authedFetch<T>(path: string): Promise<T> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch(`${API}/api${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface CurrencyQuote {
  symbol: string;
  label: string;
  rate: number;
}

export interface EconomicCalendarResponse {
  indicators: EconomicIndicator[];
  ipoListings: IpoListingDto[];
  allLive: boolean;
}

export function useIndices() {
  return useQuery<MarketQuote[]>({
    queryKey: ["markets", "indices"],
    queryFn: () => publicFetch("/markets/indices"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useCurrencies() {
  return useQuery<CurrencyQuote[]>({
    queryKey: ["markets", "currencies"],
    queryFn: () => publicFetch("/markets/currencies"),
    staleTime: 60_000,
  });
}

export function useCryptoMarket() {
  return useQuery<MarketQuote[]>({
    queryKey: ["markets", "crypto"],
    queryFn: () => publicFetch("/markets/crypto"),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });
}

export function useCommoditiesMarket() {
  return useQuery<MarketQuote[]>({
    queryKey: ["markets", "commodities"],
    queryFn: () => publicFetch("/markets/commodities"),
    staleTime: 60_000,
  });
}

export function useMyMovers() {
  return useQuery<{ gainers: HoldingMoverQuote[]; losers: HoldingMoverQuote[] }>({
    queryKey: ["markets", "movers"],
    queryFn: () => authedFetch("/markets/movers"),
    staleTime: 60_000,
  });
}

export function useEconomicCalendar() {
  return useQuery<EconomicCalendarResponse>({
    queryKey: ["markets", "calendar"],
    queryFn: () => publicFetch("/markets/calendar"),
    staleTime: 5 * 60_000,
  });
}
