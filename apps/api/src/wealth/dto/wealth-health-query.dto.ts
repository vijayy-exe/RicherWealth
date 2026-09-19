import { IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class WealthHealthQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  refresh?: boolean;

  @IsOptional()
  @IsString()
  countryCode?: string;
}
