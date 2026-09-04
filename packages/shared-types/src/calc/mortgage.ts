/**
 * Mortgage calculator — the loan-payment math is entirely
 * `generateAmortizationSchedule` from amortization.ts (a mortgage IS an
 * amortized loan); this file only adds the extra monthly carrying costs a
 * mortgage calculator conventionally shows alongside principal+interest
 * (property tax, homeowner's insurance, HOA dues) as a simple sum — those
 * three are flat pass-through inputs, not part of the loan amortization
 * itself, so they don't belong inside amortization.ts.
 */

import { generateAmortizationSchedule, type PaymentFrequency, type AmortizationResult } from "./amortization";

export interface MortgageInput {
  homePrice: number;
  downPayment: number;
  annualRatePct: number;
  tenureMonths: number;
  paymentFrequency?: PaymentFrequency;
  /** Annual property tax, in currency (not percent). Default 0. */
  annualPropertyTax?: number;
  /** Annual homeowner's insurance premium. Default 0. */
  annualInsurance?: number;
  /** Monthly HOA/maintenance dues. Default 0. */
  monthlyHoa?: number;
}

export interface MortgageResult {
  loanAmount: number;
  amortization: AmortizationResult;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  /** Principal & interest + tax + insurance + HOA — the conventional "PITI + HOA" total. */
  totalMonthlyPayment: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const {
    homePrice, downPayment, annualRatePct, tenureMonths, paymentFrequency = "MONTHLY",
    annualPropertyTax = 0, annualInsurance = 0, monthlyHoa = 0,
  } = input;

  const loanAmount = round2(Math.max(0, homePrice - downPayment));
  const amortization = generateAmortizationSchedule({ principal: loanAmount, annualRatePct, tenureMonths, paymentFrequency });

  const monthlyPropertyTax = round2(annualPropertyTax / 12);
  const monthlyInsurance = round2(annualInsurance / 12);

  return {
    loanAmount,
    amortization,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa: round2(monthlyHoa),
    totalMonthlyPayment: round2(amortization.scheduledPayment + monthlyPropertyTax + monthlyInsurance + monthlyHoa),
  };
}
