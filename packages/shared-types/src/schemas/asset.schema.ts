import { z } from "zod";

import { CurrencyCodeSchema, CuidSchema, NonNegativeDecimalSchema } from "./common.schema";

// ─── Asset type enum ──────────────────────────────────────────────────────────

export const AssetTypeSchema = z.enum([
  // Liquid
  "CASH",
  "FIXED_DEPOSIT",
  // Market-traded
  "STOCK",
  "MUTUAL_FUND",
  "ETF",
  "BOND",
  "CRYPTO",
  // Commodities
  "GOLD",
  "SILVER",
  "COMMODITY",
  // Illiquid
  "REAL_ESTATE",
  "VEHICLE",
  "COLLECTIBLE",
  "NFT",
  // Business
  "BUSINESS_EQUITY",
  "PRIVATE_EQUITY",
  "ANGEL_INVESTMENT",
  "REIT",
  "P2P_LENDING",
  // Retirement
  "RETIREMENT_ACCOUNT",
  // Insurance
  "INSURANCE",
  // Misc
  "FOREX",
  "OTHER",
]);

export type AssetType = z.infer<typeof AssetTypeSchema>;

// ─── Document attachment (stored in details.documents[]) ─────────────────────

export const AssetDocumentSchema = z.object({
  name: z.string(),
  path: z.string(),   // Storage path: {userId}/{assetId}/{filename}
  size: z.number(),
  mimeType: z.string(),
  uploadedAt: z.string().datetime(),
});
export type AssetDocument = z.infer<typeof AssetDocumentSchema>;

// ─── Generic Asset schema (base) ──────────────────────────────────────────────

export const AssetBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: AssetTypeSchema,
  currentValue: NonNegativeDecimalSchema,
  currencyCode: CurrencyCodeSchema,
  notes: z.string().max(2000).optional(),
  details: z.record(z.unknown()).default({}),
});

export const CreateAssetSchema = AssetBaseSchema;
export const UpdateAssetSchema = AssetBaseSchema.partial();

export const AssetSchema = AssetBaseSchema.extend({
  id: CuidSchema,
  userId: CuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

// ─── Type-specific detail schemas ─────────────────────────────────────────────

/** Cash & Bank Accounts */
export const CashDetailsSchema = z.object({
  bankName: z.string().min(1, "Bank name is required"),
  accountType: z.enum(["SAVINGS", "CURRENT", "SALARY", "NRE", "NRO", "OTHER"]).default("SAVINGS"),
  accountNumberLast4: z.string().length(4).regex(/^\d{4}$/, "Must be last 4 digits").optional(),
});

/** Fixed Deposits / CDs / RDs */
export const FixedDepositDetailsSchema = z.object({
  bankName: z.string().min(1, "Bank name is required"),
  fdType: z.enum(["FD", "RD", "CD", "NCD"]).default("FD"),
  principalAmount: z.number().positive("Principal must be positive"),
  interestRate: z.number().min(0).max(100, "Rate must be 0–100"),
  maturityDate: z.string().min(1, "Maturity date is required"),
  maturityAmount: z.number().positive().optional(),
  isAutoRenew: z.boolean().default(false),
  accountNumber: z.string().optional(),
});

/** Stocks / ETFs */
export const StockDetailsSchema = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
  exchange: z.enum(["NSE", "BSE", "NYSE", "NASDAQ", "LSE", "HKEX", "SGX", "OTHER"]),
  quantity: z.number().positive("Quantity must be positive"),
  avgBuyPrice: z.number().positive("Buy price must be positive"),
  sector: z.string().optional(),
  industry: z.string().optional(),
});

/** Mutual Funds */
export const MutualFundDetailsSchema = z.object({
  fundName: z.string().min(1, "Fund name is required"),
  /// MFAPI.in numeric scheme code (e.g. "120503")
  schemeCode: z.string().min(1, "Scheme code is required"),
  isin: z.string().optional(),
  units: z.number().positive("Units must be positive"),
  avgNAV: z.number().positive("Avg NAV must be positive"),
  investmentType: z.enum(["SIP", "LUMPSUM"]).default("LUMPSUM"),
  fundType: z.enum(["EQUITY", "DEBT", "HYBRID", "LIQUID", "ELSS", "INDEX", "OTHER"]).optional(),
  expenseRatio: z.number().min(0).max(5).optional(),  // % per year
  sipFrequency: z.enum(["MONTHLY", "QUARTERLY"]).optional(),  // only for SIP
  platform: z.string().optional(),
});

