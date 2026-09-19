"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface AssetRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  currentValue: string;
  currencyCode: string;
  notes?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  // Phase 21: Family Office & Estate Planning
  householdId?: string | null;
  nomineeName?: string | null;
  nomineeRelationship?: string | null;
  nomineeContact?: string | null;
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

export function useAssets(type?: string) {
  return useQuery({
    queryKey: ["assets", type ?? "all"],
    queryFn: () => apiFetch<AssetRow[]>(`/assets${type ? `?type=${type}` : ""}`),
    staleTime: 15_000,
  });
}

export interface AssetsPortfolioSummary {
  totalValue: number;
  currency: string;
  count: number;
}

export function useAssetsSummary(type?: string) {
  return useQuery({
    queryKey: ["assets", "summary", type ?? "all"],
    queryFn: () => apiFetch<AssetsPortfolioSummary | null>(`/assets/summary${type ? `?type=${type}` : ""}`),
    staleTime: 15_000,
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ["assets", id],
    queryFn: () => apiFetch<AssetRow>(`/assets/${id}`),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AssetRow, "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt">) =>
      apiFetch<AssetRow>("/assets", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AssetRow>) =>
      apiFetch<AssetRow>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["assets"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}
