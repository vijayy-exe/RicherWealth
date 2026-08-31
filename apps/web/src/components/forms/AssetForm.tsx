"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { FormField } from "./FormField";
import { CurrencyInput } from "./CurrencyInput";
import { TextInput, SelectField, DateInput, TextArea } from "./Inputs";
import { ASSET_TYPE_META } from "./AssetTypeSelector";
import { FileUploadZone } from "./FileUploadZone";
import type { UploadedDocument } from "@/hooks/useFileUpload";
import type { AssetType } from "@richer/shared-types";

// ─── Shared base schema ───────────────────────────────────────────────────────
const BaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  currentValue: z.number({ invalid_type_error: "Value is required" }).min(0, "Must be ≥ 0"),
  currencyCode: z.string().min(1),
  notes: z.string().max(2000).optional(),
  details: z.record(z.unknown()).default({}),
});

type BaseFormValues = z.infer<typeof BaseSchema>;

// ─── Step 1: Type-specific detail forms ──────────────────────────────────────

function CashDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Bank Name" required error={errors.bankName?.message as string}>
        <TextInput {...register("bankName")} placeholder="e.g. HDFC Bank" />
      </FormField>
      <FormField label="Account Type" error={errors.accountType?.message as string}>
        <SelectField {...register("accountType")} options={[
          { value: "SAVINGS", label: "Savings" }, { value: "CURRENT", label: "Current" },
          { value: "SALARY", label: "Salary" }, { value: "NRE", label: "NRE" },
          { value: "NRO", label: "NRO" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Last 4 Digits" hint="Optional, for identification" error={errors.accountNumberLast4?.message as string}>
        <TextInput {...register("accountNumberLast4")} placeholder="XXXX" maxLength={4} />
      </FormField>
    </div>
  );
}

function FixedDepositDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Bank Name" required error={errors.bankName?.message as string}>
        <TextInput {...register("bankName")} placeholder="e.g. SBI" />
      </FormField>
      <FormField label="Type" error={errors.fdType?.message as string}>
        <SelectField {...register("fdType")} options={[
          { value: "FD", label: "Fixed Deposit" }, { value: "RD", label: "Recurring Deposit" },
          { value: "CD", label: "Certificate of Deposit" }, { value: "NCD", label: "Non-Convertible Debenture" },
        ]} />
      </FormField>
      <FormField label="Principal Amount" required error={errors.principalAmount?.message as string}>
        <TextInput {...register("principalAmount", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Interest Rate (%)" required error={errors.interestRate?.message as string}>
        <TextInput {...register("interestRate", { valueAsNumber: true })} type="number" step="0.01" placeholder="6.5" />
      </FormField>
      <FormField label="Maturity Date" required error={errors.maturityDate?.message as string}>
        <DateInput {...register("maturityDate")} />
      </FormField>
    </div>
  );
}

function StockDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Ticker Symbol" required error={errors.ticker?.message as string}>
        <TextInput {...register("ticker")} placeholder="e.g. RELIANCE" style={{ textTransform: "uppercase" }} />
      </FormField>
      <FormField label="Exchange" required error={errors.exchange?.message as string}>
        <SelectField {...register("exchange")} placeholder="Select exchange" options={[
          { value: "NSE", label: "NSE" }, { value: "BSE", label: "BSE" },
          { value: "NYSE", label: "NYSE" }, { value: "NASDAQ", label: "NASDAQ" },
          { value: "LSE", label: "LSE" }, { value: "SGX", label: "SGX" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Quantity" required error={errors.quantity?.message as string}>
        <TextInput {...register("quantity", { valueAsNumber: true })} type="number" step="0.001" placeholder="0" />
      </FormField>
      <FormField label="Avg. Buy Price" required error={errors.avgBuyPrice?.message as string}>
        <TextInput {...register("avgBuyPrice", { valueAsNumber: true })} type="number" step="0.01" placeholder="0.00" />
      </FormField>
      <FormField label="Sector" error={errors.sector?.message as string}>
        <TextInput {...register("sector")} placeholder="e.g. Technology" />
      </FormField>
    </div>
  );
}

function CryptoDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Symbol" required error={errors.symbol?.message as string}>
        <TextInput {...register("symbol")} placeholder="e.g. BTC" style={{ textTransform: "uppercase" }} />
      </FormField>
      <FormField label="Quantity" required error={errors.quantity?.message as string}>
        <TextInput {...register("quantity", { valueAsNumber: true })} type="number" step="0.00000001" placeholder="0" />
      </FormField>
      <FormField label="Avg. Buy Price (USD)" required error={errors.avgBuyPrice?.message as string}>
        <TextInput {...register("avgBuyPrice", { valueAsNumber: true })} type="number" step="0.01" placeholder="0.00" />
      </FormField>
      <FormField label="Network" error={errors.network?.message as string}>
        <TextInput {...register("network")} placeholder="e.g. Ethereum" />
      </FormField>
      <FormField label="Wallet Address" hint="Optional, no private keys" error={errors.walletAddress?.message as string}>
        <TextInput {...register("walletAddress")} placeholder="0x..." />
      </FormField>
    </div>
  );
}

function GoldDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Form" required error={errors.form?.message as string}>
        <SelectField {...register("form")} placeholder="Select form" options={[
          { value: "PHYSICAL_COIN", label: "Physical Coin" }, { value: "PHYSICAL_BAR", label: "Physical Bar" },
          { value: "JEWELLERY", label: "Jewellery" }, { value: "DIGITAL", label: "Digital Gold" },
          { value: "ETF", label: "Gold ETF" }, { value: "FUND", label: "Gold Fund" },
        ]} />
      </FormField>
      <FormField label="Weight (grams)" required error={errors.weightGrams?.message as string}>
        <TextInput {...register("weightGrams", { valueAsNumber: true })} type="number" step="0.001" placeholder="0" />
      </FormField>
      <FormField label="Purity" error={errors.purity?.message as string}>
        <SelectField {...register("purity")} placeholder="Select purity" options={[
          { value: "24K", label: "24K (999.9)" }, { value: "22K", label: "22K" },
          { value: "18K", label: "18K" }, { value: "999", label: "999 Silver" }, { value: "925", label: "925 Silver" },
        ]} />
      </FormField>
    </div>
  );
}

function RealEstateDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Property Type" required error={errors.subType?.message as string}>
        <SelectField {...register("subType")} placeholder="Select type" options={[
          { value: "RESIDENTIAL", label: "Residential" }, { value: "COMMERCIAL", label: "Commercial" },
          { value: "AGRICULTURAL", label: "Agricultural" }, { value: "RENTAL", label: "Rental" },
          { value: "LAND", label: "Land" }, { value: "PLOT", label: "Plot" },
          { value: "APARTMENT", label: "Apartment" }, { value: "VILLA", label: "Villa" },
          { value: "UNDER_CONSTRUCTION", label: "Under Construction" },
        ]} />
      </FormField>
      <FormField label="Purchase Price" required error={errors.purchasePrice?.message as string}>
        <TextInput {...register("purchasePrice", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Purchase Date" error={errors.purchaseDate?.message as string}>
        <DateInput {...register("purchaseDate")} />
      </FormField>
      <FormField label="Address" error={errors.address?.message as string}>
        <TextInput {...register("address")} placeholder="Full property address" />
      </FormField>
      <FormField label="Area" error={errors.area?.message as string}>
        <TextInput {...register("area", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Area Unit" error={errors.areaUnit?.message as string}>
        <SelectField {...register("areaUnit")} options={[
          { value: "SQ_FT", label: "Sq. Ft." }, { value: "SQ_M", label: "Sq. M." },
          { value: "ACRE", label: "Acre" }, { value: "HECTARE", label: "Hectare" },
        ]} />
      </FormField>
      <FormField label="Monthly Rental Income" error={errors.rentalIncome?.message as string}>
        <TextInput {...register("rentalIncome", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
    </div>
  );
}

function VehicleDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Make" required error={errors.make?.message as string}>
        <TextInput {...register("make")} placeholder="e.g. Toyota" />
      </FormField>
      <FormField label="Model" required error={errors.model?.message as string}>
        <TextInput {...register("model")} placeholder="e.g. Fortuner" />
      </FormField>
      <FormField label="Year" required error={errors.year?.message as string}>
        <TextInput {...register("year", { valueAsNumber: true })} type="number" min="1900" max="2027" placeholder="2024" />
      </FormField>
      <FormField label="Fuel Type" error={errors.fuelType?.message as string}>
        <SelectField {...register("fuelType")} options={[
          { value: "PETROL", label: "Petrol" }, { value: "DIESEL", label: "Diesel" },
          { value: "ELECTRIC", label: "Electric" }, { value: "HYBRID", label: "Hybrid" },
          { value: "CNG", label: "CNG" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Registration Number" error={errors.registrationNumber?.message as string}>
        <TextInput {...register("registrationNumber")} placeholder="e.g. MH12AB1234" />
      </FormField>
      <FormField label="Purchase Price" error={errors.purchasePrice?.message as string}>
        <TextInput {...register("purchasePrice", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
    </div>
  );
}

function CollectibleDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Category" required error={errors.category?.message as string}>
        <SelectField {...register("category")} placeholder="Select category" options={[
          { value: "WATCH", label: "Watch" }, { value: "ART", label: "Art" },
          { value: "CAR", label: "Classic Car" }, { value: "COIN", label: "Coin" },
          { value: "STAMP", label: "Stamp" }, { value: "WINE", label: "Wine" },
          { value: "SNEAKER", label: "Sneaker" }, { value: "JEWELLERY", label: "Jewellery" },
          { value: "ANTIQUE", label: "Antique" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Brand" error={errors.brand?.message as string}>
        <TextInput {...register("brand")} placeholder="e.g. Rolex" />
      </FormField>
      <FormField label="Model / Name" error={errors.model?.message as string}>
        <TextInput {...register("model")} placeholder="e.g. Submariner" />
      </FormField>
      <FormField label="Condition" error={errors.condition?.message as string}>
        <SelectField {...register("condition")} placeholder="Select condition" options={[
          { value: "MINT", label: "Mint" }, { value: "EXCELLENT", label: "Excellent" },
          { value: "GOOD", label: "Good" }, { value: "FAIR", label: "Fair" }, { value: "POOR", label: "Poor" },
        ]} />
      </FormField>
      <FormField label="Purchase Price" error={errors.purchasePrice?.message as string}>
        <TextInput {...register("purchasePrice", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
    </div>
  );
}

function NftDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Collection Name" required error={errors.collection?.message as string}>
        <TextInput {...register("collection")} placeholder="e.g. Bored Ape Yacht Club" />
      </FormField>
      <FormField label="Token ID" required error={errors.tokenId?.message as string}>
        <TextInput {...register("tokenId")} placeholder="e.g. #1234" />
      </FormField>
      <FormField label="Blockchain" required error={errors.blockchain?.message as string}>
        <SelectField {...register("blockchain")} placeholder="Select blockchain" options={[
          { value: "ETHEREUM", label: "Ethereum" }, { value: "SOLANA", label: "Solana" },
          { value: "POLYGON", label: "Polygon" }, { value: "BINANCE", label: "BNB Chain" },
          { value: "AVALANCHE", label: "Avalanche" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Contract Address" error={errors.contractAddress?.message as string}>
        <TextInput {...register("contractAddress")} placeholder="0x..." />
      </FormField>
    </div>
  );
}

function BusinessDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Company Name" required error={errors.companyName?.message as string}>
        <TextInput {...register("companyName")} placeholder="e.g. Acme Corp" />
      </FormField>
      <FormField label="Your Stake (%)" required error={errors.stakePercent?.message as string}>
        <TextInput {...register("stakePercent", { valueAsNumber: true })} type="number" step="0.01" min="0" max="100" placeholder="0.00" />
      </FormField>
      <FormField label="Stage" error={errors.stage?.message as string}>
        <SelectField {...register("stage")} placeholder="Select stage" options={[
          { value: "IDEA", label: "Idea" }, { value: "PRE_SEED", label: "Pre-Seed" },
          { value: "SEED", label: "Seed" }, { value: "SERIES_A", label: "Series A" },
          { value: "SERIES_B", label: "Series B+" }, { value: "GROWTH", label: "Growth" },
          { value: "PROFITABLE", label: "Profitable" }, { value: "PUBLIC", label: "Public" },
        ]} />
      </FormField>
      <FormField label="Industry" error={errors.industry?.message as string}>
        <TextInput {...register("industry")} placeholder="e.g. Fintech" />
      </FormField>
      <FormField label="Annual Revenue" hint="Optional" error={errors.revenue?.message as string}>
        <TextInput {...register("revenue", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
    </div>
  );
}

function RetirementDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Account Type" required error={errors.accountType?.message as string}>
        <SelectField {...register("accountType")} placeholder="Select type" options={[
          { value: "401K", label: "401(k)" }, { value: "IRA", label: "IRA" },
          { value: "ROTH_IRA", label: "Roth IRA" }, { value: "NPS", label: "NPS (India)" },
          { value: "EPF", label: "EPF (India)" }, { value: "PPF", label: "PPF (India)" },
          { value: "SUPERANNUATION", label: "Superannuation (AU)" },
          { value: "PENSION", label: "Pension" }, { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Provider / Employer" error={errors.provider?.message as string}>
        <TextInput {...register("provider")} placeholder="e.g. Vanguard / Infosys" />
      </FormField>
      <FormField label="Account / PRAN Number" hint="Optional" error={errors.accountNumber?.message as string}>
        <TextInput {...register("accountNumber")} placeholder="Account number" />
      </FormField>
      <FormField label="Monthly Employee Contribution" error={errors.employeeContribution?.message as string}>
        <TextInput {...register("employeeContribution", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Monthly Employer Contribution" error={errors.employerContribution?.message as string}>
        <TextInput {...register("employerContribution", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
    </div>
  );
}

function InsuranceDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Insurance Type" required error={errors.subType?.message as string}>
        <SelectField {...register("subType")} placeholder="Select type" options={[
          { value: "LIFE", label: "Life" }, { value: "HEALTH", label: "Health" },
          { value: "VEHICLE", label: "Vehicle" }, { value: "HOME", label: "Home" },
          { value: "TRAVEL", label: "Travel" }, { value: "ULIP", label: "ULIP" },
          { value: "TERM", label: "Term Life" }, { value: "ENDOWMENT", label: "Endowment" },
          { value: "OTHER", label: "Other" },
        ]} />
      </FormField>
      <FormField label="Insurance Company" required error={errors.insurer?.message as string}>
        <TextInput {...register("insurer")} placeholder="e.g. LIC, Max Life" />
      </FormField>
      <FormField label="Sum Assured (Coverage)" required error={errors.sumAssured?.message as string}>
        <TextInput {...register("sumAssured", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Annual Premium" required error={errors.annualPremium?.message as string}>
        <TextInput {...register("annualPremium", { valueAsNumber: true })} type="number" placeholder="0" />
      </FormField>
      <FormField label="Renewal Date" required error={errors.renewalDate?.message as string}>
        <DateInput {...register("renewalDate")} />
      </FormField>
      <FormField label="Nominee" error={errors.nominee?.message as string}>
        <TextInput {...register("nominee")} placeholder="Nominee name" />
      </FormField>
      <FormField label="Policy Number" error={errors.policyNumber?.message as string}>
        <TextInput {...register("policyNumber")} placeholder="Policy number" />
      </FormField>
    </div>
  );
}

function MutualFundDetails({ register, errors }: DetailProps) {
  return (
    <div style={fieldGrid}>
      <FormField label="Fund Name" required error={errors.fundName?.message as string}>
        <TextInput {...register("fundName")} placeholder="e.g. Mirae Asset Large Cap" />
      </FormField>
      <FormField label="Units" required error={errors.units?.message as string}>
        <TextInput {...register("units", { valueAsNumber: true })} type="number" step="0.001" placeholder="0" />
      </FormField>
      <FormField label="Current NAV" required error={errors.nav?.message as string}>
        <TextInput {...register("nav", { valueAsNumber: true })} type="number" step="0.01" placeholder="0.00" />
      </FormField>
      <FormField label="Fund Type" error={errors.fundType?.message as string}>
        <SelectField {...register("fundType")} placeholder="Select type" options={[
          { value: "EQUITY", label: "Equity" }, { value: "DEBT", label: "Debt" },
          { value: "HYBRID", label: "Hybrid" }, { value: "LIQUID", label: "Liquid" },
          { value: "ELSS", label: "ELSS (Tax Saving)" }, { value: "INDEX", label: "Index" },
        ]} />
      </FormField>
      <FormField label="ISIN" hint="Optional" error={errors.isin?.message as string}>
        <TextInput {...register("isin")} placeholder="INF123X01234" />
      </FormField>
      <FormField label="Platform" error={errors.platform?.message as string}>
        <TextInput {...register("platform")} placeholder="e.g. Zerodha, Groww" />
      </FormField>
    </div>
  );
}

// ─── Detail form router ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DetailProps = { register: any; errors: any };

function DetailFields({ type, register, errors }: DetailProps & { type: AssetType }) {
  switch (type) {
    case "CASH": return <CashDetails register={register} errors={errors} />;
    case "FIXED_DEPOSIT": return <FixedDepositDetails register={register} errors={errors} />;
    case "STOCK": case "ETF": return <StockDetails register={register} errors={errors} />;
    case "MUTUAL_FUND": return <MutualFundDetails register={register} errors={errors} />;
    case "CRYPTO": return <CryptoDetails register={register} errors={errors} />;
    case "GOLD": case "SILVER": return <GoldDetails register={register} errors={errors} />;
    case "REAL_ESTATE": return <RealEstateDetails register={register} errors={errors} />;
    case "VEHICLE": return <VehicleDetails register={register} errors={errors} />;
    case "COLLECTIBLE": return <CollectibleDetails register={register} errors={errors} />;
    case "NFT": return <NftDetails register={register} errors={errors} />;
    case "BUSINESS_EQUITY": case "PRIVATE_EQUITY": case "ANGEL_INVESTMENT":
      return <BusinessDetails register={register} errors={errors} />;
    case "RETIREMENT_ACCOUNT": return <RetirementDetails register={register} errors={errors} />;
    case "INSURANCE": return <InsuranceDetails register={register} errors={errors} />;
    default: return (
      <FormField label="Description" error={errors.description?.message as string}>
        <TextInput {...register("description")} placeholder="Describe this asset" />
      </FormField>
    );
  }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Basics", "Details", "Notes", "Documents"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: i === current ? 24 : 8, height: 8,
            borderRadius: 4,
            background: i < current ? "var(--color-gain)" : i === current ? "var(--color-accent)" : "var(--color-border-strong)",
            transition: "all 0.3s ease",
          }} />
        </div>
      ))}
      <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
        Step {current + 1} of {total} — {STEPS[current]}
      </span>
    </div>
  );
}

// ─── Main AssetForm ───────────────────────────────────────────────────────────

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 16,
};

interface AssetFormProps {
  type: AssetType;
  defaultValues?: Partial<Record<string, unknown>>;
  onSuccess: (data: {
    name: string;
    type: string;
    currentValue: number;
    currencyCode: string;
    notes?: string | undefined;
    details: Record<string, unknown>;
  }) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function AssetForm({ type, defaultValues, onSuccess, onBack, isLoading }: AssetFormProps) {
  const [step, setStep] = useState(0);
  const meta = ASSET_TYPE_META[type] ?? { label: type, icon: "💎", color: "#3D83FF" };

  const { control, register, handleSubmit, formState: { errors } } = useForm<Record<string, unknown>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(BaseSchema) as any,
    defaultValues: {
      name: "",
      currentValue: 0,
      currencyCode: "INR",
      notes: "",
      ...defaultValues,
    },
  });

  const onSubmit = (data: Record<string, unknown>) => {
    const { name, currentValue, currencyCode, notes, details: _d, ...rest } = data;
    const details: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) details[k] = v;
    onSuccess({
      name: name as string,
      type,
      currentValue: Number(currentValue),
      currencyCode: currencyCode as string,
      notes: (notes as string | undefined) ?? undefined,
      details,
    });
  };

  const goNext = async () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goPrev = () => { if (step === 0 && onBack) onBack(); else setStep((s) => Math.max(s - 1, 0)); };

  const slideVariants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "var(--radius-md)",
          background: meta.color + "20", border: `1px solid ${meta.color}40`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem",
        }}>
          {meta.icon}
        </div>
        <div>
          <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "1rem" }}>
            Add {meta.label}
          </h3>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{type}</p>
        </div>
      </div>

      <StepIndicator current={step} total={STEPS.length} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 4 }}
        >
          {/* Step 0: Basic info */}
          {step === 0 && (
            <>
              <FormField label="Asset Name" required error={errors.name?.message as string} htmlFor="asset-name">
                <TextInput {...register("name")} id="asset-name" placeholder={`e.g. My ${meta.label}`} />
              </FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
                <FormField label="Current Value" required error={errors.currentValue?.message as string}>
                  <Controller
                    name="currentValue"
                    control={control}
                    render={({ field }) => (
                      <CurrencyInput
                        value={field.value as number}
                        onChange={field.onChange}
                        error={!!errors.currentValue}
                      />
                    )}
                  />
                </FormField>
                <FormField label="Currency" required>
                  <Controller
                    name="currencyCode"
                    control={control}
                    render={({ field }) => (
                      <SelectField
                        value={field.value as string}
                        onChange={field.onChange}
                        options={[
                          { value: "INR", label: "INR ₹" }, { value: "USD", label: "USD $" },
                          { value: "EUR", label: "EUR €" }, { value: "GBP", label: "GBP £" },
                          { value: "SGD", label: "SGD" }, { value: "AED", label: "AED" },
                          { value: "JPY", label: "JPY ¥" }, { value: "AUD", label: "AUD" },
                        ]}
                      />
                    )}
                  />
                </FormField>
              </div>
            </>
          )}

          {/* Step 1: Type-specific details */}
          {step === 1 && (
            <DetailFields
              type={type}
              register={register}
              errors={errors}
            />
          )}

          {/* Step 2: Notes */}
          {step === 2 && (
            <FormField label="Notes" hint="Any additional context (optional)">
              <TextArea {...register("notes")} placeholder="e.g. Purchased as part of tax-saving strategy..." rows={4} />
            </FormField>
          )}

          {/* Step 3: Documents */}
          {step === 3 && (
            <Controller
              name="documents"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <FileUploadZone
                  documents={(field.value as UploadedDocument[]) || []}
                  onChange={field.onChange}
                />
              )}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer buttons — always visible */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 24, paddingTop: 16,
        borderTop: "1px solid var(--color-border-glass)",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={goPrev}
          style={{
            padding: "0.625rem 1.25rem",
            background: "var(--color-bg-input)",
            border: "1px solid var(--color-border-glass)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-secondary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {step === 0 ? "← Back" : "Previous"}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            style={{
              padding: "0.625rem 1.5rem",
              background: "var(--color-accent)",
              border: "none",
              borderRadius: "var(--radius-md)",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Next →
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: "0.625rem 1.5rem",
              background: isLoading ? "var(--color-text-muted)" : "linear-gradient(135deg, var(--color-accent), #00D97E)",
              border: "none",
              borderRadius: "var(--radius-md)",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-sans)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isLoading ? "Saving…" : "✓ Save Asset"}
          </button>
        )}
      </div>
    </form>
  );
}
