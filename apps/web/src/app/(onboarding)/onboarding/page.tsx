"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useUser, authFetch } from "@/hooks/useUser";
import { Button } from "@richer/ui";

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
];

const TRACKING_OPTIONS = [
  { id: "stocks", label: "Stocks & ETFs", icon: "📈" },
  { id: "mutual_funds", label: "Mutual Funds", icon: "🏦" },
  { id: "crypto", label: "Cryptocurrency", icon: "₿" },
  { id: "real_estate", label: "Real Estate", icon: "🏠" },
  { id: "gold", label: "Gold & Silver", icon: "✨" },
  { id: "retirement", label: "Retirement Accounts", icon: "🎯" },
  { id: "insurance", label: "Insurance", icon: "🛡️" },
  { id: "other", label: "Other Assets", icon: "📦" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: user, refetch } = useUser();
  const [step, setStep] = useState(1);
  
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [trackingPreferences, setTrackingPreferences] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePref = (id: string) => {
    setTrackingPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await authFetch(`${apiUrl}/api/auth/complete-onboarding`, {
        method: "POST",
        body: JSON.stringify({ baseCurrency, trackingPreferences }),
      });
      
      if (res.ok) {
        await refetch();
        router.push("/dashboard");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.3, ease: "easeIn" as const } },
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(circle at top right, rgba(0, 217, 126, 0.05), transparent 40%), radial-gradient(circle at bottom left, rgba(61, 131, 255, 0.05), transparent 40%)"
      }} />

      <div className="w-full max-w-lg z-10">
        {/* Progress Bar */}
        <div className="flex gap-2 mb-8 px-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="h-1 flex-1 rounded-full bg-[var(--color-bg-input)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
                style={{ width: step >= s ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>

        <div className="glass-card p-8 min-h-[400px] flex flex-col">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1 flex flex-col justify-center text-center">
                <div className="text-5xl mb-6">👋</div>
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
                  Welcome to RicherWealth{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
                </h1>
                <p className="text-[var(--color-text-secondary)] text-sm mb-8 leading-relaxed">
                  We'll help you track your net worth across all asset classes, run advanced analytics, and surface AI-driven insights to maximize your wealth.
                </p>
                <div className="mt-auto">
                  <Button variant="primary" size="lg" className="w-full" onClick={() => setStep(2)}>
                    Get Started
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1 flex flex-col">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Base Currency</h2>
                <p className="text-[var(--color-text-secondary)] text-sm mb-6">
                  What currency should we use for your overall net worth? You can track individual assets in any currency.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setBaseCurrency(c.code)}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        baseCurrency === c.code
                          ? "bg-[var(--color-accent-muted)] border-[var(--color-accent)] shadow-[var(--shadow-glow-accent)]"
                          : "bg-[var(--color-bg-input)] border-[var(--color-border-glass)] hover:border-[var(--color-border-strong)]"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border-glass)] flex items-center justify-center text-sm font-semibold">
                        {c.symbol}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-[var(--color-text-primary)]">{c.code}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{c.label}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-auto flex gap-3">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button variant="primary" className="flex-1" onClick={() => setStep(3)}>Continue</Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1 flex flex-col">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">What do you want to track?</h2>
                <p className="text-[var(--color-text-secondary)] text-sm mb-6">
                  Select the asset classes you currently own. This helps us personalize your dashboard. You can always add others later.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {TRACKING_OPTIONS.map((opt) => {
                    const isSelected = trackingPreferences.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => togglePref(opt.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-[var(--color-accent-muted)] border-[var(--color-accent)]"
                            : "bg-[var(--color-bg-input)] border-[var(--color-border-glass)] hover:border-[var(--color-border-strong)]"
                        }`}
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-auto flex gap-3">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={trackingPreferences.length === 0 || isSubmitting}
                    isLoading={isSubmitting}
                    onClick={() => void handleComplete()}
                  >
                    Finish Setup
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
