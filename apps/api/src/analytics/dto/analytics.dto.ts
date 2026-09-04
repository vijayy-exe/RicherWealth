import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class RiskMetricsQueryDto {
  @IsOptional()
  @IsString()
  benchmarkTicker?: string;

  @IsOptional()
  @IsIn(["NYSE", "NASDAQ", "NSE", "BSE"])
  benchmarkExchange?: string;
}

export class MonteCarloQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  years?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50_000)
  simulations?: number;

  @IsOptional()
  @Type(() => Boolean)
  refresh?: boolean;
}
