// Frontend types for Mutual Fund holdings — mirror the backend MfHoldingRow

export interface MfHoldingAnalytics {
  currentValue: number;
  totalInvested: number;
  absoluteReturn: number;
  absoluteReturnPct: number;
  xirr: number | null;
  cagr: number | null;
  latestNAV: number | null;
  navDate: string | null;
  sipCount: number;
  expenseRatioImpact: number | null;
}

export interface SipInstallmentRow {
  id: string;
  amount: number;
  units: number;
  nav: number;
  date: string;
}

export interface MfHoldingRow {
  id: string;
  holdingId: string;
  schemeCode: string;
  fundName: string;
  investmentType: "SIP" | "LUMPSUM";
  unitsHeld: number;
  avgNAV: number;
  expenseRatio: number | null;
  isin: string | null;
  lastNavSyncAt: string | null;
  currencyCode: string;
  analytics: MfHoldingAnalytics;
  sipInstallments: SipInstallmentRow[];
}

export interface CreateMfHoldingDto {
  schemeCode: string;
  fundName: string;
  investmentType: "SIP" | "LUMPSUM";
  unitsHeld: number;
  avgNAV: number;
  expenseRatio?: number;
  isin?: string;
  currencyCode?: string;
}

export interface AddSipInstallmentDto {
  amount: number;
  units: number;
  nav: number;
  date: string;
}

export interface NavPoint {
  date: string;
  nav: number;
}
