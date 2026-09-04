import { simulateSwp } from "./swp";

describe("simulateSwp", () => {
  it("depletes exactly at 0% return: 120000 corpus, 10000/mo withdrawal -> exactly 12 months", () => {
    const result = simulateSwp({ initialCorpus: 120_000, monthlyWithdrawal: 10_000, annualRatePct: 0 });
    expect(result.monthsLasted).toBe(12);
    expect(result.corpusExhausted).toBe(true);
    expect(result.totalWithdrawn).toBe(120_000);
    expect(result.finalCorpus).toBe(0);
  });

  it("hand-computed single-month depletion when the withdrawal exceeds the grown corpus", () => {
    // growth = 100000*0.01 = 1000 -> corpus = 101000; withdrawal capped at 101000 (all of it)
    const result = simulateSwp({ initialCorpus: 100_000, monthlyWithdrawal: 101_500, annualRatePct: 12, maxMonths: 10 });
    expect(result.monthsLasted).toBe(1);
    expect(result.corpusExhausted).toBe(true);
    expect(result.schedule[0]).toEqual({ month: 1, growth: 1_000, withdrawal: 101_000, remainingCorpus: 0 });
    expect(result.totalWithdrawn).toBe(101_000);
    expect(result.finalCorpus).toBe(0);
  });

  it("never exhausts when monthly growth exceeds the withdrawal — corpus grows over time", () => {
    // 1,200,000 @ 12% p.a. (1%/mo = 12,000/mo growth) vs. a 10,000/mo withdrawal: sustainable forever
    const result = simulateSwp({ initialCorpus: 1_200_000, monthlyWithdrawal: 10_000, annualRatePct: 12, maxMonths: 24 });
    expect(result.corpusExhausted).toBe(false);
    expect(result.monthsLasted).toBe(24);
    expect(result.finalCorpus).toBeGreaterThan(1_200_000);
  });

  it("hand-computed first two months at a non-zero rate", () => {
    // month 1: growth = 100000*0.01 = 1000, corpus = 101000, withdraw 5000 -> 96000
    // month 2: growth = 96000*0.01 = 960, corpus = 96960, withdraw 5000 -> 91960
    const result = simulateSwp({ initialCorpus: 100_000, monthlyWithdrawal: 5_000, annualRatePct: 12, maxMonths: 2 });
    expect(result.schedule[0]).toEqual({ month: 1, growth: 1_000, withdrawal: 5_000, remainingCorpus: 96_000 });
    expect(result.schedule[1]).toEqual({ month: 2, growth: 960, withdrawal: 5_000, remainingCorpus: 91_960 });
  });
});
