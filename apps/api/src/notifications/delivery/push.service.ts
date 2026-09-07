import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Real firebase-admin integration — but no FIREBASE_* credentials exist in
 * this dev environment (confirmed: none in .env/.env.example before this
 * phase), so every send here logs a clear warning and returns false. The
 * code path itself (token lookup → admin.messaging().sendEachForMulticast)
 * is real and correct; what's genuinely unverifiable without a real
 * Firebase project is whether a notification actually reaches a device —
 * documented as such in STATUS.md rather than claimed as seen.
 */
@Injectable()
export class NotificationPushService {
  private readonly logger = new Logger(NotificationPushService.name);
  private app: App | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
    const clientEmail = this.config.get<string>("FIREBASE_CLIENT_EMAIL");
    const privateKey = this.config.get<string>("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      this.app = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      this.logger.warn("FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY not configured — push notifications will be skipped, not faked.");
    }
  }

  async registerToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token },
      update: { userId },
    });
  }

  /** Returns true only if Firebase actually accepted at least one delivery. */
  async send(userId: string, title: string, body: string): Promise<boolean> {
    if (!this.app) return false;

    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) {
      this.logger.debug(`No registered push tokens for user ${userId} — nothing to send.`);
      return false;
    }

    try {
      const result = await getMessaging(this.app).sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title, body },
      });
      if (result.successCount === 0) {
        this.logger.warn(`FCM accepted 0/${tokens.length} sends for user ${userId}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`FCM send failed: ${String(err)}`);
      return false;
    }
  }
}
