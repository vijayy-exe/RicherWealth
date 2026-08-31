"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { io, Socket } from "socket.io-client";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface NetWorthUpdate {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  baseCurrency: string;
  updatedAt: string;
}

/**
 * useNetWorthSocket — connects to the /dashboard WebSocket namespace.
 * Authenticates with Supabase JWT and listens for live net-worth-update events.
 * On update, invalidates the dashboard query so the UI refetches.
 */
export function useNetWorthSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  const connect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const socket = io(`${API_URL}/dashboard`, {
      auth: { token: session.access_token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected to /dashboard");
    });

    socket.on("net-worth-update", (data: NetWorthUpdate) => {
      console.log("[WS] Net worth update:", data.netWorth, data.baseCurrency);
      // Invalidate dashboard query so it refetches fresh data
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    });

    socket.on("connect_error", (err) => {
      console.warn("[WS] Connection error:", err.message);
    });

    socketRef.current = socket;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void connect();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connect]);
}
