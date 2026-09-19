import { IsString, IsEnum, IsOptional, IsObject, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateAssetDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currentValue!: number;

  @IsString()
  currencyCode!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  // ─── Phase 21: Family Office & Estate Planning ───────────────────────────
  @IsOptional()
  @IsString()
  householdId?: string;

  @IsOptional()
  @IsString()
  nomineeName?: string;

  @IsOptional()
  @IsString()
  nomineeRelationship?: string;

  @IsOptional()
  @IsString()
  nomineeContact?: string;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currentValue?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  // ─── Phase 21: Family Office & Estate Planning ───────────────────────────
  // Nullable (not just optional) so the frontend can explicitly UNSET a
  // household assignment or a nominee field, not just add one.
  @IsOptional()
  householdId?: string | null;

  @IsOptional()
  nomineeName?: string | null;

  @IsOptional()
  nomineeRelationship?: string | null;

  @IsOptional()
  nomineeContact?: string | null;
}
