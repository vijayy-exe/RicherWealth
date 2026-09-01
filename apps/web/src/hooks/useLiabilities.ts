"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface LiabilityRow {
  id: string;
  userId: string;
  type: string;
  name: string;
  principalAmount: string;
  remainingBalance: string;
  interestRate: string;
  currencyCode: string;
  emiAmount?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  maturityDate?: string | null;
  notes?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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

export function useLiabilities(type?: string) {
  return useQuery({
    queryKey: ["liabilities", type ?? "all"],
    queryFn: () => apiFetch<LiabilityRow[]>(`/liabilities${type ? `?type=${type}` : ""}`),
    staleTime: 15_000,
  });
}

export interface LiabilitiesPortfolioSummary {
  totalOutstanding: number;
  totalMonthlyEmi: number;
  weightedInterestRate: number;
  currency: string;
  count: number;
}

export function useLiabilitiesSummary(type?: string) {
  return useQuery({
    queryKey: ["liabilities", "summary", type ?? "all"],
    queryFn: () => apiFetch<LiabilitiesPortfolioSummary | null>(`/liabilities/summary${type ? `?type=${type}` : ""}`),
    staleTime: 15_000,
  });
}

export function useCreateLiability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<LiabilityRow, "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt">) =>
      apiFetch<LiabilityRow>("/liabilities", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["liabilities"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateLiability(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LiabilityRow>) =>
      apiFetch<LiabilityRow>(`/liabilities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["liabilities"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useDeleteLiability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/liabilities/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["liabilities"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}