/** Bonds */
export const BondDetailsSchema = z.object({
  issuer: z.string().min(1, "Issuer is required"),
  /// Phase 5: GOVT | CORPORATE | MUNICIPAL | SGB
  bondType: z.enum(["GOVT", "CORPORATE", "MUNICIPAL", "SGB"]).default("CORPORATE"),
  faceValue: z.number().positive(),
  couponRate: z.number().min(0).max(100),
  maturityDate: z.string().min(1, "Maturity date is required"),
  quantityHeld: z.number().int().positive("Quantity must be a positive integer"),
  purchasePrice: z.number().positive().optional(),
  purchaseDate: z.string().optional(),
  isin: z.string().optional(),
});

/** Cryptocurrency */
export const CryptoDetailsSchema = z.object({
  symbol: z.string().min(1).toUpperCase(),
  coinId: z.string().optional(),
  quantity: z.number().positive("Quantity must be positive"),
  avgBuyPrice: z.number().positive("Buy price must be positive"),
  network: z.string().optional(),
  walletAddress: z.string().optional(),
  isStaked: z.boolean().default(false),
  stakingYield: z.number().min(0).max(100).optional(),
});

/** Gold / Silver */
export const GoldSilverDetailsSchema = z.object({
  form: z.enum(["PHYSICAL_COIN", "PHYSICAL_BAR", "JEWELLERY", "DIGITAL", "ETF", "FUND"]),
  weightGrams: z.number().positive("Weight must be positive"),
  purity: z.enum(["24K", "22K", "18K", "14K", "999", "999.9", "925"]).optional(),
  hallmarked: z.boolean().default(false),
  storageLocation: z.string().optional(),
});

/** Real Estate */
export const RealEstateDetailsSchema = z.object({
  subType: z.enum([
    "RESIDENTIAL",
    "COMMERCIAL",
    "AGRICULTURAL",
    "RENTAL",
    "LAND",
    "PLOT",
    "APARTMENT",
    "VILLA",
    "UNDER_CONSTRUCTION",
  ]),
  purchasePrice: z.number().positive("Purchase price must be positive"),
  purchaseDate: z.string().optional(),
  address: z.string().optional(),
  area: z.number().positive().optional(),
  areaUnit: z.enum(["SQ_FT", "SQ_M", "ACRE", "HECTARE"]).default("SQ_FT"),
  rentalIncome: z.number().nonnegative().optional(),
  rentalFrequency: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]).optional(),
  linkedLiabilityId: z.string().optional(),
  registrationNumber: z.string().optional(),
});

/** Vehicle */
export const VehicleDetailsSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  registrationNumber: z.string().optional(),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "HYBRID", "CNG", "OTHER"]).default("PETROL"),
  purchasePrice: z.number().positive().optional(),
  purchaseDate: z.string().optional(),
  odometer: z.number().nonnegative().optional(),
  linkedLiabilityId: z.string().optional(),
});

/** Collectibles */
export const CollectibleDetailsSchema = z.object({
  category: z.enum(["WATCH", "ART", "CAR", "COIN", "STAMP", "WINE", "SNEAKER", "JEWELLERY", "ANTIQUE", "OTHER"]),
  brand: z.string().optional(),
  model: z.string().optional(),
  purchasePrice: z.number().positive().optional(),
  purchaseDate: z.string().optional(),
  condition: z.enum(["MINT", "EXCELLENT", "GOOD", "FAIR", "POOR"]).optional(),
  certificateNumber: z.string().optional(),
  appraisedBy: z.string().optional(),
  lastAppraisalDate: z.string().optional(),
});

/** NFTs */
export const NftDetailsSchema = z.object({
  collection: z.string().min(1, "Collection name is required"),
  tokenId: z.string().min(1, "Token ID is required"),
  blockchain: z.enum(["ETHEREUM", "SOLANA", "POLYGON", "BINANCE", "AVALANCHE", "OTHER"]),
  contractAddress: z.string().optional(),
  marketplace: z.enum(["OPENSEA", "BLUR", "MAGIC_EDEN", "FOUNDATION", "OTHER"]).optional(),
  purchasePrice: z.number().nonnegative().optional(),
  purchaseCurrency: z.string().optional(),
});

/** Business Equity / Private Company Shares */
export const BusinessEquityDetailsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  stakePercent: z.number().min(0).max(100, "Stake must be 0–100%"),
  stage: z.enum(["IDEA", "PRE_SEED", "SEED", "SERIES_A", "SERIES_B", "GROWTH", "PROFITABLE", "PUBLIC"]).optional(),
  industry: z.string().optional(),
  incorporationDate: z.string().optional(),
  registrationNumber: z.string().optional(),
  coFounders: z.string().optional(),
  revenue: z.number().nonnegative().optional(),
});

