/** Normalized domain types. Every data source (mock or live) ends up here. */

export type TaxTreatment = "taxable" | "tax-deferred" | "tax-free";
export type AssetType = "EQUITY" | "ETF" | "FUND" | "OTHER";

export interface Account {
  id: string; // Schwab hash value
  accountNumber: string;
  mask: string; // "•••8821"
  name: string;
  taxTreatment: TaxTreatment;
  color: string;
  cash: number;
  liquidationValue: number;
  longMarketValue: number;
  buyingPower: number;
}

export interface Position {
  accountId: string;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  costBasis: number;
  marketValue: number;
  dayPL: number;
  dayPLPct: number; // fraction
  openPL: number;
}

export type TxnKind = "BUY" | "SELL" | "DIVIDEND" | "INTEREST" | "DEPOSIT" | "WITHDRAWAL" | "FEE" | "OTHER";

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD (ET)
  time: string; // ISO
  kind: TxnKind;
  symbol?: string;
  quantity: number; // signed share delta (+ buy, − sell)
  price?: number;
  netAmount: number; // signed cash delta
  fees: number;
  description: string;
}

export interface Quote {
  symbol: string;
  name: string;
  last: number;
  prevClose: number;
  change: number;
  changePct: number; // fraction
  open: number;
  high: number;
  low: number;
  volume: number;
  avgVolume10d: number;
  week52High: number;
  week52Low: number;
  pe: number | null;
  eps: number | null;
  divYield: number; // fraction
  divAmount: number; // annual $/share
  nextExDate?: string;
  nextPayDate?: string;
}

export interface Bar {
  t: number; // epoch ms
  date: string; // YYYY-MM-DD (ET)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  assetType: AssetType;
  sector: string;
  industry: string;
  marketCap?: number; // $
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  hour: "bmo" | "amc" | "";
  epsEstimate?: number;
}

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  datetime: number; // epoch ms
  url: string;
  summary: string;
}

export interface RecTrend {
  symbol: string;
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/** An insider's open-market trade (Form 4): code P = purchase, S = sale. */
export interface InsiderTxn {
  symbol: string;
  name: string;
  date: string;
  shares: number; // signed: + bought, − sold
  price: number;
  code: "P" | "S";
}

export interface Connection {
  requested: "mock" | "live" | "auto";
  status: {
    configured: boolean;
    connected: boolean;
    expired: boolean;
    refreshExpiresAt: number | null;
    callbackUrl: string;
  } | null;
  /** "demo": no login is set up, so only sample data is allowed. */
  notice?: "demo" | "not-configured" | "not-connected" | "expired" | "error";
  error?: string;
}

/** Everything the app needs, loaded once per request. */
export interface PortfolioData {
  mode: "mock" | "live";
  asOf: string; // session date
  accounts: Account[];
  positions: Position[];
  transactions: Transaction[];
  quotes: Record<string, Quote>;
  daily: Record<string, Bar[]>; // ~3y of daily bars
  intraday: Record<string, Bar[]>; // last 5 sessions of 5-minute bars
  instruments: Record<string, Instrument>;
  earnings: EarningsEvent[];
  news: NewsItem[];
  recommendations: Record<string, RecTrend[]>; // newest first
  /** Insider open-market trades over the last 90 days, by symbol. */
  insiders?: Record<string, InsiderTxn[]>;
  /** Share of a normal day's volume expected by now (live, mid-session); 1 or missing otherwise. */
  volumePace?: number | null;
  universe: string[]; // searchable symbols
  connection: Connection;
  /** Recorded daily account values (live mode), by account id. */
  snapshots?: Record<string, { date: string; value: number }[]>;
}

export type Scope = "all" | string; // account id
