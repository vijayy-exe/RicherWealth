"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Unlock, ShieldAlert, Upload, Trash2, Eye, FileText, Image as ImageIcon, X } from "lucide-react";

import { useAssets } from "@/hooks/useAssets";
import {
  useVaultSalt,
  useVaultDocuments,
  useSetupVault,
  useUnlockVault,
  useUploadVaultDocument,
  useDeleteVaultDocument,
  downloadAndDecryptVaultDocument,
} from "@/hooks/useVault";
import { VAULT_DOCUMENT_CATEGORIES, VAULT_CATEGORY_LABELS, categorySupportsAssetLink } from "@richer/shared-types";
import type { VaultDocumentCategory, VaultDocumentDto } from "@richer/shared-types";
import { decryptText, base64ToBuffer } from "@richer/shared-types";

const cardStyle = { padding: "1.5rem" };
const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)",
  padding: "0.6rem 0.85rem",
  fontSize: "0.9375rem",
  width: "100%",
};
const primaryButtonStyle: React.CSSProperties = {
  background: "var(--color-accent)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "0.7rem 1.25rem",
  fontWeight: 700,
  fontSize: "0.875rem",
  cursor: "pointer",
};
const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--color-bg-input)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)",
  padding: "0.6rem 1rem",
  fontWeight: 600,
  fontSize: "0.8125rem",
  cursor: "pointer",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Shown once, at the exact moment the user creates their vault passphrase — not a buried disclaimer. */
function KeyLossWarning() {
  return (
    <div style={{
      display: "flex", gap: "0.65rem", alignItems: "flex-start", fontSize: "0.8125rem",
      color: "var(--color-warning)", background: "var(--color-warning-muted)",
      padding: "0.9rem 1rem", borderRadius: "var(--radius-md)", lineHeight: 1.5,
    }}>
      <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        <strong>Store this passphrase safely — RicherWealth cannot recover it.</strong> Your documents are
        encrypted in your browser before they ever leave your device; the server only ever stores unreadable
        ciphertext. If you lose this passphrase, your vault documents cannot be decrypted, by anyone, ever —
        there is no &quot;forgot passphrase&quot; recovery, because a real recovery option would mean the
        server could read your files, which defeats the entire point of a zero-knowledge vault.
      </span>
    </div>
  );
}

function SetupVaultScreen() {
  const setup = useSetupVault();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const canSubmit = passphrase.length >= 10 && passphrase === confirm && acknowledged && !setup.isPending;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ ...cardStyle, maxWidth: 460, margin: "2rem auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <Lock size={20} color="var(--color-accent)" />
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-primary)" }}>Set up your vault</h2>
      </div>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
        Choose a vault passphrase — separate from your login password, used only to encrypt documents in
        this browser. RicherWealth&apos;s servers never see it.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
        <input type="password" placeholder="Vault passphrase (min. 10 characters)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Confirm passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
      </div>

      <KeyLossWarning />

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.8125rem", color: "var(--color-text-secondary)", margin: "1rem 0" }}>
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 3 }} />
        I understand that if I lose this passphrase, my vault documents are permanently unrecoverable.
      </label>

      {confirm.length > 0 && passphrase !== confirm && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-loss)", marginBottom: "0.75rem" }}>Passphrases don&apos;t match.</p>
      )}
      {setup.isError && <p style={{ fontSize: "0.75rem", color: "var(--color-loss)", marginBottom: "0.75rem" }}>Setup failed — try again.</p>}

      <button disabled={!canSubmit} onClick={() => setup.mutate(passphrase)} style={{ ...primaryButtonStyle, width: "100%", opacity: canSubmit ? 1 : 0.5 }}>
        {setup.isPending ? "Setting up…" : "Create vault"}
      </button>
    </motion.div>
  );
}

function UnlockVaultScreen({ onUnlocked }: { onUnlocked: (key: CryptoKey) => void }) {
  const unlock = useUnlockVault();
  const [passphrase, setPassphrase] = useState("");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ ...cardStyle, maxWidth: 420, margin: "2rem auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <Lock size={20} color="var(--color-text-muted)" />
        <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-primary)" }}>Unlock your vault</h2>
      </div>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
        Enter your vault passphrase to decrypt documents in this session. Nothing is sent to the server.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock.mutate(passphrase, { onSuccess: onUnlocked });
        }}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <input type="password" placeholder="Vault passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} style={inputStyle} autoFocus />
        {unlock.isError && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)" }}>
            {unlock.error instanceof Error ? unlock.error.message : "Incorrect passphrase."}
          </p>
        )}
        <button type="submit" disabled={unlock.isPending || passphrase.length === 0} style={{ ...primaryButtonStyle, opacity: unlock.isPending ? 0.6 : 1 }}>
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </motion.div>
  );
}

