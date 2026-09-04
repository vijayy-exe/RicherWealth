"use client";

import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toMonthlyAmount, type RecurringFrequency } from "@richer/shared-types";
import { FormField } from "./FormField";
import { CurrencyInput } from "./CurrencyInput";
import { TextInput, SelectField, DateInput, TextArea } from "./Inputs";

const IncomeFormSchema = z.object({
  sourceType: z.string().min(1, "Source type is required"),
  name: z.string().min(1, "Name is required").max(200),
  amount: z.number({ invalid_type_error: "Required" }).positive("Must be positive"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "ONE_TIME"]),
  currencyCode: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

type IncomeFormValues = z.infer<typeof IncomeFormSchema>;

const SOURCE_TYPES = [
  { value: "SALARY", label: "💼 Salary" },
  { value: "BUSINESS", label: "🏢 Business" },
  { value: "RENTAL", label: "🏠 Rental" },
  { value: "DIVIDENDS", label: "📈 Dividends" },
  { value: "ROYALTIES", label: "📚 Royalties" },
  { value: "FREELANCE", label: "💻 Freelance" },
  { value: "INTEREST", label: "🏦 Interest" },
  { value: "AFFILIATE", label: "🔗 Affiliate" },
  { value: "YOUTUBE", label: "▶️ YouTube" },
  { value: "OTHER", label: "📋 Other" },
];

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "ONE_TIME", label: "One-time" },
];

interface IncomeFormProps {
  onSuccess: (data: IncomeFormValues) => void;
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

export function IncomeForm({ onSuccess, isLoading }: IncomeFormProps) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<IncomeFormValues>({
    resolver: zodResolver(IncomeFormSchema),
    defaultValues: { sourceType: "", name: "", amount: 0, frequency: "MONTHLY", currencyCode: "INR" },
  });

  const amount = useWatch({ control, name: "amount" });
  const frequency = useWatch({ control, name: "frequency" });
  const currencyCode = useWatch({ control, name: "currencyCode" });

  const monthlyPreview = amount > 0 ? toMonthlyAmount(amount, frequency as RecurringFrequency) : 0;

  return (
    <motion.form
      onSubmit={handleSubmit(onSuccess)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: "flex", flexDirection: "column", gap: 28 }}
    >
      <section>
        <p style={sectionTitle}>Income Source</p>
        <div style={{ ...fieldGrid, gridTemplateColumns: "1fr 1fr" }}>
          <FormField label="Source Type" required error={errors.sourceType?.message}>
            <SelectField {...register("sourceType")} placeholder="Select type" options={SOURCE_TYPES} />
          </FormField>
          <FormField label="Name / Label" required error={errors.name?.message}>
            <TextInput {...register("name")} placeholder="e.g. Acme Corp Salary" />
          </FormField>
        </div>

        <div style={{ ...fieldGrid, marginTop: 16 }}>
          <FormField label="Amount" required error={errors.amount?.message}>
            <Controller
              name="amount"
              control={control}
              render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} error={!!errors.amount} />
              )}
            />
          </FormField>
          <FormField label="Frequency" required error={errors.frequency?.message}>
            <Controller
              name="frequency"
              control={control}
              render={({ field }) => (
                <SelectField value={field.value} onChange={field.onChange} options={FREQUENCIES} />
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

        {amount > 0 && frequency !== "ONE_TIME" && (
          <div style={{
            marginTop: 16, padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: "var(--color-gain-muted, rgba(0,217,126,0.1))", fontSize: "0.8125rem", color: "var(--color-gain)",
          }}>
            ≈ {new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode || "USD", maximumFractionDigits: 0 }).format(monthlyPreview)} / month
          </div>
        )}
      </section>

      <section>
        <p style={sectionTitle}>Dates</p>
        <div style={fieldGrid}>
          <FormField label="Start Date" error={errors.startDate?.message}>
            <DateInput {...register("startDate")} />
          </FormField>
          <FormField label="End Date" hint="Optional — leave blank if ongoing">
            <DateInput {...register("endDate")} />
          </FormField>
        </div>
      </section>

      <FormField label="Notes" hint="Optional">
        <TextArea {...register("notes")} placeholder="e.g. Base salary, excludes bonus" rows={3} />
      </FormField>

      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "0.75rem 2rem",
            background: isLoading ? "var(--color-text-muted)" : "linear-gradient(135deg, #00D97E, #3D83FF)",
            border: "none",
            borderRadius: "var(--radius-md)",
            color: "#fff",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {isLoading ? "Saving…" : "✓ Save Income"}
        </button>
      </div>
    </motion.form>
  );
}
