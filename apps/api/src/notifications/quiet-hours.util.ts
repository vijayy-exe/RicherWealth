/**
 * Quiet hours only gate push/email — in-app notifications are never
 * suppressed (see the `notifyQuietHours*` fields on User). Pure function,
 * no Prisma/Date-library dependency, so it's directly unit-testable: takes
 * an explicit `now` rather than reading the clock itself.
 */
export interface QuietHoursConfig {
  start: string | null; // "HH:mm", 24h, local to `timezone`
  end: string | null; // "HH:mm" — may wrap past midnight (e.g. 22:00 → 07:00)
  timezone: string; // IANA name, e.g. "Asia/Kolkata"
}

function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Current local minutes-since-midnight in `timezone`, derived from `now`. */
function localMinutesOfDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isWithinQuietHours(config: QuietHoursConfig, now: Date = new Date()): boolean {
  if (!config.start || !config.end) return false;

  const startMin = parseHHmm(config.start);
  const endMin = parseHHmm(config.end);
  const nowMin = localMinutesOfDay(now, config.timezone);

  if (startMin === endMin) return false; // degenerate config — treat as "off"

  if (startMin < endMin) {
    // Same-day window, e.g. 13:00 → 18:00
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps past midnight, e.g. 22:00 → 07:00
  return nowMin >= startMin || nowMin < endMin;
}
