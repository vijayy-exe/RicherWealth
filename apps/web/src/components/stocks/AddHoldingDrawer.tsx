"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTickerSearch, type TickerSearchResult, type CreateHoldingInput } from "@/hooks/useStockHoldings";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { TextInput, SelectField, DateInput } from "@/components/forms/Inputs";

const EXCHANGES = [
  { value: "NASDAQ", label: "NASDAQ (US)" },
  { value: "NYSE", label: "NYSE (US)" },
  { value: "NSE", label: "NSE (India)" },
  { value: "BSE", label: "BSE (India)" },
  { value: "LSE", label: "LSE (UK)" },
  { value: "HKEX", label: "HKEX (Hong Kong)" },
  { value: "TSX", label: "TSX (Canada)" },
  { value: "ASX", label: "ASX (Australia)" },
];

const CURRENCIES = [
  { value: "USD", label: "USD $" },
  { value: "INR", label: "INR ₹" },
  { value: "GBP", label: "GBP £" },
  { value: "HKD", label: "HKD" },
  { value: "CAD", label: "CAD" },
  { value: "AUD", label: "AUD" },
];

function exchangeToCurrency(exchange: string): string {
  switch (exchange.toUpperCase()) {
    case "NSE":
    case "BSE": return "INR";
    case "LSE": return "GBP";
    case "HKEX": return "HKD";
    case "TSX": return "CAD";
    case "ASX": return "AUD";
    default: return "USD";
  }
}

const schema = z.object({
  ticker: z.string().min(1, "Required").max(20),
  exchange: z.string().min(1, "Required"),
  quantity: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  avgBuyPrice: z.number({ invalid_type_error: "Required" }).positive("Must be > 0"),
  currency: z.string().min(1),
  purchaseDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AddHoldingDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (dto: CreateHoldingInput) => Promise<void>;
  isLoading?: boolean;
}

// ─── Ticker Autocomplete ──────────────────────────────────────────────────────

interface TickerSearchProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (result: TickerSearchResult) => void;
}

