import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { RiskEngineService } from "./risk-engine.service";
import { RiskProfileQueryDto } from "./dto/risk.dto";

interface AuthRequest {
  user: { id: string };
}

/**
 * Phase 12: portfolio risk-scoring endpoints. Mirrors AnalyticsController's
 * shape — auth-guarded, thin, delegates everything to the service.
 */
@Controller("risk")
@UseGuards(SupabaseAuthGuard)
export class RiskEngineController {
  constructor(private readonly riskEngine: RiskEngineService) {}

  @Get("profile")
  getProfile(@Request() req: AuthRequest, @Query() query: RiskProfileQueryDto) {
    return this.riskEngine.getRiskProfile(req.user.id, query.refresh ?? false);
  }

  @Get("trend")
  getTrend(@Request() req: AuthRequest) {
    return this.riskEngine.getRiskTrend(req.user.id);
  }
}
