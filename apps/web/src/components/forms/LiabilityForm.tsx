"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { FormField } from "./FormField";
import { CurrencyInput } from "./CurrencyInput";
import { TextInput, SelectField, DateInput, TextArea } from "./Inputs";

const LiabilityFormSchema = z.object({
  type: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required").max(200),
  principalAmount: z.number({ invalid_type_error: "Required" }).positive("Must be positive"),
  remainingBalance: z.number({ invalid_type_error: "Required" }).min(0, "Cannot be negative"),
  interestRate: z.number({ invalid_type_error: "Required" }).min(0).max(100, "Must be 0–100"),
  currencyCode: z.string().min(1),
  emiAmount: z.number().min(0).optional(),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  maturityDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

type LiabilityFormValues = z.infer<typeof LiabilityFormSchema>;

const LIABILITY_TYPES = [
  { value: "MORTGAGE", label: "🏠 Mortgage / Home Loan" },
  { value: "CAR_LOAN", label: "🚗 Car Loan" },
  { value: "EDUCATION_LOAN", label: "🎓 Education Loan" },
  { value: "PERSONAL_LOAN", label: "💳 Personal Loan" },
  { value: "CREDIT_CARD", label: "💳 Credit Card" },
  { value: "OTHER", label: "📋 Other" },
];

interface LiabilityFormProps {
  defaultValues?: Partial<LiabilityFormValues>;
  onSuccess: (data: LiabilityFormValues) => void;
  isLoading?: boolean;
}

const sectionTitle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: "1px solid var(--color-border-glass)",
};

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 16,
};

export function LiabilityForm({ defaultValues, onSuccess, isLoading }: LiabilityFormProps) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<LiabilityFormValues>({
    resolver: zodResolver(LiabilityFormSchema),
    defaultValues: {
      type: "",
      name: "",
      principalAmount: 0,
      remainingBalance: 0,
      interestRate: 0,
      currencyCode: "INR",
      ...defaultValues,
    },
  });

  return (
    <motion.form
      onSubmit={handleSubmit(onSuccess)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: "flex", flexDirection: "column", gap: 28 }}
    >
      {/* ── Section 1: Loan Details ── */}
      <section>
        <p style={sectionTitle}>Loan Details</p>
        <div style={{ ...fieldGrid, gridTemplateColumns: "1fr 1fr" }}>
          <FormField label="Liability Type" required error={errors.type?.message}>
            <SelectField {...register("type")} placeholder="Select type" options={LIABILITY_TYPES} />
          </FormField>
          <FormField label="Name / Label" required error={errors.name?.message}>
            <TextInput {...register("name")} placeholder="e.g. HDFC Home Loan" />
          </FormField>
        </div>

        <div style={{ ...fieldGrid, marginTop: 16 }}>
          <FormField label="Principal Amount" required error={errors.principalAmount?.message}>
            <Controller
              name="principalAmount"
              control={control}
              render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} error={!!errors.principalAmount} />
              )}
            />
          </FormField>
          <FormField label="Remaining Balance" required error={errors.remainingBalance?.message}>
            <Controller
              name="remainingBalance"
              control={control}
              render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} error={!!errors.remainingBalance} />
              )}
            />
          </FormField>
          <FormField label="Currency" required>
            <Controller
              name="currencyCode"
              control={control}
              render={({ field }) => (
                <SelectField value={field.value} onChange={field.onChange} options={[
                  { value: "INR", label: "INR ₹" }, { value: "USD", label: "USD $" },
                  { value: "EUR", label: "EUR €" }, { value: "GBP", label: "GBP £" },
                ]} />
              )}
            />
          </FormField>
        </div>
      </section>

      {/* ── Section 2: Repayment ── */}
      <section>
        <p style={sectionTitle}>Repayment</p>
        <div style={fieldGrid}>
          <FormField label="Interest Rate (% p.a.)" required error={errors.interestRate?.message}>
            <TextInput {...register("interestRate", { valueAsNumber: true })} type="number" step="0.01" min="0" max="100" placeholder="8.5" />
          </FormField>
          <FormField label="EMI Amount" hint="Monthly instalment" error={errors.emiAmount?.message}>
            <Controller
              name="emiAmount"
              control={control}
              render={({ field }) => (
                <CurrencyInput value={field.value ?? 0} onChange={field.onChange} />
              )}
            />
          </FormField>
        </div>
      </section>

      {/* ── Section 3: Dates ── */}
      <section>
        <p style={sectionTitle}>Dates</p>
        <div style={fieldGrid}>
          <FormField label="Start Date" error={errors.startDate?.message}>
            <DateInput {...register("startDate")} />
          </FormField>
          <FormField label="Next Due Date" error={errors.dueDate?.message}>
            <DateInput {...register("dueDate")} />
          </FormField>
          <FormField label="Maturity Date" error={errors.maturityDate?.message}>
            <DateInput {...register("maturityDate")} />
          </FormField>
        </div>
      </section>

      {/* ── Notes ── */}
      <FormField label="Notes" hint="Optional">
        <TextArea {...register("notes")} placeholder="e.g. Linked to property at 42 MG Road..." rows={3} />
      </FormField>

      {/* ── Submit ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "0.75rem 2rem",
            background: isLoading ? "var(--color-text-muted)" : "linear-gradient(135deg, #FF4D6D, #E67E22)",
            border: "none",
            borderRadius: "var(--radius-md)",
            color: "#fff",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {isLoading ? "Saving…" : "✓ Save Liability"}
        </button>
      </div>
    </motion.form>
  );
}
