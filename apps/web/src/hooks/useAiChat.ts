"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    cache: "no-store", // GET responses here change on every new message; the browser's HTTP cache must never serve a stale one back to a just-refetched query.
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AiConversationRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface RagSource {
  sourceType: string;
  sourceId: string;
  similarity: number;
}

export interface AiMessageRow {
  id: string;
  conversationId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  ragSources: RagSource[];
  modelUsed: string | null;
  createdAt: string;
}

export function useAiConversations() {
  return useQuery<AiConversationRow[]>({
    queryKey: ["ai", "conversations"],
    queryFn: () => authedFetch("/ai/chat/conversations"),
  });
}

function messagesQueryKey(conversationId: string) {
  return ["ai", "conversations", conversationId, "messages"] as const;
}

function fetchMessages(conversationId: string): Promise<AiMessageRow[]> {
  return authedFetch(`/ai/chat/conversations/${conversationId}/messages`);
}

export function useAiConversationMessages(conversationId: string | null) {
  return useQuery<AiMessageRow[]>({
    queryKey: conversationId ? messagesQueryKey(conversationId) : ["ai", "conversations", null, "messages"],
    queryFn: () => fetchMessages(conversationId as string),
    enabled: !!conversationId,
  });
}

export function useInvalidateAiConversations() {
  const qc = useQueryClient();
  // refetchQueries, not just invalidateQueries -- see useGenerateAiReport's
  // identical comment (useAiReports.ts) for why.
  return () => {
    void qc.invalidateQueries({ queryKey: ["ai", "conversations"] });
    void qc.refetchQueries({ queryKey: ["ai", "conversations"] });
  };
}

/**
 * Fix Audit B-03: loads and caches messages for a SPECIFIC conversation id,
 * addressed directly through the query client -- not through a `refetch`
 * closure returned by `useAiConversationMessages`, and not through
 * `invalidateQueries`/`refetchQueries`. Two distinct bugs, both traced live:
 *
 * 1. That `refetch` closure is bound to whatever `conversationId` the hook
 *    was called with at render time; for a brand-new conversation that's
 *    `null` (nothing selected yet), so calling it after the first reply
 *    streams in refetches the wrong (null-keyed) query.
 * 2. Even addressed at the correct id, `invalidateQueries`/`refetchQueries`
 *    only act on a query that already has an observer mounted (active) or
 *    has been fetched before. A brand-new conversation's messages query has
 *    neither yet -- `activeConversationId` only becomes that id, mounting
 *    the hook, on the NEXT render, which hasn't happened yet when this runs
 *    -- so both calls silently find nothing to do and resolve immediately,
 *    and the caller's "clear the draft now that real data has loaded"
 *    logic fires before any real data exists. Confirmed live: the panel
 *    still snapped to empty with only the first fix applied.
 *
 * `fetchQuery` sidesteps both: it performs a real fetch unconditionally and
 * writes the result into the cache under the right key, so by the time this
 * resolves the soon-to-mount `useAiConversationMessages(realId)` already has
 * data waiting for it -- no dependent second fetch, no empty-window race.
 */
export function useInvalidateAiConversationMessages() {
  const qc = useQueryClient();
  return (conversationId: string) => qc.fetchQuery({ queryKey: messagesQueryKey(conversationId), queryFn: () => fetchMessages(conversationId) });
}

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; modelUsed: string; ragSources: RagSource[] }
  | { type: "error"; message: string };

/**
 * Streams a chat reply over a plain authenticated POST + `fetch`/
 * ReadableStream (not native EventSource, which can't send an Authorization
 * header — matches chat.controller.ts's own documented client contract).
 * Parses the backend's raw `data: {...}\n\n` SSE frames manually — no
 * precedent for this in the frontend yet (confirmed zero existing
 * EventSource/ReadableStream/SSE code anywhere in apps/web before this).
 * The response's `X-Conversation-Id` header carries a freshly-created
 * conversation's id (the only place it's exposed).
 */
export async function streamChatMessage(
  conversationId: string | null,
  message: string,
  onChunk: (text: string) => void,
  onDone: (conversationId: string, modelUsed: string, ragSources: RagSource[]) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const headers = await getAuthHeader();
    const res = await fetch(`${API}/api/ai/chat/stream`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversationId ?? undefined, message }),
    });
    if (!res.ok || !res.body) throw new Error(`Chat stream failed: ${res.status}`);

    const returnedConversationId = res.headers.get("X-Conversation-Id") ?? conversationId ?? "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice("data:".length).trim();
        if (!payload) continue;
        const event = JSON.parse(payload) as StreamEvent;
        if (event.type === "chunk") onChunk(event.text);
        else if (event.type === "done") onDone(returnedConversationId, event.modelUsed, event.ragSources);
        else if (event.type === "error") onError(event.message);
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : "Chat stream failed");
  }
}
