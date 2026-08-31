"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface PriceTick {
  price: number;
  updatedAt: string;
  /** Flash direction for cell animation — null after 800ms */
  flash: "up" | "down" | null;
  prev: number | null;
}

/** Maps "EXCHANGE:TICKER" → PriceTick */
export type PriceTickMap = Record<string, PriceTick>;

/**
 * WebSocket listener for real-time stock price ticks.
 * Subscribes to the /dashboard namespace and listens for "stock-price-tick" events.
 *
 * Flash state auto-clears after 800ms so the AG Grid cell animation plays once.
 */
export function useStockPriceTick(): PriceTickMap {
  const [ticks, setTicks] = useState<PriceTickMap>({});
  const socketRef = useRef<Socket | null>(null);
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !mounted) return;

      const socket = io(`${API_URL}/dashboard`, {
        auth: { token: session.access_token },
        transports: ["websocket"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on("stock-price-tick", (payload: { key: string; price: number; updatedAt: string }) => {
        if (!mounted) return;

        setTicks((prev) => {
          const existing = prev[payload.key];
          const prevPrice = existing?.price ?? null;
          const flash: "up" | "down" | null =
            prevPrice === null ? null : payload.price > prevPrice ? "up" : payload.price < prevPrice ? "down" : null;

          // Schedule flash clear
          const existing_timer = flashTimers.current.get(payload.key);
          if (existing_timer) clearTimeout(existing_timer);

          if (flash) {
            const timer = setTimeout(() => {
              setTicks((t) => ({
                ...t,
                [payload.key]: { ...t[payload.key]!, flash: null },
              }));
            }, 800);
            flashTimers.current.set(payload.key, timer);
          }

          return {
            ...prev,
            [payload.key]: { price: payload.price, updatedAt: payload.updatedAt, flash, prev: prevPrice },
          };
        });
      });
    };

    void init();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      flashTimers.current.forEach(clearTimeout);
    };
  }, []);

  return ticks;
}
