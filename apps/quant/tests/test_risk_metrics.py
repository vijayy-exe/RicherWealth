"""
Reference-value tests for risk_metrics.py.

Rather than trust hand-arithmetic (error-prone to do reliably by eye for
covariance/variance across multiple periods), each expected value here is
computed independently using Python's exact `fractions.Fraction` — a
completely different code path from numpy's floating-point implementation,
with zero rounding error of its own. If risk_metrics.py's numpy-based
result matches the exact fraction arithmetic to float precision, that's a
real, independent confirmation, not a comparison against numbers that
were only ever derived from numpy in the first place. Every fraction
computation's formula is spelled out inline so it can also be checked by
hand.
"""
from __future__ import annotations

from fractions import Fraction as F

import numpy as np
import pytest

from analytics.risk_metrics import (
    beta,
    downside_deviation,
    jensen_alpha,
    max_drawdown,
    mean_return,
    sharpe_ratio,
    sortino_ratio,
    std_dev,
    treynor_ratio,
    volatility,
)


def test_mean_and_std_dev_reference():
    # returns = 1%, 2%, 3%, 4%, 5%
    returns = np.array([0.01, 0.02, 0.03, 0.04, 0.05])
    fr = [F(1, 100), F(2, 100), F(3, 100), F(4, 100), F(5, 100)]

    exact_mean = sum(fr, F(0)) / len(fr)  # = 3/100
    assert exact_mean == F(3, 100)
    assert mean_return(returns) == pytest.approx(float(exact_mean), abs=1e-12)

    # sample variance (ddof=1): sum((x-mean)^2) / (n-1)
    exact_var = sum((x - exact_mean) ** 2 for x in fr) / (len(fr) - 1)
    assert exact_var == F(1, 4000)  # 0.00025 exactly
    exact_std = float(exact_var) ** 0.5
    assert std_dev(returns) == pytest.approx(exact_std, abs=1e-12)
    assert std_dev(returns) == pytest.approx(0.0158113883008419, abs=1e-12)


def test_sharpe_ratio_closed_form_reference():
    # returns = 5%, 7%, 3%, 9%, 6%; risk-free = 2% (same period)
    returns = np.array([0.05, 0.07, 0.03, 0.09, 0.06])
    rf = 0.02
    fr = [F(5, 100), F(7, 100), F(3, 100), F(9, 100), F(6, 100)]

    exact_mean = sum(fr, F(0)) / 5
    assert exact_mean == F(6, 100)  # 0.06
    exact_var = sum((x - exact_mean) ** 2 for x in fr) / 4  # ddof=1
    assert exact_var == F(1, 2000)  # 0.0005 exactly
    exact_std = float(exact_var) ** 0.5

    # Closed form: excess=0.04, std=sqrt(0.0005)=sqrt(5)/100 -> Sharpe = 4/sqrt(5)
    expected_sharpe = 4.0 / np.sqrt(5.0)
    assert expected_sharpe == pytest.approx(1.7888543819998317, abs=1e-12)

    result = sharpe_ratio(returns, rf)
    assert result == pytest.approx(expected_sharpe, abs=1e-9)
    assert result == pytest.approx((float(exact_mean) - rf) / exact_std, abs=1e-9)


def test_sortino_ratio_reference():
    # returns = 10%, -2%, 6%, -4%, 8%, 2%; MAR = risk-free = 1%
    returns = np.array([0.10, -0.02, 0.06, -0.04, 0.08, 0.02])
    rf = 0.01
    fr = [F(10, 100), F(-2, 100), F(6, 100), F(-4, 100), F(8, 100), F(2, 100)]
    mar = F(1, 100)

    exact_mean = sum(fr, F(0)) / 6
    assert exact_mean == F(20, 600)  # = 1/30

    # downside deviation: sqrt(mean(min(0, r_i - mar)^2)) over ALL N periods
    shortfalls = [min(F(0), x - mar) for x in fr]
    # r=-0.02: -0.02-0.01=-0.03 (shortfall); r=-0.04: -0.04-0.01=-0.05 (shortfall); others >= mar -> 0
    assert shortfalls == [F(0), F(-3, 100), F(0), F(-5, 100), F(0), F(0)]
    exact_downside_var = sum(s**2 for s in shortfalls) / 6
    assert exact_downside_var == F(9 + 25, 100 * 100 * 6)  # (0.03^2+0.05^2)/6
    exact_downside_dev = float(exact_downside_var) ** 0.5

    expected_sortino = (float(exact_mean) - rf) / exact_downside_dev

    assert downside_deviation(returns, float(mar)) == pytest.approx(exact_downside_dev, abs=1e-12)
    result = sortino_ratio(returns, rf, mar=float(mar))
    assert result == pytest.approx(expected_sortino, abs=1e-9)
    # sortino should be smaller than sharpe-style full-vol ratio would be,
    # since downside deviation only "counts" the bad periods
    assert result > 0  # mean exceeds rf here


