"use client";

import { useState, useRef } from "react";
import { useFileUpload, type UploadedDocument } from "@/hooks/useFileUpload";

interface FileUploadZoneProps {
  assetId?: string;
  documents: UploadedDocument[];
  onChange: (docs: UploadedDocument[]) => void;
  maxSizeMB?: number;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function FileUploadZone({
  assetId = "temp",
  documents,
  onChange,
  maxSizeMB = 20,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress, error: uploadError } = useFileUpload();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setValidationError(null);

    const file = files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setValidationError("Only PDF and image files (JPG, PNG, WEBP) are allowed.");
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      setValidationError(`File size exceeds maximum limit of ${maxSizeMB}MB.`);
      return;
    }

    try {
      const doc = await uploadFile(file, assetId);
      onChange([...documents, doc]);
    } catch {
      // Handled by uploadError state
    }
  };

  const handleRemove = (path: string) => {
    onChange(documents.filter((d) => d.path !== path));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${
            isDragging ? "var(--color-accent)" : "var(--color-border-strong)"
          }`,
          background: isDragging
            ? "var(--color-accent-muted)"
            : "var(--color-bg-input)",
          borderRadius: "var(--radius-lg)",
          padding: "24px 16px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: "none" }}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <div style={{ fontSize: "1.75rem", marginBottom: 6 }}>📄</div>
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: 2,
          }}
        >
          {isUploading ? `Uploading... ${progress}%` : "Drop document or click to browse"}
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          Supports PDF, PNG, JPG up to {maxSizeMB}MB
        </p>

        {/* Progress bar */}
        {isUploading && (
          <div
            style={{
              marginTop: 12,
              height: 4,
              width: "100%",
              background: "var(--color-border-glass)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "var(--color-accent)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        )}
      </div>

      {/* Errors */}
      {(validationError || uploadError) && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-loss)" }}>
          ⚠️ {validationError || uploadError}
        </p>
      )}

      {/* Uploaded documents list */}
      {documents.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--color-text-muted)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Attached Documents ({documents.length})
          </p>
          {documents.map((doc) => (
            <div
              key={doc.path}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-glass)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                <span>📎</span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 240,
                  }}
                >
                  {doc.name}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  ({(doc.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(doc.path);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
                title="Remove file"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
