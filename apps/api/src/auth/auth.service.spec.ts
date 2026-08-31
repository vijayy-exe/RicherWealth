import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";

import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

// Mock PrismaService
const mockPrisma = {
  user: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  passkey: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    };
    return map[key] ?? null;
  }),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ─── syncUser ─────────────────────────────────────────────────────────────

  describe("syncUser", () => {
    it("upserts user with supabaseId and email", async () => {
      const mockUser = {
        id: "cld_1",
        supabaseId: "supa_123",
        email: "test@example.com",
        name: "Test User",
        householdMemberships: [],
      };
      mockPrisma.user.upsert.mockResolvedValue(mockUser);

      const result = await service.syncUser({
        supabaseId: "supa_123",
        email: "test@example.com",
        name: "Test User",
      });

      expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { supabaseId: "supa_123" },
          create: expect.objectContaining({
            supabaseId: "supa_123",
            email: "test@example.com",
          }),
        }),
      );
      expect(result.email).toBe("test@example.com");
    });
  });

  // ─── completeOnboarding ───────────────────────────────────────────────────

  describe("completeOnboarding", () => {
    it("saves baseCurrency and marks onboarding complete", async () => {
      const mockUser = {
        id: "cld_1",
        baseCurrency: "INR",
        onboardingCompleted: true,
        trackingPreferences: ["stocks", "crypto"],
        householdMemberships: [],
      };
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await service.completeOnboarding("cld_1", {
        baseCurrency: "INR",
        trackingPreferences: ["stocks", "crypto"],
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cld_1" },
          data: expect.objectContaining({
            baseCurrency: "INR",
            onboardingCompleted: true,
            trackingPreferences: ["stocks", "crypto"],
          }),
        }),
      );
      expect(result.baseCurrency).toBe("INR");
      expect(result.onboardingCompleted).toBe(true);
    });

    it("throws BadRequestException for invalid currency code", async () => {
      await expect(
        service.completeOnboarding("cld_1", {
          baseCurrency: "inr", // lowercase — invalid
          trackingPreferences: ["stocks"],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── TOTP ─────────────────────────────────────────────────────────────────

  describe("generateTotpSetup", () => {
    it("returns a secret, otpauth URL, and QR code data URL", async () => {
      const result = await service.generateTotpSetup("cld_1", "test@example.com");

      expect(result.secret).toBeTruthy();
      expect(result.otpauthUrl).toMatch(/^otpauth:\/\//);
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("enableTotp", () => {
    it("throws BadRequestException for an invalid TOTP token", async () => {
      await expect(
        service.enableTotp("cld_1", "INVALIDSECRET", "000000"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Sessions ─────────────────────────────────────────────────────────────

  describe("revokeSession", () => {
    it("sets revokedAt on the session", async () => {
      const mockSession = { id: "sess_1", userId: "cld_1" };
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockPrisma.session.update.mockResolvedValue({ ...mockSession, revokedAt: new Date() });

      const result = await service.revokeSession("cld_1", "sess_1");
      expect(result.revokedAt).toBeTruthy();
    });
  });
});
