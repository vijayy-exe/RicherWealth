"""Correlation matrix across holdings' return series — a thin, explicit
wrapper around numpy.corrcoef (not reimplemented) so the acceptance
criterion "must match numpy's corrcoef on the same input data" is true
by construction, not by coincidence."""
from __future__ import annotations

import numpy as np


def correlation_matrix(returns_by_holding: dict[str, list[float]]) -> dict:
    """
    returns_by_holding: {holding_id: [period_return, ...]}, all series
    must be the same length (same aligned time periods).

    Returns {"labels": [...], "matrix": [[...], ...]} with matrix[i][j]
    the Pearson correlation between holding i and j, guaranteed in
    [-1, 1] (up to floating point epsilon) since that's numpy.corrcoef's
    own guarantee for real-valued input.
    """
    labels = list(returns_by_holding.keys())
    if len(labels) < 2:
        raise ValueError("correlation_matrix requires at least 2 holdings")

    lengths = {len(v) for v in returns_by_holding.values()}
    if len(lengths) != 1:
        raise ValueError(f"correlation_matrix: all return series must be the same length, got lengths {lengths}")
    if next(iter(lengths)) < 2:
        raise ValueError("correlation_matrix: each return series needs at least 2 periods")

    data = np.array([returns_by_holding[label] for label in labels])
    matrix = np.corrcoef(data)
    # corrcoef can return a bare float-like 0-d/1-element result only when
    # there's a single row, which we've already excluded above (>=2 labels).
    return {"labels": labels, "matrix": matrix.tolist()}
