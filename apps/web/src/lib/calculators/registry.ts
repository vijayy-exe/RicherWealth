/**
 * Phase 13 calculator registry — one config per calculator, each `compute`
 * calling the exact same `@richer/shared-types` functions the backend uses
 * to save a calculation as a Goal, so frontend preview and backend
 * authoritative calculation can never drift for the same inputs (this file
 * IS the regression guarantee the acceptance criteria ask for: there is
 * only one implementation of each formula, imported by both apps).
 *
 * "Save as Goal" (`goalMapping`) is offered only where a calculator
 * genuinely produces a future savings TARGET: SIP, Lumpsum, Compound
 * Interest, FD, RD, Retirement, Goal Planning, and Inflation (saving up for
 * a future inflated cost is a real goal use case). It's deliberately
 * omitted for SWP (a withdrawal/depletion tool — the opposite of
 * accumulation), EMI, Mortgage, and Loan Comparison (debt repayment, not a
 * savings target), and Tax (not a savings concept at all) — forcing a fake
 * "goal" onto those would be misleading, not helpful.
 */
import {
  compoundGrowth,
  sipFutureValue,
  requiredSipForTarget,
  requiredLumpsumForTarget,
  simulateSwp,
  futureCost,
  calculateRetirementPlan,
  calculateSlabTax,
  DEFAULT_INDIA_SLABS,
  computeEmi,
  compareLoans,
  calculateMortgage,
  generateAmortizationSchedule,
} from "@richer/shared-types";
import type { CalculatorConfig, CalculatorResult } from "./types";

// ─── SIP ────────────────────────────────────────────────────────────────────

