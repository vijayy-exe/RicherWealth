import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as speakeasy from "speakeasy";

import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { PasskeyChallengeStore } from "./passkey-challenge.store";

const TEST_MFA_KEY = "0".repeat(64); // dummy 32-byte hex key, test-only

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
      MFA_ENCRYPTION_KEY: TEST_MFA_KEY,
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
        PasskeyChallengeStore,
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

    it("stores the TOTP secret encrypted, not in plaintext", async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      const token = speakeasy.totp({ secret, encoding: "base32" });
      mockPrisma.user.update.mockResolvedValue({ id: "cld_1" });

      await service.enableTotp("cld_1", secret, token);

      const storedSecret = mockPrisma.user.update.mock.calls[0][0].data.mfaTotpSecret;
      expect(storedSecret).not.toBe(secret);
      expect(storedSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });
  });

  describe("verifyTotp", () => {
    it("decrypts the stored secret and verifies a valid token", async () => {
      const secret = speakeasy.generateSecret({ length: 32 }).base32;
      const token = speakeasy.totp({ secret, encoding: "base32" });
      mockPrisma.user.update.mockResolvedValue({ id: "cld_1" });

      await service.enableTotp("cld_1", secret, token);
      const encryptedSecret = mockPrisma.user.update.mock.calls[0][0].data.mfaTotpSecret;
      mockPrisma.user.findUnique.mockResolvedValue({ mfaTotpSecret: encryptedSecret });

      const freshToken = speakeasy.totp({ secret, encoding: "base32" });
      const verified = await service.verifyTotp("cld_1", freshToken);

      expect(verified).toBe(true);
    });

    it("throws BadRequestException when MFA is not configured", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ mfaTotpSecret: null });

      await expect(service.verifyTotp("cld_1", "000000")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Passkey registration ceremony ────────────────────────────────────────

  describe("generatePasskeyRegistrationOptions", () => {
    it("returns creation options and excludes the user's existing credentials", async () => {
      mockPrisma.passkey.findMany.mockResolvedValue([
        { credentialId: "existing-cred-id", transports: ["internal"] },
      ]);

      const options = await service.generatePasskeyRegistrationOptions(
        "cld_1",
        "test@example.com",
      );

      expect(options.rp.name).toBe("RicherWealth");
      expect(options.user.name).toBe("test@example.com");
      expect(options.excludeCredentials).toEqual([
        expect.objectContaining({ id: "existing-cred-id", transports: ["internal"] }),
      ]);
      expect(options.challenge).toBeTruthy();
    });
  });

  describe("verifyPasskeyRegistration", () => {
    it("throws BadRequestException when no challenge was issued (expired/missing)", async () => {
      await expect(
        service.verifyPasskeyRegistration(
          "cld_never_started_registration",
          {} as never,
        ),
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
