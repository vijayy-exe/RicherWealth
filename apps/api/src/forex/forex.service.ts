import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import Decimal from "decimal.js";

/**
 * ForexService — converts monetary amounts between currencies.
 *
 * Strategy (Phase 2 — demo):
 *   1. Check the postgres `forex_rates` cache (fresh if < 1h old).
 *   2. If stale/missing, try exchangerate.host (free, no key needed).
 *   3. Fall back to hard-coded rates for deterministic tests + offline dev.
 *
 * Phase 3 will add Redis caching on top of this.
 */
@Injectable()
export class ForexService {
  private readonly logger = new Logger(ForexService.name);

  // Hard-coded fallback rates relative to USD (updated periodically in code)
  private static readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1,
    INR: 83.5,
    EUR: 0.92,
    GBP: 0.79,
    SGD: 1.34,
    AED: 3.67,
    JPY: 149.5,
    CAD: 1.36,
    AUD: 1.53,
    CHF: 0.9,
    HKD: 7.82,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Convert `amount` from `fromCurrency` to `toCurrency`.
   * Returns a Decimal for precision arithmetic.
   */
  async convert(amount: Decimal, fromCurrency: string, toCurrency: string): Promise<Decimal> {
    if (fromCurrency === toCurrency) return amount;

    const rate = await this.getRate(fromCurrency, toCurrency);
    return amount.mul(rate);
  }

  /**
   * Get exchange rate from `from` to `to`.
   * Caches result in DB for 1 hour.
   */
  async getRate(from: string, to: string): Promise<Decimal> {
    // Check DB cache
    const cached = await this.prisma.forexRate.findUnique({
      where: { fromCode_toCode: { fromCode: from, toCode: to } },
    });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (cached && cached.fetchedAt > oneHourAgo) {
      return new Decimal(cached.rate.toString());
    }

    // Fetch fresh rate
    const rate = await this.fetchRate(from, to);

    // Upsert into DB cache
    await this.prisma.forexRate.upsert({
      where: { fromCode_toCode: { fromCode: from, toCode: to } },
      create: { fromCode: from, toCode: to, rate: rate.toString() },
      update: { rate: rate.toString(), fetchedAt: new Date() },
    });

    return rate;
  }

  private async fetchRate(from: string, to: string): Promise<Decimal> {
    try {
      const res = await fetch(
        `https://open.er-api.com/v6/latest/${from}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { rates?: Record<string, number> };
        const rate = data.rates?.[to];
        if (rate) {
          this.logger.debug(`Fetched ${from}→${to}: ${rate}`);
          return new Decimal(rate);
        }
      }
    } catch (err) {
      this.logger.warn(`Forex API failed for ${from}→${to}, using fallback`, err);
    }

    // Fallback: cross via USD
    return this.getFallbackRate(from, to);
  }

  private getFallbackRate(from: string, to: string): Decimal {
    const fromUsd = ForexService.FALLBACK_RATES[from] ?? 1;
    const toUsd = ForexService.FALLBACK_RATES[to] ?? 1;
    const rate = toUsd / fromUsd;
    this.logger.warn(`Using fallback rate ${from}→${to}: ${rate}`);
    return new Decimal(rate);
  }

  /** Convenience: get rate synchronously from fallback table (for tests) */
  static getFallbackRateSync(from: string, to: string): Decimal {
    const fromUsd = ForexService.FALLBACK_RATES[from] ?? 1;
    const toUsd = ForexService.FALLBACK_RATES[to] ?? 1;
    return new Decimal(toUsd / fromUsd);
  }
}
