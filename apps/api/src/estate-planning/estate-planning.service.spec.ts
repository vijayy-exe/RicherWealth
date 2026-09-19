/**
 * EstatePlanningService unit tests — deterministic with mocked Prisma.
 * Covers acceptance criterion 3: "estate-planning checklist correctly
 * flags assets missing a nominee", plus beneficiary allocation validation.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EstatePlanningService } from "./estate-planning.service";
import { PrismaService } from "../prisma/prisma.service";
import { HouseholdAccessService } from "../household/household-access.service";
import { AuditService } from "../audit/audit.service";

const dec = (v: string) => ({ toString: () => v });

const mockPrisma = {
  asset: { findUnique: jest.fn(), findMany: jest.fn() },
  estateBeneficiary: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  assetTransferChecklist: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};

const mockAccess = {
  householdIdsFor: jest.fn(),
  assertCanEditResource: jest.fn(),
};

const mockAudit = { log: jest.fn() };

describe("EstatePlanningService", () => {
  let service: EstatePlanningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstatePlanningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HouseholdAccessService, useValue: mockAccess },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(EstatePlanningService);
    jest.clearAllMocks();
  });

  describe("getMissingNomineeChecklist", () => {
    it("returns only assets with nomineeName null, tagging joint assets", async () => {
      mockAccess.householdIdsFor.mockResolvedValue(["hh1"]);
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: "a1", name: "Family Home", type: "REAL_ESTATE", currentValue: dec("500000"), currencyCode: "USD",
          userId: "alice", householdId: "hh1", user: { name: "Alice" },
        },
        {
          id: "a2", name: "Personal Savings", type: "CASH", currentValue: dec("10000"), currencyCode: "USD",
          userId: "bob", householdId: null, user: { name: "Bob" },
        },
      ]);

      const result = await service.getMissingNomineeChecklist("bob");

      expect(result).toHaveLength(2);
      expect(result[0]?.isJoint).toBe(true);
      expect(result[1]?.isJoint).toBe(false);
      // Confirms the query actually filtered nomineeName: null — asserted via call args.
      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ nomineeName: null }) }),
      );
    });

    it("returns an empty list when every asset already has a nominee (query-level guarantee)", async () => {
      mockAccess.householdIdsFor.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue([]); // the nomineeName:null filter would exclude them at the DB level
      const result = await service.getMissingNomineeChecklist("bob");
      expect(result).toEqual([]);
    });
  });

  describe("beneficiary allocation validation", () => {
    const ASSET = { id: "a1", userId: "alice", householdId: null, deletedAt: null };

    it("allows a beneficiary allocation that fits within 100%", async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(ASSET);
      mockAccess.assertCanEditResource.mockResolvedValue(undefined);
      mockPrisma.estateBeneficiary.findMany.mockResolvedValue([{ allocationPercent: dec("40") }]);
      mockPrisma.estateBeneficiary.create.mockResolvedValue({
        id: "b1", assetId: "a1", beneficiaryName: "Son", relationship: "Child",
        allocationPercent: dec("50"), trustName: null, notes: null, createdAt: new Date(),
      });

      await expect(
        service.addBeneficiary("alice", "a1", { beneficiaryName: "Son", relationship: "Child", allocationPercent: 50 }),
      ).resolves.toMatchObject({ allocationPercent: 50 });
    });

    it("rejects a beneficiary allocation that would push the asset's total over 100%", async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(ASSET);
      mockAccess.assertCanEditResource.mockResolvedValue(undefined);
      mockPrisma.estateBeneficiary.findMany.mockResolvedValue([{ allocationPercent: dec("70") }]);

      await expect(
        service.addBeneficiary("alice", "a1", { beneficiaryName: "Son", relationship: "Child", allocationPercent: 50 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.estateBeneficiary.create).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for a deleted/missing asset", async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);
      await expect(
        service.addBeneficiary("alice", "missing", { beneficiaryName: "Son", relationship: "Child", allocationPercent: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("transfer checklist", () => {
    it("auto-seeds the standard step list on first access", async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: "a1", userId: "alice", householdId: null, deletedAt: null });
      mockPrisma.assetTransferChecklist.findUnique.mockResolvedValue(null);
      mockPrisma.assetTransferChecklist.create.mockImplementation(({ data }: { data: { assetId: string; steps: unknown } }) =>
        Promise.resolve({ id: "c1", assetId: data.assetId, steps: data.steps, updatedAt: new Date() }),
      );

      const checklist = await service.getOrCreateTransferChecklist("alice", "a1");

      expect(checklist.steps.length).toBeGreaterThan(0);
      expect(checklist.steps.every((s) => s.completed === false)).toBe(true);
    });
  });
});
