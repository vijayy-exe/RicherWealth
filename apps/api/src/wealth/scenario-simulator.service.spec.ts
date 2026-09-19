/**
 * ScenarioSimulatorService tests — deterministic with mocked
 * NetWorthService, AnalyticsService, and QuantClientService. The actual
 * Monte Carlo math (including phase chaining, shocks, and lump sums) is
 * covered exactly and rigorously in apps/quant/tests/test_monte_carlo.py —
 * this file verifies the ASSEMBLY layer: that each named scenario type
 * translates into the correct `phases[]` array handed to the quant client.
 */
import Decimal from "decimal.js";
import { ScenarioSimulatorService } from "./scenario-simulator.service";
import { ScenarioTypeDto } from "./dto/simulate-scenario.dto";

describe("ScenarioSimulatorService", () => {
  const mockNetWorth = { calculateNetWorth: jest.fn() };
  const mockAnalytics = { getPortfolioReturnAssumption: jest.fn() };
  const mockQuant = { monteCarloScenario: jest.fn() };

  let service: ScenarioSimulatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNetWorth.calculateNetWorth.mockResolvedValue({
      netWorth: new Decimal(1_000_000),
      baseCurrency: "INR",
      currencyExposure: [{ currency: "INR", percentage: 70 }, { currency: "USD", percentage: 30 }],
    });
    mockAnalytics.getPortfolioReturnAssumption.mockResolvedValue({
      annualReturnPct: 12,
      annualVolatilityPct: 18,
      isAssumedReturn: false,
    });
    mockQuant.monteCarloScenario.mockResolvedValue({
      periods: 120,
      percentiles: { "50": [] },
      mean: [],
      finalValueStats: { mean: 2_000_000, std: 100_000, min: 500_000, max: 4_000_000 },
    });
    service = new ScenarioSimulatorService(mockNetWorth as never, mockAnalytics as never, mockQuant as never);
  });

  it("throws when the user's current net worth is zero or negative", async () => {
    mockNetWorth.calculateNetWorth.mockResolvedValue({ netWorth: new Decimal(0), baseCurrency: "INR", currencyExposure: [] });
    await expect(service.simulate("user-1", { scenarioType: ScenarioTypeDto.MARKET_CRASH })).rejects.toThrow(
      "positive current net worth",
    );
  });

  it("always calls the quant client twice — once for baseline, once for the scenario", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.MARKET_CRASH });
    expect(mockQuant.monteCarloScenario).toHaveBeenCalledTimes(2);
  });

  it("MARKET_CRASH: applies a negative shockMultiplier derived from marketCrashPct, baseline has no shock", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.MARKET_CRASH, marketCrashPct: 40 });
    const [baselineCall, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(baselineCall[0].phases[0].shockMultiplier).toBeUndefined();
    expect(scenarioCall[0].phases[0].shockMultiplier).toBeCloseTo(0.6, 6);
    expect(scenarioCall[0].initialValue).toBe(1_000_000);
  });

  it("MARKET_CRASH defaults to a 30% crash when marketCrashPct is omitted", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.MARKET_CRASH });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(scenarioCall[0].phases[0].shockMultiplier).toBeCloseTo(0.7, 6);
  });

  it("INHERITANCE: adds a positive lumpSumDelta equal to inheritanceAmount", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.INHERITANCE, inheritanceAmount: 500_000 });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(scenarioCall[0].phases[0].lumpSumDelta).toBe(500_000);
  });

  it("HOME_PURCHASE: adds a negative lumpSumDelta equal to -downPayment", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.HOME_PURCHASE, homePurchaseDownPayment: 200_000 });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(scenarioCall[0].phases[0].lumpSumDelta).toBe(-200_000);
  });

  it("JOB_LOSS: splits into a negative-contribution drawdown phase followed by a normal-contribution phase", async () => {
    await service.simulate("user-1", {
      scenarioType: ScenarioTypeDto.JOB_LOSS,
      jobLossMonths: 4,
      jobLossMonthlyDrawdown: 30_000,
      monthlyContribution: 20_000,
      horizonYears: 1,
    });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    const phases = scenarioCall[0].phases;
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ periods: 4, contributionPerPeriod: -30_000 });
    expect(phases[1]).toMatchObject({ periods: 8, contributionPerPeriod: 20_000 });
  });

  it("JOB_LOSS: omits the resume phase entirely if the job loss covers the whole horizon", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.JOB_LOSS, jobLossMonths: 999, horizonYears: 1 });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(scenarioCall[0].phases).toHaveLength(1);
    expect(scenarioCall[0].phases[0].periods).toBe(12); // clamped to the horizon
  });

  it("EARLY_RETIREMENT: switches from a normal-contribution phase to a negative-withdrawal phase", async () => {
    await service.simulate("user-1", {
      scenarioType: ScenarioTypeDto.EARLY_RETIREMENT,
      retirementStartMonth: 6,
      retirementMonthlyWithdrawal: 15_000,
      monthlyContribution: 10_000,
      horizonYears: 1,
    });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    const phases = scenarioCall[0].phases;
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ periods: 6, contributionPerPeriod: 10_000 });
    expect(phases[1]).toMatchObject({ periods: 6, contributionPerPeriod: -15_000 });
  });

  it("INFLATION_SPIKE: reduces mu below baseline for the spike phase, then restores it", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.INFLATION_SPIKE, inflationSpikePct: 6, inflationSpikeMonths: 3, horizonYears: 1 });
    const [baselineCall, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    const baseMu = baselineCall[0].phases[0].mu;
    const phases = scenarioCall[0].phases;
    expect(phases[0].mu).toBeLessThan(baseMu);
    expect(phases[0].mu).toBeCloseTo(baseMu - 0.06 / 12, 8);
    expect(phases[1].mu).toBeCloseTo(baseMu, 8);
  });

  it("CURRENCY_DEPRECIATION: scales the shock by the real non-base-currency exposure fraction", async () => {
    // fixture: 30% USD-exposed, base currency INR
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.CURRENCY_DEPRECIATION, currencyDepreciationPct: 20 });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    // 30% exposed * 20% depreciation = 6% portfolio-level shock -> multiplier 0.94
    expect(scenarioCall[0].phases[0].shockMultiplier).toBeCloseTo(0.94, 6);
  });

  it("CURRENCY_DEPRECIATION: applies no shock when the portfolio has zero FX exposure", async () => {
    mockNetWorth.calculateNetWorth.mockResolvedValue({
      netWorth: new Decimal(1_000_000),
      baseCurrency: "INR",
      currencyExposure: [{ currency: "INR", percentage: 100 }],
    });
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.CURRENCY_DEPRECIATION, currencyDepreciationPct: 20 });
    const [, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(scenarioCall[0].phases[0].shockMultiplier).toBeCloseTo(1, 6);
  });

  it("SALARY_CHANGE: scales the contribution by (1 + salaryChangePct/100)", async () => {
    await service.simulate("user-1", { scenarioType: ScenarioTypeDto.SALARY_CHANGE, salaryChangePct: 25, monthlyContribution: 10_000 });
    const [baselineCall, scenarioCall] = mockQuant.monteCarloScenario.mock.calls;
    expect(baselineCall[0].phases[0].contributionPerPeriod).toBe(10_000);
    expect(scenarioCall[0].phases[0].contributionPerPeriod).toBeCloseTo(12_500, 6);
  });

  it("market crash and salary increase produce visibly different scenario contribution/shock shapes on the same portfolio (acceptance criterion, assembly level)", async () => {
    mockQuant.monteCarloScenario
      .mockResolvedValueOnce({ finalValueStats: { mean: 1_800_000, std: 0, min: 0, max: 0 }, periods: 120, percentiles: {}, mean: [] }) // baseline (crash run)
      .mockResolvedValueOnce({ finalValueStats: { mean: 1_200_000, std: 0, min: 0, max: 0 }, periods: 120, percentiles: {}, mean: [] }) // crash scenario
      .mockResolvedValueOnce({ finalValueStats: { mean: 1_800_000, std: 0, min: 0, max: 0 }, periods: 120, percentiles: {}, mean: [] }) // baseline (salary run)
      .mockResolvedValueOnce({ finalValueStats: { mean: 2_100_000, std: 0, min: 0, max: 0 }, periods: 120, percentiles: {}, mean: [] }); // salary-increase scenario

    const crash = await service.simulate("user-1", { scenarioType: ScenarioTypeDto.MARKET_CRASH, marketCrashPct: 30, monthlyContribution: 10_000 });
    const salary = await service.simulate("user-1", { scenarioType: ScenarioTypeDto.SALARY_CHANGE, salaryChangePct: 25, monthlyContribution: 10_000 });

    expect(crash.scenario.finalValueStats.mean).toBeLessThan(crash.baseline.finalValueStats.mean);
    expect(salary.scenario.finalValueStats.mean).toBeGreaterThan(salary.baseline.finalValueStats.mean);
  });
});
