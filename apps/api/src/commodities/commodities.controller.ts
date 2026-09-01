import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CommoditiesService, type CreateCommodityDto } from "./commodities.service";
import { CommodityPriceSyncService, type CommodityCode } from "./commodity-price-sync.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("commodities")
export class CommoditiesPublicController {
  constructor(private readonly priceSync: CommodityPriceSyncService) {}

  /** Live futures price — no auth required, public market data. */
  @Get("spot/:commodity")
  getSpot(@Param("commodity") commodity: string) {
    return this.priceSync.getPrice(commodity.toUpperCase() as CommodityCode);
  }
}

@Controller("commodities")
@UseGuards(SupabaseAuthGuard)
export class CommoditiesController {
  constructor(private readonly commodities: CommoditiesService) {}

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.commodities.listHoldings(req.user.id);
  }

  @Get("summary")
  getSummary(@Request() req: AuthRequest) {
    return this.commodities.getPortfolioSummary(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreateCommodityDto) {
    return this.commodities.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.commodities.deleteHolding(req.user.id, assetId);
  }
}
