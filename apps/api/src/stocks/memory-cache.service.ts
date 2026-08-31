import { Injectable, Logger } from "@nestjs/common";

/**
 * A simple in-memory fallback cache for when Redis is unavailable.
 * TTL is respected via setTimeout / stored expiry timestamps.
 */
@Injectable()
export class MemoryCacheService {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly logger = new Logger(MemoryCacheService.name);

  constructor() {
    this.logger.warn("Using in-memory cache (Redis not available). Prices will not persist across restarts.");
  }

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  del(key: string): void {
    this.store.delete(key);
  }
}
