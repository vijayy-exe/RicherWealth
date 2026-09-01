"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export type RealEstateSubType =
  | "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL" | "RENTAL" | "LAND"
  | "PLOT" | "APARTMENT" | "VILLA" | "UNDER_CONSTRUCTION";

export interface RealEstateRoiBreakdown {
  annualRentalIncome: number;
  appreciation: number;
  annualMortgageInterest: number;
  annualMaintenanceCost: number;
  equityInvested: number;
  roiPct: number;
}

export interface LinkedLiabilitySummary {
  id: string;
  name: string;
  interestRate: number;
  remainingBalance: number;
  principalAmount: number;
}

export interface RealEstateRow {
  id: string;
  detailId: string;
  subType: RealEstateSubType;
  name: string;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  purchasePrice: number;
  purchaseDate: string | null;
  currentEstimate: number;
  lastAppraisalDate: string | null;
  monthlyRentalIncome: number | null;
  annualMaintenanceCost: number | null;
  areaValue: number | null;
  areaUnit: string | null;
  photos: string[];
  currency: string;
  linkedLiability: LinkedLiabilitySummary | null;
  roi: RealEstateRoiBreakdown;
}

export interface CreateRealEstateDto {
  subType: RealEstateSubType;
  name: string;
  addressLine?: string;
  purchasePrice: number;
  purchaseDate?: string;
  currentEstimate: number;
  lastAppraisalDate?: string;
  monthlyRentalIncome?: number;
  annualMaintenanceCost?: number;
  areaValue?: number;
  areaUnit?: string;
  photos?: string[];
  linkedLiabilityId?: string;
  currency: string;
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

export function useProperties() {
  return useQuery<RealEstateRow[]>({
    queryKey: ["real-estate", "properties"],
    queryFn: () => apiFetch<RealEstateRow[]>("/real-estate/properties"),
    staleTime: 15_000,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation<RealEstateRow, Error, CreateRealEstateDto>({
    mutationFn: (dto) => apiFetch<RealEstateRow>("/real-estate/properties", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["real-estate"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (assetId) => apiFetch<void>(`/real-estate/properties/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["real-estate"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Manual revaluation history (collectibles, NFTs, etc.) ────────────────────

export interface RevaluationEntry {
  id: string;
  assetId: string;
  value: number;
  currency: string;
  note: string | null;
  valuedAt: string;
  createdAt: string;
}

export function useRevaluations(assetId: string | null) {
  return useQuery<RevaluationEntry[]>({
    queryKey: ["assets", assetId, "revaluations"],
    queryFn: () => apiFetch<RevaluationEntry[]>(`/assets/${assetId}/revaluations`),
    enabled: !!assetId,
  });
}

export function useAddRevaluation(assetId: string) {
  const qc = useQueryClient();
  return useMutation<RevaluationEntry, Error, { value: number; currency: string; note?: string; valuedAt?: string }>({
    mutationFn: (dto) => apiFetch<RevaluationEntry>(`/assets/${assetId}/revaluations`, { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets", assetId, "revaluations"] });
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
