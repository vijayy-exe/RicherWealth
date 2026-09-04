import { IsString, IsOptional } from "class-validator";

export class ExchangePublicTokenDto {
  @IsString()
  publicToken!: string;

  // From Plaid Link's onSuccess metadata.institution — avoids an extra API round-trip to look it up.
  @IsOptional()
  @IsString()
  institutionId?: string;

  @IsOptional()
  @IsString()
  institutionName?: string;
}
