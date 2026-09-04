import { IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class RiskProfileQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  refresh?: boolean;
}