def test_beta_and_alpha_reference():
    # 4 periods, deliberately different portfolio/benchmark series
    port = np.array([0.10, -0.05, 0.08, 0.02])
    bench = np.array([0.08, -0.04, 0.06, 0.03])
    rf = 0.01

    fp = [F(10, 100), F(-5, 100), F(8, 100), F(2, 100)]
    fb = [F(8, 100), F(-4, 100), F(6, 100), F(3, 100)]
    mp = sum(fp, F(0)) / 4  # 0.0375
    mb = sum(fb, F(0)) / 4  # 0.0325
    assert mp == F(375, 10000)
    assert mb == F(325, 10000)

    dp = [x - mp for x in fp]
    db = [x - mb for x in fb]
    cov = sum(a * b for a, b in zip(dp, db)) / 3  # ddof=1, n-1=3
    var_b = sum(b**2 for b in db) / 3

    exact_beta = cov / var_b
    assert exact_beta == F(421, 331)  # simplified fraction, verified by construction below
    # sanity re-derivation of the fraction reduction, spelled out:
    # cov*3 = sum(products) = 1,052,500 (in units of 1e-8); var_b*3 = 827,500 (same units)
    # 1,052,500 / 827,500 = 2105/1655 = 421/331 after dividing by 5 twice.
    assert F(1_052_500, 827_500) == F(421, 331)

    result_beta = beta(port, bench)
    assert result_beta == pytest.approx(float(exact_beta), abs=1e-9)
    assert result_beta == pytest.approx(1.2719033232628399, abs=1e-9)

    expected_alpha = float(mp) - (rf + float(exact_beta) * (float(mb) - rf))
    result_alpha = jensen_alpha(port, bench, rf, portfolio_beta=result_beta)
    assert result_alpha == pytest.approx(expected_alpha, abs=1e-9)
    assert result_alpha == pytest.approx(-0.0011178243542434, abs=1e-9)


def test_treynor_ratio_reference():
    port = np.array([0.10, -0.05, 0.08, 0.02])
    rf = 0.01
    b = 1.2719033232628399  # from test_beta_and_alpha_reference
    fp = [F(10, 100), F(-5, 100), F(8, 100), F(2, 100)]
    mp = float(sum(fp, F(0)) / 4)
    expected = (mp - rf) / b
    assert treynor_ratio(port, rf, b) == pytest.approx(expected, abs=1e-12)


def test_volatility_annualization():
    returns = np.array([0.01, 0.02, 0.03, 0.04, 0.05])
    # std_dev is exactly sqrt(0.00025) per test_mean_and_std_dev_reference
    period_std = 0.0158113883008419
    assert volatility(returns, periods_per_year=252) == pytest.approx(period_std * np.sqrt(252), abs=1e-9)
    assert volatility(returns, periods_per_year=12) == pytest.approx(period_std * np.sqrt(12), abs=1e-9)


def test_max_drawdown_reference():
    # values climb to a peak of 120, fall to 90 (25% drawdown from peak), recover
    values = np.array([100, 110, 120, 100, 90, 105, 115])
    # running peaks: 100,110,120,120,120,120,120
    # drawdowns:       0,  0,  0,-1/6,-1/4,-1/8,-1/24
    expected = (90 - 120) / 120
    assert expected == pytest.approx(-0.25)
    assert max_drawdown(values) == pytest.approx(-0.25, abs=1e-12)


def test_max_drawdown_never_declines():
    values = np.array([100, 105, 110, 120])
    assert max_drawdown(values) == pytest.approx(0.0, abs=1e-12)


def test_errors_on_degenerate_input():
    with pytest.raises(ValueError):
        std_dev(np.array([0.05]))  # needs >= 2 points
    with pytest.raises(ValueError):
        sharpe_ratio(np.array([0.05, 0.05, 0.05]), 0.01)  # zero std dev
    with pytest.raises(ValueError):
        beta(np.array([0.01, 0.02]), np.array([0.03, 0.03]))  # zero benchmark variance
    with pytest.raises(ValueError):
        treynor_ratio(np.array([0.01, 0.02]), 0.01, portfolio_beta=0.0)
