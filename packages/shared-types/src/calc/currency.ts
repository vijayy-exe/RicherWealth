/**
 * Currency-conversion math — deliberately trivial. The actual exchange RATE
 * is never computed here: it comes from the existing Phase 7 CurrencyService
 * (Frankfurter.app / open.er-api.com, Redis-cached), fetched by the frontend
 * via a small backend endpoint (GET /api/calculators/fx-rate). This function
 * exists only so the multiplication step itself is one shared, tested
 * function rather than copy-pasted `amount * rate` in a component.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function convertCurrency(amount: number, rate: number): number {
  return round2(amount * rate);
}
