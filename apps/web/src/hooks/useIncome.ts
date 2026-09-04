"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export type IncomeSourceType =
  | "SALARY" | "BUSINESS" | "RENTAL" | "DIVIDENDS" | "ROYALTIES"
  | "FREELANCE" | "INTEREST" | "AFFILIATE" | "YOUTUBE" | "OTHER";

export type IncomeFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "ONE_TIME";

export interface IncomeRow {
  id: string;
  userId: string;
  sourceType: IncomeSourceType;
  name: string;
  amount: string;
  frequency: IncomeFrequency;
  currencyCode: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MonthlyPassiveIncome {
  monthlyAmount: number;
  currency: string;
  breakdown: Array<{ sourceType: string; monthlyAmount: number }>;
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

export function useIncomeList() {
  return useQuery({
    queryKey: ["income", "list"],
    queryFn: () => apiFetch<IncomeRow[]>("/income"),
    staleTime: 15_000,
  });
}

export function useMonthlyPassiveIncome() {
  return useQuery({
    queryKey: ["income", "monthly-passive"],
    queryFn: () => apiFetch<MonthlyPassiveIncome>("/income/monthly-passive"),
    staleTime: 15_000,
  });
}

export function useCreateIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<IncomeRow, "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt">) =>
      apiFetch<IncomeRow>("/income", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["income"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/income/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["income"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
