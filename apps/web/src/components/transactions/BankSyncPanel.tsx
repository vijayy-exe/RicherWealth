"use client";

import { useCallback, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { motion } from "framer-motion";
import {
  usePlaidStatus, usePlaidItems, useCreatePlaidLinkToken, useExchangePlaidToken,
  useSyncPlaidItem, useDisconnectPlaidItem, useImportStatement,
} from "@/hooks/useBankSync";

const sectionTitle: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--color-text-muted)", marginBottom: "1rem",
};
const buttonStyle: React.CSSProperties = {
  padding: "0.625rem 1.25rem", border: "none", borderRadius: "var(--radius-md)",
  color: "#fff", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", fontFamily: "var(--font-sans)",
};

function PlaidConnectButton() {
  const { data: status } = usePlaidStatus();
  const createLinkToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const onSuccess = useCallback(
    (publicToken: string, metadata: { institution?: { institution_id: string; name: string } | null }) => {
      exchangeToken.mutate({
        publicToken,
        ...(metadata.institution?.institution_id && { institutionId: metadata.institution.institution_id }),
        ...(metadata.institution?.name && { institutionName: metadata.institution.name }),
      });
    },
    [exchangeToken],
  );

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess });

  const handleClick = async () => {
    if (linkToken && ready) {
      open();
      return;
    }
    const { linkToken: token } = await createLinkToken.mutateAsync();
    setLinkToken(token);
  };

  if (status && !status.configured) {
    return (
      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
        Plaid isn&apos;t configured yet — add <code>PLAID_CLIENT_ID</code>/<code>PLAID_SECRET</code> (free Sandbox
        credentials from dashboard.plaid.com) to the API&apos;s .env to enable bank sync.
      </div>
    );
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={createLinkToken.isPending || exchangeToken.isPending}
      style={{ ...buttonStyle, background: "linear-gradient(135deg, #3D83FF, #00D97E)" }}
    >
      {exchangeToken.isPending ? "Connecting…" : createLinkToken.isPending ? "Loading…" : "🏦 Connect a Bank (Plaid Sandbox)"}
    </button>
  );
}

function StatementUpload() {
  const importStatement = useImportStatement();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLastResult(null);
    try {
      const result = await importStatement.mutateAsync(file);
      setLastResult(`Imported ${result.created} transactions${result.skippedDuplicates ? ` (${result.skippedDuplicates} duplicates skipped)` : ""}.`);
    } catch (err) {
      setLastResult(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importStatement.isPending}
        style={{ ...buttonStyle, background: "transparent", border: "1px solid var(--color-border-glass)", color: "var(--color-text-primary)" }}
      >
        {importStatement.isPending ? "Importing…" : "📄 Upload CSV / PDF Statement"}
      </button>
      {lastResult && (
        <p style={{ marginTop: 8, fontSize: "0.8125rem", color: importStatement.isError ? "var(--color-loss)" : "var(--color-gain)" }}>
          {lastResult}
        </p>
      )}
    </div>
  );
}

export function BankSyncPanel() {
  const { data: items = [] } = usePlaidItems();
  const syncItem = useSyncPlaidItem();
  const disconnectItem = useDisconnectPlaidItem();

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <p style={sectionTitle}>Bank Sync</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: 16 }}>
        Connect a US/EU bank via Plaid Sandbox, or upload an Indian bank/UPI statement (CSV or PDF) — both feed the
        same categorization and dedup pipeline.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <PlaidConnectButton />
        <StatementUpload />
      </div>

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.625rem 0.875rem", background: "var(--color-bg-input, rgba(255,255,255,0.03))", borderRadius: "var(--radius-md)",
            }}>
              <div>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
                  {item.institutionName ?? "Connected Bank"}
                </span>
                <span style={{
                  marginLeft: 8, fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: 20,
                  color: item.status === "ACTIVE" ? "var(--color-gain)" : "var(--color-loss)",
                  background: item.status === "ACTIVE" ? "var(--color-gain-muted, rgba(0,217,126,0.1))" : "var(--color-loss-muted, rgba(255,77,109,0.1))",
                }}>
                  {item.status}
                </span>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  {item.lastSyncedAt ? `Last synced ${new Date(item.lastSyncedAt).toLocaleString()}` : "Never synced"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => syncItem.mutate(item.id)}
                  disabled={syncItem.isPending}
                  style={{ ...buttonStyle, padding: "0.375rem 0.875rem", fontSize: "0.75rem", background: "var(--color-accent-muted, rgba(61,131,255,0.15))", color: "var(--color-accent)" }}
                >
                  {syncItem.isPending ? "Syncing…" : "Sync"}
                </button>
                <button
                  onClick={() => { if (confirm("Disconnect this bank?")) disconnectItem.mutate(item.id); }}
                  style={{ ...buttonStyle, padding: "0.375rem 0.875rem", fontSize: "0.75rem", background: "transparent", color: "var(--color-text-muted)" }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
