"use client";

import { useEffect } from "react";
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
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    // Fix Audit S-04: the naive version stored the socket in a ref shared
    // across effect invocations. Because connect() is async (awaits
    // getSession() before creating the socket), StrictMode's dev-mode
    // double-invoke can run this effect, clean it up, and run it again all
    // before the FIRST invocation's socket even exists yet -- so its
    // cleanup finds nothing to disconnect, and by the time its own
    // getSession() resolves it creates a socket anyway, overwriting the
    // ref and leaking a connection the second invocation never sees. A
    // `cancelled` flag scoped to this exact invocation (checked after the
    // await, alongside a local `socket` variable instead of a shared ref)
    // closes that race instead of just hiding the symptom.
    let cancelled = false;
    let socket: Socket | null = null;

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;

      socket = io(`${API_URL}/dashboard`, {
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
    }

    void connect();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // Intentionally run once on mount, not on queryClient/supabase identity
    // -- matches this hook's original intent (its prior useCallback used
    // the same empty-deps + disable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
