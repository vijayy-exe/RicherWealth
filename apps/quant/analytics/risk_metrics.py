"""
Risk-adjusted return metrics: beta, alpha, Sharpe/Sortino/Treynor ratios,
volatility, and max drawdown.

Convention notes (matter for anyone reproducing these by hand):
- Sample statistics (ddof=1) are used for variance/std/covariance
  throughout, matching the standard finance-textbook convention (and
  numpy's default `np.cov`, which uses ddof=1).
- All ratios operate on a single consistent return period (e.g. daily or
  monthly) — the caller is responsible for annualizing inputs/outputs
  consistently; this module never silently assumes a period length.
- Sortino's downside deviation uses the "full" definition (Sortino & van
  der Meer): sqrt(mean(min(0, r_i - MAR)^2)) over ALL N periods (not just
  the downside ones), so upside periods contribute exactly 0 rather than
  being excluded from the denominator.
"""
from __future__ import annotations

import numpy as np

# Floating-point "effectively zero" threshold for variance/std-dev guards.
# Exact equality (`== 0`) is unsafe here: e.g. three identical 0.05 values
# produce a mean that isn't bit-identical to 0.05 after division, so their
# "zero" variance comes out as ~8e-18 rather than exactly 0.0.
_ZERO_EPS = 1e-10


def mean_return(returns: np.ndarray) -> float:
    return float(np.mean(returns))


def std_dev(returns: np.ndarray) -> float:
    """Sample standard deviation (ddof=1). Requires len(returns) >= 2."""
    if len(returns) < 2:
        raise ValueError("std_dev requires at least 2 return periods")
    return float(np.std(returns, ddof=1))


def volatility(returns: np.ndarray, periods_per_year: float) -> float:
    """Annualized volatility: period std_dev scaled by sqrt(periods_per_year)."""
    return std_dev(returns) * np.sqrt(periods_per_year)


def downside_deviation(returns: np.ndarray, mar: float) -> float:
    """Sortino's downside deviation relative to a minimum acceptable
    return (MAR), in the same period units as `returns`."""
    shortfalls = np.minimum(0.0, returns - mar)
    return float(np.sqrt(np.mean(shortfalls**2)))


def max_drawdown(cumulative_values: np.ndarray) -> float:
    """
    Maximum peak-to-trough decline over a series of portfolio VALUES
    (not returns) — e.g. a running product of (1+return) or actual
    portfolio value over time. Returns a negative fraction (e.g. -0.25
    for a 25% drawdown), 0.0 if the series never declines from its
    running peak.
    """
    if len(cumulative_values) == 0:
        return 0.0
    running_peak = np.maximum.accumulate(cumulative_values)
    drawdowns = (cumulative_values - running_peak) / running_peak
    return float(np.min(drawdowns))


def sharpe_ratio(returns: np.ndarray, risk_free_rate: float) -> float:
    """
    Sharpe ratio = (mean(returns) - risk_free_rate) / std_dev(returns),
    all in the SAME period units (e.g. all monthly, or all annualized —
    caller's choice, but must be consistent).
    """
    excess = mean_return(returns) - risk_free_rate
    sd = std_dev(returns)
    if sd < _ZERO_EPS:
        raise ValueError("sharpe_ratio: zero standard deviation (constant returns)")
    return excess / sd


def sortino_ratio(returns: np.ndarray, risk_free_rate: float, mar: float | None = None) -> float:
    """
    Sortino ratio = (mean(returns) - risk_free_rate) / downside_deviation.
    `mar` (minimum acceptable return) defaults to risk_free_rate if not
    given, a common convention when no separate MAR is specified.
    """
    if mar is None:
        mar = risk_free_rate
    excess = mean_return(returns) - risk_free_rate
    dd = downside_deviation(returns, mar)
    if dd < _ZERO_EPS:
        raise ValueError("sortino_ratio: zero downside deviation (no returns below MAR)")
    return excess / dd


def beta(portfolio_returns: np.ndarray, benchmark_returns: np.ndarray) -> float:
    """Beta = Cov(portfolio, benchmark) / Var(benchmark), sample statistics."""
    if len(portfolio_returns) != len(benchmark_returns):
        raise ValueError("beta: portfolio and benchmark return series must be the same length")
    if len(portfolio_returns) < 2:
        raise ValueError("beta requires at least 2 return periods")
    cov_matrix = np.cov(portfolio_returns, benchmark_returns, ddof=1)
    cov = cov_matrix[0, 1]
    bench_var = cov_matrix[1, 1]
    if bench_var < _ZERO_EPS:
        raise ValueError("beta: zero benchmark variance (constant benchmark returns)")
    return float(cov / bench_var)


def jensen_alpha(
    portfolio_returns: np.ndarray,
    benchmark_returns: np.ndarray,
    risk_free_rate: float,
    portfolio_beta: float | None = None,
) -> float:
    """
    Jensen's alpha (CAPM), per-period:
      alpha = mean(portfolio) - [risk_free_rate + beta * (mean(benchmark) - risk_free_rate)]
    Pass a precomputed `portfolio_beta` to avoid recomputing it (e.g. when
    the caller already has it), otherwise it's derived from the same series.
    """
    b = portfolio_beta if portfolio_beta is not None else beta(portfolio_returns, benchmark_returns)
    expected_return = risk_free_rate + b * (mean_return(benchmark_returns) - risk_free_rate)
    return mean_return(portfolio_returns) - expected_return


def treynor_ratio(
    portfolio_returns: np.ndarray,
    risk_free_rate: float,
    portfolio_beta: float,
) -> float:
    """Treynor ratio = (mean(returns) - risk_free_rate) / beta."""
    if abs(portfolio_beta) < _ZERO_EPS:
        raise ValueError("treynor_ratio: zero beta")
    excess = mean_return(portfolio_returns) - risk_free_rate
    return excess / portfolio_beta
