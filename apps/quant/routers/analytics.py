from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException

from analytics.allocation import full_allocation_report
from analytics.correlation import correlation_matrix
from analytics.monte_carlo import run_monte_carlo, run_monte_carlo_scenario
from analytics.risk_metrics import (
    beta as compute_beta,
    jensen_alpha,
    max_drawdown,
    sharpe_ratio,
    sortino_ratio,
    std_dev,
    treynor_ratio,
    volatility,
)
from schemas import (
    AllocationRequest,
    CorrelationRequest,
    MonteCarloRequest,
    RiskMetricsRequest,
    ScenarioMonteCarloRequest,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.post("/allocation")
async def allocation(req: AllocationRequest):
    holdings = [h.model_dump() for h in req.holdings]
    try:
        return full_allocation_report(holdings, req.dimensions)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/risk-metrics")
async def risk_metrics(req: RiskMetricsRequest):
    port = np.array(req.portfolioReturns)
    bench = np.array(req.benchmarkReturns)
    if len(port) < 2:
        raise HTTPException(status_code=422, detail="Need at least 2 return periods")

    try:
        b = compute_beta(port, bench)
        result = {
            "beta": b,
            "alpha": jensen_alpha(port, bench, req.riskFreeRate, portfolio_beta=b),
            "sharpeRatio": sharpe_ratio(port, req.riskFreeRate),
            "sortinoRatio": sortino_ratio(port, req.riskFreeRate, req.mar),
            "treynorRatio": treynor_ratio(port, req.riskFreeRate, b),
            "stdDev": std_dev(port),
            "volatility": volatility(port, req.periodsPerYear),
            "maxDrawdown": max_drawdown(np.array(req.portfolioValues)) if req.portfolioValues else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.post("/correlation")
async def correlation(req: CorrelationRequest):
    try:
        return correlation_matrix(req.returnsByHolding)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/monte-carlo")
async def monte_carlo(req: MonteCarloRequest):
    try:
        return run_monte_carlo(
            initial_value=req.initialValue,
            mu=req.mu,
            sigma=req.sigma,
            periods=req.periods,
            n_simulations=req.nSimulations,
            dt=req.dt,
            seed=req.seed,
            percentiles=tuple(req.percentiles),
            contribution_per_period=req.contributionPerPeriod,
            target_value=req.targetValue,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/monte-carlo-scenario")
async def monte_carlo_scenario(req: ScenarioMonteCarloRequest):
    """Phase 20 — Wealth Digital Twin. Same response shape as /monte-carlo
    (via the same summarize_paths call), so the frontend's existing fan-
    chart rendering works unchanged; the only difference is a chained list
    of phases instead of one flat mu/sigma/periods run."""
    try:
        return run_monte_carlo_scenario(
            initial_value=req.initialValue,
            phases=[p.model_dump() for p in req.phases],
            n_simulations=req.nSimulations,
            seed=req.seed,
            percentiles=tuple(req.percentiles),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
