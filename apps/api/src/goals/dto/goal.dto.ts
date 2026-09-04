import { IsString, IsEnum, IsOptional, IsNumber, Min, IsArray, ArrayUnique } from "class-validator";
import { Type } from "class-transformer";

export enum GoalTypeDto {
  HOUSE = "HOUSE",
  MARRIAGE = "MARRIAGE",
  VACATION = "VACATION",
  EDUCATION = "EDUCATION",
  EMERGENCY_FUND = "EMERGENCY_FUND",
  RETIREMENT = "RETIREMENT",
  CAR = "CAR",
  CUSTOM = "CUSTOM",
}

export class CreateGoalDto {
  @IsEnum(GoalTypeDto)
  type!: GoalTypeDto;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  targetAmount!: number;

  /** ISO date string (yyyy-mm-dd or full ISO) — must be in the future for success-probability to be computable. */
  @IsString()
  targetDate!: string;

  @IsString()
  currencyCode!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  linkedAssetIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  standaloneProgressAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsEnum(GoalTypeDto)
  type?: GoalTypeDto;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  targetAmount?: number;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  linkedAssetIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  standaloneProgressAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SuccessProbabilityQueryDto {
  /** Override the mathematically-required monthly contribution with a specific what-if amount. Omit to use the required amount. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyContribution?: number;
}