function CategoryDropzone({ category, vaultKey, linkedAssetId }: { category: VaultDocumentCategory; vaultKey: CryptoKey; linkedAssetId: string | null }) {
  const upload = useUploadVaultDocument();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    upload.mutate({ file, category, vaultKey, linkedAssetId });
  }, [category, vaultKey, linkedAssetId, upload]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragging ? "var(--color-accent)" : "var(--color-border-strong)"}`,
        background: isDragging ? "var(--color-accent-muted)" : "var(--color-bg-input)",
        borderRadius: "var(--radius-lg)", padding: "1.5rem", textAlign: "center", cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      <Upload size={22} color="var(--color-text-muted)" style={{ marginBottom: 6 }} />
      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
        {upload.isPending ? "Encrypting & uploading…" : "Drop a file or click to browse"}
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>Encrypted in your browser before upload — PDF, JPG, PNG</p>
      {upload.isError && <p style={{ fontSize: "0.75rem", color: "var(--color-loss)", marginTop: 6 }}>Upload failed — try again.</p>}
    </div>
  );
}

function DocumentRow({ doc, vaultKey, onPreview }: { doc: VaultDocumentDto; vaultKey: CryptoKey; onPreview: (doc: VaultDocumentDto) => void }) {
  const del = useDeleteVaultDocument();
  const [name, setName] = useState<string>("…");

  useEffect(() => {
    let cancelled = false;
    decryptText(vaultKey, base64ToBuffer(doc.encryptedFilename), doc.encryptedFilenameIv)
      .then((n) => { if (!cancelled) setName(n); })
      .catch(() => { if (!cancelled) setName("(unable to decrypt filename)"); });
    return () => { cancelled = true; };
  }, [doc, vaultKey]);

  const isImage = doc.mimeType.startsWith("image/");

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.65rem 0.9rem", background: "var(--color-bg-input)", borderRadius: "var(--radius-md)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", overflow: "hidden" }}>
        {isImage ? <ImageIcon size={16} color="var(--color-text-muted)" /> : <FileText size={16} color="var(--color-text-muted)" />}
        <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>{name}</span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{fmtBytes(doc.fileSizeBytes)}</span>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button onClick={() => onPreview(doc)} title="Decrypt & preview" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-accent)" }}>
          <Eye size={16} />
        </button>
        <button onClick={() => del.mutate(doc.id)} title="Delete" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function PreviewModal({ doc, vaultKey, onClose }: { doc: VaultDocumentDto; vaultKey: CryptoKey; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");

  useEffect(() => {
    let url: string | null = null;
    downloadAndDecryptVaultDocument(doc.id, vaultKey)
      .then(({ blob, filename: fn }) => {
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
        setFilename(fn);
        setState("ready");
      })
      .catch(() => setState("error"));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc, vaultKey]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}
      onClick={onClose}
    >
      <div className="glass-card" style={{ maxWidth: 800, maxHeight: "85vh", width: "100%", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{filename || "Decrypting…"}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
        </div>
        {state === "loading" && <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Decrypting in your browser…</p>}
        {state === "error" && <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)" }}>Couldn&apos;t decrypt this document — wrong vault key for this session?</p>}
        {state === "ready" && objectUrl && (
          doc.mimeType.startsWith("image/")
            ? <img src={objectUrl} alt={filename} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "var(--radius-md)" }} />
            : <iframe src={objectUrl} title={filename} style={{ width: "100%", height: "70vh", border: "none", borderRadius: "var(--radius-md)" }} />
        )}
      </div>
    </motion.div>
  );
}

export default function VaultPage() {
  const salt = useVaultSalt();
  const docsQuery = useVaultDocuments();
  const assets = useAssets();
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [activeCategory, setActiveCategory] = useState<VaultDocumentCategory>("PAN");
  const [linkedAssetId, setLinkedAssetId] = useState<string>("");
  const [previewDoc, setPreviewDoc] = useState<VaultDocumentDto | null>(null);

  if (salt.isLoading) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>;

  if (!salt.data?.saltB64) {
    return (
      <div>
        <PageHeader />
        <SetupVaultScreen />
      </div>
    );
  }

  if (!vaultKey) {
    return (
      <div>
        <PageHeader />
        <UnlockVaultScreen onUnlocked={setVaultKey} />
      </div>
    );
  }

  const docsInCategory = (docsQuery.data ?? []).filter((d) => d.category === activeCategory);
  const supportsLink = categorySupportsAssetLink(activeCategory);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader unlocked onLock={() => setVaultKey(null)} />

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {VAULT_DOCUMENT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => { setActiveCategory(c); setLinkedAssetId(""); }}
            style={{
              ...secondaryButtonStyle,
              background: activeCategory === c ? "var(--color-accent)" : "var(--color-bg-input)",
              color: activeCategory === c ? "#fff" : "var(--color-text-primary)",
              border: activeCategory === c ? "none" : "1px solid var(--color-border-glass)",
            }}
          >
            {VAULT_CATEGORY_LABELS[c]} {(docsQuery.data ?? []).filter((d) => d.category === c).length > 0 && `(${(docsQuery.data ?? []).filter((d) => d.category === c).length})`}
          </button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={cardStyle}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.9rem" }}>
          {VAULT_CATEGORY_LABELS[activeCategory]}
        </h3>

        {supportsLink && (
          <div style={{ marginBottom: "0.9rem" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Link to an asset (optional)</label>
            <select value={linkedAssetId} onChange={(e) => setLinkedAssetId(e.target.value)} style={inputStyle}>
              <option value="">— None —</option>
              {(assets.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <CategoryDropzone category={activeCategory} vaultKey={vaultKey} linkedAssetId={linkedAssetId || null} />

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          {docsQuery.isLoading ? (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Loading documents…</p>
          ) : docsInCategory.length === 0 ? (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", padding: "0.5rem 0" }}>No documents in this category yet.</p>
          ) : (
            docsInCategory.map((doc) => <DocumentRow key={doc.id} doc={doc} vaultKey={vaultKey} onPreview={setPreviewDoc} />)
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {previewDoc && <PreviewModal doc={previewDoc} vaultKey={vaultKey} onClose={() => setPreviewDoc(null)} />}
      </AnimatePresence>
    </div>
  );
}

function PageHeader({ unlocked, onLock }: { unlocked?: boolean; onLock?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Lock size={24} /> Document Vault
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
          Zero-knowledge encrypted storage — documents are encrypted in your browser; RicherWealth&apos;s servers never see the contents.
        </p>
      </div>
      {unlocked && (
        <button onClick={onLock} style={secondaryButtonStyle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Unlock size={14} /> Lock vault</span>
        </button>
      )}
    </motion.div>
  );
}
