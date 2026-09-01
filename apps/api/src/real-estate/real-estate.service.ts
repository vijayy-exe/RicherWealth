import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { GeocodingService } from "./geocoding.service";
import { calculateRealEstateRoi } from "./real-estate-roi";
import type { RealEstateSubType } from "@prisma/client";
import Decimal from "decimal.js";

export interface CreateRealEstateDto {
  subType: RealEstateSubType;
  name: string;
  addressLine?: string;
  purchasePrice: number;
  purchaseDate?: string;
  currentEstimate: number;
  lastAppraisalDate?: string;
  monthlyRentalIncome?: number;
  annualMaintenanceCost?: number;
  areaValue?: number;
  areaUnit?: string;
  photos?: string[];
  linkedLiabilityId?: string;
  currency: string;
}

export interface UpdateRealEstateDto extends Partial<CreateRealEstateDto> {}

export interface RealEstateRoiBreakdown {
  annualRentalIncome: number;
  appreciation: number;
  annualMortgageInterest: number;
  annualMaintenanceCost: number;
  equityInvested: number;
  roiPct: number;
}

export interface RealEstateRow {
  id: string; // Asset ID
  detailId: string;
  subType: RealEstateSubType;
  name: string;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  purchasePrice: number;
  purchaseDate: string | null;
  currentEstimate: number;
  lastAppraisalDate: string | null;
  monthlyRentalIncome: number | null;
  annualMaintenanceCost: number | null;
  areaValue: number | null;
  areaUnit: string | null;
  photos: string[];
  currency: string;
  linkedLiability: { id: string; name: string; interestRate: number; remainingBalance: number; principalAmount: number } | null;
  roi: RealEstateRoiBreakdown;
}

@Injectable()
export class RealEstateService {
  private readonly logger = new Logger(RealEstateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly geocoding: GeocodingService,
  ) {}

