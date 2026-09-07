import { isWithinQuietHours } from "./quiet-hours.util";

describe("isWithinQuietHours", () => {
  it("returns false when either bound is unset", () => {
    expect(isWithinQuietHours({ start: null, end: "07:00", timezone: "UTC" })).toBe(false);
    expect(isWithinQuietHours({ start: "22:00", end: null, timezone: "UTC" })).toBe(false);
  });

  it("same-day window: inside vs outside", () => {
    const config = { start: "13:00", end: "18:00", timezone: "UTC" };
    expect(isWithinQuietHours(config, new Date("2026-09-05T15:00:00Z"))).toBe(true);
    expect(isWithinQuietHours(config, new Date("2026-09-05T20:00:00Z"))).toBe(false);
    expect(isWithinQuietHours(config, new Date("2026-09-05T13:00:00Z"))).toBe(true); // inclusive start
    expect(isWithinQuietHours(config, new Date("2026-09-05T18:00:00Z"))).toBe(false); // exclusive end
  });

  it("wraps past midnight: 22:00 -> 07:00", () => {
    const config = { start: "22:00", end: "07:00", timezone: "UTC" };
    expect(isWithinQuietHours(config, new Date("2026-09-05T23:30:00Z"))).toBe(true);
    expect(isWithinQuietHours(config, new Date("2026-09-05T03:00:00Z"))).toBe(true);
    expect(isWithinQuietHours(config, new Date("2026-09-05T12:00:00Z"))).toBe(false);
  });

  it("honors a non-UTC timezone", () => {
    // 03:30 IST == 22:00 UTC the previous day
    const config = { start: "22:00", end: "07:00", timezone: "Asia/Kolkata" };
    expect(isWithinQuietHours(config, new Date("2026-09-05T22:00:00Z"))).toBe(true); // 03:30 IST next day
    expect(isWithinQuietHours(config, new Date("2026-09-05T10:00:00Z"))).toBe(false); // 15:30 IST — daytime
  });

  it("degenerate config (start === end) is treated as off", () => {
    expect(isWithinQuietHours({ start: "09:00", end: "09:00", timezone: "UTC" })).toBe(false);
  });
});
