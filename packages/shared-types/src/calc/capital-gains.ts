/**
 * Pure capital-gains functions — FIFO lot consumption, short/long-term
 * classification, realized-gain computation, and a rules-based (NOT AI)
 * tax-loss-harvesting scan. No DI, no I/O, no country-specific numbers
 * hardcoded here — every rate/threshold comes from a `TaxConfig` (see
 * `../tax-config`), so this file never changes when a country is added.
 *
 * Shared between apps/api (apps/api/src/tax/capital-gains.service.ts, the
 * authoritative calculation that persists TaxLotDisposal rows) and any
 * frontend preview that wants to show "if you sell this, here's your
 * gain/loss" before committing — same single-source-of-truth pattern as
 * Phase 9's amortization.ts and Phase 13's compound-growth.ts.
 */
import type { TaxConfig, CapitalGainsRateRule } from "../tax-config/schema";

export type CapitalGainsTerm = "SHORT" | "LONG";
export type TaxHoldingType = "STOCK" | "MUTUAL_FUND" | "CRYPTO";

const MS_PER_DAY = 86_400_000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Term classification ───────────────────────────────────────────────────

export interface TermClassification {
  term: CapitalGainsTerm;
  holdingPeriodDays: number;
}

/**
 * Classifies a disposal as SHORT or LONG term. When `longTermThresholdDays`
 * is null (e.g. India crypto, which has no term distinction — flat 30%
 * regardless of holding period per Section 115BBH), this still computes a
 * term using a 365-day reference so the field is never left undefined, but
 * the term is INFORMATIONAL ONLY in that case: `capitalGainsRateForTerm`
 * ignores it and uses `flatRatePct` instead.
 */
export function classifyHoldingTerm(acquiredAt: Date, disposedAt: Date, longTermThresholdDays: number | null): TermClassification {
  if (disposedAt.getTime() < acquiredAt.getTime()) {
    throw new Error("classifyHoldingTerm: disposedAt cannot be before acquiredAt");
  }
  const holdingPeriodDays = Math.floor((disposedAt.getTime() - acquiredAt.getTime()) / MS_PER_DAY);
  const threshold = longTermThresholdDays ?? 365;
  const term: CapitalGainsTerm = holdingPeriodDays > threshold ? "LONG" : "SHORT";
  return { term, holdingPeriodDays };
}

// ─── FIFO lot consumption ───────────────────────────────────────────────────

export interface FifoLot {
  id: string;
  remainingQuantity: number;
  costBasisPerUnit: number;
  acquiredAt: Date;
}

export interface FifoConsumption {
  lotId: string;
  quantityConsumed: number;
  costBasisPerUnit: number;
  acquiredAt: Date;
}

/**
 * Consumes the oldest lots first (FIFO — the standard default cost-basis
 * method absent a specific-lot election) until `quantityToSell` is fully
 * accounted for. Throws if the lots don't hold enough remaining quantity —
 * callers should treat that as "you don't own that much," not silently
 * short-sell.
 */
export function planFifoConsumption(lots: FifoLot[], quantityToSell: number): FifoConsumption[] {
  if (quantityToSell <= 0) throw new Error("planFifoConsumption: quantityToSell must be positive");

  const sorted = [...lots]
    .filter((l) => l.remainingQuantity > 0)
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());

  const consumptions: FifoConsumption[] = [];
  let remaining = quantityToSell;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQuantity, remaining);
    consumptions.push({ lotId: lot.id, quantityConsumed: take, costBasisPerUnit: lot.costBasisPerUnit, acquiredAt: lot.acquiredAt });
    remaining -= take;
  }

  if (remaining > 1e-9) {
    throw new Error(`planFifoConsumption: insufficient lot quantity — requested ${quantityToSell}, only ${quantityToSell - remaining} available across ${lots.length} lot(s)`);
  }

  return consumptions;
}

// ─── Realized gain/loss ─────────────────────────────────────────────────────

export function computeRealizedGainLoss(quantityConsumed: number, costBasisPerUnit: number, proceedsPerUnit: number): number {
  return round2((proceedsPerUnit - costBasisPerUnit) * quantityConsumed);
}

