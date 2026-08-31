"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface PasskeyRow {
  id: string;
  name: string;
  deviceType: "SINGLE_DEVICE" | "MULTI_DEVICE";
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
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

export function usePasskeys() {
  return useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiFetch<PasskeyRow[]>("/auth/passkeys"),
    staleTime: 15_000,
  });
}

/**
 * Runs the full WebAuthn registration ceremony: fetch options from the API,
 * prompt the browser/authenticator, then send the signed response back for
 * verification and storage.
 */
export function useRegisterPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name?: string) => {
      const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
        "/auth/passkeys/register/options",
        { method: "POST" },
      );
      const response = await startRegistration({ optionsJSON: options });
      return apiFetch<{ id: string; name: string }>("/auth/passkeys/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, name }),
      });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["passkeys"] }); },
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/auth/passkeys/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["passkeys"] }); },
  });
}
