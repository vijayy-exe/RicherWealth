import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { BondsService, type CreateBondHoldingDto } from "./bonds.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("bonds")
@UseGuards(SupabaseAuthGuard)
export class BondsController {
  constructor(private readonly bonds: BondsService) {}

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.bonds.listHoldings(req.user.id);
  }

  @Get("summary")
  getSummary(@Request() req: AuthRequest) {
    return this.bonds.getPortfolioSummary(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreateBondHoldingDto) {
    return this.bonds.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.bonds.deleteHolding(req.user.id, assetId);
  }
}
