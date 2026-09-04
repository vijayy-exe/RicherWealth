"""End-to-end tests through the actual FastAPI app (not just the pure
calculation functions) — catches request/response wiring bugs (schema
validation, routing, serialization) the unit tests above can't see."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_allocation_endpoint():
    res = client.post("/analytics/allocation", json={
        "holdings": [
            {"id": "1", "value": 100, "assetClass": "STOCK", "sector": "Tech"},
            {"id": "2", "value": 100, "assetClass": "CRYPTO", "sector": None},
        ],
        "dimensions": ["assetClass", "sector"],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["totalValue"] == 200
    assert body["overallDiversificationScore"] == 50.0


def test_risk_metrics_endpoint():
    res = client.post("/analytics/risk-metrics", json={
        "portfolioReturns": [0.10, -0.05, 0.08, 0.02],
        "benchmarkReturns": [0.08, -0.04, 0.06, 0.03],
        "riskFreeRate": 0.01,
        "periodsPerYear": 12,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["beta"] == pytest.approx(1.2719033232628399, abs=1e-9)
    assert body["maxDrawdown"] is None


def test_risk_metrics_rejects_mismatched_lengths():
    res = client.post("/analytics/risk-metrics", json={
        "portfolioReturns": [0.1, 0.2, 0.3],
        "benchmarkReturns": [0.1, 0.2],
        "riskFreeRate": 0.01,
    })
    assert res.status_code == 422


def test_correlation_endpoint():
    res = client.post("/analytics/correlation", json={
        "returnsByHolding": {
            "A": [0.01, 0.02, -0.01, 0.03, 0.0],
            "B": [0.02, 0.01, -0.02, 0.01, 0.01],
        }
    })
    assert res.status_code == 200
    body = res.json()
    assert len(body["matrix"]) == 2
    assert body["matrix"][0][0] == pytest.approx(1.0, abs=1e-9)


def test_monte_carlo_endpoint():
    res = client.post("/analytics/monte-carlo", json={
        "initialValue": 100000,
        "mu": 0.0008,
        "sigma": 0.01,
        "periods": 60,
        "nSimulations": 2000,
        "seed": 5,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["periods"] == 60
    assert "50" in body["percentiles"]
    assert len(body["percentiles"]["50"]) == 61
