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

export type RiskDimensionKey = "liquidity" | "debt" | "inflation" | "currency" | "market" | "interestRate" | "credit";
export type RiskLevel = "low" | "moderate" | "elevated" | "high";

export interface RiskSubScore {
  key: RiskDimensionKey;
  label: string;
  score: number;
  level: RiskLevel;
  explanation: string;
  insufficientData?: false;
}

export interface InsufficientRiskSubScore {
  key: RiskDimensionKey;
  label: string;
  insufficientData: true;
  reason: string;
}

export type AnyRiskSubScore = RiskSubScore | InsufficientRiskSubScore;

export function isInsufficientRiskSubScore(s: AnyRiskSubScore): s is InsufficientRiskSubScore {
  return "insufficientData" in s && s.insufficientData === true;
}

export interface RiskProfile {
  overallScore: number | null;
  subScores: AnyRiskSubScore[];
  computedAt: string;
  cached: boolean;
}

export interface RiskTrendPoint {
  date: string;
  overallScore: number;
}

export function useRiskProfile() {
  return useQuery({
    queryKey: ["risk", "profile"],
    queryFn: () => apiFetch<RiskProfile>("/risk/profile"),
    staleTime: 60_000 * 30, // 30 min — matches the 6h server-side cache in spirit (no point refetching more often)
  });
}

export function useRefreshRiskProfile() {
  return async () => apiFetch<RiskProfile>("/risk/profile?refresh=true");
}

export function useRiskTrend() {
  return useQuery({
    queryKey: ["risk", "trend"],
    queryFn: () => apiFetch<RiskTrendPoint[]>("/risk/trend"),
    staleTime: 60_000 * 30,
  });
}
