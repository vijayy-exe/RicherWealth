"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  MissingNomineeAssetDto,
  EstateBeneficiaryDto,
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  AssetTransferChecklistDto,
  ToggleChecklistStepDto,
} from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function useMissingNomineeChecklist() {
  return useQuery<MissingNomineeAssetDto[]>({
    queryKey: ["estate-planning", "checklist"],
    queryFn: () => authedFetch("/estate-planning/checklist"),
  });
}

export function useBeneficiaries(assetId: string | null) {
  return useQuery<EstateBeneficiaryDto[]>({
    queryKey: ["estate-planning", "beneficiaries", assetId],
    queryFn: () => authedFetch(`/estate-planning/assets/${assetId}/beneficiaries`),
    enabled: !!assetId,
  });
}

export function useAddBeneficiary(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateBeneficiaryDto) =>
      authedFetch<EstateBeneficiaryDto>(`/estate-planning/assets/${assetId}/beneficiaries`, { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estate-planning", "beneficiaries", assetId] }),
  });
}

export function useUpdateBeneficiary(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ beneficiaryId, dto }: { beneficiaryId: string; dto: UpdateBeneficiaryDto }) =>
      authedFetch<EstateBeneficiaryDto>(`/estate-planning/assets/${assetId}/beneficiaries/${beneficiaryId}`, {
        method: "PATCH", body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estate-planning", "beneficiaries", assetId] }),
  });
}

export function useRemoveBeneficiary(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (beneficiaryId: string) =>
      authedFetch(`/estate-planning/assets/${assetId}/beneficiaries/${beneficiaryId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estate-planning", "beneficiaries", assetId] }),
  });
}

export function useTransferChecklist(assetId: string | null) {
  return useQuery<AssetTransferChecklistDto>({
    queryKey: ["estate-planning", "transfer-checklist", assetId],
    queryFn: () => authedFetch(`/estate-planning/assets/${assetId}/transfer-checklist`),
    enabled: !!assetId,
  });
}

export function useToggleChecklistStep(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: ToggleChecklistStepDto) =>
      authedFetch<AssetTransferChecklistDto>(`/estate-planning/assets/${assetId}/transfer-checklist`, {
        method: "PATCH", body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estate-planning", "transfer-checklist", assetId] }),
  });
}
