// Frontend types for Crypto holdings — mirror the backend CryptoHoldingRow

export interface CryptoHoldingAnalytics {
  livePrice: number | null;
  currency: string;
  change24hPct: number | null;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface CryptoHoldingRow {
  id: string;
  holdingId: string;
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  walletAddress: string | null;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: CryptoHoldingAnalytics;
}

export interface CreateCryptoHoldingDto {
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  walletAddress?: string;
  purchaseDate?: string;
}

export interface PriceAlertRow {
  id: string;
  coinId: string;
  symbol: string;
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
  currency: string;
  triggeredAt: string | null;
  createdAt: string;
}

export interface CreatePriceAlertDto {
  coinId: string;
  symbol: string;
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
  currency?: string;
}

export interface CoinSearchResult {
  coinId: string;
  symbol: string;
  name: string;
}