function TickerSearch({ value, onChange, onSelect }: TickerSearchProps) {
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<TickerSearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isLoading } = useTickerSearch(query);

  // Reset when form resets (value goes back to "")
  useEffect(() => {
    if (!value) {
      setQuery("");
      setSelected(null);
      setShowDropdown(false);
    }
  }, [value]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    onChange(v);
    setSelected(null);
    if (v.length > 0) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  // Use onMouseDown so the selection registers BEFORE the input blur fires
  const handleSelect = useCallback((result: TickerSearchResult) => {
    setSelected(result);
    setQuery(result.symbol);
    onChange(result.symbol);
    onSelect(result);
    setShowDropdown(false);
  }, [onChange, onSelect]);

  const shouldShowDropdown = showDropdown && query.length > 0;
  const hasContent = isLoading || results.length > 0 || (!isLoading && query.length >= 2 && results.length === 0);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={query}
        onChange={handleInput}
        onFocus={() => {
          if (query.length > 0) setShowDropdown(true);
        }}
        onBlur={() => {
          // Delay close so onMouseDown on items can fire first
          setTimeout(() => setShowDropdown(false), 200);
        }}
        placeholder="Search: AAPL, Reliance, MSFT, HDFC…"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "0.625rem 1rem",
          background: "var(--color-bg-input)",
          border: `1px solid ${showDropdown ? "var(--color-accent)" : "var(--color-border-glass)"}`,
          borderRadius: showDropdown ? "var(--radius-md) var(--radius-md) 0 0" : "var(--radius-md)",
          color: "var(--color-text-primary)",
          fontSize: "0.9375rem",
          fontFamily: "var(--font-sans)",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.15s, border-radius 0.1s",
        }}
      />

      {/* Dropdown — always rendered when showDropdown so clicks register */}
      {shouldShowDropdown && hasContent && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-accent)",
            borderTop: "none",
            borderRadius: "0 0 var(--radius-md) var(--radius-md)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {/* Loading skeleton */}
          {isLoading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px",
              color: "var(--color-text-muted)", fontSize: "0.8125rem",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid var(--color-accent)",
                borderTopColor: "transparent",
                animation: "spin 0.7s linear infinite",
              }} />
              Searching for &quot;{query}&quot;…
            </div>
          )}

          {/* Results */}
          {!isLoading && results.map((r, i) => (
            <button
              key={`${r.symbol}-${r.exchange}-${i}`}
              type="button"
              // onMouseDown fires before onBlur, so the dropdown stays open long enough
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur on input
                handleSelect(r);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: i < results.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                color: "var(--color-text-primary)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(61,131,255,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{
                  fontWeight: 800, fontFamily: "var(--font-mono)",
                  marginRight: 10, color: "var(--color-accent)", fontSize: "0.9375rem",
                }}>
                  {r.symbol}
                </span>
                <span style={{
                  fontSize: "0.8125rem", color: "var(--color-text-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: 8 }}>
                <span style={{
                  fontSize: "0.6875rem", fontWeight: 700,
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(61,131,255,0.12)",
                  color: "var(--color-accent)", whiteSpace: "nowrap",
                }}>
                  {r.exchange}
                </span>
                <span style={{
                  fontSize: "0.6875rem", fontWeight: 600,
                  padding: "2px 6px", borderRadius: 4,
                  background: "rgba(92,104,128,0.12)",
                  color: "var(--color-text-muted)",
                }}>
                  {r.currency}
                </span>
              </div>
            </button>
          ))}

          {/* No results */}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div style={{
              padding: "12px 16px",
              color: "var(--color-text-muted)", fontSize: "0.8125rem",
              lineHeight: 1.5,
            }}>
              No results for &quot;{query}&quot;
              {query.includes(".") && (
                <span> — try without the dot, e.g. <strong style={{ color: "var(--color-text-secondary)" }}>{query.split(".")[0]}</strong></span>
              )}
              {!query.includes(".") && (
                <span> — try a shorter name or exact ticker symbol</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Selected chip */}
      {selected && (
        <div style={{
          marginTop: 7, fontSize: "0.75rem",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ color: "#00D97E", fontSize: "0.875rem" }}>✓</span>
          <span style={{ color: "var(--color-text-muted)" }}>{selected.name}</span>
          <span style={{
            padding: "2px 7px", borderRadius: 4,
            background: "rgba(61,131,255,0.12)", color: "var(--color-accent)",
            fontSize: "0.6875rem", fontWeight: 700,
          }}>
            {selected.exchange} · {selected.currency}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function AddHoldingDrawer({ open, onClose, onSave, isLoading }: AddHoldingDrawerProps) {
  const {
    control, register, handleSubmit,
    formState: { errors },
    reset, setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ticker: "",
      exchange: "NASDAQ",
      quantity: "" as unknown as number,
      avgBuyPrice: "" as unknown as number,
      currency: "USD",
    },
  });

  const onSubmit = async (data: FormValues) => {
    await onSave({
      ticker: data.ticker,
      exchange: data.exchange,
      quantity: data.quantity,
      avgBuyPrice: data.avgBuyPrice,
      currency: data.currency,
      purchaseDate: data.purchaseDate ?? undefined,
    });
    reset();
  };

  const handleTickerSelect = useCallback((result: TickerSearchResult) => {
    setValue("exchange", result.exchange, { shouldValidate: true, shouldDirty: true });
    const currency = result.currency ?? exchangeToCurrency(result.exchange);
    setValue("currency", currency, { shouldValidate: true, shouldDirty: true });
  }, [setValue]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Reset form when drawer closes
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const sectionTitle: React.CSSProperties = {
    fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "var(--color-text-muted)",
    marginBottom: 12, paddingBottom: 8,
    borderBottom: "1px solid var(--color-border-glass)",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 90,
              background: "rgba(9,14,26,0.6)", backdropFilter: "blur(3px)",
            }}
          />

          {/* Slide-in drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            style={{
              position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 91,
              width: "min(480px, 100vw)",
              background: "var(--color-bg-elevated)",
              borderLeft: "1px solid var(--color-border-strong)",
              display: "flex", flexDirection: "column",
              boxShadow: "-16px 0 48px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "20px 24px", borderBottom: "1px solid var(--color-border-glass)",
              flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontWeight: 800, fontSize: "1.125rem", color: "var(--color-text-primary)" }}>
                  Add Stock Holding
                </h2>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                  Search for any stock — exchange &amp; currency auto-fill on select
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: "var(--radius-full)",
                  background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
                  color: "var(--color-text-muted)", fontSize: "1.125rem", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
            </div>

            {/* Scrollable form body */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              style={{
                flex: 1, overflowY: "auto",
                padding: "24px", display: "flex", flexDirection: "column", gap: 24,
              }}
            >
              {/* ── Section 1: Stock ── */}
              <section>
                <p style={sectionTitle}>Stock Identity</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  <FormField
                    label="Search Ticker or Company Name"
                    required
                    error={errors.ticker?.message as string | undefined}
                  >
                    <Controller
                      name="ticker"
                      control={control}
                      render={({ field }) => (
                        <TickerSearch
                          value={field.value}
                          onChange={field.onChange}
                          onSelect={handleTickerSelect}
                        />
                      )}
                    />
                  </FormField>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField
                      label="Exchange"
                      required
                      error={errors.exchange?.message as string | undefined}
                    >
                      <SelectField {...register("exchange")} options={EXCHANGES} />
                    </FormField>
                    <FormField label="Currency">
                      <SelectField {...register("currency")} options={CURRENCIES} />
                    </FormField>
                  </div>
                </div>
              </section>

              {/* ── Section 2: Position ── */}
              <section>
                <p style={sectionTitle}>Position</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <FormField
                    label="Quantity"
                    required
                    error={errors.quantity?.message as string | undefined}
                  >
                    <TextInput
                      {...register("quantity", { valueAsNumber: true })}
                      type="number"
                      min="0.001"
                      step="any"
                      placeholder="10"
                    />
                  </FormField>
                  <FormField
                    label="Avg Buy Price"
                    required
                    error={errors.avgBuyPrice?.message as string | undefined}
                  >
                    <Controller
                      name="avgBuyPrice"
                      control={control}
                      render={({ field }) => (
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          error={!!errors.avgBuyPrice}
                        />
                      )}
                    />
                  </FormField>
                </div>
              </section>

              {/* ── Section 3: Purchase Date ── */}
              <section>
                <p style={sectionTitle}>
                  Purchase Date{" "}
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    (optional — used for CAGR)
                  </span>
                </p>
                <DateInput {...register("purchaseDate")} />
              </section>

              {/* Tip */}
              <div style={{
                padding: "10px 14px",
                background: "rgba(61,131,255,0.07)",
                border: "1px solid rgba(61,131,255,0.18)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.75rem", color: "var(--color-text-muted)", lineHeight: 1.5,
              }}>
                💡 Live price fetches after you save. Falls back through Finnhub → Twelve Data if Alpha Vantage is rate-limited.
              </div>

              <div style={{ flex: 1 }} />

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  padding: "0.875rem",
                  background: isLoading
                    ? "var(--color-bg-input)"
                    : "linear-gradient(135deg, var(--color-accent), #00D97E)",
                  border: isLoading ? "1px solid var(--color-border-glass)" : "none",
                  borderRadius: "var(--radius-md)",
                  color: isLoading ? "var(--color-text-muted)" : "#fff",
                  fontWeight: 700, fontSize: "0.9375rem",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-sans)", width: "100%",
                  transition: "opacity 0.15s",
                }}
              >
                {isLoading ? "⏳ Fetching live price…" : "✓ Add Holding"}
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
