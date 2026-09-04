"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface PlaidItemRow {
  id: string;
  institutionName: string | null;
  status: "ACTIVE" | "ERROR" | "DISCONNECTED";
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface SyncSummary {
  created: number;
  skippedDuplicates: number;
  removed: number;
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

export function usePlaidStatus() {
  return useQuery({
    queryKey: ["bank-sync", "plaid-status"],
    queryFn: () => apiFetch<{ configured: boolean }>("/bank-sync/plaid/status"),
    staleTime: 60_000,
  });
}

export function usePlaidItems() {
  return useQuery({
    queryKey: ["bank-sync", "plaid-items"],
    queryFn: () => apiFetch<PlaidItemRow[]>("/bank-sync/plaid/items"),
    staleTime: 15_000,
  });
}

export function useCreatePlaidLinkToken() {
  return useMutation({
    mutationFn: () => apiFetch<{ linkToken: string }>("/bank-sync/plaid/link-token", { method: "POST" }),
  });
}

export function useExchangePlaidToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { publicToken: string; institutionId?: string; institutionName?: string }) =>
      apiFetch<PlaidItemRow>("/bank-sync/plaid/exchange-token", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-sync"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSyncPlaidItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiFetch<SyncSummary>(`/bank-sync/plaid/items/${itemId}/sync`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-sync"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDisconnectPlaidItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiFetch<void>(`/bank-sync/plaid/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bank-sync"] }),
  });
}

export function useImportStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/api/bank-sync/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets the multipart boundary
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
        throw new Error(err.message ?? "Import failed");
      }
      return res.json() as Promise<SyncSummary>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
