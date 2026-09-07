"use client";

import { useState, useEffect } from "react";
import {
  useNotificationPreferences,
  useUpsertPreference,
  useQuietHours,
  useSetQuietHours,
  type ChannelPreference,
} from "@/hooks/useNotifications";

const TYPE_LABELS: Record<string, string> = {
  MARKET_CRASH: "Market crash (large index drop)",
  DIVIDEND_RECEIVED: "Dividend received",
  LOAN_DUE: "Loan / EMI due date approaching",
  SIP_DUE: "SIP installment due approaching",
  STOCK_PRICE_ALERT: "Stock hits target price",
  CRYPTO_PRICE_ALERT: "Crypto hits target price",
  PROPERTY_PRICE_CHANGE: "Property valuation change",
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 20,
        borderRadius: "var(--radius-full)",
        border: "none",
        padding: 2,
        background: checked ? "var(--color-accent)" : "var(--color-bg-input)",
        cursor: "pointer",
        display: "flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        transition: "background 0.15s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          display: "block",
          boxShadow: "var(--shadow-sm)",
        }}
      />
    </button>
  );
}

export function NotificationPreferencesPanel() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const upsert = useUpsertPreference();
  const { data: quietHours } = useQuietHours();
  const setQuietHours = useSetQuietHours();

  const [localQuiet, setLocalQuiet] = useState<{ start: string; end: string; timezone: string }>({
    start: "",
    end: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  useEffect(() => {
    if (quietHours) {
      setLocalQuiet({
        start: quietHours.start ?? "",
        end: quietHours.end ?? "",
        timezone: quietHours.timezone,
      });
    }
  }, [quietHours]);

  const handleToggle = (pref: ChannelPreference, channel: "inAppEnabled" | "pushEnabled" | "emailEnabled", value: boolean) => {
    upsert.mutate({ ...pref, [channel]: value });
  };

  const handleSaveQuietHours = () => {
    setQuietHours.mutate({
      start: localQuiet.start || null,
      end: localQuiet.end || null,
      timezone: localQuiet.timezone,
    });
  };

  if (isLoading || !prefs) {
    return <div className="text-sm text-[var(--color-text-muted)]">Loading preferences…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-text-muted)] text-xs uppercase tracking-wide">
                <th className="pb-3 font-medium">Alert type</th>
                <th className="pb-3 font-medium text-center w-20">In-app</th>
                <th className="pb-3 font-medium text-center w-20">Push</th>
                <th className="pb-3 font-medium text-center w-20">Email</th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((pref) => (
                <tr key={pref.alertType} className="border-t border-[var(--color-border-subtle)]">
                  <td className="py-3 pr-4 text-[var(--color-text-primary)]">{TYPE_LABELS[pref.alertType] ?? pref.alertType}</td>
                  <td className="py-3 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={pref.inAppEnabled} onChange={(v) => handleToggle(pref, "inAppEnabled", v)} label="In-app" />
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={pref.pushEnabled} onChange={(v) => handleToggle(pref, "pushEnabled", v)} label="Push" />
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex justify-center">
                      <Toggle checked={pref.emailEnabled} onChange={(v) => handleToggle(pref, "emailEnabled", v)} label="Email" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-[var(--color-border-subtle)] pt-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Quiet hours</h3>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Push and email notifications are held during this window — in-app notifications still appear in the bell, they&apos;re just not sent as interruptions.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
            Start
            <input
              type="time"
              value={localQuiet.start}
              onChange={(e) => setLocalQuiet((s) => ({ ...s, start: e.target.value }))}
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-glass)] rounded-md px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
            End
            <input
              type="time"
              value={localQuiet.end}
              onChange={(e) => setLocalQuiet((s) => ({ ...s, end: e.target.value }))}
              className="bg-[var(--color-bg-input)] border border-[var(--color-border-glass)] rounded-md px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
            />
          </label>
          <span className="text-xs text-[var(--color-text-muted)] pb-2">{localQuiet.timezone}</span>
          <button
            type="button"
            onClick={handleSaveQuietHours}
            className="text-sm font-medium px-4 py-1.5 rounded-md bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
