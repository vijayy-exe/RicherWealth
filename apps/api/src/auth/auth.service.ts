import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

import { PrismaService } from "../prisma/prisma.service";
import { encryptSecret, decryptSecret } from "./crypto.util";
import { PasskeyChallengeStore } from "./passkey-challenge.store";
import type {
  SyncUserDto,
  UpdateProfileDto,
  CompleteOnboardingDto,
  CreateSessionDto,
} from "./dto/auth.dto";

// Full user type with relations — used throughout the app
export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    householdMemberships: {
      include: { household: true };
    };
  };
}>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passkeyChallenges: PasskeyChallengeStore,
  ) {}

  // ─── User sync ────────────────────────────────────────────────────────────

  /**
   * Called by the Supabase webhook on new user creation (and idempotently on login).
   * Creates or updates the local User row to match Supabase.
   */
  async syncUser(dto: SyncUserDto): Promise<UserWithRelations> {
    const user = await this.prisma.user.upsert({
      where: { supabaseId: dto.supabaseId },
      update: {
        email: dto.email,
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      create: {
        supabaseId: dto.supabaseId,
        email: dto.email,
        name: dto.name ?? null,
        avatarUrl: dto.avatarUrl ?? null,
      },
      include: {
        householdMemberships: { include: { household: true } },
      },
    });

    this.logger.log(`User synced: ${user.email} (${user.id})`);
    return user;
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserWithRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        householdMemberships: { include: { household: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserWithRelations> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.baseCurrency !== undefined && { baseCurrency: dto.baseCurrency }),
      },
      include: {
        householdMemberships: { include: { household: true } },
      },
    });
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────

  async completeOnboarding(
    userId: string,
    dto: CompleteOnboardingDto,
  ): Promise<UserWithRelations> {
    if (dto.baseCurrency.length !== 3 || !/^[A-Z]{3}$/.test(dto.baseCurrency)) {
      throw new BadRequestException("Invalid currency code");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        baseCurrency: dto.baseCurrency,
        trackingPreferences: dto.trackingPreferences,
        onboardingCompleted: true,
      },
      include: {
        householdMemberships: { include: { household: true } },
      },
    });
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async createSession(userId: string, dto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        userId,
        supabaseSessionId: dto.supabaseSessionId ?? null,
        deviceName: dto.deviceName ?? null,
        deviceType: dto.deviceType ?? null,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException("Session not found");

    return this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── MFA / TOTP ───────────────────────────────────────────────────────────

  /**
   * Generates a TOTP secret and returns:
   * - the base32 secret (to be encrypted and stored after verification)
   * - an otpauth:// URL for QR code generation
   * - the QR code as a data URI
   */
  async generateTotpSetup(userId: string, email: string) {
    const secret = speakeasy.generateSecret({
      name: `RicherWealth (${email})`,
      issuer: "RicherWealth",
      length: 32,
    });

    const otpauthUrl = secret.otpauth_url ?? "";
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      otpauthUrl,
      qrCode: qrCodeDataUrl,
    };
  }

  /** Reads the MFA encryption key from config, failing fast if unset. */
  private getMfaEncryptionKey(): string {
    const key = this.config.get<string>("MFA_ENCRYPTION_KEY");
    if (!key) {
      throw new Error("MFA_ENCRYPTION_KEY is not configured");
    }
    return key;
  }

  /**
   * Verifies the TOTP token and, if valid, activates MFA by storing the
   * secret encrypted at rest (AES-256-GCM, see crypto.util.ts).
   */
  async enableTotp(userId: string, secret: string, token: string): Promise<boolean> {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1, // allow 1 step clock drift
    });

    if (!verified) throw new BadRequestException("Invalid TOTP code");

    const encryptedSecret = encryptSecret(secret, this.getMfaEncryptionKey());

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaTotpSecret: encryptedSecret,
        mfaEnabled: true,
      },
    });

    this.logger.log(`MFA enabled for user ${userId}`);
    return true;
  }

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaTotpSecret) throw new BadRequestException("MFA not configured");

    const secret = decryptSecret(user.mfaTotpSecret, this.getMfaEncryptionKey());

    return speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaTotpSecret: null,
        mfaEnabled: false,
      },
    });
    this.logger.log(`MFA disabled for user ${userId}`);
  }

  // ─── Passkeys ─────────────────────────────────────────────────────────────

  /** RP ID (domain) WebAuthn ceremonies are scoped to. Defaults to local dev. */
  private getRpId(): string {
    return this.config.get<string>("WEBAUTHN_RP_ID") ?? "localhost";
  }

  /** Origin the browser must report during ceremonies. Defaults to local dev. */
  private getRpOrigin(): string {
    return this.config.get<string>("WEBAUTHN_RP_ORIGIN") ?? "http://localhost:3000";
  }

  async generatePasskeyRegistrationOptions(
    userId: string,
    email: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.prisma.passkey.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: "RicherWealth",
      rpID: this.getRpId(),
      userName: email,
      userID: new TextEncoder().encode(userId),
      attestationType: "none",
      excludeCredentials: existing.map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    this.passkeyChallenges.set(userId, options.challenge);
    return options;
  }

  async verifyPasskeyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    name?: string,
  ) {
    const expectedChallenge = this.passkeyChallenges.take(userId);
    if (!expectedChallenge) {
      throw new BadRequestException("Registration challenge expired or not found — please retry");
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.getRpOrigin(),
      expectedRPID: this.getRpId(),
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException("Passkey registration could not be verified");
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const passkey = await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        deviceType: credentialDeviceType === "singleDevice" ? "SINGLE_DEVICE" : "MULTI_DEVICE",
        backedUp: credentialBackedUp,
        transports: credential.transports ?? [],
        name: name ?? "My Passkey",
      },
    });

    this.logger.log(`Passkey registered for user ${userId}`);
    return { id: passkey.id, name: passkey.name };
  }

  async listPasskeys(userId: string) {
    return this.prisma.passkey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
        backedUp: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async deletePasskey(userId: string, passkeyId: string) {
    const pk = await this.prisma.passkey.findFirst({
      where: { id: passkeyId, userId },
    });
    if (!pk) throw new NotFoundException("Passkey not found");

    await this.prisma.passkey.delete({ where: { id: passkeyId } });
  }

  async renamePasskey(userId: string, passkeyId: string, name: string) {
    const pk = await this.prisma.passkey.findFirst({
      where: { id: passkeyId, userId },
    });
    if (!pk) throw new NotFoundException("Passkey not found");

    return this.prisma.passkey.update({
      where: { id: passkeyId },
      data: { name },
    });
  }
}
