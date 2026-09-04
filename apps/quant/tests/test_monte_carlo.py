from __future__ import annotations

import time

import numpy as np
import pytest

from analytics.monte_carlo import run_monte_carlo, simulate_paths, summarize_paths


def test_reproducible_with_seed():
    r1 = run_monte_carlo(100_000, mu=0.0008, sigma=0.01, periods=252, n_simulations=5_000, seed=123)
    r2 = run_monte_carlo(100_000, mu=0.0008, sigma=0.01, periods=252, n_simulations=5_000, seed=123)
    assert r1 == r2


def test_different_seeds_differ():
    r1 = run_monte_carlo(100_000, mu=0.0008, sigma=0.01, periods=100, n_simulations=2_000, seed=1)
    r2 = run_monte_carlo(100_000, mu=0.0008, sigma=0.01, periods=100, n_simulations=2_000, seed=2)
    assert r1["finalValueStats"]["mean"] != r2["finalValueStats"]["mean"]


def test_zero_volatility_is_deterministic_compounding():
    # sigma=0 -> every path is identical: S_t = S_0 * exp(mu*t) exactly
    result = run_monte_carlo(100_000, mu=0.001, sigma=0.0, periods=10, n_simulations=100, seed=0)
    expected_final = 100_000 * np.exp(0.001 * 10)
    for p in result["percentiles"].values():
        assert p[-1] == pytest.approx(expected_final, rel=1e-9)
    assert result["finalValueStats"]["std"] == pytest.approx(0.0, abs=1e-6)


def test_percentile_bands_widen_over_time():
    result = run_monte_carlo(100_000, mu=0.0005, sigma=0.02, periods=252, n_simulations=20_000, seed=42)
    p5 = result["percentiles"]["5"]
    p95 = result["percentiles"]["95"]
    early_spread = p95[10] - p5[10]
    late_spread = p95[-1] - p5[-1]
    assert late_spread > early_spread, "uncertainty should grow over the projection horizon"


def test_median_tracks_expected_geometric_drift_approximately():
    # Over many simulations the median of a GBM should approximate
    # S_0 * exp((mu - 0.5*sigma^2)*t) — check it's in a sane ballpark
    # (loose tolerance: this is a stochastic check, not an exact one).
    mu, sigma, periods = 0.0008, 0.015, 252
    result = run_monte_carlo(100_000, mu=mu, sigma=sigma, periods=periods, n_simulations=50_000, seed=7)
    expected_median = 100_000 * np.exp((mu - 0.5 * sigma**2) * periods)
    actual_median = result["percentiles"]["50"][-1]
    assert actual_median == pytest.approx(expected_median, rel=0.05)


def test_completes_within_5_seconds_for_typical_portfolio_horizon():
    # "20-holding portfolio" performance bound: this module simulates the
    # AGGREGATE portfolio trajectory (mu/sigma already derived upstream
    # from 20 correlated holdings), so its own cost doesn't scale with
    # holding count — this checks a full 10-year daily-step simulation at
    # a generous path count completes comfortably inside the bound.
    start = time.perf_counter()
    run_monte_carlo(500_000, mu=0.0004, sigma=0.012, periods=252 * 10, n_simulations=20_000, seed=1)
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"Monte Carlo took {elapsed:.2f}s, exceeds the 5s bound"


def test_summarize_paths_shape_and_percentile_ordering():
    paths = simulate_paths(100_000, mu=0.001, sigma=0.02, periods=50, n_simulations=1_000, seed=3)
    assert paths.shape == (1_000, 51)
    assert np.all(paths[:, 0] == 100_000)

    summary = summarize_paths(paths, percentiles=(5, 50, 95))
    assert summary["periods"] == 50
    for t in range(51):
        p5 = summary["percentiles"]["5"][t]
        p50 = summary["percentiles"]["50"][t]
        p95 = summary["percentiles"]["95"][t]
        assert p5 <= p50 <= p95


def test_rejects_invalid_input():
    with pytest.raises(ValueError):
        simulate_paths(100_000, mu=0.01, sigma=0.02, periods=0)
    with pytest.raises(ValueError):
        simulate_paths(-100, mu=0.01, sigma=0.02, periods=10)
