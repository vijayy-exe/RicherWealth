"use client";

import { useMemo, useState } from "react";
import { use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, type ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  generateAmortizationSchedule,
  calculatePrepaymentSavings,
  type PaymentFrequency,
  type AmortizationScheduleEntry,
} from "@richer/shared-types";

import { useLiability, useDeleteLiability, useCreditCardPayoff, type LiabilityRow } from "@/hooks/useLiabilities";

const LIABILITY_META: Record<string, { label: string; icon: string; color: string }> = {
  MORTGAGE: { label: "Mortgage", icon: "🏠", color: "#9B59B6" },
  CAR_LOAN: { label: "Car Loan", icon: "🚗", color: "#3D83FF" },
  EDUCATION_LOAN: { label: "Education Loan", icon: "🎓", color: "#00D97E" },
  PERSONAL_LOAN: { label: "Personal Loan", icon: "💳", color: "#F5A623" },
  CREDIT_CARD: { label: "Credit Card", icon: "💳", color: "#E74C3C" },
  OTHER: { label: "Other", icon: "📋", color: "#5C6880" },
};

function formatCurrency(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (currency === "INR") {
    if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatFull(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

/** Months elapsed since startDate — used to find "today's" row in a nominal schedule. */
function elapsedMonths(startDate: string | null | undefined): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
}

const statCard: React.CSSProperties = {
  padding: "16px 20px",
  background: "var(--color-bg-card)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-lg)",
};

const statLabel: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 6,
};

const sectionTitle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: "1.25rem",
};

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const { data: liability, isLoading, isError } = useLiability(id);
  const deleteLiability = useDeleteLiability();

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 80, color: "var(--color-text-muted)" }}>Loading…</div>;
  }
  if (isError || !liability) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <p style={{ color: "var(--color-loss)", marginBottom: 16 }}>Couldn&apos;t load this liability.</p>
        <Link href="/liabilities" style={{ color: "var(--color-accent)" }}>← Back to Liabilities</Link>
      </div>
    );
  }

  const meta = LIABILITY_META[liability.type] ?? { label: liability.type, icon: "📋", color: "#5C6880" };
  const isCreditCard = liability.type === "CREDIT_CARD";

  const handleDelete = () => {
    if (confirm(`Delete "${liability.name}"?`)) {
      deleteLiability.mutate(id, { onSuccess: () => router.push("/liabilities") });
    }
  };

  const daysUntilDue = (() => {
    if (!liability.dueDate) return null;
    const due = new Date(liability.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86_400_000);
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Link href="/liabilities" style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", textDecoration: "none" }}>
        ← Back to Liabilities
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: "1.5rem" }}>{meta.icon}</span>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{liability.name}</h1>
            <span style={{
              padding: "2px 10px", borderRadius: 20, background: meta.color + "20", color: meta.color,
              fontSize: "0.75rem", fontWeight: 700,
            }}>
              {meta.label}
            </span>
          </div>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            {liability.interestRate}% p.a. · {liability.currencyCode}
            {daysUntilDue !== null && (
              <span style={{ color: daysUntilDue < 0 ? "var(--color-loss)" : daysUntilDue <= 7 ? "#FFB547" : "var(--color-text-muted)" }}>
                {" · "}{daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? "Due today" : `Next due in ${daysUntilDue}d`}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleDelete}
          style={{
            padding: "0.5rem 1rem", background: "transparent", border: "1px solid var(--color-border-glass)",
            borderRadius: "var(--radius-md)", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "0.8125rem",
          }}
        >
          🗑 Delete
        </button>
      </motion.div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={statCard}>
          <p style={statLabel}>Outstanding</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-loss)" }}>
            {formatCurrency(parseFloat(liability.remainingBalance), liability.currencyCode)}
          </p>
        </div>
        <div style={statCard}>
          <p style={statLabel}>Original Principal</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-text-primary)" }}>
            {formatCurrency(parseFloat(liability.principalAmount), liability.currencyCode)}
          </p>
        </div>
        <div style={statCard}>
          <p style={statLabel}>{isCreditCard ? "APR" : "Interest Rate"}</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-warning, #FFB547)" }}>
            {liability.interestRate}%
          </p>
        </div>
        {!isCreditCard && liability.emiAmount && (
          <div style={statCard}>
            <p style={statLabel}>EMI</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-text-primary)" }}>
              {formatCurrency(parseFloat(liability.emiAmount), liability.currencyCode)}
            </p>
          </div>
        )}
      </div>

      {isCreditCard ? (
        <CreditCardDetail liability={liability} />
      ) : (
        <AmortizedLoanDetail liability={liability} />
      )}
    </div>
  );
}

// ─── Amortized loan (mortgage / car / education / personal / other) ───────────

