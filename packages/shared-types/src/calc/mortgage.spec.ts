import { calculateMortgage } from "./mortgage";
import { generateAmortizationSchedule } from "./amortization";

describe("calculateMortgage", () => {
  it("subtracts the down payment before amortizing, matching the same reference EMI at the resulting loan amount", () => {
    // $250,000 home, $50,000 down -> $200,000 loan, the same textbook reference as amortization.spec.ts
    const result = calculateMortgage({
      homePrice: 250_000, downPayment: 50_000,
      annualRatePct: 6, tenureMonths: 360,
    });
    expect(result.loanAmount).toBe(200_000);
    expect(result.amortization.scheduledPayment).toBeCloseTo(1199.10, 1);
    const direct = generateAmortizationSchedule({ principal: 200_000, annualRatePct: 6, tenureMonths: 360 });
    expect(result.amortization.scheduledPayment).toBe(direct.scheduledPayment);
  });

  it("sums P&I + tax + insurance + HOA exactly for the total monthly payment", () => {
    const result = calculateMortgage({
      homePrice: 250_000, downPayment: 50_000, annualRatePct: 6, tenureMonths: 360,
      annualPropertyTax: 3_600, annualInsurance: 1_200, monthlyHoa: 150,
    });
    expect(result.monthlyPropertyTax).toBe(300); // 3600/12
    expect(result.monthlyInsurance).toBe(100); // 1200/12
    expect(result.monthlyHoa).toBe(150);
    expect(result.totalMonthlyPayment).toBeCloseTo(result.amortization.scheduledPayment + 300 + 100 + 150, 2);
  });

  it("floors the loan amount at 0 when down payment exceeds home price", () => {
    const result = calculateMortgage({ homePrice: 100_000, downPayment: 150_000, annualRatePct: 6, tenureMonths: 360 });
    expect(result.loanAmount).toBe(0);
    expect(result.amortization.scheduledPayment).toBe(0);
  });
});
