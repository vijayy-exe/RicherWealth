"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, UserPlus, Crown, Eye, Pencil } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { IconBadge } from "@/components/ui/IconBadge";
import {
  useMyHouseholds,
  useHouseholdNetWorth,
  useMemberNetWorth,
  useCreateHousehold,
  useAddHouseholdMember,
} from "@/hooks/useHousehold";
import { useHouseholdStore } from "@/store/household.store";
import type { HouseholdRoleValue } from "@richer/shared-types";

const cardStyle: React.CSSProperties = { padding: "1.5rem" };
const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  padding: "0.6rem 0.85rem", fontSize: "0.9375rem", width: "100%",
};
const primaryButtonStyle: React.CSSProperties = {
  background: "var(--color-accent)", color: "#fff", border: "none",
  borderRadius: "var(--radius-md)", padding: "0.7rem 1.25rem", fontWeight: 700,
  fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
};

const ROLE_META: Record<HouseholdRoleValue, { icon: typeof Crown; label: string }> = {
  OWNER: { icon: Crown, label: "Owner" },
  MEMBER: { icon: Pencil, label: "Member" },
  VIEWER: { icon: Eye, label: "Viewer" },
};

function CreateHouseholdCard() {
  const [name, setName] = useState("");
  const create = useCreateHousehold();
  const { setActiveHousehold } = useHouseholdStore();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem", maxWidth: 440 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
        <Users size={20} color="var(--color-accent)" />
        <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--color-text-primary)" }}>Set up Family Office mode</h2>
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginBottom: "1rem", lineHeight: 1.6 }}>
        Create a household to link family members, share joint assets, and see combined net worth alongside each
        person&apos;s individual view.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={inputStyle} placeholder="e.g. The Sharma Family" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          style={{ ...primaryButtonStyle, opacity: name.trim() && !create.isPending ? 1 : 0.6 }}
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate({ name: name.trim() }, { onSuccess: (h) => setActiveHousehold(h.id) })}
        >
          <Plus size={16} /> Create
        </button>
      </div>
      {create.isError && <p style={{ color: "var(--color-loss)", fontSize: "0.8125rem", marginTop: 8 }}>Could not create household.</p>}
    </motion.div>
  );
}

function AddMemberForm({ householdId }: { householdId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HouseholdRoleValue>("MEMBER");
  const addMember = useAddHouseholdMember(householdId);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input style={{ ...inputStyle, maxWidth: 240 }} placeholder="member@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <select style={{ ...inputStyle, width: "auto" }} value={role} onChange={(e) => setRole(e.target.value as HouseholdRoleValue)}>
        <option value="MEMBER">Member (view + edit)</option>
        <option value="VIEWER">Viewer (view only)</option>
        <option value="OWNER">Owner</option>
      </select>
      <button
        style={{ ...primaryButtonStyle, opacity: email.trim() && !addMember.isPending ? 1 : 0.6, padding: "0.6rem 1rem" }}
        disabled={!email.trim() || addMember.isPending}
        onClick={() => addMember.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail("") })}
      >
        <UserPlus size={15} /> Add
      </button>
      {addMember.isError && <span style={{ color: "var(--color-loss)", fontSize: "0.8125rem" }}>Couldn&apos;t add member — only an OWNER can, and they must already have a RicherWealth account.</span>}
    </div>
  );
}

function MemberCard({ householdId, userId, name, email, role }: { householdId: string; userId: string; name: string | null; email: string; role: HouseholdRoleValue }) {
  const { data: netWorth } = useMemberNetWorth(householdId, userId);
  const RoleIcon = ROLE_META[role].icon;

  return (
    <div className="glass-card" style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconBadge icon={Users} tone="accent" size={32} />
          <div>
            <p style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "0.9375rem" }}>{name ?? email}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{email}</p>
          </div>
        </div>
        <span style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", fontWeight: 600,
          color: "var(--color-text-secondary)", background: "var(--color-bg-input)",
          padding: "3px 9px", borderRadius: "var(--radius-md)",
        }}>
          <RoleIcon size={12} /> {ROLE_META[role].label}
        </span>
      </div>
      <div>
        <p style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Net Worth</p>
        <p style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {netWorth ? `${netWorth.baseCurrency} ${netWorth.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
        </p>
      </div>
    </div>
  );
}

export default function HouseholdPage() {
  const { data: households, isLoading } = useMyHouseholds();
  const { activeHouseholdId, setActiveHousehold } = useHouseholdStore();

  // Default to the first household once loaded, if none is selected yet.
  useEffect(() => {
    if (!activeHouseholdId && households && households.length > 0) {
      setActiveHousehold(households[0]?.id ?? null);
    }
  }, [households, activeHouseholdId, setActiveHousehold]);

  const household = households?.find((h) => h.id === activeHouseholdId) ?? households?.[0];
  const { data: aggregate } = useHouseholdNetWorth(household?.id ?? null);

  if (isLoading) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>Family Office</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
          Combined family net worth, joint assets, and household membership.
        </p>
      </div>

      {!household ? (
        <CreateHouseholdCard />
      ) : (
        <>
          {aggregate && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <SummaryCard label={`${household.name} — Combined Net Worth`} value={aggregate.netWorth} currency={aggregate.baseCurrency} isPrimary />
              <SummaryCard label="Household Assets" value={aggregate.totalAssets} currency={aggregate.baseCurrency} />
              <SummaryCard label="Household Liabilities" value={aggregate.totalLiabilities} currency={aggregate.baseCurrency} />
            </div>
          )}

          <div className="glass-card" style={cardStyle}>
            <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, fontSize: "0.9375rem" }}>Add a family member</h3>
            <AddMemberForm householdId={household.id} />
          </div>

          <div>
            <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, fontSize: "0.9375rem" }}>
              Members ({household.members.length})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {household.members.map((m) => (
                <MemberCard key={m.userId} householdId={household.id} userId={m.userId} name={m.name} email={m.email} role={m.role} />
              ))}
            </div>
          </div>

          <CreateHouseholdCard />
        </>
      )}
    </div>
  );
}
