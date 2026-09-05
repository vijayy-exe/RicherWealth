import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationType } from "@prisma/client";

export interface ChannelPreference {
  alertType: NotificationType;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export interface QuietHoursDto {
  start: string | null;
  end: string | null;
  timezone: string;
}

/** A user with no NotificationPreference row for a type gets this — in-app
 * on by default (it's the low-friction channel), push/email opt-in only. */
const DEFAULT_PREFERENCE = { inAppEnabled: true, pushEnabled: false, emailEnabled: false };

const ALL_TYPES: NotificationType[] = [
  "MARKET_CRASH",
  "DIVIDEND_RECEIVED",
  "LOAN_DUE",
  "SIP_DUE",
  "STOCK_PRICE_ALERT",
  "CRYPTO_PRICE_ALERT",
  "PROPERTY_PRICE_CHANGE",
];

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<ChannelPreference[]> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(rows.map((r) => [r.alertType, r]));
    return ALL_TYPES.map((alertType) => {
      const row = byType.get(alertType);
      return row
        ? { alertType, inAppEnabled: row.inAppEnabled, pushEnabled: row.pushEnabled, emailEnabled: row.emailEnabled }
        : { alertType, ...DEFAULT_PREFERENCE };
    });
  }

  /** Used by the dispatch service — same defaulting logic as listForUser, single-type. */
  async getEffective(userId: string, alertType: NotificationType): Promise<typeof DEFAULT_PREFERENCE> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_alertType: { userId, alertType } },
    });
    return row
      ? { inAppEnabled: row.inAppEnabled, pushEnabled: row.pushEnabled, emailEnabled: row.emailEnabled }
      : DEFAULT_PREFERENCE;
  }

  async upsert(userId: string, pref: ChannelPreference): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { userId_alertType: { userId, alertType: pref.alertType } },
      create: { userId, ...pref },
      update: {
        inAppEnabled: pref.inAppEnabled,
        pushEnabled: pref.pushEnabled,
        emailEnabled: pref.emailEnabled,
      },
    });
  }

  async getQuietHours(userId: string): Promise<QuietHoursDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notifyQuietHoursStart: true, notifyQuietHoursEnd: true, notifyQuietHoursTimezone: true },
    });
    return {
      start: user.notifyQuietHoursStart,
      end: user.notifyQuietHoursEnd,
      timezone: user.notifyQuietHoursTimezone,
    };
  }

  async setQuietHours(userId: string, dto: QuietHoursDto): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        notifyQuietHoursStart: dto.start,
        notifyQuietHoursEnd: dto.end,
        notifyQuietHoursTimezone: dto.timezone || "UTC",
      },
    });
  }
}
