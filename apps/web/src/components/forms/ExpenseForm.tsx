"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { FormField } from "./FormField";
import { CurrencyInput } from "./CurrencyInput";
import { TextInput, SelectField, DateInput } from "./Inputs";

const ExpenseFormSchema = z.object({
  merchant: z.string().min(1, "Merchant is required").max(200),
  amount: z.number({ invalid_type_error: "Required" }).positive("Must be positive"),
  date: z.string().min(1, "Date is required"),
  currencyCode: z.string().min(1),
  category: z.string().optional(),
});

export type ExpenseFormValues = z.infer<typeof ExpenseFormSchema>;

const CATEGORY_OPTIONS = [
  { value: "", label: "Auto-categorize" },
  { value: "TRAVEL", label: "✈️ Travel" },
  { value: "SHOPPING", label: "🛍️ Shopping" },
  { value: "FOOD", label: "🍔 Food" },
  { value: "UTILITIES", label: "💡 Utilities" },
  { value: "HEALTHCARE", label: "🏥 Healthcare" },
  { value: "ENTERTAINMENT", label: "🎬 Entertainment" },
  { value: "SUBSCRIPTIONS", label: "🔁 Subscriptions" },
  { value: "BILLS", label: "🧾 Bills" },
  { value: "OTHER", label: "📋 Other" },
];

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 16,
};

interface ExpenseFormProps {
  onSuccess: (data: ExpenseFormValues) => void;
  isLoading?: boolean;
}

export function ExpenseForm({ onSuccess, isLoading }: ExpenseFormProps) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<ExpenseFormValues>({
    resolver: zodResolver(ExpenseFormSchema),
    defaultValues: { merchant: "", amount: 0, date: new Date().toISOString().slice(0, 10), currencyCode: "INR", category: "" },
  });

  return (
    <motion.form onSubmit={handleSubmit(onSuccess)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FormField label="Merchant" required error={errors.merchant?.message}>
        <TextInput {...register("merchant")} placeholder="e.g. Starbucks" />
      </FormField>

      <div style={fieldGrid}>
        <FormField label="Amount" required error={errors.amount?.message}>
          <Controller name="amount" control={control} render={({ field }) => (
            <CurrencyInput value={field.value} onChange={field.onChange} error={!!errors.amount} />
          )} />
        </FormField>
        <FormField label="Date" required error={errors.date?.message}>
          <DateInput {...register("date")} />
        </FormField>
        <FormField label="Currency" required>
          <Controller name="currencyCode" control={control} render={({ field }) => (
            <SelectField value={field.value} onChange={field.onChange} options={[
              { value: "INR", label: "INR ₹" }, { value: "USD", label: "USD $" },
              { value: "EUR", label: "EUR €" }, { value: "GBP", label: "GBP £" },
            ]} />
          )} />
        </FormField>
      </div>

      <FormField label="Category" hint="Leave as Auto-categorize to let the rules engine assign one">
        <Controller name="category" control={control} render={({ field }) => (
          <SelectField value={field.value} onChange={field.onChange} options={CATEGORY_OPTIONS} />
        )} />
      </FormField>

      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button type="submit" disabled={isLoading} style={{
          padding: "0.75rem 2rem",
          background: isLoading ? "var(--color-text-muted)" : "linear-gradient(135deg, #FF4D6D, #E67E22)",
          border: "none", borderRadius: "var(--radius-md)", color: "#fff",
          fontSize: "0.9375rem", fontWeight: 600, cursor: isLoading ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)",
        }}>
          {isLoading ? "Saving…" : "✓ Add Expense"}
        </button>
      </div>
    </motion.form>
  );
}
