import { IsString, IsIn, IsOptional, IsObject, IsNumber, Min, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

export const TRANSACTION_TYPES = ["buy", "sell", "dividend", "income", "expense", "transfer", "emi", "deposit", "withdrawal"] as const;
export const TRANSACTION_SOURCES = ["manual", "bank_sync", "csv_import", "pdf_import"] as const;
export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "SHOPPING",
  "FOOD",
  "UTILITIES",
  "HEALTHCARE",
  "ENTERTAINMENT",
  "SUBSCRIPTIONS",
  "BILLS",
  "OTHER",
] as const;

export class CreateTransactionDto {
  @IsIn(TRANSACTION_TYPES)
  type!: (typeof TRANSACTION_TYPES)[number];

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsString()
  currencyCode!: string;

  @IsString()
  date!: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  liabilityId?: string;

  /** Explicit category — if omitted for an "expense" transaction, the auto-categorization rules engine assigns one. */
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: (typeof EXPENSE_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TRANSACTION_SOURCES)
  source?: (typeof TRANSACTION_SOURCES)[number];

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(TRANSACTION_TYPES)
  type?: (typeof TRANSACTION_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: (typeof EXPENSE_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class RecategorizeTransactionDto {
  @IsIn(EXPENSE_CATEGORIES)
  category!: (typeof EXPENSE_CATEGORIES)[number];
}

export class TransactionQueryDto {
  @IsOptional()
  @IsIn(TRANSACTION_TYPES)
  type?: (typeof TRANSACTION_TYPES)[number];

  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: (typeof EXPENSE_CATEGORIES)[number];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  needsReview?: boolean;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
