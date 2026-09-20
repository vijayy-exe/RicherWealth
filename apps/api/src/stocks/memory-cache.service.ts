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
    // Fix Audit S-01: this class never actually probes Redis -- it's an
    // unconditional in-memory cache used by ~15 services by design, not a
    // fallback that kicks in when Redis is down. The old message claimed
    // "Redis not available" even with Redis up and ten other services
    // logging a real connection in the same boot. .log, not .warn -- this
    // isn't a degraded state, it's how this service always works.
    this.logger.log("Using in-memory cache (by design, not Redis-backed). Values will not persist across restarts.");
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
