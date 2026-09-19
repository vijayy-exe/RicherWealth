/**
 * HouseholdAccessService unit tests — deterministic with mocked Prisma.
 * This is the direct proof for Phase 21's acceptance criterion: "a member
 * with VIEWER role cannot edit another member's private assets."
 */
import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { HouseholdAccessService } from "./household-access.service";
import { PrismaService } from "../prisma/prisma.service";

const mockPrisma = {
  householdMember: { findMany: jest.fn(), findUnique: jest.fn() },
};

describe("HouseholdAccessService", () => {
  let service: HouseholdAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HouseholdAccessService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(HouseholdAccessService);
    jest.clearAllMocks();
  });

  describe("assertCanEditResource", () => {
    it("allows a user to edit their own private (non-household) asset", async () => {
      await expect(service.assertCanEditResource("alice", "alice", null)).resolves.toBeUndefined();
    });

    it("rejects any user editing another member's PRIVATE asset — VIEWER role", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1", role: "VIEWER" }]);
      await expect(service.assertCanEditResource("bob", "alice", null)).rejects.toThrow(ForbiddenException);
    });

    it("rejects any user editing another member's PRIVATE asset — even an OWNER", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1", role: "OWNER" }]);
      await expect(service.assertCanEditResource("bob", "alice", null)).rejects.toThrow(ForbiddenException);
    });

    it("rejects a VIEWER editing a joint (household-owned) asset", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1", role: "VIEWER" }]);
      await expect(service.assertCanEditResource("bob", "alice", "hh1")).rejects.toThrow(ForbiddenException);
    });

    it("allows a MEMBER to edit a joint (household-owned) asset", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1", role: "MEMBER" }]);
      await expect(service.assertCanEditResource("bob", "alice", "hh1")).resolves.toBeUndefined();
    });

    it("allows an OWNER to edit a joint (household-owned) asset", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1", role: "OWNER" }]);
      await expect(service.assertCanEditResource("bob", "alice", "hh1")).resolves.toBeUndefined();
    });

    it("rejects a non-member entirely from editing a joint asset of a household they don't belong to", async () => {
      mockPrisma.householdMember.findMany.mockResolvedValue([]);
      await expect(service.assertCanEditResource("stranger", "alice", "hh1")).rejects.toThrow(ForbiddenException);
    });
  });

  describe("assertCanView / shareHousehold", () => {
    it("allows viewing your own data with no household query needed", async () => {
      await expect(service.assertCanView("alice", "alice")).resolves.toBeUndefined();
    });

    it("allows a VIEWER to view another member's individual data", async () => {
      mockPrisma.householdMember.findMany
        .mockResolvedValueOnce([{ householdId: "hh1" }]) // actor's households
        .mockResolvedValueOnce([{ householdId: "hh1" }]); // target's households
      await expect(service.assertCanView("bob", "alice")).resolves.toBeUndefined();
    });

    it("rejects viewing when actor and target share no household", async () => {
      mockPrisma.householdMember.findMany
        .mockResolvedValueOnce([{ householdId: "hh1" }])
        .mockResolvedValueOnce([{ householdId: "hh2" }]);
      await expect(service.assertCanView("bob", "alice")).rejects.toThrow(ForbiddenException);
    });
  });

  describe("assertIsOwner", () => {
    it("allows an OWNER", async () => {
      mockPrisma.householdMember.findUnique.mockResolvedValue({ role: "OWNER" });
      await expect(service.assertIsOwner("alice", "hh1")).resolves.toBeUndefined();
    });

    it("rejects a MEMBER", async () => {
      mockPrisma.householdMember.findUnique.mockResolvedValue({ role: "MEMBER" });
      await expect(service.assertIsOwner("bob", "hh1")).rejects.toThrow(ForbiddenException);
    });

    it("rejects a non-member", async () => {
      mockPrisma.householdMember.findUnique.mockResolvedValue(null);
      await expect(service.assertIsOwner("stranger", "hh1")).rejects.toThrow(ForbiddenException);
    });
  });
});
