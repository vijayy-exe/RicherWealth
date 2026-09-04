from __future__ import annotations

from fractions import Fraction as F

import pytest

from analytics.allocation import (
    breakdown_by_dimension,
    compute_weights,
    diversification_score,
    full_allocation_report,
    hhi,
)


def test_hhi_and_diversification_two_equal_holdings():
    # Two equal holdings: HHI = 0.5^2 + 0.5^2 = 0.5, score = 50
    weights = [0.5, 0.5]
    assert hhi(weights) == pytest.approx(0.5)
    assert diversification_score(weights) == pytest.approx(50.0)


def test_hhi_single_holding_is_fully_concentrated():
    assert hhi([1.0]) == pytest.approx(1.0)
    assert diversification_score([1.0]) == pytest.approx(0.0)


def test_hhi_four_equal_holdings_reference():
    # Four equal holdings: HHI = 4*(1/4)^2 = 1/4 = 0.25, score = 75
    weights = compute_weights([100.0, 100.0, 100.0, 100.0])
    exact = sum(F(1, 4) ** 2 for _ in range(4))
    assert exact == F(1, 4)
    assert hhi(weights) == pytest.approx(float(exact), abs=1e-12)
    assert diversification_score(weights) == pytest.approx(75.0, abs=1e-9)


def test_hhi_unequal_holdings_reference():
    # Values 60/30/10 -> weights 0.6/0.3/0.1 -> HHI = 0.36+0.09+0.01=0.46
    weights = compute_weights([60.0, 30.0, 10.0])
    fw = [F(6, 10), F(3, 10), F(1, 10)]
    exact_hhi = sum(w**2 for w in fw)
    assert exact_hhi == F(46, 100)
    assert hhi(weights) == pytest.approx(0.46, abs=1e-12)
    assert diversification_score(weights) == pytest.approx(54.0, abs=1e-9)


def test_breakdown_by_dimension_groups_and_sums():
    holdings = [
        {"value": 100.0, "assetClass": "STOCK"},
        {"value": 50.0, "assetClass": "STOCK"},
        {"value": 50.0, "assetClass": "CRYPTO"},
    ]
    result = breakdown_by_dimension(holdings, "assetClass")
    by_label = {g["label"]: g for g in result["groups"]}
    assert by_label["STOCK"]["value"] == pytest.approx(150.0)
    assert by_label["STOCK"]["weight"] == pytest.approx(0.75)
    assert by_label["CRYPTO"]["value"] == pytest.approx(50.0)
    assert by_label["CRYPTO"]["weight"] == pytest.approx(0.25)
    # HHI = 0.75^2 + 0.25^2 = 0.625, score = 37.5
    assert result["hhi"] == pytest.approx(0.625)
    assert result["diversificationScore"] == pytest.approx(37.5)


def test_breakdown_missing_dimension_grouped_as_unknown():
    holdings = [{"value": 10.0}, {"value": 10.0, "sector": "Tech"}]
    result = breakdown_by_dimension(holdings, "sector")
    labels = {g["label"] for g in result["groups"]}
    assert labels == {"UNKNOWN", "Tech"}


def test_full_allocation_report_structure():
    holdings = [
        {"value": 100.0, "assetClass": "STOCK", "sector": "Tech", "geography": "US", "currency": "USD"},
        {"value": 100.0, "assetClass": "CRYPTO", "sector": None, "geography": "Global", "currency": "USD"},
    ]
    report = full_allocation_report(holdings, ["assetClass", "sector", "geography", "currency"])
    assert report["totalValue"] == pytest.approx(200.0)
    # 2 equal holdings overall -> HHI 0.5 -> score 50
    assert report["overallDiversificationScore"] == pytest.approx(50.0)
    assert set(report["byDimension"].keys()) == {"assetClass", "sector", "geography", "currency"}


def test_compute_weights_rejects_zero_total():
    with pytest.raises(ValueError):
        compute_weights([0.0, 0.0])
