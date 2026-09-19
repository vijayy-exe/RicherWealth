import { BadRequestException, Injectable } from "@nestjs/common";
import { NetWorthService } from "../net-worth/net-worth.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { QuantClientService } from "../analytics/quant-client.service";
import { ScenarioTypeDto, SimulateScenarioDto } from "./dto/simulate-scenario.dto";

interface ScenarioPhaseInput {
  periods: number;
  mu: number;
  sigma: number;
  contributionPerPeriod?: number;
  shockMultiplier?: number;
  lumpSumDelta?: number;
}

export interface FanChartResult {
  periods: number;
  percentiles: Record<string, number[]>;
  mean: number[];
  finalValueStats: { mean: number; std: number; min: number; max: number };
}

export interface BaselineProjectionResult {
  horizonMonths: number;
  initialValue: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  projection: FanChartResult;
}

export interface ScenarioSimulationResult {
  scenarioType: ScenarioTypeDto;
  horizonMonths: number;
  initialValue: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  baseline: FanChartResult;
  scenario: FanChartResult;
}

const DEFAULT_HORIZON_YEARS = 10;
const N_SIMULATIONS = 10_000;

/**
 * Phase 20 — Wealth Digital Twin. Translates a named scenario type + params
 * into a `phases[]` array for `apps/quant`'s `simulate_phased_paths` (via
 * `QuantClientService.monteCarloScenario`), then runs BOTH a no-shock
 * baseline and the chosen scenario over the SAME initial net worth and
 * return assumption, in one response, so the frontend overlays them on one
 * fan chart without a second round trip.
 *
 * Reuses, rather than rebuilds: `NetWorthService.calculateNetWorth` for the
 * real starting portfolio value, `AnalyticsService.getPortfolioReturnAssumption`
 * (promoted from GoalsService — see its docstring) for the real mu/sigma,
 * and the existing `/analytics/monte-carlo-scenario` phased Monte Carlo
 * engine for all the actual math. This service owns NO simulation math
 * itself — only phase-array assembly, matching AnalyticsService's own
 * "data assembly here, math in Python" split.
 */
@Injectable()
export class ScenarioSimulatorService {
  constructor(
    private readonly netWorth: NetWorthService,
    private readonly analytics: AnalyticsService,
    private readonly quant: QuantClientService,
  ) {}

  async simulate(userId: string, dto: SimulateScenarioDto): Promise<ScenarioSimulationResult> {
    const netWorthResult = await this.netWorth.calculateNetWorth(userId);
    const initialValue = netWorthResult.netWorth.toNumber();
    if (initialValue <= 0) {
      throw new BadRequestException("Scenario simulation requires a positive current net worth to project forward from");
    }

    const { annualReturnPct, annualVolatilityPct, isAssumedReturn } = await this.analytics.getPortfolioReturnAssumption(userId);
    const monthlyMu = annualReturnPct / 100 / 12; // same simple-division convention as GoalsService/RiskFreeRateService
    const monthlySigma = annualVolatilityPct / 100 / Math.sqrt(12);

    const horizonMonths = Math.round((dto.horizonYears ?? DEFAULT_HORIZON_YEARS) * 12);
    const monthlyContribution = dto.monthlyContribution ?? 0;

    const baselinePhases: ScenarioPhaseInput[] = [
      { periods: horizonMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution },
    ];
    const scenarioPhases = await this.buildScenarioPhases(dto, {
      horizonMonths,
      monthlyMu,
      monthlySigma,
      monthlyContribution,
      userId,
      currencyExposure: netWorthResult.currencyExposure,
      baseCurrency: netWorthResult.baseCurrency,
    });

    const [baseline, scenario] = await Promise.all([
      this.quant.monteCarloScenario({ initialValue, phases: baselinePhases, nSimulations: N_SIMULATIONS, seed: null }),
      this.quant.monteCarloScenario({ initialValue, phases: scenarioPhases, nSimulations: N_SIMULATIONS, seed: null }),
    ]);

    return {
      scenarioType: dto.scenarioType,
      horizonMonths,
      initialValue,
      isAssumedReturn,
      assumedAnnualReturnPct: annualReturnPct,
      assumedAnnualVolatilityPct: annualVolatilityPct,
      baseline: baseline as FanChartResult,
      scenario: scenario as FanChartResult,
    };
  }

  /**
   * The plain no-shock projection — the SAME baseline computation `simulate`
   * always runs alongside a chosen scenario, exposed standalone so other
   * Phase 20 features (the Financial Time Machine's "project forward" mode)
   * reuse this exact simulator instead of re-deriving their own baseline
   * math. Deliberately NOT a `MARKET_CRASH` scenario with a 0% crash or
   * similar workaround — that would be a confusing way to ask for "no
   * scenario at all."
   */
  async projectBaseline(userId: string, horizonYears = DEFAULT_HORIZON_YEARS, monthlyContribution = 0): Promise<BaselineProjectionResult> {
    const netWorthResult = await this.netWorth.calculateNetWorth(userId);
    const initialValue = netWorthResult.netWorth.toNumber();
    if (initialValue <= 0) {
      throw new BadRequestException("Baseline projection requires a positive current net worth to project forward from");
    }

    const { annualReturnPct, annualVolatilityPct, isAssumedReturn } = await this.analytics.getPortfolioReturnAssumption(userId);
    const monthlyMu = annualReturnPct / 100 / 12;
    const monthlySigma = annualVolatilityPct / 100 / Math.sqrt(12);
    const horizonMonths = Math.round(horizonYears * 12);

    const projection = (await this.quant.monteCarloScenario({
      initialValue,
      phases: [{ periods: horizonMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution }],
      nSimulations: N_SIMULATIONS,
      seed: null,
    })) as FanChartResult;

    return {
      horizonMonths,
      initialValue,
      isAssumedReturn,
      assumedAnnualReturnPct: annualReturnPct,
      assumedAnnualVolatilityPct: annualVolatilityPct,
      projection,
    };
  }

