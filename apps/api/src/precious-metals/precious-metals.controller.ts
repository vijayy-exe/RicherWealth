import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { PreciousMetalsService, type CreatePreciousMetalDto } from "./precious-metals.service";
import { PreciousMetalPriceSyncService } from "./precious-metal-price-sync.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("precious-metals")
export class PreciousMetalsPublicController {
  constructor(private readonly priceSync: PreciousMetalPriceSyncService) {}

  /** Live spot price — no auth required, public market data. */
  @Get("spot/:metal")
  getSpot(@Param("metal") metal: string) {
    return this.priceSync.getPrice(metal.toUpperCase() as "GOLD" | "SILVER");
  }
}

@Controller("precious-metals")
@UseGuards(SupabaseAuthGuard)
export class PreciousMetalsController {
  constructor(private readonly metals: PreciousMetalsService) {}

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.metals.listHoldings(req.user.id);
  }

  @Get("summary")
  getSummary(@Request() req: AuthRequest) {
    return this.metals.getPortfolioSummary(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreatePreciousMetalDto) {
    return this.metals.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.metals.deleteHolding(req.user.id, assetId);
  }
}
