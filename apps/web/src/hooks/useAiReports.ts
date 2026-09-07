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
    cache: "no-store", // GET responses here change on every mutation (generate/reindex); the browser's HTTP cache must never serve a stale one back to a just-refetched query.
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export type AiReportType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface AiReportRow {
  id: string;
  userId: string;
  type: AiReportType;
  periodStart: string;
  periodEnd: string;
  computedData: Record<string, unknown>;
  narrative: string;
  isLLMGenerated: boolean;
  modelUsed: string | null;
  createdAt: string;
}

export function useAiReports() {
  return useQuery<AiReportRow[]>({
    queryKey: ["ai", "reports"],
    queryFn: () => authedFetch("/ai/reports"),
  });
}

export function useLatestAiReport(type: AiReportType) {
  return useQuery<AiReportRow | null>({
    queryKey: ["ai", "reports", type, "latest"],
    queryFn: () => authedFetch(`/ai/reports/${type.toLowerCase()}/latest`),
  });
}

export function useGenerateAiReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: AiReportType) => authedFetch(`/ai/reports/${type.toLowerCase()}/generate`, { method: "POST" }),
    // refetchQueries (not just invalidateQueries) -- live-verified this
    // matters: this app's global QueryClient sets a 5-minute default
    // staleTime (Providers.tsx), and in this dev session invalidateQueries
    // alone left the just-generated report showing its old "no report yet"
    // state until a full page reload, even though the new row was
    // confirmed correct in the database and the POST returned 201. Forcing
    // an explicit refetch of the exact same key removes the dependency on
    // however invalidation's active-query detection behaves here.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai", "reports"] });
      await qc.refetchQueries({ queryKey: ["ai", "reports"] });
    },
  });
}

export function useReindexMyData() {
  return useMutation({
    mutationFn: (): Promise<{ indexed: number; skipped: number }> => authedFetch("/ai/reindex", { method: "POST" }),
  });
}
