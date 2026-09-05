import { Body, Controller, Get, Post, Query, Request, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrencyService } from "../forex/currency.service";

import { IndicesService } from "./indices.service";
import { CryptoMarketService } from "./crypto-market.service";
import { CommoditiesWidgetService } from "./commodities-widget.service";
import { MoversService } from "./movers.service";
import { EconomicCalendarService } from "./economic-calendar.service";
import { IpoListingService, type CreateIpoListingDto } from "./ipo-listing.service";

interface AuthRequest {
  user: { id: string };
}

/** Currency pairs shown on the Markets page — quoted against USD, matching
 * the base-currency convention used elsewhere (conversion at read-time via
 * CurrencyService, never a separate fetch). */
const CURRENCY_PAIRS = ["EUR", "GBP", "INR", "JPY", "AUD", "CAD"];

/** Public routes — world market data, no user data involved. */
@Controller("markets")
export class MarketIntelligencePublicController {
  constructor(
    private readonly indices: IndicesService,
    private readonly cryptoMarket: CryptoMarketService,
    private readonly commodities: CommoditiesWidgetService,
    private readonly currency: CurrencyService,
    private readonly calendar: EconomicCalendarService,
    private readonly ipoListings: IpoListingService,
  ) {}

  @Get("indices")
  getIndices() {
    return this.indices.getIndices();
  }

  @Get("currencies")
  async getCurrencies() {
    const rates = await Promise.all(
      CURRENCY_PAIRS.map(async (code) => ({
        symbol: `USD/${code}`,
        label: code,
        rate: (await this.currency.getRate("USD", code)).toNumber(),
      })),
    );
    return rates;
  }

  @Get("crypto")
  getCrypto() {
    return this.cryptoMarket.getTopCoins();
  }

  @Get("crypto/movers")
  async getCryptoMovers() {
    const [gainers, losers] = await Promise.all([
      this.cryptoMarket.getGainers(),
      this.cryptoMarket.getLosers(),
    ]);
    return { gainers, losers };
  }

  @Get("commodities")
  getCommodities() {
    return this.commodities.getQuotes();
  }

  @Get("calendar")
  getCalendar() {
    return this.calendar.getCalendar();
  }

  @Get("ipo")
  getIpoListings() {
    return this.ipoListings.list();
  }
}

/** Protected routes — depend on the authenticated user's own holdings. */
@Controller("markets")
@UseGuards(SupabaseAuthGuard)
export class MarketIntelligenceController {
  constructor(
    private readonly movers: MoversService,
    private readonly ipoListings: IpoListingService,
  ) {}

  @Get("movers")
  getMyMovers(@Request() req: AuthRequest) {
    return this.movers.getUserMovers(req.user.id);
  }

  @Post("ipo")
  createIpoListing(@Request() req: AuthRequest, @Body() dto: CreateIpoListingDto) {
    return this.ipoListings.create(req.user.id, dto);
  }
}
