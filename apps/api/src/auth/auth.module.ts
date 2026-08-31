import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { HouseholdRoleGuard } from "./guards/household-role.guard";
import { PasskeyChallengeStore } from "./passkey-challenge.store";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard, HouseholdRoleGuard, PasskeyChallengeStore],
  exports: [AuthService, SupabaseAuthGuard, HouseholdRoleGuard],
})
export class AuthModule {}
