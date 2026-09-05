import { Injectable, Logger } from "@nestjs/common";
import type { EconomicIndicator } from "@richer/shared-types";

/**
 * RBI (Reserve Bank of India) repo rate for the economic calendar.
 *
 * Investigated: RBI's own Database on Indian Economy (DBIE, data.rbi.org.in)
 * has no stable, keyless, CORS-friendly JSON API — it's a reporting portal
 * meant for browser use, not programmatic consumption, and third-party
 * mirrors either require a paid key or are unreliable enough that a
 * production feature shouldn't depend on them. No free, reliable API for
 * this figure was found (matching this repo's own convention for the
 * emergency-fund/IPO-calendar situations: an honest static value, never a
 * fabricated live source).
 *
 * This value must be manually updated when the RBI Monetary Policy
 * Committee changes the repo rate (last set: 2026-08, 6.50%, matching the
 * MPC's publicly announced rate at that time) — it is NEVER presented as
 * live data (`isLive: false` always).
 */
const RBI_REPO_RATE_PCT = 6.5;
const RBI_RATE_LAST_UPDATED = "2026-08-01T00:00:00Z";

@Injectable()
export class RbiRateService {
  private readonly logger = new Logger(RbiRateService.name);

  constructor() {
    this.logger.warn(
      `RBI repo rate is a manually-maintained static value (${RBI_REPO_RATE_PCT}%, last updated ${RBI_RATE_LAST_UPDATED}) — no free live API available. Never presented as live.`,
    );
  }

  getRbiRepoRate(): EconomicIndicator {
    return {
      key: "RBI_REPO_RATE",
      label: "RBI Repo Rate",
      valuePct: RBI_REPO_RATE_PCT,
      isLive: false,
      fetchedAt: RBI_RATE_LAST_UPDATED,
    };
  }
}
