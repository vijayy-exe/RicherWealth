"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ItrDocumentDto, ItrDiscrepancyReport, ItrYearlyTrendPoint, ParsedItrData } from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const TAX_DOCUMENTS_BUCKET = "tax-documents";

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

export function useItrDocuments() {
  return useQuery<ItrDocumentDto[]>({
    queryKey: ["tax", "itr", "list"],
    queryFn: () => authedFetch("/tax/itr"),
  });
}

export function useItrDocument(id: string | null) {
  return useQuery<ItrDocumentDto>({
    queryKey: ["tax", "itr", id],
    queryFn: () => authedFetch(`/tax/itr/${id}`),
    enabled: !!id,
    // Extraction (esp. OCR) can take a few real seconds — poll while processing.
    refetchInterval: (query) => (query.state.data?.extractionStatus === "PROCESSING" ? 2000 : false),
  });
}

export function useItrDiscrepancies(id: string | null) {
  return useQuery<ItrDiscrepancyReport>({
    queryKey: ["tax", "itr", id, "discrepancies"],
    queryFn: () => authedFetch(`/tax/itr/${id}/discrepancies`),
    enabled: !!id,
  });
}

export function useItrTrend() {
  return useQuery<ItrYearlyTrendPoint[]>({
    queryKey: ["tax", "itr", "trend"],
    queryFn: () => authedFetch("/tax/itr/trend"),
  });
}

/**
 * Full upload flow: sign a URL against the private tax-documents bucket,
 * upload the file directly to Supabase Storage (no API server bandwidth
 * used — same direct-to-storage pattern as the existing asset-documents
 * flow), then tell the API to register the row and start extraction.
 */
export function useUploadItrDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, assessmentYear }: { file: File; assessmentYear: string }) => {
      const signed = await authedFetch<{ uploadUrl: string; path: string; token: string }>("/tax/itr/upload-url", {
        method: "POST",
        body: JSON.stringify({ assessmentYear, filename: file.name, mimeType: file.type }),
      });

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(TAX_DOCUMENTS_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      return authedFetch<ItrDocumentDto>("/tax/itr/register", {
        method: "POST",
        body: JSON.stringify({ assessmentYear, storagePath: signed.path, mimeType: file.type, originalFilename: file.name }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax", "itr"] }),
  });
}

export function useConfirmItrDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, correctedData }: { id: string; correctedData: ParsedItrData }) =>
      authedFetch<ItrDocumentDto>(`/tax/itr/${id}/confirm`, { method: "POST", body: JSON.stringify({ correctedData }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tax", "itr", "list"] });
      qc.invalidateQueries({ queryKey: ["tax", "itr", vars.id] });
      qc.invalidateQueries({ queryKey: ["tax", "itr", "trend"] });
    },
  });
}

export function useDeleteItrDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authedFetch<{ deleted: true }>(`/tax/itr/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax", "itr"] }),
  });
}
