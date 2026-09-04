"""
RicherWealth Quant Microservice — Phase 11
FastAPI service for quantitative analysis: allocation/diversification,
beta/alpha, Sharpe/Sortino/Treynor, correlation matrix, Monte Carlo.
Called internally from NestJS over REST; never exposed directly to the
frontend (CORS below only allows the NestJS API's own origin).

This service is intentionally stateless and pure-computation: it never
talks to Postgres/Redis or any external market-data API itself. NestJS
assembles portfolio composition and historical return series (from
whichever data source applies per asset class) and POSTs plain
numbers/arrays in; this service always returns the same output for the
same input, which is what makes the reference-value unit tests in
tests/ meaningful and exact.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone

from routers.analytics import router as analytics_router

app = FastAPI(
    title="RicherWealth Quant API",
    description="Quantitative analytics microservice — Sharpe, Sortino, Treynor, Monte Carlo, correlation",
    version="0.11.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — restricted to internal NestJS API only in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],  # NestJS API only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics_router)


@app.get("/health", tags=["System"])
async def health_check():
    """Service health check — called by NestJS on startup."""
    return {
        "status": "ok",
        "service": "richerwealth-quant",
        "version": "0.11.0",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "phase": "11 — portfolio analytics engine",
    }


@app.get("/", tags=["System"])
async def root():
    """Root endpoint."""
    return {
        "message": "RicherWealth Quant API",
        "docs": "/docs",
        "health": "/health",
    }
