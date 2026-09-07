import { inferSipCadence, isSipApproaching } from "./sip-cadence.util";

describe("inferSipCadence", () => {
  it("returns null with fewer than 2 installments — never guesses a schedule", () => {
    expect(inferSipCadence([])).toBeNull();
    expect(inferSipCadence([new Date("2026-08-01")])).toBeNull();
  });

  it("infers a ~30 day monthly cadence from clearly monthly-spaced installments", () => {
    const datesDesc = [
      new Date("2026-08-05"),
      new Date("2026-07-05"),
      new Date("2026-06-05"),
      new Date("2026-05-05"),
    ];
    const result = inferSipCadence(datesDesc);
    expect(result).not.toBeNull();
    expect(result!.inferredCadenceDays).toBeGreaterThanOrEqual(28);
    expect(result!.inferredCadenceDays).toBeLessThanOrEqual(31);
    expect(result!.lastInstallmentDate).toEqual(new Date("2026-08-05"));
  });

  it("expected next date is last installment + inferred cadence", () => {
    const result = inferSipCadence([new Date("2026-08-05"), new Date("2026-07-06")]); // 30-day gap
    expect(result!.inferredCadenceDays).toBe(30);
    expect(result!.expectedNextDate.toISOString().slice(0, 10)).toBe("2026-09-04");
  });
});

describe("isSipApproaching", () => {
  it("flags a next date within the -1..+3 day window", () => {
    const now = new Date("2026-09-04T00:00:00Z");
    expect(isSipApproaching({ inferredCadenceDays: 30, lastInstallmentDate: now, expectedNextDate: new Date("2026-09-06") }, now)).toBe(true);
    expect(isSipApproaching({ inferredCadenceDays: 30, lastInstallmentDate: now, expectedNextDate: new Date("2026-09-03") }, now)).toBe(true); // 1 day overdue, still "approaching"
  });

  it("does not flag a date far in the future or long overdue", () => {
    const now = new Date("2026-09-04T00:00:00Z");
    expect(isSipApproaching({ inferredCadenceDays: 30, lastInstallmentDate: now, expectedNextDate: new Date("2026-09-20") }, now)).toBe(false);
    expect(isSipApproaching({ inferredCadenceDays: 30, lastInstallmentDate: now, expectedNextDate: new Date("2026-08-20") }, now)).toBe(false);
  });
});
