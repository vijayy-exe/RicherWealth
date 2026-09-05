"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { NewsArticle } from "@richer/shared-types";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function useGeneralNews() {
  return useQuery<NewsArticle[]>({
    queryKey: ["news", "general"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/news/general`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json() as Promise<NewsArticle[]>;
    },
    staleTime: 5 * 60_000,
  });
}

export function usePersonalizedNews() {
  return useQuery<NewsArticle[]>({
    queryKey: ["news", "personalized"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const res = await fetch(`${API}/api/news/personalized`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json() as Promise<NewsArticle[]>;
    },
    staleTime: 5 * 60_000,
  });
}
