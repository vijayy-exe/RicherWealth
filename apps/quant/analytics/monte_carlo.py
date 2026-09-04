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
