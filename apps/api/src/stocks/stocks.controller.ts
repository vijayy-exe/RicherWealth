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
import { StocksService, type CreateHoldingDto } from "./stocks.service";
import { PriceSyncService } from "./price-sync.service";

interface AuthRequest {
  user: { id: string };
}

/**
 * Public routes — no auth required (returns public market data only).
 */
@Controller("stocks")
export class StocksPublicController {
  constructor(private readonly priceSync: PriceSyncService) {}

  /** Ticker autocomplete — no user data involved, safe to expose publicly */
  @Get("search")
  searchTickers(@Query("q") query: string) {
    return this.priceSync.searchTickers(query ?? "");
  }
}

/**
 * Protected routes — all require a valid Supabase JWT.
 */
@Controller("stocks")
@UseGuards(SupabaseAuthGuard)
export class StocksController {
  constructor(
    private readonly stocks: StocksService,
    private readonly priceSync: PriceSyncService,
  ) {}

  // ─── Holdings ──────────────────────────────────────────────────────────────

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.stocks.listHoldings(req.user.id);
  }

  @Post("holdings")
  addHolding(@Request() req: AuthRequest, @Body() dto: CreateHoldingDto) {
    return this.stocks.addHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.stocks.deleteHolding(req.user.id, assetId);
  }

  // ─── Live price (from cache only) ─────────────────────────────────────────

  @Get("price/:exchange/:ticker")
  async getPrice(
    @Param("ticker") ticker: string,
    @Param("exchange") exchange: string,
  ) {
    return this.priceSync.getPrice(ticker.toUpperCase(), exchange.toUpperCase());
  }

  // ─── Watchlists ───────────────────────────────────────────────────────────

  @Get("watchlists")
  listWatchlists(@Request() req: AuthRequest) {
    return this.stocks.listWatchlists(req.user.id);
  }

  @Post("watchlists")
  createWatchlist(@Request() req: AuthRequest, @Body("name") name: string) {
    return this.stocks.createWatchlist(req.user.id, name ?? "My Watchlist");
  }

  @Post("watchlists/:id/items")
  addToWatchlist(
    @Request() req: AuthRequest,
    @Param("id") watchlistId: string,
    @Body("ticker") ticker: string,
    @Body("exchange") exchange: string,
  ) {
    return this.stocks.addToWatchlist(watchlistId, req.user.id, ticker, exchange);
  }

  @Delete("watchlists/:watchlistId/items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFromWatchlist(@Param("itemId") itemId: string) {
    return this.stocks.removeFromWatchlist(itemId);
  }
}
