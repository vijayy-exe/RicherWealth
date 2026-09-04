import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";

/**
 * Thin HTTP client for the internal Python quant microservice
 * (apps/quant) — the ONLY thing in NestJS allowed to know its base URL.
 * The quant service is never reached directly by the frontend (its own
 * CORS config only allows this API's origin); every analytics request
 * from the browser goes through AnalyticsController -> AnalyticsService
 * -> here.
 *
 * Deliberately dumb: no caching, no retries beyond what axios does by
 * default, no business logic — just typed request/response passthrough.
 * Caching (where it matters, e.g. Monte Carlo) lives in AnalyticsService,
 * which knows WHAT is being cached and for how long; this client
 * shouldn't need to know that.
 */
@Injectable()
export class QuantClientService {
  private readonly logger = new Logger(QuantClientService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>("QUANT_API_URL") ?? "http://localhost:8000";
    this.http = axios.create({ baseURL, timeout: 15_000 });
  }

  async allocation(payload: unknown): Promise<unknown> {
    return this.post("/analytics/allocation", payload);
  }

  async riskMetrics(payload: unknown): Promise<unknown> {
    return this.post("/analytics/risk-metrics", payload);
  }

  async correlation(payload: unknown): Promise<unknown> {
    return this.post("/analytics/correlation", payload);
  }

  async monteCarlo(payload: unknown): Promise<unknown> {
    return this.post("/analytics/monte-carlo", payload);
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    try {
      const res = await this.http.post(path, payload);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Surface the quant service's own 422 validation detail rather than
        // masking it — these are almost always a real data-shape problem
        // worth seeing (e.g. mismatched return-series lengths), not a
        // generic 5xx.
        if (err.response?.status === 422) {
          throw new ServiceUnavailableException(
            `Quant service rejected the request: ${JSON.stringify(err.response.data?.detail ?? err.response.data)}`,
          );
        }
        this.logger.error(`Quant service call failed: ${path} — ${err.message}`);
      }
      throw new ServiceUnavailableException("Portfolio analytics service is temporarily unavailable");
    }
  }
}
