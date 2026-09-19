import { IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class RefreshQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  refresh?: boolean;
}
