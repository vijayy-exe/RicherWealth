"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface UploadedDocument {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

async function getToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

export function useFileUpload() {
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File, assetId: string = "temp"): Promise<UploadedDocument> => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      const token = await getToken();
      // 1. Get presigned upload URL from backend API
      const signRes = await fetch(`${API}/api/storage/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      });

      if (!signRes.ok) {
        throw new Error("Failed to get presigned upload URL");
      }

      const { uploadUrl, path } = await signRes.json();

      // 2. Direct upload to Supabase Storage via XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setIsUploading(false);
      return {
        name: file.name,
        path,
        size: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "File upload failed";
      setError(msg);
      setIsUploading(false);
      throw err;
    }
  };

  return { uploadFile, isUploading, progress, error };
}
