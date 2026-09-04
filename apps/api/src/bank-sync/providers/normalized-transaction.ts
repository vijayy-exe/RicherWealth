/**
 * The common output contract every bank-sync source normalizes into —
 * Plaid, CSV import, PDF import, and (later) a paid India Account
 * Aggregator provider all produce this same shape. The rest of the app
 * (categorization, dedup, Transaction persistence) only ever deals with
 * this type, never with a provider's raw response — that's what makes the
 * Account Aggregator swap-in "without touching the rest of the app" real:
 * a new provider just needs to produce `NormalizedBankTransaction[]`.
 */
export interface NormalizedBankTransaction {
  date: Date;
  /** Signed: positive = credit/income, negative = debit/expense — matches how bank CSVs and Plaid both express amounts. */
  amount: number;
  merchant: string;
  description?: string;
  currencyCode: string;
  /** Stable provider-side ID, when the source has one (Plaid does; CSV/PDF statements don't). */
  externalId?: string;
}
