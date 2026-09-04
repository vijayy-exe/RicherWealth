import { detectSubscriptions, type SubscriptionCandidateInput } from "./subscription-detector";

const d = (s: string) => new Date(s);

describe("detectSubscriptions", () => {
  it("flags a synthetic recurring same-merchant/same-amount monthly charge", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: "NETFLIX.COM", amount: -15.49, currencyCode: "USD", date: d("2026-06-05") },
      { id: "2", merchant: "NETFLIX.COM", amount: -15.49, currencyCode: "USD", date: d("2026-07-05") },
      { id: "3", merchant: "NETFLIX.COM", amount: -15.49, currencyCode: "USD", date: d("2026-08-05") },
      // Unrelated one-off transactions that should NOT be flagged.
      { id: "4", merchant: "STARBUCKS", amount: -5.75, currencyCode: "USD", date: d("2026-06-10") },
      { id: "5", merchant: "AMAZON.COM", amount: -89.99, currencyCode: "USD", date: d("2026-07-22") },
    ];

    const result = detectSubscriptions(transactions);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      merchant: "NETFLIX.COM",
      amount: -15.49,
      occurrences: 3,
      estimatedFrequency: "MONTHLY",
    });
    expect(result[0]?.transactionIds).toEqual(["1", "2", "3"]);
  });

  it("does not flag two unrelated same-amount purchases with no periodicity evidence", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: "RANDOM SHOP", amount: -20, currencyCode: "USD", date: d("2026-01-03") },
      { id: "2", merchant: "RANDOM SHOP", amount: -20, currencyCode: "USD", date: d("2026-01-17") }, // 14-day gap, not close to any known cycle within tolerance, only 2 occurrences
    ];

    expect(detectSubscriptions(transactions)).toHaveLength(0);
  });

  it("flags a weekly subscription off just two occurrences", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: "MEAL KIT CO", amount: -42, currencyCode: "USD", date: d("2026-01-01") },
      { id: "2", merchant: "MEAL KIT CO", amount: -42, currencyCode: "USD", date: d("2026-01-08") },
    ];

    const result = detectSubscriptions(transactions);
    expect(result).toHaveLength(1);
    expect(result[0]?.estimatedFrequency).toBe("WEEKLY");
  });

  it("flags an irregular-but-repeated (3+) charge even off a known cycle", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: "GYM CLUB", amount: -60, currencyCode: "USD", date: d("2026-01-01") },
      { id: "2", merchant: "GYM CLUB", amount: -60, currencyCode: "USD", date: d("2026-01-20") },
      { id: "3", merchant: "GYM CLUB", amount: -60, currencyCode: "USD", date: d("2026-02-15") },
    ];

    const result = detectSubscriptions(transactions);
    expect(result).toHaveLength(1);
    expect(result[0]?.occurrences).toBe(3);
  });

  it("does not group transactions with the same merchant but a different amount", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: "NETFLIX.COM", amount: -15.49, currencyCode: "USD", date: d("2026-06-05") },
      { id: "2", merchant: "NETFLIX.COM", amount: -19.99, currencyCode: "USD", date: d("2026-07-05") }, // plan upgrade — different amount
    ];

    expect(detectSubscriptions(transactions)).toHaveLength(0);
  });

  it("ignores transactions with a null merchant", () => {
    const transactions: SubscriptionCandidateInput[] = [
      { id: "1", merchant: null, amount: -15.49, currencyCode: "USD", date: d("2026-06-05") },
      { id: "2", merchant: null, amount: -15.49, currencyCode: "USD", date: d("2026-07-05") },
    ];

    expect(detectSubscriptions(transactions)).toHaveLength(0);
  });
});
