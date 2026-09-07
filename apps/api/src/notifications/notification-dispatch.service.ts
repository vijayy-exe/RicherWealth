import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationPushService } from "./delivery/push.service";
import { NotificationEmailService } from "./delivery/email.service";
import { isWithinQuietHours } from "./quiet-hours.util";
import type { NotificationType } from "@prisma/client";

export interface NotifyOnceParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Identifies the real-world thing this alert is about (an alert id, a
   * liability id, an income row id, a ticker...) — combined with
   * `triggerBucket`, this is the idempotency key. */
  sourceEntityId: string;
  /** "ONCE" for one-shot alerts, or a bucket like a yyyy-mm-dd date for
   * alerts that may legitimately re-fire on a later day. */
  triggerBucket: string;
}

type ChannelOutcome = "SENT" | "SKIPPED_BY_PREFERENCE" | "SKIPPED_QUIET_HOURS" | "FAILED_NO_CREDENTIALS";

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

/**
 * The single write path for every alert evaluator. `notifyOnce` is the
 * whole idempotency contract: the DB's unique constraint on
 * (userId, type, sourceEntityId, triggerBucket) is the actual guard — this
 * method attempts the insert and treats a P2002 conflict as "already
 * notified, nothing to do," so calling it twice for the same event (two
 * overlapping job runs, a retried job, etc.) can never deliver twice.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferenceService,
    private readonly push: NotificationPushService,
    private readonly email: NotificationEmailService,
  ) {}

  async notifyOnce(params: NotifyOnceParams): Promise<{ created: boolean; notificationId?: string }> {
    let notificationId: string;
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          data: (params.data ?? {}) as never,
          sourceEntityId: params.sourceEntityId,
          triggerBucket: params.triggerBucket,
          deliveryResult: {},
        },
      });
      notificationId = notification.id;
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return { created: false };
      }
      throw err;
    }

    const deliveryResult = await this.deliverAcrossChannels(params);
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryResult: deliveryResult as never },
    });

    return { created: true, notificationId };
  }

  private async deliverAcrossChannels(params: NotifyOnceParams): Promise<Record<string, ChannelOutcome>> {
    const [pref, user] = await Promise.all([
      this.preferences.getEffective(params.userId, params.type),
      this.prisma.user.findUniqueOrThrow({
        where: { id: params.userId },
        select: { email: true, notifyQuietHoursStart: true, notifyQuietHoursEnd: true, notifyQuietHoursTimezone: true },
      }),
    ]);

    const quiet = isWithinQuietHours({
      start: user.notifyQuietHoursStart,
      end: user.notifyQuietHoursEnd,
      timezone: user.notifyQuietHoursTimezone,
    });

    const result: Record<string, ChannelOutcome> = {
      // In-app is never quiet-houred — it's not interruptive, it just sits
      // in the bell. Preference still gates it (a user can turn a type off
      // entirely).
      IN_APP: pref.inAppEnabled ? "SENT" : "SKIPPED_BY_PREFERENCE",
    };

    if (!pref.pushEnabled) {
      result["PUSH"] = "SKIPPED_BY_PREFERENCE";
    } else if (quiet) {
      result["PUSH"] = "SKIPPED_QUIET_HOURS";
    } else {
      const sent = await this.push.send(params.userId, params.title, params.body);
      result["PUSH"] = sent ? "SENT" : "FAILED_NO_CREDENTIALS";
    }

    if (!pref.emailEnabled) {
      result["EMAIL"] = "SKIPPED_BY_PREFERENCE";
    } else if (quiet) {
      result["EMAIL"] = "SKIPPED_QUIET_HOURS";
    } else {
      const sent = await this.email.send(user.email, params.title, params.body);
      result["EMAIL"] = sent ? "SENT" : "FAILED_NO_CREDENTIALS";
    }

    this.logger.debug(`Delivery for ${params.type}/${params.sourceEntityId}: ${JSON.stringify(result)}`);
    return result;
  }
}
