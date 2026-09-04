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
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? "API error");
  }
  return res.json() as Promise<T>;
}

export type GoalType = "HOUSE" | "MARRIAGE" | "VACATION" | "EDUCATION" | "EMERGENCY_FUND" | "RETIREMENT" | "CAR" | "CUSTOM";

export interface Goal {
  id: string;
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: string;
  currencyCode: string;
  linkedAssetIds: string[];
  standaloneProgressAmount: number;
  notes: string | null;
  currentProgress: number;
  percentComplete: number;
}

export interface CreateGoalInput {
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: string;
  currencyCode: string;
  linkedAssetIds?: string[];
  standaloneProgressAmount?: number;
  notes?: string;
}

export interface GoalSuccessProbability {
  monthsRemaining: number;
  requiredMonthlyContribution: number;
  contributionUsed: number;
  probabilityOfTarget: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  alreadyAchieved?: true;
}

export interface GoalSuccessProbabilityError {
  error: true;
  reason: string;
}

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: () => apiFetch<Goal[]>("/goals"),
    staleTime: 30_000,
  });
}

export function useGoal(id: string | null) {
  return useQuery({
    queryKey: ["goals", id],
    queryFn: () => apiFetch<Goal>(`/goals/${id}`),
    enabled: !!id,
  });
}

export function useGoalSuccessProbability(id: string | null, monthlyContribution?: number) {
  return useQuery({
    queryKey: ["goals", id, "success-probability", monthlyContribution ?? "auto"],
    queryFn: () => apiFetch<GoalSuccessProbability | GoalSuccessProbabilityError>(
      `/goals/${id}/success-probability${monthlyContribution ? `?monthlyContribution=${monthlyContribution}` : ""}`,
    ),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => apiFetch<Goal>("/goals", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function isSuccessProbabilityError(x: GoalSuccessProbability | GoalSuccessProbabilityError | undefined): x is GoalSuccessProbabilityError {
  return !!x && "error" in x;
}
