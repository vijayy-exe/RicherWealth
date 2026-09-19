"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, UserCheck, Users, ListChecks, ChevronRight, Plus, Trash2 } from "lucide-react";
import { IconBadge } from "@/components/ui/IconBadge";
import {
  useMissingNomineeChecklist,
  useBeneficiaries,
  useAddBeneficiary,
  useRemoveBeneficiary,
  useTransferChecklist,
  useToggleChecklistStep,
} from "@/hooks/useEstatePlanning";
import type { MissingNomineeAssetDto } from "@richer/shared-types";

const cardStyle: React.CSSProperties = { padding: "1.5rem" };
const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  padding: "0.55rem 0.75rem", fontSize: "0.875rem",
};

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function AssetDetailPanel({ asset }: { asset: MissingNomineeAssetDto }) {
  const beneficiaries = useBeneficiaries(asset.id);
  const addBeneficiary = useAddBeneficiary(asset.id);
  const removeBeneficiary = useRemoveBeneficiary(asset.id);
  const checklist = useTransferChecklist(asset.id);
  const toggleStep = useToggleChecklistStep(asset.id);

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [percent, setPercent] = useState(50);

  const totalAllocated = (beneficiaries.data ?? []).reduce((s, b) => s + b.allocationPercent, 0);

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--color-border-glass)", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Beneficiaries / trust records */}
        <div>
          <h4 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>
            Beneficiaries & trust records ({totalAllocated.toFixed(0)}% allocated)
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {(beneficiaries.data ?? []).map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8125rem", padding: "6px 10px", background: "var(--color-bg-input)", borderRadius: "var(--radius-md)" }}>
                <span style={{ color: "var(--color-text-primary)" }}>{b.beneficiaryName} <span style={{ color: "var(--color-text-muted)" }}>({b.relationship})</span>{b.trustName && <span style={{ color: "var(--color-text-muted)" }}> — via {b.trustName}</span>}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{b.allocationPercent}%</span>
                  <button onClick={() => removeBeneficiary.mutate(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-loss)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} placeholder="Beneficiary name" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={{ ...inputStyle, width: 130 }} placeholder="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
            <input style={{ ...inputStyle, width: 80 }} type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
            <button
              disabled={!name.trim() || !relationship.trim() || addBeneficiary.isPending}
              onClick={() => addBeneficiary.mutate(
                { beneficiaryName: name.trim(), relationship: relationship.trim(), allocationPercent: percent },
                { onSuccess: () => { setName(""); setRelationship(""); } },
              )}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", padding: "0 14px", fontWeight: 700, fontSize: "0.8125rem", cursor: "pointer" }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {addBeneficiary.isError && <p style={{ color: "var(--color-loss)", fontSize: "0.75rem", marginTop: 6 }}>Allocations for this asset can&apos;t exceed 100%.</p>}
        </div>

        {/* Transfer checklist */}
        <div>
          <h4 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Asset-transfer checklist</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(checklist.data?.steps ?? []).map((step) => (
              <label key={step.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: step.completed ? "var(--color-text-muted)" : "var(--color-text-primary)", textDecoration: step.completed ? "line-through" : "none", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={step.completed}
                  onChange={(e) => toggleStep.mutate({ stepId: step.id, completed: e.target.checked })}
                />
                {step.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AssetRow({ asset }: { asset: MissingNomineeAssetDto }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconBadge icon={ShieldAlert} tone="warning" size={36} />
          <div>
            <p style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "0.9375rem" }}>
              {asset.name}
              {asset.isJoint && (
                <span style={{ marginLeft: 8, fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-accent)", background: "var(--color-accent-muted)", padding: "2px 7px", borderRadius: "var(--radius-md)" }}>
                  <Users size={10} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} /> Joint
                </span>
              )}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{asset.type} · {formatMoney(asset.currentValue, asset.currencyCode)} · owned by {asset.ownerName ?? "—"}</p>
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--color-text-muted)", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>
      {expanded && <AssetDetailPanel asset={asset} />}
    </div>
  );
}

export default function EstatePlanningPage() {
  const { data: assets, isLoading } = useMissingNomineeChecklist();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>Estate Planning</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
          Assets missing a nominee, plus beneficiary designations and transfer checklists per asset.
        </p>
      </div>

      {!isLoading && assets && assets.length === 0 && (
        <div className="glass-card" style={{ ...cardStyle, textAlign: "center" }}>
          <IconBadge icon={UserCheck} tone="gain" size={48} />
          <p style={{ marginTop: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>Every asset has a nominee</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Nothing needs attention right now.</p>
        </div>
      )}

      {assets && assets.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--color-warning)" }}>
            <ListChecks size={16} />
            <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>{assets.length} asset{assets.length === 1 ? "" : "s"} missing a nominee</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {assets.map((a) => <AssetRow key={a.id} asset={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}
