"""
Allocation breakdown and diversification scoring.

Diversification score uses the Herfindahl-Hirschman Index (HHI): the sum
of squared portfolio weights (as fractions, so a single-holding portfolio
has HHI=1.0, an N-way equal split has HHI=1/N). Score = (1 - HHI) * 100,
so a fully concentrated portfolio scores 0 and a maximally spread one
approaches 100 as N grows. This is a standard concentration measure
(same math the DOJ/FTC use for market concentration, applied here to
portfolio weights) — deterministic, bounded, and easy to sanity-check by
hand: two equal holdings -> HHI=0.5 -> score=50.
"""
from __future__ import annotations

from collections import defaultdict


def compute_weights(values: list[float]) -> list[float]:
    """Convert raw holding values into portfolio-weight fractions summing to 1."""
    total = sum(values)
    if total <= 0:
        raise ValueError("compute_weights: total portfolio value must be positive")
    return [v / total for v in values]


def hhi(weights: list[float]) -> float:
    """Herfindahl-Hirschman Index: sum of squared weights. Range (1/N, 1]."""
    return sum(w**2 for w in weights)


def diversification_score(weights: list[float]) -> float:
    """0 (fully concentrated) to ~100 (maximally diversified given N holdings)."""
    if not weights:
        return 0.0
    return (1.0 - hhi(weights)) * 100.0


def breakdown_by_dimension(
    holdings: list[dict],
    dimension: str,
) -> dict:
    """
    Group holdings by an arbitrary dimension key (e.g. "assetClass",
    "sector", "geography", "currency", "marketCap") and return each
    group's total value, weight, and a diversification score for that
    dimension alone.

    Each holding dict must have `value` (float) and the given `dimension`
    key (a string label; holdings missing it are grouped under "UNKNOWN").
    """
    totals: dict[str, float] = defaultdict(float)
    for h in holdings:
        label = h.get(dimension) or "UNKNOWN"
        totals[label] += h["value"]

    total_value = sum(totals.values())
    if total_value <= 0:
        raise ValueError("breakdown_by_dimension: total portfolio value must be positive")

    groups = [
        {"label": label, "value": value, "weight": value / total_value}
        for label, value in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    ]
    weights = [g["weight"] for g in groups]
    return {
        "dimension": dimension,
        "groups": groups,
        "diversificationScore": diversification_score(weights),
        "hhi": hhi(weights),
    }


def full_allocation_report(holdings: list[dict], dimensions: list[str]) -> dict:
    """
    holdings: list of dicts, each with at minimum `value`, plus whichever
    of `dimensions` keys apply (e.g. assetClass, sector, geography,
    currency, marketCap).
    """
    total_value = sum(h["value"] for h in holdings)
    overall_weights = compute_weights([h["value"] for h in holdings]) if holdings else []
    return {
        "totalValue": total_value,
        "overallDiversificationScore": diversification_score(overall_weights),
        "byDimension": {dim: breakdown_by_dimension(holdings, dim) for dim in dimensions},
    }
