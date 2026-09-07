"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ChannelPreference {
  alertType: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export interface QuietHours {
  start: string | null;
  end: string | null;
  timezone: string;
}

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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Polled rather than pushed — simplest reliable path for the bell's unread
 * badge; a WebSocket push would be a nice upgrade but isn't required for
 * the acceptance criteria (in-app delivery = a row existing and being
 * visible on next fetch). */
const POLL_MS = 30_000;

export function useNotifications(limit = 20) {
  return useQuery<NotificationRow[]>({
    queryKey: ["notifications", "list", limit],
    queryFn: () => authedFetch(`/notifications?limit=${limit}`),
    refetchInterval: POLL_MS,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => authedFetch("/notifications/unread-count"),
    refetchInterval: POLL_MS,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authedFetch<void>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authedFetch<void>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery<ChannelPreference[]>({
    queryKey: ["notifications", "preferences"],
    queryFn: () => authedFetch("/notifications/preferences"),
  });
}

export function useUpsertPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pref: ChannelPreference) =>
      authedFetch<void>("/notifications/preferences", { method: "PUT", body: JSON.stringify(pref) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },
  });
}

export function useQuietHours() {
  return useQuery<QuietHours>({
    queryKey: ["notifications", "quiet-hours"],
    queryFn: () => authedFetch("/notifications/quiet-hours"),
  });
}

export function useSetQuietHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: QuietHours) =>
      authedFetch<void>("/notifications/quiet-hours", { method: "PUT", body: JSON.stringify(dto) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "quiet-hours"] });
    },
  });
}
