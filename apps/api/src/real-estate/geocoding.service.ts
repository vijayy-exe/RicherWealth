import { Injectable, Logger } from "@nestjs/common";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import axios from "axios";

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

const CACHE_TTL_S = 60 * 60 * 24 * 30; // 30 days — addresses don't move
/** Nominatim's usage policy caps unauthenticated use at 1 request/second. */
const MIN_REQUEST_GAP_MS = 1100;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestAt = 0;

  constructor(private readonly memoryCache: MemoryCacheService) {}

  /** Geocodes a free-text address via Nominatim/OSM (free, no key — do not
   * substitute a paid provider). Returns null if the address can't be resolved. */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const trimmed = address.trim();
    if (!trimmed) return null;

    const cacheKey = `geocode:${trimmed.toLowerCase()}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) return JSON.parse(cached) as GeocodeResult;

    await this.throttle();

    try {
      const res = await axios.get<Array<{ lat: string; lon: string; display_name: string }>>(
        "https://nominatim.openstreetmap.org/search",
        {
          params: { q: trimmed, format: "json", limit: 1 },
          headers: { "User-Agent": "RicherWealth/1.0 (personal finance app; geocoding property addresses)" },
          timeout: 8000,
        },
      );

      const hit = res.data[0];
      if (!hit) {
        this.logger.warn(`Nominatim: no match for "${trimmed}"`);
        return null;
      }

      const result: GeocodeResult = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name };
      this.memoryCache.set(cacheKey, JSON.stringify(result), CACHE_TTL_S);
      return result;
    } catch (err) {
      this.logger.warn(`Nominatim geocode failed for "${trimmed}": ${String(err)}`);
      return null;
    }
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
}
