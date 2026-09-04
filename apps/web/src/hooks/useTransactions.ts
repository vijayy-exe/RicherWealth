"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export type TransactionType = "buy" | "sell" | "dividend" | "income" | "expense" | "transfer" | "emi" | "deposit" | "withdrawal";
export type ExpenseCategory = "TRAVEL" | "SHOPPING" | "FOOD" | "UTILITIES" | "HEALTHCARE" | "ENTERTAINMENT" | "SUBSCRIPTIONS" | "BILLS" | "OTHER";

export interface TransactionRow {
  id: string;
  userId: string;
  type: TransactionType;
  amount: string;
  currencyCode: string;
  date: string;
  assetId?: string | null;
  liabilityId?: string | null;
  category?: ExpenseCategory | null;
  merchant?: string | null;
  description?: string | null;
  source: "manual" | "bank_sync" | "csv_import" | "pdf_import";
  externalId?: string | null;
  needsCategoryReview: boolean;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CashFlowMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface SubscriptionCandidate {
  merchant: string;
  amount: number;
  currencyCode: string;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  averageIntervalDays: number;
  estimatedFrequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "IRREGULAR";
  transactionIds: string[];
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

export function useTransactions(filters?: { type?: string; needsReview?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.needsReview !== undefined) params.set("needsReview", String(filters.needsReview));
  const qs = params.toString();

  return useQuery({
    queryKey: ["transactions", "list", filters ?? {}],
    queryFn: () => apiFetch<TransactionRow[]>(`/transactions${qs ? `?${qs}` : ""}`),
    staleTime: 15_000,
  });
}

export function useCashFlow(months = 12) {
  return useQuery({
    queryKey: ["transactions", "cash-flow", months],
    queryFn: () => apiFetch<CashFlowMonth[]>(`/transactions/cash-flow?months=${months}`),
    staleTime: 30_000,
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ["transactions", "subscriptions"],
    queryFn: () => apiFetch<SubscriptionCandidate[]>("/transactions/subscriptions"),
    staleTime: 30_000,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<TransactionRow>("/transactions", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRecategorizeTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: ExpenseCategory }) =>
      apiFetch<TransactionRow>(`/transactions/${id}/category`, { method: "PATCH", body: JSON.stringify({ category }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
