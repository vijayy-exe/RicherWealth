"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, Plus, Bot, User, RefreshCw, MessageSquare } from "lucide-react";
import {
  useAiConversations,
  useAiConversationMessages,
  useInvalidateAiConversations,
  useInvalidateAiConversationMessages,
  streamChatMessage,
  type AiMessageRow,
  type RagSource,
} from "@/hooks/useAiChat";
import { useReindexMyData } from "@/hooks/useAiReports";

interface DisplayMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  modelUsed?: string | null;
  ragSources?: RagSource[];
  streaming?: boolean;
}

function sourceLabel(source: RagSource): string {
  return `${source.sourceType.replace(/_/g, " ").toLowerCase()} · ${(source.similarity * 100).toFixed(0)}% match`;
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "USER";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: isUser ? "row-reverse" : "row" }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: "var(--radius-full)",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isUser ? "var(--color-accent-muted)" : "var(--color-bg-card-hover)",
            color: isUser ? "var(--color-accent)" : "var(--color-text-secondary)", flexShrink: 0,
          }}
        >
          {isUser ? <User size={12} /> : <Bot size={12} />}
        </div>
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>{isUser ? "You" : "AI Analyst"}</span>
      </div>

      <div
        style={{
          maxWidth: "70%",
          padding: "10px 14px",
          borderRadius: "var(--radius-lg)",
          background: isUser ? "var(--color-accent-muted)" : "var(--color-bg-card)",
          border: `1px solid ${isUser ? "var(--color-accent-glow)" : "var(--color-border-glass)"}`,
          color: "var(--color-text-primary)",
          fontSize: "0.875rem",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
        {message.streaming && <span style={{ opacity: 0.5 }}>▍</span>}
      </div>

      {!isUser && message.modelUsed && (
        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
          Answered by <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{message.modelUsed}</code>
        </span>
      )}

      {!isUser && message.ragSources && message.ragSources.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "70%" }}>
          {message.ragSources.map((s, i) => (
            <span
              key={`${s.sourceId}-${i}`}
              title={s.sourceId}
              style={{
                fontSize: "0.625rem",
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                background: "var(--color-info-muted)",
                color: "var(--color-info)",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              {sourceLabel(s)}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function AiChatPage() {
  const { data: conversations, isLoading: loadingConversations } = useAiConversations();
  const invalidateConversations = useInvalidateAiConversations();
  const invalidateConversationMessages = useInvalidateAiConversationMessages();
  const reindex = useReindexMyData();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { data: persistedMessages } = useAiConversationMessages(activeConversationId);

  // Only ever holds the CURRENT in-flight exchange (a just-sent question and
  // its streaming reply) -- not a synced copy of persistedMessages. Once a
  // stream finishes, the messages query is refetched and this is cleared,
  // so persistedMessages alone becomes the source of truth again. This
  // avoids syncing query data into local state via an effect (an anti-
  // pattern react-hooks' set-state-in-effect rule flags) -- switching
  // conversations clears the draft directly in the click handler below,
  // an event, not an effect.
  const [draftMessages, setDraftMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayMessages: DisplayMessage[] = [
    ...(persistedMessages ?? []).map((m: AiMessageRow) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      modelUsed: m.modelUsed,
      ragSources: m.ragSources,
    })),
    ...draftMessages,
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [displayMessages.length, draftMessages]);

  function selectConversation(id: string | null) {
    setActiveConversationId(id);
    setDraftMessages([]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    setStreamError(null);
    setIsStreaming(true);

    const userMsg: DisplayMessage = { id: `local-user-${Date.now()}`, role: "USER", content: text };
    const assistantMsgId = `local-assistant-${Date.now()}`;
    setDraftMessages([userMsg, { id: assistantMsgId, role: "ASSISTANT", content: "", streaming: true }]);

    await streamChatMessage(
      activeConversationId,
      text,
      (chunk) => {
        setDraftMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m)));
      },
      (conversationId, modelUsed, ragSources) => {
        setActiveConversationId((prev) => prev ?? conversationId);
        setDraftMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false, modelUsed, ragSources } : m)));
        setIsStreaming(false);
        invalidateConversations();
        // Always refetch by the id the backend actually returned, not
        // `activeConversationId` -- for a brand-new conversation that's
        // still `null` in this closure (see B-03 comment on the hook).
        void invalidateConversationMessages(conversationId).then(() => setDraftMessages([]));
      },
      (message) => {
        setStreamError(message);
        setDraftMessages([]);
        setIsStreaming(false);
      },
    );
  }

  async function handleReindex() {
    setReindexResult(null);
    try {
      const result = await reindex.mutateAsync();
      setReindexResult(`Indexed ${result.indexed} item${result.indexed === 1 ? "" : "s"} from your portfolio.`);
    } catch (err) {
      setReindexResult(err instanceof Error ? err.message : "Reindex failed");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, height: "calc(100vh - 140px)" }}>
      {/* Conversation list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border-glass)",
          background: "var(--color-bg-card)",
          padding: 12,
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={() => selectConversation(null)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent-glow)",
            background: "var(--color-accent-muted)", color: "var(--color-accent)",
            fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} /> New chat
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {loadingConversations ? (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", padding: "8px 10px" }}>Loading…</span>
          ) : !conversations || conversations.length === 0 ? (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", padding: "8px 10px" }}>No conversations yet.</span>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConversation(c.id)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: c.id === activeConversationId ? "var(--color-bg-card-hover)" : "transparent",
                  color: "var(--color-text-secondary)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border-glass)",
          background: "var(--color-bg-card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={16} color="var(--color-accent)" />
            <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>AI Analyst</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {reindexResult && <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>{reindexResult}</span>}
            <button
              type="button"
              onClick={() => void handleReindex()}
              disabled={reindex.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem",
                color: "var(--color-text-secondary)", background: "none",
                border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
                padding: "6px 10px", cursor: reindex.isPending ? "default" : "pointer",
              }}
            >
              <RefreshCw size={12} style={{ animation: reindex.isPending ? "spin 1s linear infinite" : "none" }} />
              {reindex.isPending ? "Indexing…" : "Reindex my data"}
            </button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {displayMessages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--color-text-muted)" }}>
              <MessageSquare size={28} />
              <p style={{ fontSize: "0.875rem", maxWidth: 320, textAlign: "center" }}>
                Ask about your portfolio — &quot;Is my portfolio diversified?&quot;, &quot;How much risk am I taking?&quot; — or a general
                finance question. First time here? Click &quot;Reindex my data&quot; so answers are grounded in your real holdings.
              </p>
            </div>
          ) : (
            displayMessages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        {streamError && (
          <div style={{ padding: "8px 16px", fontSize: "0.8125rem", color: "#FF5C5C", background: "rgba(255,92,92,0.1)" }}>{streamError}</div>
        )}

        <div style={{ display: "flex", gap: 10, padding: 12, borderTop: "1px solid var(--color-border-subtle)" }}>
          <input
            type="text"
            data-testid="ai-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask about your portfolio…"
            disabled={isStreaming}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-glass)", background: "var(--color-bg-input)",
              color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none",
            }}
          />
          <button
            type="button"
            data-testid="ai-chat-send"
            onClick={() => void handleSend()}
            disabled={isStreaming || !input.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40,
              borderRadius: "var(--radius-md)", border: "none",
              background: isStreaming || !input.trim() ? "var(--color-bg-card-hover)" : "var(--color-accent)",
              color: isStreaming || !input.trim() ? "var(--color-text-muted)" : "var(--color-text-inverted)",
              cursor: isStreaming || !input.trim() ? "default" : "pointer",
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
