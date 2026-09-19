"""
Monte Carlo simulation for forward portfolio-value projection, via
Geometric Brownian Motion (GBM):

    S_{t+dt} = S_t * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z),  Z ~ N(0,1)

`mu` and `sigma` are the portfolio's expected return and volatility for
ONE period of length `dt` (both already reflecting portfolio-level
diversification — the caller computes these from the correlated
per-holding return series before calling in here; this module only
simulates the aggregate trajectory, which is what makes it fast enough
to vectorize fully rather than needing per-holding correlated paths).

Fully vectorized: one (n_simulations, periods) matrix of draws, one
cumulative-sum, one exp — no Python-level loop over paths or periods, so
periods x paths in the hundreds of thousands still run in well under a
second, comfortably inside the "20-holding portfolio in under 5s"
acceptance bound (which this doesn't even scale with — the per-holding
count only affects how mu/sigma were derived upstream, not this step).
"""
from __future__ import annotations

import numpy as np


def simulate_paths(
    initial_value: float,
    mu: float,
    sigma: float,
    periods: int,
    n_simulations: int = 10_000,
    dt: float = 1.0,
    seed: int | None = None,
    contribution_per_period: float = 0.0,
) -> np.ndarray:
    """Returns an (n_simulations, periods+1) array of simulated portfolio
    values, column 0 being `initial_value` for every path.

    With no periodic contribution (the Phase 11 portfolio-projection case),
    this stays the fully-vectorized single-cumsum path below: one draw
    matrix, one cumulative sum, one exp — no Python-level loop.

    Phase 13's goal simulation needs a periodic contribution added to the
    corpus BETWEEN each period's multiplicative GBM step (S_{t+1} = S_t *
    exp(drift+diffusion) + contribution) — additive contributions break the
    closed-form single-cumsum trick, since exp(cumsum(...)) only works for
    a pure product series. That case instead loops over `periods`, each
    iteration still a single vectorized numpy op across all n_simulations
    paths at once — for goal horizons (typically <= 600 monthly periods)
    this is still comfortably fast, just not the O(1)-numpy-calls path.
    """
    if periods < 1:
        raise ValueError("simulate_paths: periods must be >= 1")
    if initial_value <= 0:
        raise ValueError("simulate_paths: initial_value must be positive")

    rng = np.random.default_rng(seed)

    if contribution_per_period == 0.0:
        z = rng.standard_normal((n_simulations, periods))
        drift = (mu - 0.5 * sigma**2) * dt
        diffusion = sigma * np.sqrt(dt) * z
        log_returns = drift + diffusion
        cumulative_log_returns = np.cumsum(log_returns, axis=1)

        paths = np.empty((n_simulations, periods + 1))
        paths[:, 0] = initial_value
        paths[:, 1:] = initial_value * np.exp(cumulative_log_returns)
        return paths

    drift = (mu - 0.5 * sigma**2) * dt
    vol = sigma * np.sqrt(dt)
    paths = np.empty((n_simulations, periods + 1))
    paths[:, 0] = initial_value
    for t in range(1, periods + 1):
        z = rng.standard_normal(n_simulations)
        paths[:, t] = paths[:, t - 1] * np.exp(drift + vol * z) + contribution_per_period
    return paths


