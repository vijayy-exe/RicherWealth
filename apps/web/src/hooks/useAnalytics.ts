"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? "API error");
  }
  return res.json() as Promise<T>;
}

// ─── Allocation ─────────────────────────────────────────────────────────────

export interface AllocationGroup {
  label: string;
  value: number;
  weight: number;
}

export interface AllocationDimension {
  dimension: string;
  groups: AllocationGroup[];
  diversificationScore: number;
  hhi: number;
}

export interface AllocationReport {
  totalValue: number;
  overallDiversificationScore: number;
  byDimension: Record<string, AllocationDimension>;
}

export function useAllocation() {
  return useQuery({
    queryKey: ["analytics", "allocation"],
    queryFn: () => apiFetch<AllocationReport>("/analytics/allocation"),
    staleTime: 60_000,
  });
}

// ─── Risk metrics ───────────────────────────────────────────────────────────

export interface RiskMetrics {
  beta: number;
  alpha: number;
  sharpeRatio: number;
  sortinoRatio: number;
  treynorRatio: number;
  stdDev: number;
  volatility: number;
  maxDrawdown: number | null;
}

export interface InsufficientData {
  insufficientData: true;
  reason: string;
}

export function useRiskMetrics(benchmarkTicker?: string, benchmarkExchange?: string) {
  const params = new URLSearchParams();
  if (benchmarkTicker) params.set("benchmarkTicker", benchmarkTicker);
  if (benchmarkExchange) params.set("benchmarkExchange", benchmarkExchange);
  const qs = params.toString();
  return useQuery({
    queryKey: ["analytics", "risk-metrics", benchmarkTicker ?? "SPY", benchmarkExchange ?? "NYSE"],
    queryFn: () => apiFetch<RiskMetrics | InsufficientData>(`/analytics/risk-metrics${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
  });
}

// ─── Correlation matrix ─────────────────────────────────────────────────────

export interface CorrelationMatrix {
  labels: string[];
  matrix: number[][];
}

export function useCorrelationMatrix() {
  return useQuery({
    queryKey: ["analytics", "correlation"],
    queryFn: () => apiFetch<CorrelationMatrix | InsufficientData>("/analytics/correlation"),
    staleTime: 60_000,
  });
}

// ─── Monte Carlo ────────────────────────────────────────────────────────────

export interface MonteCarloResult {
  periods: number;
  percentiles: Record<string, number[]>;
  mean: number[];
  finalValueStats: { mean: number; std: number; min: number; max: number };
  cached: boolean;
}

export function useMonteCarlo(years = 10, simulations = 10_000) {
  return useQuery({
    queryKey: ["analytics", "monte-carlo", years, simulations],
    queryFn: () => apiFetch<MonteCarloResult | InsufficientData>(`/analytics/monte-carlo?years=${years}&simulations=${simulations}`),
    staleTime: 60_000 * 60, // an hour — this is the "recompute on schedule/on-demand" cache, not a live figure
  });
}

export function useRefreshMonteCarlo() {
  return async (years = 10, simulations = 10_000) =>
    apiFetch<MonteCarloResult | InsufficientData>(`/analytics/monte-carlo?years=${years}&simulations=${simulations}&refresh=true`);
}

export function isInsufficientData(x: unknown): x is InsufficientData {
  return typeof x === "object" && x !== null && "insufficientData" in x;
}
