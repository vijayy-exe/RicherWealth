import { Injectable, Logger } from "@nestjs/common";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // WebAuthn ceremonies must complete within 5 minutes

/**
 * In-memory store for WebAuthn registration challenges, keyed by userId.
 * Mirrors the MemoryCacheService pattern used elsewhere in this app —
 * fine for a single-instance deployment; move to Redis if this API is
 * ever horizontally scaled.
 */
@Injectable()
export class PasskeyChallengeStore {
  private readonly store = new Map<string, { challenge: string; expiresAt: number }>();
  private readonly logger = new Logger(PasskeyChallengeStore.name);

  set(userId: string, challenge: string): void {
    this.store.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  }

  take(userId: string): string | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    this.store.delete(userId); // single-use — consumed on verification attempt
    if (Date.now() > entry.expiresAt) {
      this.logger.warn(`Expired passkey challenge for user ${userId}`);
      return null;
    }
    return entry.challenge;
  }
}