function AmortizedLoanDetail({ liability }: { liability: LiabilityRow }) {
  const principal = parseFloat(liability.principalAmount);
  const remainingBalance = parseFloat(liability.remainingBalance);
  const annualRatePct = parseFloat(liability.interestRate);
  const paymentFrequency = liability.paymentFrequency as PaymentFrequency;
  const tenureMonths = liability.tenureMonths ?? null;

  const [extraPayment, setExtraPayment] = useState(0);

  // Baseline schedule computed once from the loan's original terms — this is
  // the "shared amortization engine" (@richer/shared-types) also used by
  // apps/api for the persisted /amortization endpoint, so these numbers are
  // guaranteed to match what the backend would compute for the same inputs.
  const scheduleResult = useMemo(() => {
    if (!tenureMonths) return null;
    return generateAmortizationSchedule({ principal, annualRatePct, tenureMonths, paymentFrequency });
  }, [principal, annualRatePct, tenureMonths, paymentFrequency]);

  const elapsed = elapsedMonths(liability.startDate);
  const remainingTenure = tenureMonths ? Math.max(1, tenureMonths - elapsed) : 0;
  const sliderMax = scheduleResult ? Math.round(scheduleResult.scheduledPayment * 4) || 1000 : 1000;

  // Prepayment "what if" — recomputed on every slider tick, entirely in the
  // browser. No network round-trip, so this is genuinely real time.
  const prepayment = useMemo(() => {
    if (!tenureMonths || extraPayment <= 0) return null;
    return calculatePrepaymentSavings({
      principal: remainingBalance,
      annualRatePct,
      tenureMonths: remainingTenure,
      paymentFrequency,
      extraPaymentPerPeriod: extraPayment,
    });
  }, [remainingBalance, annualRatePct, remainingTenure, paymentFrequency, extraPayment, tenureMonths]);

  const todaySnapshot: AmortizationScheduleEntry | null = scheduleResult
    ? scheduleResult.schedule[Math.min(elapsed, scheduleResult.schedule.length - 1)] ?? null
    : null;

  const columnDefs: ColDef<AmortizationScheduleEntry>[] = [
    { field: "period", headerName: "#", width: 70 },
    {
      field: "payment", headerName: "Payment", flex: 1,
      cellRenderer: (p: { data: AmortizationScheduleEntry }) => formatFull(p.data.payment, liability.currencyCode),
    },
    {
      field: "principalPortion", headerName: "Principal", flex: 1,
      cellRenderer: (p: { data: AmortizationScheduleEntry }) => formatFull(p.data.principalPortion, liability.currencyCode),
    },
    {
      field: "interestPortion", headerName: "Interest", flex: 1,
      cellRenderer: (p: { data: AmortizationScheduleEntry }) => (
        <span style={{ color: "var(--color-warning, #FFB547)" }}>{formatFull(p.data.interestPortion, liability.currencyCode)}</span>
      ),
    },
    {
      field: "remainingBalance", headerName: "Balance", flex: 1,
      cellRenderer: (p: { data: AmortizationScheduleEntry }) => formatFull(p.data.remainingBalance, liability.currencyCode),
    },
    {
      field: "interestToPrincipalRatio", headerName: "Int:Princ", width: 110,
      cellRenderer: (p: { data: AmortizationScheduleEntry }) => p.data.interestToPrincipalRatio.toFixed(2),
    },
  ];

  if (!tenureMonths || !scheduleResult) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 8 }}>
          No amortization schedule yet — this liability doesn&apos;t have a tenure set.
        </p>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
          Edit it from the Liabilities list and add a loan tenure (in months) to generate one.
        </p>
      </motion.div>
    );
  }

  return (
    <>
      {/* As-of-today snapshot */}
      {todaySnapshot && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div style={statCard}>
            <p style={statLabel}>Interest Paid to Date</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.05rem", color: "var(--color-warning, #FFB547)" }}>
              {formatCurrency(todaySnapshot.cumulativeInterest, liability.currencyCode)}
            </p>
          </div>
          <div style={statCard}>
            <p style={statLabel}>Principal Paid to Date</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.05rem", color: "var(--color-gain)" }}>
              {formatCurrency(todaySnapshot.cumulativePrincipal, liability.currencyCode)}
            </p>
          </div>
          <div style={statCard}>
            <p style={statLabel}>Interest : Principal Ratio</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.05rem", color: "var(--color-text-primary)" }}>
              {todaySnapshot.interestToPrincipalRatio.toFixed(2)}
            </p>
          </div>
          <div style={statCard}>
            <p style={statLabel}>Total Interest Over Loan Life</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.05rem", color: "var(--color-text-primary)" }}>
              {formatCurrency(scheduleResult.totalInterest, liability.currencyCode)}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
        <p style={sectionTitle}>Principal vs. Interest Over Time</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={scheduleResult.schedule} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="principalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00D97E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00D97E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFB547" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FFB547" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="period" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => formatCurrency(v, liability.currencyCode)} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              formatter={(value: number, name: string) => [formatFull(value, liability.currencyCode), name]}
              labelFormatter={(l: number) => `Period ${l}`}
              contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: 10 }}
            />
            <Area type="monotone" dataKey="cumulativePrincipal" name="Principal paid" stackId="1" stroke="#00D97E" fill="url(#principalGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="cumulativeInterest" name="Interest paid" stackId="1" stroke="#FFB547" fill="url(#interestGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Prepayment slider */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
        <p style={sectionTitle}>What if I prepay {formatCurrency(extraPayment, liability.currencyCode)} extra every payment?</p>

        <input
          type="range"
          min={0}
          max={sliderMax}
          step={Math.max(1, Math.round(sliderMax / 200))}
          value={extraPayment}
          onChange={(e) => setExtraPayment(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#00D97E", marginBottom: 20 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div style={statCard}>
            <p style={statLabel}>Interest Saved</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-gain)" }}>
              {prepayment ? formatCurrency(prepayment.interestSaved, liability.currencyCode) : "—"}
            </p>
          </div>
          <div style={statCard}>
            <p style={statLabel}>Tenure Reduction</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-gain)" }}>
              {prepayment ? `${prepayment.periodsReduced} payments` : "—"}
            </p>
          </div>
          <div style={statCard}>
            <p style={statLabel}>New Payoff</p>
            <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-text-primary)" }}>
              {prepayment ? `${prepayment.newPayoffPeriods} payments left` : `${remainingTenure} payments left`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Schedule table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <p style={sectionTitle}>Full Amortization Schedule</p>
        <div className="ag-theme-quartz-dark" style={{ height: 500, width: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <AgGridReact
            modules={[ClientSideRowModelModule]}
            theme="legacy"
            rowData={scheduleResult.schedule}
            columnDefs={columnDefs}
            rowHeight={40}
            headerHeight={40}
            defaultColDef={{ sortable: true, resizable: true }}
          />
        </div>
      </motion.div>
    </>
  );
}

// ─── Credit card (revolving balance) ───────────────────────────────────────

function CreditCardDetail({ liability }: { liability: LiabilityRow }) {
  const { data: payoff, isLoading } = useCreditCardPayoff(liability.id, true);

  const columnDefs: ColDef<{ month: number; payment: number; interestPortion: number; principalPortion: number; remainingBalance: number }>[] = [
    { field: "month", headerName: "Month", width: 90 },
    { field: "payment", headerName: "Payment", flex: 1, valueFormatter: (p) => formatFull(p.value as number, liability.currencyCode) },
    { field: "interestPortion", headerName: "Interest", flex: 1, valueFormatter: (p) => formatFull(p.value as number, liability.currencyCode) },
    { field: "principalPortion", headerName: "Principal", flex: 1, valueFormatter: (p) => formatFull(p.value as number, liability.currencyCode) },
    { field: "remainingBalance", headerName: "Balance", flex: 1, valueFormatter: (p) => formatFull(p.value as number, liability.currencyCode) },
  ];

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Calculating…</div>;
  }
  if (!payoff) return null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={statCard}>
          <p style={statLabel}>This Month&apos;s Interest</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-warning, #FFB547)" }}>
            {formatCurrency(payoff.monthlyInterest, liability.currencyCode)}
          </p>
        </div>
        <div style={statCard}>
          <p style={statLabel}>Minimum Payment Due</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-text-primary)" }}>
            {formatCurrency(payoff.minimumPayment, liability.currencyCode)}
          </p>
        </div>
        <div style={statCard}>
          <p style={statLabel}>Of Which Principal</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color: "var(--color-gain)" }}>
            {formatCurrency(payoff.principalPortion, liability.currencyCode)}
          </p>
        </div>
      </div>

      {/* Minimum-payment-trap warning */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card"
        style={{ padding: "1.25rem 1.5rem", borderColor: payoff.neverPaysOff ? "var(--color-loss)" : undefined }}
      >
        {payoff.neverPaysOff ? (
          <p style={{ color: "var(--color-loss)", fontSize: "0.875rem" }}>
            ⚠️ At the current minimum-payment formula, this balance will <strong>never be paid off</strong> — the minimum
            payment doesn&apos;t cover the interest that accrues each month.
          </p>
        ) : (
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            Paying only the minimum every month, this balance takes{" "}
            <strong style={{ color: "var(--color-text-primary)" }}>{payoff.monthsToPayoff} months</strong> to pay off and costs{" "}
            <strong style={{ color: "var(--color-loss)" }}>{formatCurrency(payoff.totalInterestPaid, liability.currencyCode)}</strong> in
            total interest on top of the balance. Consider paying more than the minimum to cut that down.
          </p>
        )}
      </motion.div>

      {payoff.months.length > 0 && (
        <>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={sectionTitle}>Balance If You Only Pay the Minimum</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={payoff.months} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => formatCurrency(v, liability.currencyCode)} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(value: number) => formatFull(value, liability.currencyCode)}
                  labelFormatter={(l: number) => `Month ${l}`}
                  contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: 10 }}
                />
                <Line type="monotone" dataKey="remainingBalance" stroke="#FF4D6D" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <p style={sectionTitle}>Minimum-Payment Projection</p>
            <div className="ag-theme-quartz-dark" style={{ height: 400, width: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <AgGridReact
                modules={[ClientSideRowModelModule]}
                theme="legacy"
                rowData={payoff.months}
                columnDefs={columnDefs}
                rowHeight={40}
                headerHeight={40}
                defaultColDef={{ sortable: true, resizable: true }}
              />
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}
