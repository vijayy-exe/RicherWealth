/**
 * Shared currency formatter for components that display a monetary value
 * in the user's/asset's own real currency (baseCurrency, property.currency,
 * etc.) via `Intl.NumberFormat` — NOT hardcoded to INR.
 *
 * Extracted from `apps/web/src/app/(app)/wealth/time-machine/page.tsx`'s
 * already-correct implementation (Fix Audit B-01) so every chart/component
 * that needs this reuses one function instead of each carrying its own
 * copy — several of which had silently drifted into unconditionally
 * rupee-formatting real account data regardless of the account's actual
 * currency (see `RicherWealth_Fix_Audit_Implementation_Plan.md`, B-01).
 *
 * Deliberately NOT the same function as
 * `apps/web/src/lib/calculators/format.ts`'s `formatCurrency` — that one is
 * India-focused by design for the standalone financial calculators (EMI,
 * mortgage, etc., which are not tied to any specific account's
 * baseCurrency) and is out of this fix's scope.
 */
export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