  // ─── Scenario -> phases[] translation ────────────────────────────────────

  private async buildScenarioPhases(
    dto: SimulateScenarioDto,
    ctx: {
      horizonMonths: number;
      monthlyMu: number;
      monthlySigma: number;
      monthlyContribution: number;
      userId: string;
      currencyExposure: Array<{ currency: string; percentage: number }>;
      baseCurrency: string;
    },
  ): Promise<ScenarioPhaseInput[]> {
    const { horizonMonths, monthlyMu, monthlySigma, monthlyContribution } = ctx;

    switch (dto.scenarioType) {
      case ScenarioTypeDto.MARKET_CRASH: {
        // One-time instantaneous drop applied at t=0, then the SAME baseline
        // growth assumption carries the recovery — a single phase is enough
        // since simulate_phased_paths applies shockMultiplier once at the
        // START of a phase, before that phase's own GBM steps run.
        const crashPct = dto.marketCrashPct ?? 30;
        return [
          {
            periods: horizonMonths,
            mu: monthlyMu,
            sigma: monthlySigma,
            contributionPerPeriod: monthlyContribution,
            shockMultiplier: 1 - crashPct / 100,
          },
        ];
      }

      case ScenarioTypeDto.JOB_LOSS: {
        // Contributions flip to a withdrawal (living expenses funded from
        // savings) for jobLossMonths, then resume as normal.
        const jobLossMonths = Math.min(dto.jobLossMonths ?? 6, horizonMonths);
        const drawdown = dto.jobLossMonthlyDrawdown ?? monthlyContribution;
        const phases: ScenarioPhaseInput[] = [
          { periods: jobLossMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: -drawdown },
        ];
        if (horizonMonths > jobLossMonths) {
          phases.push({ periods: horizonMonths - jobLossMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution });
        }
        return phases;
      }

      case ScenarioTypeDto.INHERITANCE: {
        const amount = dto.inheritanceAmount ?? 0;
        return [
          { periods: horizonMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution, lumpSumDelta: amount },
        ];
      }

      case ScenarioTypeDto.HOME_PURCHASE: {
        const downPayment = dto.homePurchaseDownPayment ?? 0;
        return [
          {
            periods: horizonMonths,
            mu: monthlyMu,
            sigma: monthlySigma,
            contributionPerPeriod: monthlyContribution,
            lumpSumDelta: -downPayment,
          },
        ];
      }

      case ScenarioTypeDto.EARLY_RETIREMENT: {
        // Accumulation phase (normal contribution) up to retirementStartMonth,
        // then a withdrawal phase for the remainder of the horizon.
        const retireAt = Math.min(dto.retirementStartMonth ?? Math.round(horizonMonths / 2), horizonMonths);
        const withdrawal = dto.retirementMonthlyWithdrawal ?? monthlyContribution;
        const phases: ScenarioPhaseInput[] = [
          { periods: retireAt, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution },
        ];
        if (horizonMonths > retireAt) {
          phases.push({ periods: horizonMonths - retireAt, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: -withdrawal });
        }
        return phases;
      }

      case ScenarioTypeDto.INFLATION_SPIKE: {
        // A bounded stretch of reduced real return, then a return to the
        // baseline assumption — real purchasing-power erosion modeled as a
        // direct cut to mu for the spike's duration, not a separate
        // inflation-index simulation (no such index feed exists here).
        const spikeMonths = Math.min(dto.inflationSpikeMonths ?? 12, horizonMonths);
        const spikePct = dto.inflationSpikePct ?? 3;
        const spikeMu = monthlyMu - spikePct / 100 / 12;
        const phases: ScenarioPhaseInput[] = [
          { periods: spikeMonths, mu: spikeMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution },
        ];
        if (horizonMonths > spikeMonths) {
          phases.push({ periods: horizonMonths - spikeMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: monthlyContribution });
        }
        return phases;
      }

      case ScenarioTypeDto.CURRENCY_DEPRECIATION: {
        // Approximate: a one-time shock scaled by the user's REAL non-base-
        // currency exposure fraction (from NetWorthService.calculateNetWorth's
        // currencyExposure breakdown), not a true multi-currency revaluation
        // of each holding — documented here and in the plan as approximate.
        const depreciationPct = dto.currencyDepreciationPct ?? 15;
        const fxExposedPct = ctx.currencyExposure
          .filter((c) => c.currency !== ctx.baseCurrency)
          .reduce((sum, c) => sum + c.percentage, 0);
        const portfolioLevelShockPct = (fxExposedPct / 100) * depreciationPct;
        return [
          {
            periods: horizonMonths,
            mu: monthlyMu,
            sigma: monthlySigma,
            contributionPerPeriod: monthlyContribution,
            shockMultiplier: 1 - portfolioLevelShockPct / 100,
          },
        ];
      }

      case ScenarioTypeDto.SALARY_CHANGE: {
        const changePct = dto.salaryChangePct ?? 20;
        const newContribution = monthlyContribution * (1 + changePct / 100);
        return [{ periods: horizonMonths, mu: monthlyMu, sigma: monthlySigma, contributionPerPeriod: newContribution }];
      }

      default:
        throw new BadRequestException(`Unknown scenario type: ${dto.scenarioType as string}`);
    }
  }
}
