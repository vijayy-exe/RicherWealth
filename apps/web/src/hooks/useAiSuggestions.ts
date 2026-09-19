"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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
    cache: "no-store", // GET responses here change on every mutation (generate/status update); the browser's HTTP cache must never serve a stale one back to a just-refetched query.
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export type AiSuggestionType =
  | "SELL"
  | "BUY"
  | "REBALANCE"
  | "TAX_HARVEST"
  | "INCREASE_SIP"
  // Phase 20 — AI CFO (notification-delivered)
  | "DEBT_COST_ALERT"
  | "RETIREMENT_ACCELERATION"
  // Phase 20 — Opportunity Scanner
  | "LOW_FEE_ALTERNATIVE"
  | "DIVIDEND_OPPORTUNITY";
export type AiSuggestionStatus = "ACTIVE" | "DISMISSED" | "ACTED_ON";

export interface AiSuggestionRow {
  id: string;
  userId: string;
  type: AiSuggestionType;
  title: string;
  description: string;
  dataPoint: Record<string, unknown>;
  dedupeKey: string;
  status: AiSuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

export function useAiSuggestions() {
  return useQuery<AiSuggestionRow[]>({
    queryKey: ["ai", "suggestions"],
    queryFn: () => authedFetch("/ai/suggestions"),
  });
}

export function useGenerateAiSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ created: number; total: number }> => authedFetch("/ai/suggestions/generate", { method: "POST" }),
    // refetchQueries, not just invalidateQueries -- see useGenerateAiReport's
    // identical comment (useAiReports.ts) for why: live-verified this
    // matters against this app's 5-minute default staleTime.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai", "suggestions"] });
      await qc.refetchQueries({ queryKey: ["ai", "suggestions"] });
    },
  });
}

export function useUpdateAiSuggestionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "DISMISSED" | "ACTED_ON" }) =>
      authedFetch(`/ai/suggestions/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai", "suggestions"] });
      await qc.refetchQueries({ queryKey: ["ai", "suggestions"] });
    },
  });
}
