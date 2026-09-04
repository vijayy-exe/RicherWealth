import { IsString, IsEnum, IsOptional, IsObject, IsNumber, Min, Max, IsInt } from "class-validator";
import { Type } from "class-transformer";

export enum LoanPaymentFrequencyDto {
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  ANNUALLY = "ANNUALLY",
}

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
  @IsEnum(LoanPaymentFrequencyDto)
  paymentFrequency?: LoanPaymentFrequencyDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tenureMonths?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  minPaymentPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPaymentFlat?: number;

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
  @IsEnum(LoanPaymentFrequencyDto)
  paymentFrequency?: LoanPaymentFrequencyDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tenureMonths?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  minPaymentPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPaymentFlat?: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

/**
 * Standalone amortization calculator — no persisted liability required.
 * This is the shape the Phase 13 EMI/Mortgage calculators will POST to.
 */
export class CalculateAmortizationDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  principal!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  interestRate!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  tenureMonths!: number;

  @IsOptional()
  @IsEnum(LoanPaymentFrequencyDto)
  paymentFrequency?: LoanPaymentFrequencyDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  extraPaymentPerPeriod?: number;
}

export class PrepaymentSavingsQueryDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  extraPayment!: number;
}
