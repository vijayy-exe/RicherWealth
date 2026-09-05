import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { IpoListingDto } from "@richer/shared-types";
import type { IpoStatus } from "@prisma/client";

export interface CreateIpoListingDto {
  companyName: string;
  exchange: string;
  expectedDate?: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
  currency?: string;
  status?: IpoStatus;
  notes?: string;
}

/**
 * Manual-entry IPO calendar (see rbi-rate.service.ts's comment style for
 * why: no free, reliable, global IPO-calendar API was found). Any
 * authenticated user may add an entry — this app has no admin-role system
 * yet, so "admin-style create" means "authenticated create", listed
 * globally for everyone (consistent with how curated reference data, not
 * personal data, is meant to work here).
 */
@Injectable()
export class IpoListingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<IpoListingDto[]> {
    const rows = await this.prisma.ipoListing.findMany({
      orderBy: [{ expectedDate: "asc" }, { createdAt: "desc" }],
    });
    return rows.map(toDto);
  }

  async create(userId: string, dto: CreateIpoListingDto): Promise<IpoListingDto> {
    const row = await this.prisma.ipoListing.create({
      data: {
        companyName: dto.companyName,
        exchange: dto.exchange,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        priceRangeMin: dto.priceRangeMin ?? null,
        priceRangeMax: dto.priceRangeMax ?? null,
        currency: dto.currency ?? "USD",
        status: dto.status ?? "UPCOMING",
        notes: dto.notes ?? null,
        createdByUserId: userId,
      },
    });
    return toDto(row);
  }
}

function toDto(row: {
  id: string; companyName: string; exchange: string; expectedDate: Date | null;
  priceRangeMin: unknown; priceRangeMax: unknown; currency: string; status: string;
  notes: string | null; createdAt: Date;
}): IpoListingDto {
  return {
    id: row.id,
    companyName: row.companyName,
    exchange: row.exchange,
    expectedDate: row.expectedDate ? row.expectedDate.toISOString().slice(0, 10) : null,
    priceRangeMin: row.priceRangeMin !== null ? Number(row.priceRangeMin) : null,
    priceRangeMax: row.priceRangeMax !== null ? Number(row.priceRangeMax) : null,
    currency: row.currency,
    status: row.status as IpoListingDto["status"],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