/** Retirement Accounts (401k / IRA / NPS / EPF / PPF / Superannuation) */
export const RetirementDetailsSchema = z.object({
  accountType: z.enum(["401K", "IRA", "ROTH_IRA", "NPS", "EPF", "PPF", "SUPERANNUATION", "PENSION", "OTHER"]),
  provider: z.string().optional(),
  employerName: z.string().optional(),
  employeeContribution: z.number().nonnegative().optional(),
  employerContribution: z.number().nonnegative().optional(),
  pran: z.string().optional(),        // for NPS
  uanNumber: z.string().optional(),   // for EPF
  accountNumber: z.string().optional(),
  lockInDate: z.string().optional(),
});

/** Insurance Policies */
export const InsuranceDetailsSchema = z.object({
  subType: z.enum(["LIFE", "HEALTH", "VEHICLE", "HOME", "TRAVEL", "ULIP", "TERM", "WHOLE_LIFE", "ENDOWMENT", "OTHER"]),
  insurer: z.string().min(1, "Insurance company is required"),
  policyNumber: z.string().optional(),
  sumAssured: z.number().positive("Coverage amount must be positive"),
  annualPremium: z.number().positive("Annual premium must be positive"),
  premiumFrequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]).default("ANNUAL"),
  renewalDate: z.string().min(1, "Renewal date is required"),
  nominee: z.string().optional(),
  policyTerm: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

/** P2P Lending */
export const P2PLendingDetailsSchema = z.object({
  platform: z.string().min(1, "Platform name is required"),
  interestRate: z.number().min(0).max(100),
  maturityDate: z.string().optional(),
  borrowerRating: z.enum(["A", "B", "C", "D", "NR"]).optional(),
  loanType: z.enum(["PERSONAL", "BUSINESS", "CONSUMER", "AUTO", "OTHER"]).optional(),
});

// ─── Map: AssetType → detail schema ──────────────────────────────────────────
export const ASSET_DETAIL_SCHEMAS = {
  CASH: CashDetailsSchema,
  FIXED_DEPOSIT: FixedDepositDetailsSchema,
  STOCK: StockDetailsSchema,
  ETF: StockDetailsSchema,
  MUTUAL_FUND: MutualFundDetailsSchema,
  BOND: BondDetailsSchema,
  CRYPTO: CryptoDetailsSchema,
  GOLD: GoldSilverDetailsSchema,
  SILVER: GoldSilverDetailsSchema,
  COMMODITY: z.object({ commodityName: z.string(), unit: z.string().optional(), quantity: z.number().positive() }),
  REAL_ESTATE: RealEstateDetailsSchema,
  REIT: z.object({ ticker: z.string(), units: z.number().positive(), nav: z.number().positive(), exchange: z.string().optional() }),
  VEHICLE: VehicleDetailsSchema,
  COLLECTIBLE: CollectibleDetailsSchema,
  NFT: NftDetailsSchema,
  BUSINESS_EQUITY: BusinessEquityDetailsSchema,
  PRIVATE_EQUITY: BusinessEquityDetailsSchema,
  ANGEL_INVESTMENT: BusinessEquityDetailsSchema,
  RETIREMENT_ACCOUNT: RetirementDetailsSchema,
  INSURANCE: InsuranceDetailsSchema,
  P2P_LENDING: P2PLendingDetailsSchema,
  FOREX: z.object({ fromCurrency: z.string(), toCurrency: z.string(), quantity: z.number().positive(), avgRate: z.number().positive() }),
  OTHER: z.object({ description: z.string().optional() }),
} as const;

// ─── Inferred types ────────────────────────────────────────────────────────────────────
export type Asset = z.infer<typeof AssetSchema>;
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;
export type StockDetails = z.infer<typeof StockDetailsSchema>;
export type CryptoDetails = z.infer<typeof CryptoDetailsSchema>;
export type RealEstateDetails = z.infer<typeof RealEstateDetailsSchema>;
export type InsuranceDetails = z.infer<typeof InsuranceDetailsSchema>;
export type RetirementDetails = z.infer<typeof RetirementDetailsSchema>;
export type VehicleDetails = z.infer<typeof VehicleDetailsSchema>;
export type CollectibleDetails = z.infer<typeof CollectibleDetailsSchema>;
// Phase 5
export type MutualFundDetails = z.infer<typeof MutualFundDetailsSchema>;
export type BondDetails = z.infer<typeof BondDetailsSchema>;
