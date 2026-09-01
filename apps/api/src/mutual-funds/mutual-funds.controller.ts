import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { MutualFundsService, type CreateMfHoldingDto, type AddSipInstallmentDto } from "./mutual-funds.service";
import { NavSyncService } from "./nav-sync.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("mutual-funds")
export class MutualFundsPublicController {
  constructor(private readonly navSync: NavSyncService) {}

  /** Scheme search — no auth required, returns only public MFAPI data */
  @Get("search")
  searchSchemes(@Query("q") query: string) {
    return this.navSync.searchSchemes(query ?? "");
  }
}

@Controller("mutual-funds")
@UseGuards(SupabaseAuthGuard)
export class MutualFundsController {
  constructor(
    private readonly mf: MutualFundsService,
    private readonly navSync: NavSyncService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Holdings ──────────────────────────────────────────────────────────────

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.mf.listHoldings(req.user.id);
  }

  /** Currency-correct portfolio summary — see PortfolioSummary doc comment. */
  @Get("summary")
  getSummary(@Request() req: AuthRequest) {
    return this.mf.getPortfolioSummary(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreateMfHoldingDto) {
    return this.mf.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.mf.deleteHolding(req.user.id, assetId);
  }

  // ─── SIP Installments ──────────────────────────────────────────────────────

  @Post("holdings/:id/sip")
  addSipInstallment(
    @Request() req: AuthRequest,
    @Param("id") assetId: string,
    @Body() dto: AddSipInstallmentDto,
  ) {
    return this.mf.addSipInstallment(req.user.id, assetId, dto);
  }

  // ─── NAV History (for sparklines) ─────────────────────────────────────────

  @Get("holdings/:id/nav-history")
  async getNavHistory(
    @Request() req: AuthRequest,
    @Param("id") assetId: string,
    @Query("days") days?: string,
  ) {
    const holding = await this.prisma.mutualFundHolding.findFirst({
      where: { assetId, userId: req.user.id },
    });
    if (!holding) throw new NotFoundException("Mutual fund holding not found");

    return this.mf.getNavHistory(holding.schemeCode, parseInt(days ?? "365", 10));
  }

  /** Trigger a manual NAV sync for a single scheme (useful for testing) */
  @Post("holdings/:id/sync-nav")
  async syncNav(@Request() req: AuthRequest, @Param("id") assetId: string) {
    const holding = await this.prisma.mutualFundHolding.findFirst({
      where: { assetId, userId: req.user.id },
    });
    if (!holding) throw new NotFoundException("Mutual fund holding not found");

    const nav = await this.navSync.syncSchemeNav(holding.schemeCode);
    return { schemeCode: holding.schemeCode, latestNAV: nav };
  }
}
