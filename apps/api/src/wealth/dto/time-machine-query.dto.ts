import { IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class PastStateQueryDto {
  /** ISO date string (yyyy-mm-dd or full ISO). Required. */
  @IsString()
  date!: string;
}

export class ProjectForwardQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  horizonYears?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyContribution?: number;
}
