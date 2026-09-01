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
} from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CryptoService, type CreateCryptoHoldingDto, type CreatePriceAlertDto } from "./crypto.service";
import { CryptoPriceSyncService } from "./crypto-price-sync.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("crypto")
export class CryptoPublicController {
  constructor(private readonly priceSync: CryptoPriceSyncService) {}

  /** Coin search — no auth required, returns only public CoinGecko data. */
  @Get("search")
  searchCoins(@Query("q") query: string) {
    return this.priceSync.searchCoins(query ?? "");
  }
}

@Controller("crypto")
@UseGuards(SupabaseAuthGuard)
export class CryptoController {
  constructor(
    private readonly crypto: CryptoService,
    private readonly priceSync: CryptoPriceSyncService,
  ) {}

  // ─── Holdings ──────────────────────────────────────────────────────────────

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.crypto.listHoldings(req.user.id);
  }

  @Get("summary")
  getSummary(@Request() req: AuthRequest) {
    return this.crypto.getPortfolioSummary(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreateCryptoHoldingDto) {
    return this.crypto.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.crypto.deleteHolding(req.user.id, assetId);
  }

  /** Manual price refresh for a single coin (useful for testing). */
  @Post("holdings/:coinId/sync/:currency")
  async syncPrice(@Param("coinId") coinId: string, @Param("currency") currency: string) {
    const price = await this.priceSync.refreshPrice(coinId, currency);
    return { coinId, currency, price };
  }

  // ─── Price Alerts (persisted only — delivery is Phase 17) ──────────────────

  @Get("alerts")
  listAlerts(@Request() req: AuthRequest) {
    return this.crypto.listAlerts(req.user.id);
  }

  @Post("alerts")
  createAlert(@Request() req: AuthRequest, @Body() dto: CreatePriceAlertDto) {
    return this.crypto.createAlert(req.user.id, dto);
  }

  @Delete("alerts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAlert(@Request() req: AuthRequest, @Param("id") alertId: string) {
    return this.crypto.deleteAlert(req.user.id, alertId);
  }
}
