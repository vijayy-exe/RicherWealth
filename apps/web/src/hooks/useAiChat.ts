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

export function useAiConversationMessages(conversationId: string | null) {
  return useQuery<AiMessageRow[]>({
    queryKey: ["ai", "conversations", conversationId, "messages"],
    queryFn: () => authedFetch(`/ai/chat/conversations/${conversationId}/messages`),
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
