import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { AuthService } from "./auth.service";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { UserWithRelations } from "./auth.service";
import {
  SyncUserDto,
  UpdateProfileDto,
  CompleteOnboardingDto,
  VerifyTotpDto,
  CreateSessionDto,
} from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Public: User Sync (called by Supabase webhook) ───────────────────────

  /**
   * POST /api/auth/sync-user
   * Called by Supabase Auth webhook on user creation.
   * Also safe to call on every login to keep the row fresh.
   *
   * Production: protect with a shared Supabase webhook secret header.
   */
  @Post("sync-user")
  @HttpCode(HttpStatus.OK)
  async syncUser(@Body() dto: SyncUserDto) {
    return this.authService.syncUser(dto);
  }

  // ─── Protected: Current User ──────────────────────────────────────────────

  @Get("me")
  @UseGuards(SupabaseAuthGuard)
  async getMe(@CurrentUser() user: UserWithRelations) {
    return this.formatUser(user);
  }

  @Patch("me")
  @UseGuards(SupabaseAuthGuard)
  async updateProfile(
    @CurrentUser() user: UserWithRelations,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.authService.updateProfile(user.id, dto);
    return this.formatUser(updated);
  }

  @Post("complete-onboarding")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @CurrentUser() user: UserWithRelations,
    @Body() dto: CompleteOnboardingDto,
  ) {
    const updated = await this.authService.completeOnboarding(user.id, dto);
    return this.formatUser(updated);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  @Get("sessions")
  @UseGuards(SupabaseAuthGuard)
  async listSessions(@CurrentUser() user: UserWithRelations) {
    return this.authService.listSessions(user.id);
  }

  @Post("sessions")
  @UseGuards(SupabaseAuthGuard)
  async createSession(
    @CurrentUser() user: UserWithRelations,
    @Body() dto: CreateSessionDto,
    @Req() req: Request,
  ) {
    const ipAddress = dto.ipAddress ?? req.ip;
    const userAgent = dto.userAgent ?? (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined);
    
    return this.authService.createSession(user.id, {
      ...dto,
      ...(ipAddress !== undefined && { ipAddress }),
      ...(userAgent !== undefined && { userAgent }),
    });
  }

  @Delete("sessions/all")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@CurrentUser() user: UserWithRelations) {
    await this.authService.revokeAllSessions(user.id);
  }

  @Delete("sessions/:id")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: UserWithRelations,
    @Param("id") sessionId: string,
  ) {
    await this.authService.revokeSession(user.id, sessionId);
  }

  // ─── MFA / TOTP ───────────────────────────────────────────────────────────

  /**
   * POST /api/auth/mfa/setup
   * Returns a TOTP secret + QR code. The user scans in their authenticator app
   * then calls /mfa/enable with the token to activate.
   */
  @Post("mfa/setup")
  @UseGuards(SupabaseAuthGuard)
  async setupTotp(@CurrentUser() user: UserWithRelations) {
    return this.authService.generateTotpSetup(user.id, user.email);
  }

  /**
   * POST /api/auth/mfa/enable
   * Verifies the token and activates TOTP MFA. Body must include `secret` (from setup)
   * and `token` (from authenticator app).
   */
  @Post("mfa/enable")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enableTotp(
    @CurrentUser() user: UserWithRelations,
    @Body() body: { secret: string; token: string },
  ) {
    await this.authService.enableTotp(user.id, body.secret, body.token);
    return { mfaEnabled: true };
  }

  /**
   * POST /api/auth/mfa/verify
   * Verifies a TOTP token (for step-up auth during login).
   */
  @Post("mfa/verify")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @CurrentUser() user: UserWithRelations,
    @Body() dto: VerifyTotpDto,
  ) {
    const valid = await this.authService.verifyTotp(user.id, dto.token);
    return { valid };
  }

  @Delete("mfa/disable")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTotp(@CurrentUser() user: UserWithRelations) {
    await this.authService.disableTotp(user.id);
  }

  // ─── Passkeys ─────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/passkeys/register/options
   * Returns WebAuthn registration options for navigator.credentials.create().
   */
  @Post("passkeys/register/options")
  @UseGuards(SupabaseAuthGuard)
  async getPasskeyRegistrationOptions(@CurrentUser() user: UserWithRelations) {
    return this.authService.generatePasskeyRegistrationOptions(user.id, user.email);
  }

  /**
   * POST /api/auth/passkeys/register/verify
   * Verifies the browser's registration response and persists the passkey.
   */
  @Post("passkeys/register/verify")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPasskeyRegistration(
    @CurrentUser() user: UserWithRelations,
    @Body() body: { response: RegistrationResponseJSON; name?: string },
  ) {
    return this.authService.verifyPasskeyRegistration(user.id, body.response, body.name);
  }

  @Get("passkeys")
  @UseGuards(SupabaseAuthGuard)
  async listPasskeys(@CurrentUser() user: UserWithRelations) {
    return this.authService.listPasskeys(user.id);
  }

  @Patch("passkeys/:id/rename")
  @UseGuards(SupabaseAuthGuard)
  async renamePasskey(
    @CurrentUser() user: UserWithRelations,
    @Param("id") passkeyId: string,
    @Body() body: { name: string },
  ) {
    return this.authService.renamePasskey(user.id, passkeyId, body.name);
  }

  @Delete("passkeys/:id")
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePasskey(
    @CurrentUser() user: UserWithRelations,
    @Param("id") passkeyId: string,
  ) {
    await this.authService.deletePasskey(user.id, passkeyId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private formatUser(user: UserWithRelations) {
    return {
      id: user.id,
      supabaseId: user.supabaseId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      baseCurrency: user.baseCurrency,
      mfaEnabled: user.mfaEnabled,
      onboardingCompleted: user.onboardingCompleted,
      trackingPreferences: user.trackingPreferences,
      createdAt: user.createdAt,
      households: user.householdMemberships.map((m) => ({
        id: m.household.id,
        name: m.household.name,
        role: m.role,
      })),
    };
  }
}
