"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? "API error");
  }
  return res.json() as Promise<T>;
}

// ─── Item 1: Wealth Digital Twin / Scenario Simulator ────────────────────

export type ScenarioType =
  | "MARKET_CRASH"
  | "JOB_LOSS"
  | "INHERITANCE"
  | "HOME_PURCHASE"
  | "EARLY_RETIREMENT"
  | "INFLATION_SPIKE"
  | "CURRENCY_DEPRECIATION"
  | "SALARY_CHANGE";

export interface SimulateScenarioInput {
  scenarioType: ScenarioType;
  horizonYears?: number;
  monthlyContribution?: number;
  marketCrashPct?: number;
  jobLossMonths?: number;
  jobLossMonthlyDrawdown?: number;
  inheritanceAmount?: number;
  homePurchaseDownPayment?: number;
  retirementStartMonth?: number;
  retirementMonthlyWithdrawal?: number;
  inflationSpikePct?: number;
  inflationSpikeMonths?: number;
  currencyDepreciationPct?: number;
  salaryChangePct?: number;
}

export interface FanChartResult {
  periods: number;
  percentiles: Record<string, number[]>;
  mean: number[];
  finalValueStats: { mean: number; std: number; min: number; max: number };
}

export interface ScenarioSimulationResult {
  scenarioType: ScenarioType;
  horizonMonths: number;
  initialValue: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  baseline: FanChartResult;
  scenario: FanChartResult;
}

export function useSimulateScenario() {
  return useMutation({
    mutationFn: (input: SimulateScenarioInput) =>
      apiFetch<ScenarioSimulationResult>("/wealth/simulate-scenario", { method: "POST", body: JSON.stringify(input) }),
  });
}

// ─── Item 4: Wealth Health Score ──────────────────────────────────────────

export type WealthHealthDimensionKey = "diversification" | "risk" | "savingsRate" | "taxEfficiency" | "goalProgress" | "insurance";
export type WealthHealthLevel = "critical" | "needsAttention" | "good" | "excellent";

export interface WealthHealthSubScore {
  key: WealthHealthDimensionKey;
  label: string;
  score: number;
  level: WealthHealthLevel;
  explanation: string;
  insufficientData?: false;
}

export interface InsufficientWealthHealthSubScore {
  key: WealthHealthDimensionKey;
  label: string;
  insufficientData: true;
  reason: string;
}

export type AnyWealthHealthSubScore = WealthHealthSubScore | InsufficientWealthHealthSubScore;

export function isInsufficientWealthHealthSubScore(s: AnyWealthHealthSubScore): s is InsufficientWealthHealthSubScore {
  return "insufficientData" in s && s.insufficientData === true;
}

export interface WealthHealthScore {
  overallScore: number | null;
  subScores: AnyWealthHealthSubScore[];
  computedAt: string;
  cached: boolean;
}

export function useWealthHealthScore() {
  return useQuery({
    queryKey: ["wealth", "health-score"],
    queryFn: () => apiFetch<WealthHealthScore>("/wealth/health-score"),
    staleTime: 60_000 * 30,
  });
}

export function useRefreshWealthHealthScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WealthHealthScore>("/wealth/health-score?refresh=true"),
    onSuccess: (data) => queryClient.setQueryData(["wealth", "health-score"], data),
  });
}

// ─── Item 5: Financial Time Machine ───────────────────────────────────────

export interface TimeMachineSnapshotPoint {
  date: string;
  netWorth: number;
}

export interface TimeMachineAllocationItem {
  category: string;
  valueInBase: number;
  percentage: number;
}

export interface TimeMachinePastState {
  requestedDate: string;
  snapshotDate: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  baseCurrency: string;
  approximateAllocation: TimeMachineAllocationItem[];
  isApproximate: true;
}

export interface TimeMachineInsufficientData {
  insufficientData: true;
  reason: string;
}

export interface BaselineProjectionResult {
  horizonMonths: number;
  initialValue: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  projection: FanChartResult;
}

export function useWealthTimeline() {
  return useQuery({
    queryKey: ["wealth", "time-machine", "timeline"],
    queryFn: () => apiFetch<TimeMachineSnapshotPoint[]>("/wealth/time-machine/timeline"),
    staleTime: 60_000 * 10,
  });
}

export function usePastState(date: string | null) {
  return useQuery({
    queryKey: ["wealth", "time-machine", "past-state", date],
    queryFn: () => apiFetch<TimeMachinePastState | TimeMachineInsufficientData>(`/wealth/time-machine/past-state?date=${encodeURIComponent(date as string)}`),
    enabled: date !== null,
    staleTime: 60_000 * 10,
  });
}

export function useProjectForward(horizonYears: number, monthlyContribution: number, enabled = true) {
  return useQuery({
    queryKey: ["wealth", "time-machine", "project-forward", horizonYears, monthlyContribution],
    queryFn: () =>
      apiFetch<BaselineProjectionResult>(
        `/wealth/time-machine/project-forward?horizonYears=${horizonYears}&monthlyContribution=${monthlyContribution}`,
      ),
    enabled,
    staleTime: 60_000 * 10,
  });
}

// ─── Item 6: Wealth DNA ────────────────────────────────────────────────────

export interface WealthDnaSignals {
  overallRiskScore: number | null;
  debtRiskScore: number | null;
  savingsRatePct: number | null;
  passiveIncomeSharePct: number | null;
  avgGoalAggressiveness: number | null;
}

export interface WealthDnaProfileResult {
  archetype: string;
  narrative: string;
  isLLMGenerated: boolean;
  signals: WealthDnaSignals;
  computedAt: string;
}

export interface WealthDnaInsufficientData {
  insufficientData: true;
  reason: string;
  signals: WealthDnaSignals;
  computedAt: string;
}

export function useWealthDna() {
  return useQuery({
    queryKey: ["wealth", "wealth-dna"],
    queryFn: () => apiFetch<WealthDnaProfileResult | WealthDnaInsufficientData>("/wealth/wealth-dna"),
    staleTime: 60_000 * 30,
  });
}

export function useRefreshWealthDna() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WealthDnaProfileResult | WealthDnaInsufficientData>("/wealth/wealth-dna?refresh=true"),
    onSuccess: (data) => queryClient.setQueryData(["wealth", "wealth-dna"], data),
  });
}