def simulate_phased_paths(
    initial_value: float,
    phases: list[dict],
    n_simulations: int = 10_000,
    seed: int | None = None,
) -> np.ndarray:
    """Phase 20 — Wealth Digital Twin / scenario simulator. Generalizes
    `simulate_paths`'s existing per-period loop (see its own docstring —
    that loop already exists for the contribution case) to chain an ordered
    list of PHASES, each with its own `mu`/`sigma`/`contributionPerPeriod`
    plus an optional one-time `shockMultiplier` (e.g. 0.7 for a market crash)
    and/or `lumpSumDelta` (e.g. +inheritance, -home-purchase-down-payment)
    applied instantaneously at the START of that phase, before its own GBM
    steps run. This is what makes "market crash" vs "job loss" vs "early
    retirement" all representable with the SAME engine instead of one-off
    special cases: a one-time shock is `shockMultiplier`/`lumpSumDelta` on a
    single-period phase; a sustained change (job loss, salary change,
    inflation spike) is a multi-period phase with adjusted `mu`/
    `contributionPerPeriod`; a life event with both (early retirement, home
    purchase) is a lump-sum phase followed by a phase with different
    ongoing parameters.

    Deliberately NOT implemented as repeated calls to `simulate_paths` /
    the existing `/analytics/monte-carlo` endpoint chained via percentile
    handoff: that would collapse each phase's full distribution down to a
    few percentile numbers before starting the next phase, losing genuine
    per-path continuity (a path that got unlucky in phase 1 should stay the
    SAME unlucky path in phase 2, not get reseeded from a population
    average). This function instead carries one (n_simulations,) array of
    current per-path values across every phase boundary, so path identity
    is preserved throughout — the same fully-vectorized-per-step approach
    `simulate_paths`'s contribution branch already uses, just chained.

    Each `phases[i]` dict: `{periods: int, mu: float, sigma: float,
    contributionPerPeriod: float = 0.0, shockMultiplier: float = 1.0,
    lumpSumDelta: float = 0.0, dt: float = 1.0}`.

    Returns an (n_simulations, total_columns) array. `total_columns` is 1
    (the initial value) plus, per phase, `periods` GBM-step columns and
    (only when that phase actually has a shock/lump-sum) one extra
    instantaneous shock column — so a plain multi-phase chain with no shocks
    produces exactly the same column count as calling `simulate_paths` once
    with `sum(periods)`, and a shock phase's discontinuity is visible as its
    own explicit point in the returned path (useful for a "before/after the
    crash" chart marker), not silently absorbed into a GBM step.
    """
    if not phases:
        raise ValueError("simulate_phased_paths: phases must be non-empty")
    if initial_value <= 0:
        raise ValueError("simulate_phased_paths: initial_value must be positive")

    rng = np.random.default_rng(seed)
    current = np.full(n_simulations, initial_value, dtype=float)
    columns = [current.copy()]

    for i, phase in enumerate(phases):
        periods = phase["periods"]
        if periods < 1:
            raise ValueError(f"simulate_phased_paths: phases[{i}].periods must be >= 1")
        mu = phase["mu"]
        sigma = phase["sigma"]
        dt = phase.get("dt", 1.0)
        contribution = phase.get("contributionPerPeriod", 0.0)
        shock = phase.get("shockMultiplier", 1.0)
        lump_sum = phase.get("lumpSumDelta", 0.0)

        if shock != 1.0 or lump_sum != 0.0:
            current = np.maximum(current * shock + lump_sum, 0.0)  # a portfolio value can't go negative
            columns.append(current.copy())

        drift = (mu - 0.5 * sigma**2) * dt
        vol = sigma * np.sqrt(dt)
        for _ in range(periods):
            z = rng.standard_normal(n_simulations)
            current = np.maximum(current * np.exp(drift + vol * z) + contribution, 0.0)
            columns.append(current.copy())

    return np.stack(columns, axis=1)


def run_monte_carlo_scenario(
    initial_value: float,
    phases: list[dict],
    n_simulations: int = 10_000,
    seed: int | None = None,
    percentiles: tuple[float, ...] = (5, 25, 50, 75, 95),
) -> dict:
    """Phase 20 orchestration wrapper, mirroring `run_monte_carlo`'s shape
    exactly (same `summarize_paths` call, same response shape) so the
    NestJS/frontend side reuses its existing fan-chart rendering unchanged
    for scenario results, not a second response format."""
    paths = simulate_phased_paths(initial_value, phases, n_simulations, seed)
    return summarize_paths(paths, percentiles)


def probability_of_target(final_values: np.ndarray, target: float) -> float:
    """Fraction of simulated final values that meet or exceed `target` — a
    real Monte Carlo estimate of goal success probability, not a placeholder."""
    return float(np.mean(final_values >= target))


def summarize_paths(paths: np.ndarray, percentiles: tuple[float, ...] = (5, 25, 50, 75, 95)) -> dict:
    """Collapses a simulated-paths matrix into per-period percentile bands
    for a fan chart, plus the mean trajectory."""
    pct_values = np.percentile(paths, percentiles, axis=0)
    return {
        "periods": paths.shape[1] - 1,
        "percentiles": {str(p): pct_values[i].tolist() for i, p in enumerate(percentiles)},
        "mean": paths.mean(axis=0).tolist(),
        "finalValueStats": {
            "mean": float(paths[:, -1].mean()),
            "std": float(paths[:, -1].std(ddof=1)),
            "min": float(paths[:, -1].min()),
            "max": float(paths[:, -1].max()),
        },
    }


def run_monte_carlo(
    initial_value: float,
    mu: float,
    sigma: float,
    periods: int,
    n_simulations: int = 10_000,
    dt: float = 1.0,
    seed: int | None = None,
    percentiles: tuple[float, ...] = (5, 25, 50, 75, 95),
    contribution_per_period: float = 0.0,
    target_value: float | None = None,
) -> dict:
    paths = simulate_paths(initial_value, mu, sigma, periods, n_simulations, dt, seed, contribution_per_period)
    result = summarize_paths(paths, percentiles)
    if target_value is not None:
        result["probabilityOfTarget"] = probability_of_target(paths[:, -1], target_value)
    return result