const sip: CalculatorConfig = {
  slug: "sip",
  title: "SIP Calculator",
  description: "Project the future value of a monthly Systematic Investment Plan.",
  icon: "📈",
  fields: [
    { key: "monthlyContribution", label: "Monthly Investment", defaultValue: 10_000, min: 500, step: 500 },
    { key: "annualRatePct", label: "Expected Annual Return", defaultValue: 12, min: 0, max: 40, step: 0.5, suffix: "%" },
    { key: "years", label: "Investment Period", defaultValue: 10, min: 1, max: 40, step: 1, suffix: "years" },
  ],
  compute: (v): CalculatorResult => {
    const months = Math.round(v.years! * 12);
    const r = sipFutureValue({ monthlyContribution: v.monthlyContribution!, annualRatePct: v.annualRatePct!, months });
    return {
      fields: [
        { label: "Future Value", value: r.futureValue, format: "currency", highlight: true },
        { label: "Total Invested", value: r.totalInvested, format: "currency" },
        { label: "Wealth Gained", value: r.totalGain, format: "currency" },
      ],
      chart: {
        data: r.monthlySchedule.filter((_, i) => i % Math.max(1, Math.round(months / 60)) === 0 || i === r.monthlySchedule.length - 1).map((p) => ({ x: p.month, invested: p.invested, value: p.value })),
        series: [
          { key: "invested", label: "Invested", color: "#5C6880" },
          { key: "value", label: "Value", color: "#3D83FF" },
        ],
        xLabel: "Month",
      },
      goalMapping: { targetAmount: r.futureValue, suggestedName: "SIP Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── Lumpsum ────────────────────────────────────────────────────────────────

const lumpsum: CalculatorConfig = {
  slug: "lumpsum",
  title: "Lumpsum Calculator",
  description: "Project the future value of a one-time investment.",
  icon: "💰",
  fields: [
    { key: "principal", label: "Investment Amount", defaultValue: 100_000, min: 1_000, step: 1_000 },
    { key: "annualRatePct", label: "Expected Annual Return", defaultValue: 12, min: 0, max: 40, step: 0.5, suffix: "%" },
    { key: "years", label: "Investment Period", defaultValue: 10, min: 1, max: 40, step: 1, suffix: "years" },
  ],
  compute: (v): CalculatorResult => {
    const r = compoundGrowth({ principal: v.principal!, annualRatePct: v.annualRatePct!, years: v.years!, compoundingPerYear: 1 });
    return {
      fields: [
        { label: "Future Value", value: r.futureValue, format: "currency", highlight: true },
        { label: "Amount Invested", value: v.principal!, format: "currency" },
        { label: "Wealth Gained", value: r.totalInterest, format: "currency" },
      ],
      chart: {
        data: r.yearlySchedule.map((p) => ({ x: p.year, value: p.value })),
        series: [{ key: "value", label: "Value", color: "#3D83FF" }],
        xLabel: "Year",
      },
      goalMapping: { targetAmount: r.futureValue, suggestedName: "Lumpsum Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── Compound Interest ──────────────────────────────────────────────────────

const compoundInterest: CalculatorConfig = {
  slug: "compound-interest",
  title: "Compound Interest Calculator",
  description: "See how compounding frequency affects growth.",
  icon: "🧮",
  fields: [
    { key: "principal", label: "Principal", defaultValue: 100_000, min: 1_000, step: 1_000 },
    { key: "annualRatePct", label: "Annual Interest Rate", defaultValue: 8, min: 0, max: 40, step: 0.25, suffix: "%" },
    { key: "years", label: "Duration", defaultValue: 5, min: 1, max: 40, step: 1, suffix: "years" },
    { key: "compoundingPerYear", label: "Compounding Frequency (per year)", defaultValue: 4, min: 1, max: 365, step: 1 },
  ],
  compute: (v): CalculatorResult => {
    const r = compoundGrowth({ principal: v.principal!, annualRatePct: v.annualRatePct!, years: v.years!, compoundingPerYear: v.compoundingPerYear! });
    return {
      fields: [
        { label: "Future Value", value: r.futureValue, format: "currency", highlight: true },
        { label: "Interest Earned", value: r.totalInterest, format: "currency" },
      ],
      chart: {
        data: r.yearlySchedule.map((p) => ({ x: p.year, value: p.value })),
        series: [{ key: "value", label: "Value", color: "#3D83FF" }],
        xLabel: "Year",
      },
      goalMapping: { targetAmount: r.futureValue, suggestedName: "Compound Interest Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── FD (Fixed Deposit) ─────────────────────────────────────────────────────

const fd: CalculatorConfig = {
  slug: "fd",
  title: "FD Calculator",
  description: "Fixed Deposit maturity value, quarterly compounding (standard bank convention).",
  icon: "🏦",
  fields: [
    { key: "principal", label: "Deposit Amount", defaultValue: 100_000, min: 1_000, step: 1_000 },
    { key: "annualRatePct", label: "Annual Interest Rate", defaultValue: 7, min: 0, max: 20, step: 0.1, suffix: "%" },
    { key: "years", label: "Tenure", defaultValue: 5, min: 0.25, max: 10, step: 0.25, suffix: "years" },
  ],
  compute: (v): CalculatorResult => {
    const r = compoundGrowth({ principal: v.principal!, annualRatePct: v.annualRatePct!, years: v.years!, compoundingPerYear: 4 });
    return {
      fields: [
        { label: "Maturity Value", value: r.futureValue, format: "currency", highlight: true },
        { label: "Interest Earned", value: r.totalInterest, format: "currency" },
      ],
      chart: {
        data: r.yearlySchedule.map((p) => ({ x: p.year, value: p.value })),
        series: [{ key: "value", label: "Value", color: "#3D83FF" }],
        xLabel: "Year",
      },
      goalMapping: { targetAmount: r.futureValue, suggestedName: "FD Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── RD (Recurring Deposit) ─────────────────────────────────────────────────

const rd: CalculatorConfig = {
  slug: "rd",
  title: "RD Calculator",
  description: "Recurring Deposit maturity value — a fixed-rate monthly deposit, the bank-guaranteed counterpart to a market-linked SIP.",
  icon: "🪙",
  fields: [
    { key: "monthlyContribution", label: "Monthly Deposit", defaultValue: 5_000, min: 500, step: 500 },
    { key: "annualRatePct", label: "Annual Interest Rate", defaultValue: 6.5, min: 0, max: 20, step: 0.1, suffix: "%" },
    { key: "years", label: "Tenure", defaultValue: 3, min: 0.5, max: 10, step: 0.5, suffix: "years" },
  ],
  compute: (v): CalculatorResult => {
    const months = Math.round(v.years! * 12);
    const r = sipFutureValue({ monthlyContribution: v.monthlyContribution!, annualRatePct: v.annualRatePct!, months });
    return {
      fields: [
        { label: "Maturity Value", value: r.futureValue, format: "currency", highlight: true },
        { label: "Total Deposited", value: r.totalInvested, format: "currency" },
        { label: "Interest Earned", value: r.totalGain, format: "currency" },
      ],
      chart: {
        data: r.monthlySchedule.filter((_, i) => i % Math.max(1, Math.round(months / 60)) === 0 || i === r.monthlySchedule.length - 1).map((p) => ({ x: p.month, invested: p.invested, value: p.value })),
        series: [
          { key: "invested", label: "Deposited", color: "#5C6880" },
          { key: "value", label: "Value", color: "#3D83FF" },
        ],
        xLabel: "Month",
      },
      goalMapping: { targetAmount: r.futureValue, suggestedName: "RD Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── SWP (Systematic Withdrawal Plan) ───────────────────────────────────────

const swp: CalculatorConfig = {
  slug: "swp",
  title: "SWP Calculator",
  description: "How long a corpus lasts under a fixed monthly withdrawal.",
  icon: "📉",
  fields: [
    { key: "initialCorpus", label: "Initial Corpus", defaultValue: 2_000_000, min: 10_000, step: 10_000 },
    { key: "monthlyWithdrawal", label: "Monthly Withdrawal", defaultValue: 15_000, min: 500, step: 500 },
    { key: "annualRatePct", label: "Expected Annual Return", defaultValue: 8, min: 0, max: 30, step: 0.5, suffix: "%" },
  ],
  compute: (v): CalculatorResult => {
    const r = simulateSwp({ initialCorpus: v.initialCorpus!, monthlyWithdrawal: v.monthlyWithdrawal!, annualRatePct: v.annualRatePct!, maxMonths: 600 });
    return {
      fields: [
        {
          label: r.corpusExhausted ? "Corpus Lasts" : "Corpus Lasts At Least",
          value: r.monthsLasted,
          format: "months",
          highlight: true,
        },
        { label: "Total Withdrawn", value: r.totalWithdrawn, format: "currency" },
        { label: r.corpusExhausted ? "Final Corpus" : "Corpus After 50 Years", value: r.finalCorpus, format: "currency" },
      ],
      chart: {
        data: r.schedule.filter((_, i) => i % Math.max(1, Math.round(r.schedule.length / 60)) === 0 || i === r.schedule.length - 1).map((p) => ({ x: p.month, remainingCorpus: p.remainingCorpus })),
        series: [{ key: "remainingCorpus", label: "Remaining Corpus", color: "#FF8A3D" }],
        xLabel: "Month",
      },
      goalMapping: null, // depletion tool, not an accumulation target
    };
  },
};

// ─── Retirement ──────────────────────────────────────────────────────────────

const retirement: CalculatorConfig = {
  slug: "retirement",
  title: "Retirement Calculator",
  description: "Required retirement corpus and the monthly SIP to reach it.",
  icon: "🏖️",
  fields: [
    { key: "currentAge", label: "Current Age", defaultValue: 30, min: 18, max: 70, step: 1 },
    { key: "retirementAge", label: "Retirement Age", defaultValue: 60, min: 40, max: 80, step: 1 },
    { key: "lifeExpectancy", label: "Life Expectancy", defaultValue: 85, min: 60, max: 100, step: 1 },
    { key: "currentMonthlyExpense", label: "Current Monthly Expense", defaultValue: 50_000, min: 1_000, step: 1_000 },
    { key: "inflationPct", label: "Expected Inflation", defaultValue: 6, min: 0, max: 15, step: 0.5, suffix: "%" },
    { key: "preRetirementReturnPct", label: "Pre-Retirement Return", defaultValue: 12, min: 0, max: 30, step: 0.5, suffix: "%" },
    { key: "postRetirementReturnPct", label: "Post-Retirement Return", defaultValue: 7, min: 0, max: 20, step: 0.5, suffix: "%" },
    { key: "existingCorpus", label: "Existing Retirement Savings", defaultValue: 0, min: 0, step: 10_000 },
  ],
  compute: (v): CalculatorResult => {
    const r = calculateRetirementPlan({
      currentAge: v.currentAge!, retirementAge: v.retirementAge!, lifeExpectancy: v.lifeExpectancy!,
      currentMonthlyExpense: v.currentMonthlyExpense!, inflationPct: v.inflationPct!,
      preRetirementReturnPct: v.preRetirementReturnPct!, postRetirementReturnPct: v.postRetirementReturnPct!,
      existingCorpus: v.existingCorpus!,
    });
    if (r.yearsToRetirement < 0) {
      return { fields: [], chart: null, goalMapping: null, error: "Retirement age must be after current age." };
    }
    return {
      fields: [
        { label: "Required Corpus at Retirement", value: r.requiredCorpusAtRetirement, format: "currency", highlight: true },
        { label: "Required Monthly SIP", value: r.requiredMonthlySip ?? 0, format: "currency" },
        { label: "Monthly Expense at Retirement", value: r.monthlyExpenseAtRetirement, format: "currency" },
        { label: "Years to Retirement", value: r.yearsToRetirement, format: "years" },
      ],
      chart: null,
      goalMapping: { targetAmount: r.requiredCorpusAtRetirement, suggestedName: "Retirement Corpus", yearsFromNow: r.yearsToRetirement },
    };
  },
};

// ─── Goal Planning ───────────────────────────────────────────────────────────

const goalPlanning: CalculatorConfig = {
  slug: "goal-planning",
  title: "Goal Planning Calculator",
  description: "How much to invest (monthly SIP or a lumpsum today) to hit a target.",
  icon: "🎯",
  fields: [
    { key: "targetAmount", label: "Target Amount", defaultValue: 1_000_000, min: 1_000, step: 10_000 },
    { key: "currentValue", label: "Already Saved", defaultValue: 0, min: 0, step: 10_000 },
    { key: "years", label: "Time Horizon", defaultValue: 10, min: 1, max: 40, step: 1, suffix: "years" },
    { key: "annualRatePct", label: "Expected Annual Return", defaultValue: 12, min: 0, max: 40, step: 0.5, suffix: "%" },
  ],
  compute: (v): CalculatorResult => {
    const months = Math.round(v.years! * 12);
    const requiredSip = requiredSipForTarget(v.targetAmount!, v.currentValue!, v.annualRatePct!, months) ?? 0;
    const requiredLumpsum = requiredLumpsumForTarget(v.targetAmount!, v.annualRatePct!, v.years!) ?? 0;
    return {
      fields: [
        { label: "Required Monthly SIP", value: requiredSip, format: "currency", highlight: true },
        { label: "— or a Lumpsum Today of", value: requiredLumpsum, format: "currency" },
        { label: "Target Amount", value: v.targetAmount!, format: "currency" },
      ],
      chart: null,
      goalMapping: { targetAmount: v.targetAmount!, suggestedName: "My Goal", yearsFromNow: v.years! },
    };
  },
};

// ─── Inflation ───────────────────────────────────────────────────────────────

const inflation: CalculatorConfig = {
  slug: "inflation",
  title: "Inflation Calculator",
  description: "What today's cost will become in the future, adjusted for inflation.",
  icon: "🎈",
  fields: [
    { key: "currentCost", label: "Current Cost", defaultValue: 100_000, min: 100, step: 1_000 },
    { key: "inflationPct", label: "Expected Inflation", defaultValue: 6, min: 0, max: 20, step: 0.5, suffix: "%" },
    { key: "years", label: "Time Horizon", defaultValue: 10, min: 1, max: 40, step: 1, suffix: "years" },
  ],
  compute: (v): CalculatorResult => {
    const future = futureCost(v.currentCost!, v.inflationPct!, v.years!);
    const points = Array.from({ length: Math.round(v.years!) + 1 }, (_, year) => ({ x: year, value: futureCost(v.currentCost!, v.inflationPct!, year) }));
    return {
      fields: [
        { label: "Future Cost", value: future, format: "currency", highlight: true },
        { label: "Today's Cost", value: v.currentCost!, format: "currency" },
      ],
      chart: { data: points, series: [{ key: "value", label: "Cost", color: "#FF8A3D" }], xLabel: "Year" },
      goalMapping: { targetAmount: future, suggestedName: "Inflation-Adjusted Target", yearsFromNow: v.years! },
    };
  },
};

// ─── EMI ─────────────────────────────────────────────────────────────────────

const emi: CalculatorConfig = {
  slug: "emi",
  title: "EMI Calculator",
  description: "Monthly loan installment for a given principal, rate, and tenure.",
  icon: "🏛️",
  fields: [
    { key: "principal", label: "Loan Amount", defaultValue: 1_000_000, min: 1_000, step: 10_000 },
    { key: "annualRatePct", label: "Annual Interest Rate", defaultValue: 9, min: 0, max: 30, step: 0.1, suffix: "%" },
    { key: "tenureMonths", label: "Tenure", defaultValue: 60, min: 1, max: 480, step: 1, suffix: "months" },
  ],
  compute: (v): CalculatorResult => {
    const emiAmount = computeEmi(v.principal!, v.annualRatePct!, Math.round(v.tenureMonths!));
    const schedule = generateAmortizationSchedule({ principal: v.principal!, annualRatePct: v.annualRatePct!, tenureMonths: Math.round(v.tenureMonths!) });
    return {
      fields: [
        { label: "Monthly EMI", value: emiAmount, format: "currency", highlight: true },
        { label: "Total Interest", value: schedule.totalInterest, format: "currency" },
        { label: "Total Payment", value: schedule.totalPaid, format: "currency" },
      ],
      chart: {
        data: schedule.schedule.filter((_, i) => i % Math.max(1, Math.round(schedule.schedule.length / 60)) === 0 || i === schedule.schedule.length - 1).map((p) => ({ x: p.period, remainingBalance: p.remainingBalance })),
        series: [{ key: "remainingBalance", label: "Remaining Balance", color: "#3D83FF" }],
        xLabel: "Month",
      },
      goalMapping: null, // debt repayment, not a savings target
    };
  },
};

// ─── Mortgage ────────────────────────────────────────────────────────────────

const mortgage: CalculatorConfig = {
  slug: "mortgage",
  title: "Mortgage Calculator",
  description: "Total monthly housing payment — principal, interest, tax, insurance, and HOA.",
  icon: "🏠",
  fields: [
    { key: "homePrice", label: "Home Price", defaultValue: 5_000_000, min: 100_000, step: 50_000 },
    { key: "downPayment", label: "Down Payment", defaultValue: 1_000_000, min: 0, step: 50_000 },
    { key: "annualRatePct", label: "Annual Interest Rate", defaultValue: 8.5, min: 0, max: 20, step: 0.1, suffix: "%" },
    { key: "tenureMonths", label: "Tenure", defaultValue: 240, min: 12, max: 480, step: 12, suffix: "months" },
    { key: "annualPropertyTax", label: "Annual Property Tax", defaultValue: 30_000, min: 0, step: 1_000 },
    { key: "annualInsurance", label: "Annual Insurance", defaultValue: 12_000, min: 0, step: 1_000 },
    { key: "monthlyHoa", label: "Monthly HOA/Maintenance", defaultValue: 2_000, min: 0, step: 500 },
  ],
  compute: (v): CalculatorResult => {
    const r = calculateMortgage({
      homePrice: v.homePrice!, downPayment: v.downPayment!, annualRatePct: v.annualRatePct!,
      tenureMonths: Math.round(v.tenureMonths!), annualPropertyTax: v.annualPropertyTax!,
      annualInsurance: v.annualInsurance!, monthlyHoa: v.monthlyHoa!,
    });
    return {
      fields: [
        { label: "Total Monthly Payment", value: r.totalMonthlyPayment, format: "currency", highlight: true },
        { label: "Principal & Interest", value: r.amortization.scheduledPayment, format: "currency" },
        { label: "Tax + Insurance + HOA", value: r.monthlyPropertyTax + r.monthlyInsurance + r.monthlyHoa, format: "currency" },
        { label: "Loan Amount", value: r.loanAmount, format: "currency" },
      ],
      chart: {
        data: r.amortization.schedule.filter((_, i) => i % Math.max(1, Math.round(r.amortization.schedule.length / 60)) === 0 || i === r.amortization.schedule.length - 1).map((p) => ({ x: p.period, remainingBalance: p.remainingBalance })),
        series: [{ key: "remainingBalance", label: "Remaining Balance", color: "#3D83FF" }],
        xLabel: "Month",
      },
      goalMapping: null, // debt repayment, not a savings target
    };
  },
};

// ─── Loan Comparison ─────────────────────────────────────────────────────────

const loanComparison: CalculatorConfig = {
  slug: "loan-comparison",
  title: "Loan Comparison Calculator",
  description: "Compare two loan offers side by side — EMI and total interest.",
  icon: "⚖️",
  fields: [
    { key: "aPrincipal", label: "Offer A — Principal", defaultValue: 1_000_000, min: 1_000, step: 10_000 },
    { key: "aRatePct", label: "Offer A — Annual Rate", defaultValue: 9, min: 0, max: 30, step: 0.1, suffix: "%" },
    { key: "aTenureMonths", label: "Offer A — Tenure", defaultValue: 60, min: 1, max: 480, step: 1, suffix: "months" },
    { key: "bPrincipal", label: "Offer B — Principal", defaultValue: 1_000_000, min: 1_000, step: 10_000 },
    { key: "bRatePct", label: "Offer B — Annual Rate", defaultValue: 8.5, min: 0, max: 30, step: 0.1, suffix: "%" },
    { key: "bTenureMonths", label: "Offer B — Tenure", defaultValue: 84, min: 1, max: 480, step: 1, suffix: "months" },
  ],
  compute: (v): CalculatorResult => {
    const { results, cheapestIndex } = compareLoans([
      { label: "Offer A", principal: v.aPrincipal!, annualRatePct: v.aRatePct!, tenureMonths: Math.round(v.aTenureMonths!) },
      { label: "Offer B", principal: v.bPrincipal!, annualRatePct: v.bRatePct!, tenureMonths: Math.round(v.bTenureMonths!) },
    ]);
    const [a, b] = results;
    return {
      fields: [
        { label: `Cheaper Offer`, value: cheapestIndex === 0 ? 1 : 2, format: "number", highlight: true },
        { label: "Offer A — EMI", value: a!.scheduledPayment, format: "currency" },
        { label: "Offer A — Total Interest", value: a!.totalInterest, format: "currency" },
        { label: "Offer B — EMI", value: b!.scheduledPayment, format: "currency" },
        { label: "Offer B — Total Interest", value: b!.totalInterest, format: "currency" },
      ],
      chart: null,
      goalMapping: null, // debt repayment, not a savings target
    };
  },
};

// ─── Tax (basic) ─────────────────────────────────────────────────────────────

const tax: CalculatorConfig = {
  slug: "tax",
  title: "Tax Calculator (Basic)",
  description: "Simplified marginal-bracket income tax estimate. Not tax advice — no cess, surcharge, or deductions.",
  icon: "🧾",
  fields: [{ key: "income", label: "Annual Income", defaultValue: 1_200_000, min: 0, step: 10_000 }],
  compute: (v): CalculatorResult => {
    const r = calculateSlabTax(v.income!, DEFAULT_INDIA_SLABS);
    return {
      fields: [
        { label: "Total Tax", value: r.totalTax, format: "currency", highlight: true },
        { label: "Effective Rate", value: r.effectiveRatePct, format: "percent" },
        { label: "Net Income", value: r.netIncome, format: "currency" },
      ],
      chart: null,
      goalMapping: null, // not a savings concept
    };
  },
};

export const CALCULATORS: CalculatorConfig[] = [
  sip, lumpsum, compoundInterest, fd, rd, swp, retirement, goalPlanning,
  inflation, emi, mortgage, loanComparison, tax,
];

export const CALCULATOR_MAP = new Map(CALCULATORS.map((c) => [c.slug, c]));
