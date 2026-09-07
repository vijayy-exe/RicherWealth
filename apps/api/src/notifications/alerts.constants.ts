export const ALERTS_FAST_QUEUE = "alerts-fast";
export const ALERTS_DAILY_QUEUE = "alerts-daily";

/** Matches the price-cache cadence (Phase 4's MARKET_HOURS_TTL) — no point
 * evaluating more often than the underlying price data actually refreshes. */
export const FAST_INTERVAL_MS = 15 * 60 * 1000;
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
