import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { AnalyticsService } from "./analytics.service";
import { MonteCarloQueryDto, RiskMetricsQueryDto } from "./dto/analytics.dto";

interface AuthRequest {
  user: { id: string };
}

/**
 * All portfolio-analytics endpoints. The Python quant service this
 * delegates to is never reachable from the browser directly (its own CORS
 * config only allows this API's origin) — this controller is the only
 * door in.
 */
@Controller("analytics")
@UseGuards(SupabaseAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("allocation")
  getAllocation(@Request() req: AuthRequest) {
    return this.analytics.getAllocation(req.user.id);
  }

  @Get("risk-metrics")
  getRiskMetrics(@Request() req: AuthRequest, @Query() query: RiskMetricsQueryDto) {
    const benchmark = query.benchmarkTicker
      ? { ticker: query.benchmarkTicker, exchange: query.benchmarkExchange ?? "NYSE" }
      : undefined;
    return this.analytics.getRiskMetrics(req.user.id, benchmark);
  }

  @Get("correlation")
  getCorrelation(@Request() req: AuthRequest) {
    return this.analytics.getCorrelationMatrix(req.user.id);
  }

  @Get("monte-carlo")
  getMonteCarlo(@Request() req: AuthRequest, @Query() query: MonteCarloQueryDto) {
    return this.analytics.getMonteCarlo(
      req.user.id,
      query.years ?? 10,
      query.simulations ?? 10_000,
      query.refresh ?? false,
    );
  }
}
