import { IsString, IsOptional, IsEmail, IsBoolean } from "class-validator";

export class SyncUserDto {
  @IsString()
  supabaseId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  baseCurrency?: string;
}

export class CompleteOnboardingDto {
  @IsString()
  baseCurrency!: string;

  @IsString({ each: true })
  trackingPreferences!: string[];
}

export class VerifyTotpDto {
  @IsString()
  token!: string;
}

export class CreateSessionDto {
  @IsString()
  @IsOptional()
  supabaseSessionId?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}