  async createProperty(userId: string, dto: CreateRealEstateDto): Promise<RealEstateRow> {
    if (dto.linkedLiabilityId) await this.assertLiabilityOwned(userId, dto.linkedLiabilityId);

    const geo = dto.addressLine ? await this.geocoding.geocode(dto.addressLine) : null;

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "REAL_ESTATE",
          name: dto.name,
          currentValue: dto.currentEstimate.toFixed(6),
          currencyCode: dto.currency,
          details: { subType: dto.subType, addressLine: dto.addressLine ?? null },
        },
      });

      await tx.realEstateDetail.create({
        data: {
          assetId: asset.id,
          userId,
          subType: dto.subType,
          addressLine: dto.addressLine ?? null,
          lat: geo?.lat.toString() ?? null,
          lng: geo?.lng.toString() ?? null,
          purchasePrice: dto.purchasePrice.toString(),
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          currentEstimate: dto.currentEstimate.toString(),
          lastAppraisalDate: dto.lastAppraisalDate ? new Date(dto.lastAppraisalDate) : new Date(),
          monthlyRentalIncome: dto.monthlyRentalIncome?.toString() ?? null,
          annualMaintenanceCost: dto.annualMaintenanceCost?.toString() ?? null,
          areaValue: dto.areaValue?.toString() ?? null,
          areaUnit: dto.areaUnit ?? null,
          photos: dto.photos ?? [],
          linkedLiabilityId: dto.linkedLiabilityId ?? null,
          currency: dto.currency,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildRow(asset.id);
  }

  async listProperties(userId: string): Promise<RealEstateRow[]> {
    const details = await this.prisma.realEstateDetail.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(details.map((d) => this.buildRow(d.assetId)));
  }

  async getProperty(userId: string, assetId: string): Promise<RealEstateRow> {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new NotFoundException("Property not found");
    return this.buildRow(assetId);
  }

  async updateProperty(userId: string, assetId: string, dto: UpdateRealEstateDto): Promise<RealEstateRow> {
    const detail = await this.prisma.realEstateDetail.findUnique({ where: { assetId } });
    if (!detail || detail.userId !== userId) throw new NotFoundException("Property not found");
    if (dto.linkedLiabilityId) await this.assertLiabilityOwned(userId, dto.linkedLiabilityId);

    const addressChanged = dto.addressLine !== undefined && dto.addressLine !== detail.addressLine;
    const geo = addressChanged && dto.addressLine ? await this.geocoding.geocode(dto.addressLine) : null;

    await this.prisma.realEstateDetail.update({
      where: { assetId },
      data: {
        ...(dto.subType !== undefined && { subType: dto.subType }),
        ...(dto.addressLine !== undefined && { addressLine: dto.addressLine }),
        ...(addressChanged && { lat: geo?.lat.toString() ?? null, lng: geo?.lng.toString() ?? null }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice.toString() }),
        ...(dto.purchaseDate !== undefined && { purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null }),
        ...(dto.currentEstimate !== undefined && { currentEstimate: dto.currentEstimate.toString() }),
        ...(dto.lastAppraisalDate !== undefined && { lastAppraisalDate: dto.lastAppraisalDate ? new Date(dto.lastAppraisalDate) : null }),
        ...(dto.monthlyRentalIncome !== undefined && { monthlyRentalIncome: dto.monthlyRentalIncome?.toString() ?? null }),
        ...(dto.annualMaintenanceCost !== undefined && { annualMaintenanceCost: dto.annualMaintenanceCost?.toString() ?? null }),
        ...(dto.areaValue !== undefined && { areaValue: dto.areaValue?.toString() ?? null }),
        ...(dto.areaUnit !== undefined && { areaUnit: dto.areaUnit }),
        ...(dto.photos !== undefined && { photos: dto.photos }),
        ...(dto.linkedLiabilityId !== undefined && { linkedLiabilityId: dto.linkedLiabilityId }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });

    if (dto.currentEstimate !== undefined || dto.currency !== undefined) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          ...(dto.currentEstimate !== undefined && { currentValue: dto.currentEstimate.toFixed(6) }),
          ...(dto.currency !== undefined && { currencyCode: dto.currency }),
        },
      });
    }

    await this.netWorth.writeSnapshot(userId);
    return this.buildRow(assetId);
  }

  async deleteProperty(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new NotFoundException("Property not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
    await this.netWorth.writeSnapshot(userId);
  }

  private async assertLiabilityOwned(userId: string, liabilityId: string): Promise<void> {
    const liability = await this.prisma.liability.findUnique({ where: { id: liabilityId } });
    if (!liability || liability.deletedAt) throw new NotFoundException("Linked liability not found");
    if (liability.userId !== userId) throw new ForbiddenException("Access denied");
  }

  private async buildRow(assetId: string): Promise<RealEstateRow> {
    const detail = await this.prisma.realEstateDetail.findUnique({
      where: { assetId },
      include: { liability: true },
    });
    if (!detail) throw new NotFoundException("Property not found");
    const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { name: true } });

    const purchasePrice = parseFloat(detail.purchasePrice.toString());
    const currentEstimate = parseFloat(detail.currentEstimate.toString());
    const annualRentalIncome = detail.monthlyRentalIncome ? parseFloat(detail.monthlyRentalIncome.toString()) * 12 : 0;
    const annualMaintenanceCost = detail.annualMaintenanceCost ? parseFloat(detail.annualMaintenanceCost.toString()) : 0;

    const liability = detail.liability;
    const principalAmount = liability ? parseFloat(liability.principalAmount.toString()) : 0;
    const remainingBalance = liability ? parseFloat(liability.remainingBalance.toString()) : 0;
    const interestRate = liability ? parseFloat(liability.interestRate.toString()) : 0;
    const annualMortgageInterest = liability ? new Decimal(remainingBalance).mul(interestRate).div(100).toNumber() : 0;
    const equityInvested = liability ? purchasePrice - principalAmount : purchasePrice;

    const roiPct = calculateRealEstateRoi({
      annualRentalIncome,
      purchasePrice,
      currentEstimate,
      annualMortgageInterest,
      annualMaintenanceCost,
      equityInvested,
    });

    return {
      id: detail.assetId,
      detailId: detail.id,
      subType: detail.subType,
      name: asset.name,
      addressLine: detail.addressLine,
      lat: detail.lat ? parseFloat(detail.lat.toString()) : null,
      lng: detail.lng ? parseFloat(detail.lng.toString()) : null,
      purchasePrice,
      purchaseDate: detail.purchaseDate?.toISOString().slice(0, 10) ?? null,
      currentEstimate,
      lastAppraisalDate: detail.lastAppraisalDate?.toISOString().slice(0, 10) ?? null,
      monthlyRentalIncome: detail.monthlyRentalIncome ? parseFloat(detail.monthlyRentalIncome.toString()) : null,
      annualMaintenanceCost: detail.annualMaintenanceCost ? parseFloat(detail.annualMaintenanceCost.toString()) : null,
      areaValue: detail.areaValue ? parseFloat(detail.areaValue.toString()) : null,
      areaUnit: detail.areaUnit,
      photos: (detail.photos as string[]) ?? [],
      currency: detail.currency,
      linkedLiability: liability ? { id: liability.id, name: liability.name, interestRate, remainingBalance, principalAmount } : null,
      roi: {
        annualRentalIncome,
        appreciation: currentEstimate - purchasePrice,
        annualMortgageInterest,
        annualMaintenanceCost,
        equityInvested,
        roiPct,
      },
    };
  }
}
