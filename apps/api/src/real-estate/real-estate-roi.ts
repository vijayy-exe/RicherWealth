import Decimal from "decimal.js";

export interface RoiInput {
  /** Rental income for the period being measured (annualized), 0 if not rented. */
  annualRentalIncome: Decimal | number;
  purchasePrice: Decimal | number;
  currentEstimate: Decimal | number;
  /** Interest cost on the linked mortgage for the period, 0 if unmortgaged. */
  annualMortgageInterest: Decimal | number;
  annualMaintenanceCost: Decimal | number;
  /** Cash actually invested (purchase price minus any linked mortgage principal). */
  equityInvested: Decimal | number;
}

/**
 * (rental income + appreciation - mortgage interest - maintenance) / equity invested.
 * Appreciation is currentEstimate - purchasePrice (unrealized, since currentEstimate
 * is a manual re-appraisal). Returns a percentage; 0 when no equity is invested
 * (avoids a divide-by-zero for a fully-owned-outright edge case that can't occur
 * in practice, but keeps the function total).
 */
export function calculateRealEstateRoi(input: RoiInput): number {
  const rentalIncome = new Decimal(input.annualRentalIncome);
  const purchasePrice = new Decimal(input.purchasePrice);
  const currentEstimate = new Decimal(input.currentEstimate);
  const mortgageInterest = new Decimal(input.annualMortgageInterest);
  const maintenance = new Decimal(input.annualMaintenanceCost);
  const equityInvested = new Decimal(input.equityInvested);

  const appreciation = currentEstimate.sub(purchasePrice);
  const numerator = rentalIncome.add(appreciation).sub(mortgageInterest).sub(maintenance);

  if (equityInvested.lte(0)) return 0;
  return numerator.div(equityInvested).mul(100).toNumber();
}
