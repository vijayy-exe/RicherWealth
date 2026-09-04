from __future__ import annotations

import numpy as np
import pytest

from analytics.correlation import correlation_matrix


def test_correlation_matches_numpy_corrcoef_exactly():
    rng = np.random.default_rng(42)
    returns_by_holding = {
        "A": rng.normal(0.01, 0.02, 30).tolist(),
        "B": rng.normal(0.005, 0.03, 30).tolist(),
        "C": rng.normal(-0.002, 0.015, 30).tolist(),
    }
    result = correlation_matrix(returns_by_holding)

    expected = np.corrcoef(np.array([returns_by_holding[k] for k in result["labels"]]))
    actual = np.array(result["matrix"])
    assert actual.shape == expected.shape == (3, 3)
    np.testing.assert_allclose(actual, expected, atol=1e-12)


def test_correlation_values_bounded_in_range():
    rng = np.random.default_rng(7)
    returns_by_holding = {f"H{i}": rng.normal(0, 0.02, 50).tolist() for i in range(6)}
    result = correlation_matrix(returns_by_holding)
    matrix = np.array(result["matrix"])
    assert np.all(matrix >= -1.0 - 1e-9)
    assert np.all(matrix <= 1.0 + 1e-9)
    # diagonal must be exactly 1 (perfect self-correlation)
    np.testing.assert_allclose(np.diag(matrix), 1.0, atol=1e-9)
    # matrix must be symmetric
    np.testing.assert_allclose(matrix, matrix.T, atol=1e-12)


def test_perfectly_correlated_and_anticorrelated_series():
    base = [0.01, 0.02, -0.01, 0.03, 0.00, -0.02]
    inverted = [-x for x in base]
    result = correlation_matrix({"A": base, "B": list(base), "C": inverted})
    matrix = np.array(result["matrix"])
    idx = {label: i for i, label in enumerate(result["labels"])}
    assert matrix[idx["A"], idx["B"]] == pytest.approx(1.0, abs=1e-9)
    assert matrix[idx["A"], idx["C"]] == pytest.approx(-1.0, abs=1e-9)


def test_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        correlation_matrix({"A": [0.01, 0.02, 0.03], "B": [0.01, 0.02]})


def test_rejects_fewer_than_two_holdings():
    with pytest.raises(ValueError):
        correlation_matrix({"A": [0.01, 0.02, 0.03]})
