"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useLiabilities } from "@/hooks/useLiabilities";
import {
  useProperties,
  useCreateProperty,
  useDeleteProperty,
  type RealEstateRow,
  type RealEstateSubType,
  type CreateRealEstateDto,
} from "@/hooks/useRealEstate";

const PropertyMap = dynamic(() => import("@/components/real-estate/PropertyMap"), {
  ssr: false,
  loading: () => <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Loading map…</div>,
});

function formatCurrency(value: number, currency = "INR"): string {
  if (currency === "INR" && Math.abs(value) >= 100_000) {
    return value >= 10_000_000 ? `₹${(value / 10_000_000).toFixed(2)}Cr` : `₹${(value / 100_000).toFixed(2)}L`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--color-text-muted)", marginBottom: "0.25rem", display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none",
};

const SUBTYPE_META: Record<RealEstateSubType, { label: string; icon: string }> = {
  RESIDENTIAL: { label: "Residential", icon: "🏠" },
  COMMERCIAL: { label: "Commercial", icon: "🏢" },
  AGRICULTURAL: { label: "Agricultural", icon: "🌾" },
  RENTAL: { label: "Rental", icon: "🔑" },
  LAND: { label: "Land", icon: "🗺️" },
  PLOT: { label: "Plot", icon: "📐" },
  APARTMENT: { label: "Apartment", icon: "🏬" },
  VILLA: { label: "Villa", icon: "🏡" },
  UNDER_CONSTRUCTION: { label: "Under Construction", icon: "🚧" },
};

// ─── Add Property Modal ───────────────────────────────────────────────────────

function AddPropertyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: liabilities = [] } = useLiabilities();
  const [form, setForm] = useState({
    subType: "RESIDENTIAL" as RealEstateSubType,
    name: "",
    addressLine: "",
    purchasePrice: 0,
    currentEstimate: 0,
    monthlyRentalIncome: undefined as number | undefined,
    annualMaintenanceCost: undefined as number | undefined,
    linkedLiabilityId: undefined as string | undefined,
    currency: "INR",
  });

  const { mutate: create, isPending, error } = useCreateProperty();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dto: CreateRealEstateDto = {
      subType: form.subType,
      name: form.name,
      purchasePrice: form.purchasePrice,
      currentEstimate: form.currentEstimate,
      currency: form.currency,
      ...(form.addressLine && { addressLine: form.addressLine }),
      ...(form.monthlyRentalIncome !== undefined && { monthlyRentalIncome: form.monthlyRentalIncome }),
      ...(form.annualMaintenanceCost !== undefined && { annualMaintenanceCost: form.annualMaintenanceCost }),
      ...(form.linkedLiabilityId !== undefined && { linkedLiabilityId: form.linkedLiabilityId }),
    };
    create(dto, { onSuccess: onClose });
  };

  const field = (id: string, label: React.ReactNode, node: React.ReactNode) => (
    <div key={id}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {node}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Add Property" width={480}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        {field("sub-type", "Property Type",
          <select id="sub-type" value={form.subType} style={inputStyle}
            onChange={(e) => setForm((f) => ({ ...f, subType: e.target.value as RealEstateSubType }))}>
            {(Object.keys(SUBTYPE_META) as RealEstateSubType[]).map((t) => (
              <option key={t} value={t}>{SUBTYPE_META[t].icon} {SUBTYPE_META[t].label}</option>
            ))}
          </select>
        )}

        {field("name", "Property Name",
          <input id="name" type="text" required value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Whitefield 2BHK" style={inputStyle} />
        )}

        {field("address", <span>Address <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(geocoded automatically via OpenStreetMap)</span></span>,
          <input id="address" type="text" value={form.addressLine}
            onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
            placeholder="Full property address" style={inputStyle} />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {field("purchase-price", "Purchase Price",
            <input id="purchase-price" type="number" min="0" step="0.01" required value={form.purchasePrice || ""}
              onChange={(e) => setForm((f) => ({ ...f, purchasePrice: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
          {field("current-estimate", "Current Estimate",
            <input id="current-estimate" type="number" min="0" step="0.01" required value={form.currentEstimate || ""}
              onChange={(e) => setForm((f) => ({ ...f, currentEstimate: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {field("rental-income", <span>Monthly Rent <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(if rented)</span></span>,
            <input id="rental-income" type="number" min="0" step="0.01" value={form.monthlyRentalIncome ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, monthlyRentalIncome: e.target.value ? parseFloat(e.target.value) : undefined }))} style={inputStyle} />
          )}
          {field("maintenance", <span>Annual Maintenance <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional)</span></span>,
            <input id="maintenance" type="number" min="0" step="0.01" value={form.annualMaintenanceCost ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, annualMaintenanceCost: e.target.value ? parseFloat(e.target.value) : undefined }))} style={inputStyle} />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "1rem" }}>
          {field("liability", <span>Linked Mortgage <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional, for ROI-after-debt)</span></span>,
            <select id="liability" value={form.linkedLiabilityId ?? ""} style={inputStyle}
              onChange={(e) => setForm((f) => ({ ...f, linkedLiabilityId: e.target.value || undefined }))}>
              <option value="">None</option>
              {liabilities.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {field("currency", "Currency",
            <select id="currency" value={form.currency} style={inputStyle}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              <option value="INR">INR ₹</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
            </select>
          )}
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button type="submit" disabled={isPending} className="btn-accent" style={{ width: "100%", opacity: isPending ? 0.5 : 1 }}>
          {isPending ? "Adding…" : "Add Property"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({ property }: { property: RealEstateRow }) {
  const { mutate: deleteProperty } = useDeleteProperty();
  const meta = SUBTYPE_META[property.subType];
  const roi = property.roi;
  const isGain = roi.roiPct >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* Photo gallery / placeholder */}
      {property.photos.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: property.photos.length > 1 ? "2fr 1fr" : "1fr", gap: 2, height: 160 }}>
          <img src={property.photos[0]} alt={property.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {property.photos.length > 1 && (
            <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 2 }}>
              {property.photos.slice(1, 3).map((p, i) => (
                <img key={i} src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-input)", fontSize: "2.5rem" }}>
          {meta.icon}
        </div>
      )}

      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{property.name}</h3>
            {property.addressLine && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>{property.addressLine}</p>
            )}
          </div>
          <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: "var(--color-accent)22", color: "var(--color-accent)", whiteSpace: "nowrap" }}>
            {meta.icon} {meta.label}
          </span>
        </div>

        {/* Map */}
        {property.lat !== null && property.lng !== null && (
          <div style={{ height: 160, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <PropertyMap lat={property.lat} lng={property.lng} label={property.name} />
          </div>
        )}

        {/* Key stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
          <div>
            <p style={labelStyle}>Purchase Price</p>
            <p className="num" style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{formatCurrency(property.purchasePrice, property.currency)}</p>
          </div>
          <div>
            <p style={labelStyle}>Current Estimate</p>
            <p className="num" style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{formatCurrency(property.currentEstimate, property.currency)}</p>
          </div>
          {property.monthlyRentalIncome !== null && (
            <div>
              <p style={labelStyle}>Monthly Rent</p>
              <p className="num" style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-gain)" }}>{formatCurrency(property.monthlyRentalIncome, property.currency)}</p>
            </div>
          )}
          <div>
            <p style={labelStyle}>Appreciation</p>
            <p className="num" style={{ fontSize: "0.9375rem", fontWeight: 700, color: roi.appreciation >= 0 ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatCurrency(roi.appreciation, property.currency)}
            </p>
          </div>
        </div>

        {/* Mortgage / ROI */}
        <div style={{ padding: "0.875rem", borderRadius: "var(--radius-md)", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: property.linkedLiability ? 8 : 0 }}>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>ROI (after debt)</p>
            <p className="num" style={{ fontSize: "1.125rem", fontWeight: 800, color: isGain ? "var(--color-gain)" : "var(--color-loss)" }}>
              {isGain ? "+" : ""}{roi.roiPct.toFixed(1)}%
            </p>
          </div>
          {property.linkedLiability ? (
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
              🏦 {property.linkedLiability.name} · {property.linkedLiability.interestRate.toFixed(2)}% on {formatCurrency(property.linkedLiability.remainingBalance, property.currency)} outstanding
            </p>
          ) : (
            <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>No mortgage linked — equity invested = full purchase price</p>
          )}
        </div>

        <button
          onClick={() => { if (confirm(`Remove ${property.name}?`)) deleteProperty(property.id); }}
          style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-loss)", opacity: 0.7, background: "transparent", border: "none", cursor: "pointer", padding: "0.25rem 0", textAlign: "left" }}
        >
          Remove Property
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RealEstatePage() {
  const { data: properties, isLoading, error } = useProperties();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Real Estate</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Properties, land &amp; rentals with live ROI</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-accent">+ Add Property</button>
      </motion.div>

      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {[...Array(2)].map((_, i) => <div key={i} className="glass-card" style={{ height: 380, animation: "pulse 1.5s ease-in-out infinite" }} />)}
        </div>
      )}

      {error && (
        <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--color-loss)" }}>{error.message}</p>
        </div>
      )}

      {!isLoading && !error && (!properties || properties.length === 0) && (
        <div className="glass-card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <Home size={36} color="var(--color-text-muted)" />
          </div>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No properties yet</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
            Track properties, land, and rentals with live ROI-after-debt calculations.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Property</button>
        </div>
      )}

      {properties && properties.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {properties.map((p) => <PropertyCard key={p.id} property={p} />)}
        </div>
      )}

      <AddPropertyModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
