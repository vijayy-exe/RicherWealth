"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  HouseholdDto,
  HouseholdNetWorthDto,
  CreateHouseholdDto,
  AddHouseholdMemberDto,
  UpdateHouseholdMemberRoleDto,
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

export function useMyHouseholds() {
  return useQuery<HouseholdDto[]>({
    queryKey: ["household", "mine"],
    queryFn: () => authedFetch("/household/mine"),
  });
}

export function useHousehold(householdId: string | null) {
  return useQuery<HouseholdDto>({
    queryKey: ["household", householdId],
    queryFn: () => authedFetch(`/household/${householdId}`),
    enabled: !!householdId,
  });
}

export function useHouseholdNetWorth(householdId: string | null) {
  return useQuery<HouseholdNetWorthDto>({
    queryKey: ["household", householdId, "net-worth"],
    queryFn: () => authedFetch(`/household/${householdId}/net-worth`),
    enabled: !!householdId,
  });
}

export function useMemberNetWorth(householdId: string | null, userId: string | null) {
  return useQuery<HouseholdNetWorthDto>({
    queryKey: ["household", householdId, "member", userId, "net-worth"],
    queryFn: () => authedFetch(`/household/${householdId}/members/${userId}/net-worth`),
    enabled: !!householdId && !!userId,
  });
}

export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateHouseholdDto) => authedFetch<HouseholdDto>("/household", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household", "mine"] }),
  });
}

export function useAddHouseholdMember(householdId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: AddHouseholdMemberDto) =>
      authedFetch<HouseholdDto>(`/household/${householdId}/members`, { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household", householdId] }),
  });
}

export function useUpdateHouseholdMemberRole(householdId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, dto }: { userId: string; dto: UpdateHouseholdMemberRoleDto }) =>
      authedFetch<HouseholdDto>(`/household/${householdId}/members/${userId}`, { method: "PATCH", body: JSON.stringify(dto) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household", householdId] }),
  });
}

export function useRemoveHouseholdMember(householdId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => authedFetch<HouseholdDto>(`/household/${householdId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household", householdId] }),
  });
}
