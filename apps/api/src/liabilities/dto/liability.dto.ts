import { IsString, IsEnum, IsOptional, IsObject, IsNumber, Min, Max, IsDate } from "class-validator";
import { Type } from "class-transformer";

export class CreateLiabilityDto {
  @IsString()
  type!: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  principalAmount!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  remainingBalance!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  interestRate!: number;

  @IsString()
  currencyCode!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  emiAmount?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  maturityDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class UpdateLiabilityDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  principalAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  remainingBalance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  interestRate?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  emiAmount?: number;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  maturityDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