/**
 * The rate that actually applies to a disposal's term, per the holding
 * type's rate rule. Returns null when the config deliberately doesn't model
 * a flat number for that case (e.g. US short-term gains, taxed at the
 * filer's ordinary marginal rate, not a fixed capital-gains rate) — callers
 * must render that as "taxed as ordinary income," never coerce null to 0.
 */
export function capitalGainsRateForTerm(rateRule: CapitalGainsRateRule, term: CapitalGainsTerm): number | null {
  if (rateRule.flatRatePct !== null) return rateRule.flatRatePct;
  return term === "LONG" ? rateRule.longTermRatePct : rateRule.shortTermRatePct;
}

// ─── Tax-loss harvesting (rules-based, not AI) ─────────────────────────────

export interface HarvestCandidateInput {
  lotId: string;
  holdingType: TaxHoldingType;
  ticker: string;
  displayName: string;
  remainingQuantity: number;
  costBasisPerUnit: number;
  currentPricePerUnit: number;
  acquiredAt: Date;
}

export interface HarvestCandidate {
  lotId: string;
  holdingType: TaxHoldingType;
  ticker: string;
  displayName: string;
  remainingQuantity: number;
  costBasisPerUnit: number;
  currentPricePerUnit: number;
  unrealizedLossPerUnit: number;
  unrealizedLossTotal: number;
  /** How much of this lot's loss would still find a realized gain to offset, given gains are consumed by earlier (larger-loss) candidates first. Capped at 0 once available gains run out — still returned (not filtered out), since a loss that offsets nothing this year may still be worth banking against future FY gains. */
  offsetsRealizedGains: number;
}

/**
 * Rules-based scan (deliberately NOT AI/ML): a lot is a harvesting
 * candidate when its current market price is below its cost basis AND its
 * holding type actually allows a loss to offset other gains (India crypto:
 * `lossOffsetAllowed: false` per Section 115BBH — such lots are excluded
 * entirely, not just shown with a $0 offset, since suggesting a "harvest"
 * that can't legally offset anything would be actively misleading).
 *
 * Candidates are ranked biggest-loss-first and greedily allocated against
 * `realizedGainsAvailableToOffset` for this financial year, so the UI can
 * show "harvesting this would offset $X of your existing $Y in gains."
 */
export function scanForHarvestCandidates(
  lots: HarvestCandidateInput[],
  config: TaxConfig,
  realizedGainsAvailableToOffset: number,
): HarvestCandidate[] {
  const eligible = lots.filter((lot) => {
    const rule = config.capitalGainsRates.find((r) => r.holdingType === lot.holdingType);
    if (!rule || !rule.lossOffsetAllowed) return false;
    return lot.currentPricePerUnit < lot.costBasisPerUnit;
  });

  const withLoss: Array<HarvestCandidate & { _rawLoss: number }> = eligible.map((lot) => {
    const unrealizedLossPerUnit = round2(lot.costBasisPerUnit - lot.currentPricePerUnit);
    const unrealizedLossTotal = round2(unrealizedLossPerUnit * lot.remainingQuantity);
    return {
      lotId: lot.lotId,
      holdingType: lot.holdingType,
      ticker: lot.ticker,
      displayName: lot.displayName,
      remainingQuantity: lot.remainingQuantity,
      costBasisPerUnit: lot.costBasisPerUnit,
      currentPricePerUnit: lot.currentPricePerUnit,
      unrealizedLossPerUnit,
      unrealizedLossTotal,
      offsetsRealizedGains: 0,
      _rawLoss: unrealizedLossTotal,
    };
  });

  withLoss.sort((a, b) => b._rawLoss - a._rawLoss);

  let remainingGainsToOffset = Math.max(0, realizedGainsAvailableToOffset);
  for (const candidate of withLoss) {
    const offset = Math.min(candidate.unrealizedLossTotal, remainingGainsToOffset);
    candidate.offsetsRealizedGains = round2(offset);
    remainingGainsToOffset = round2(remainingGainsToOffset - offset);
  }

  return withLoss.map(({ _rawLoss: _drop, ...rest }) => rest);
}
