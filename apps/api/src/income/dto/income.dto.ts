import { IsString, IsEnum, IsOptional, IsObject, IsNumber, Min, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export enum IncomeSourceTypeDto {
  SALARY = "SALARY",
  BUSINESS = "BUSINESS",
  RENTAL = "RENTAL",
  DIVIDENDS = "DIVIDENDS",
  ROYALTIES = "ROYALTIES",
  FREELANCE = "FREELANCE",
  INTEREST = "INTEREST",
  AFFILIATE = "AFFILIATE",
  YOUTUBE = "YOUTUBE",
  OTHER = "OTHER",
}

export enum IncomeFrequencyDto {
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  ANNUALLY = "ANNUALLY",
  ONE_TIME = "ONE_TIME",
}

export class CreateIncomeDto {
  @IsEnum(IncomeSourceTypeDto)
  sourceType!: IncomeSourceTypeDto;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsEnum(IncomeFrequencyDto)
  frequency!: IncomeFrequencyDto;

  @IsString()
  currencyCode!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class UpdateIncomeDto {
  @IsOptional()
  @IsEnum(IncomeSourceTypeDto)
  sourceType?: IncomeSourceTypeDto;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsEnum(IncomeFrequencyDto)
  frequency?: IncomeFrequencyDto;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
