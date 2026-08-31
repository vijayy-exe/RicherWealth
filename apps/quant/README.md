# RicherWealth Quant Microservice

FastAPI-based quantitative analytics service.

## Development

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server (port 8000)
uvicorn main:app --reload --port 8000
```

## API Docs

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health**: http://localhost:8000/health

## Phases

- **Phase 0**: Stub only — health check endpoints
- **Phase 11**: Full implementation — Sharpe, Sortino, Monte Carlo, correlation matrix, Max Drawdown, VaR
