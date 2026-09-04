from __future__ import annotations

import time

import numpy as np
import pytest

from analytics.monte_carlo import run_monte_carlo, simulate_paths, summarize_paths, probability_of_target


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


# ─── Phase 13: goal simulation (periodic contribution + target probability) ─


def test_zero_volatility_with_contribution_is_exact_arithmetic():
    # mu=0, sigma=0 -> exp(drift+vol*z) == exp(0) == 1 exactly, every path.
    # S_t = S_{t-1}*1 + 1000 -> after 12 periods: 100000 + 1000*12 = 112000, exactly.
    paths = simulate_paths(100_000, mu=0.0, sigma=0.0, periods=12, n_simulations=50, seed=0, contribution_per_period=1_000)
    assert np.all(paths[:, -1] == pytest.approx(112_000, rel=1e-9))


def test_probability_of_target_is_exact_at_the_deterministic_boundary():
    paths = simulate_paths(100_000, mu=0.0, sigma=0.0, periods=12, n_simulations=50, seed=0, contribution_per_period=1_000)
    final_values = paths[:, -1]
    # Deterministic final value is exactly 112,000 (see test above).
    assert probability_of_target(final_values, 112_000) == 1.0  # target met exactly -> counts as success
    assert probability_of_target(final_values, 112_000.01) == 0.0  # just above -> no path clears it
    assert probability_of_target(final_values, 111_999.99) == 1.0  # just below -> every path clears it


def test_run_monte_carlo_includes_probability_only_when_target_given():
    without_target = run_monte_carlo(100_000, mu=0.0005, sigma=0.01, periods=12, n_simulations=1_000, seed=1)
    assert "probabilityOfTarget" not in without_target

    with_target = run_monte_carlo(100_000, mu=0.0005, sigma=0.01, periods=12, n_simulations=1_000, seed=1, target_value=150_000)
    assert "probabilityOfTarget" in with_target
    assert 0.0 <= with_target["probabilityOfTarget"] <= 1.0


def test_probability_of_target_increases_with_higher_contribution():
    # Holding everything else fixed, a higher periodic contribution should
    # raise (never lower) the probability of reaching the same target.
    low_contribution = run_monte_carlo(
        50_000, mu=0.006, sigma=0.04, periods=60, n_simulations=20_000, seed=99,
        contribution_per_period=2_000, target_value=500_000,
    )
    high_contribution = run_monte_carlo(
        50_000, mu=0.006, sigma=0.04, periods=60, n_simulations=20_000, seed=99,
        contribution_per_period=5_000, target_value=500_000,
    )
    assert high_contribution["probabilityOfTarget"] > low_contribution["probabilityOfTarget"]


def test_probability_of_target_increases_with_longer_horizon():
    # Holding contribution fixed, more periods to compound and contribute
    # should raise (never lower) the probability of reaching a fixed target.
    short_horizon = run_monte_carlo(
        50_000, mu=0.006, sigma=0.04, periods=36, n_simulations=20_000, seed=7,
        contribution_per_period=3_000, target_value=500_000,
    )
    long_horizon = run_monte_carlo(
        50_000, mu=0.006, sigma=0.04, periods=84, n_simulations=20_000, seed=7,
        contribution_per_period=3_000, target_value=500_000,
    )
    assert long_horizon["probabilityOfTarget"] > short_horizon["probabilityOfTarget"]


def test_contribution_path_completes_within_5_seconds_for_a_typical_goal_horizon():
    # Goal horizons are monthly and rarely exceed 40 years (480 periods) —
    # the per-period Python loop this path uses (see monte_carlo.py) still
    # needs to comfortably clear the same 5s bound as the fast path.
    start = time.perf_counter()
    run_monte_carlo(
        100_000, mu=0.007, sigma=0.04, periods=480, n_simulations=20_000, seed=1,
        contribution_per_period=10_000, target_value=5_000_000,
    )
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"Goal Monte Carlo took {elapsed:.2f}s, exceeds the 5s bound"
