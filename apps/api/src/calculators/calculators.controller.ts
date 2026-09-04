import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrencyService } from "../forex/currency.service";

class FxRateQueryDto {
  @IsString()
  @Length(3, 3)
  from!: string;

  @IsString()
  @Length(3, 3)
  to!: string;
}

/**
 * Phase 13: small endpoints backing the calculator suite that need
 * server-side data the pure `@richer/shared-types` calc functions can't
 * provide on their own. Currently just the Currency calculator's live
 * exchange rate — reuses Phase 7's CurrencyService (Frankfurter.app /
 * open.er-api.com, Redis-cached) rather than adding a second forex
 * integration; the actual conversion math is `convertCurrency` in
 * shared-types, computed client-side once the rate is fetched so the
 * calculator updates live as the amount changes without a network
 * round-trip per keystroke.
 */
@Controller("calculators")
@UseGuards(SupabaseAuthGuard)
export class CalculatorsController {
  constructor(private readonly currency: CurrencyService) {}

  @Get("fx-rate")
  async getFxRate(@Query() query: FxRateQueryDto) {
    const rate = await this.currency.getRate(query.from.toUpperCase(), query.to.toUpperCase());
    return { from: query.from.toUpperCase(), to: query.to.toUpperCase(), rate: rate.toNumber() };
  }
}
