"""Pydantic request/response models for the analytics endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class HoldingInput(BaseModel):
    id: str
    value: float = Field(gt=0)
    assetClass: str | None = None
    sector: str | None = None
    geography: str | None = None
    currency: str | None = None
    marketCap: str | None = None


class AllocationRequest(BaseModel):
    holdings: list[HoldingInput]
    dimensions: list[str] = Field(default_factory=lambda: ["assetClass", "sector", "geography", "currency", "marketCap"])


class RiskMetricsRequest(BaseModel):
    portfolioReturns: list[float]
    benchmarkReturns: list[float]
    riskFreeRate: float
    periodsPerYear: float = Field(gt=0, default=252)
    mar: float | None = None
    portfolioValues: list[float] | None = None  # for max drawdown, if available

    @field_validator("benchmarkReturns")
    @classmethod
    def same_length(cls, v: list[float], info):
        port = info.data.get("portfolioReturns")
        if port is not None and len(v) != len(port):
            raise ValueError("portfolioReturns and benchmarkReturns must be the same length")
        return v


class CorrelationRequest(BaseModel):
    returnsByHolding: dict[str, list[float]]


class MonteCarloRequest(BaseModel):
    initialValue: float = Field(gt=0)
    mu: float
    sigma: float = Field(ge=0)
    periods: int = Field(gt=0, le=10_000)
    nSimulations: int = Field(default=10_000, gt=0, le=200_000)
    dt: float = Field(default=1.0, gt=0)
    seed: int | None = None
    percentiles: list[float] = Field(default_factory=lambda: [5, 25, 50, 75, 95])
    # Phase 13 — goal success-probability simulation. Both default to the
    # Phase 11 behavior (no contribution, no target) when omitted.
    contributionPerPeriod: float = Field(default=0.0, ge=0)
    targetValue: float | None = Field(default=None, gt=0)


class ScenarioPhase(BaseModel):
    """Phase 20 — one leg of a scenario simulation. See
    `analytics/monte_carlo.py`'s `simulate_phased_paths` docstring for how
    phases compose into "job loss", "market crash", etc."""

    periods: int = Field(gt=0, le=10_000)
    mu: float
    sigma: float = Field(ge=0)
    # Unlike MonteCarloRequest.contributionPerPeriod above, this MAY be
    # negative -- a job-loss or early-retirement phase draws the corpus
    # down rather than contributing to it.
    contributionPerPeriod: float = Field(default=0.0)
    # One-time multiplicative shock applied at the START of this phase
    # (e.g. 0.7 for a -30% market crash). 1.0 = no shock.
    shockMultiplier: float = Field(default=1.0, ge=0)
    # One-time additive delta applied at the START of this phase, after the
    # shock multiplier (e.g. +2_000_000 for an inheritance, -1_500_000 for a
    # home-purchase down payment).
    lumpSumDelta: float = Field(default=0.0)
    dt: float = Field(default=1.0, gt=0)


class ScenarioMonteCarloRequest(BaseModel):
    initialValue: float = Field(gt=0)
    phases: list[ScenarioPhase] = Field(min_length=1)
    nSimulations: int = Field(default=10_000, gt=0, le=200_000)
    seed: int | None = None
    percentiles: list[float] = Field(default_factory=lambda: [5, 25, 50, 75, 95])
