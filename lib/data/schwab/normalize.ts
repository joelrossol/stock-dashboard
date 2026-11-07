/** Raw Schwab JSON → domain types. Shared by the sample and live sources. */
import { etDate } from "@/lib/dates";
import type { Account, AssetType, Bar, Position, Quote, TaxTreatment, Transaction, TxnKind } from "@/lib/data/types";
import {
  AccountNumbersSchema,
  AccountsSchema,
  InstrumentSearchSchema,
  PriceHistorySchema,
  QuotesSchema,
  TransactionsSchema,
  UserPreferenceSchema,
} from "./schemas";

const ACCOUNT_PALETTE = ["#8E78C4", "#6E9C86", "#5A5870", "#C28F6B", "#6B8FC2"];

export function guessTaxTreatment(name: string): TaxTreatment {
  const n = name.toLowerCase();
  if (n.includes("roth") || n.includes("hsa")) return "tax-free";
  if (n.includes("ira") || n.includes("401") || n.includes("rollover") || n.includes("sep")) return "tax-deferred";
  return "taxable";
}

function assetTypeOf(assetType: string, type?: string): AssetType {
  if (assetType === "EQUITY") return "EQUITY";
  if (assetType === "COLLECTIVE_INVESTMENT" || type === "EXCHANGE_TRADED_FUND" || assetType === "ETF") return "ETF";
  return "OTHER";
}

export interface AccountOverrides {
  [accountNumber: string]: { name?: string; taxTreatment?: TaxTreatment } | undefined;
}

export function normalizeAccounts(
  rawNumbers: unknown,
  rawPrefs: unknown,
  rawAccounts: unknown,
  overrides: AccountOverrides = {},
): { accounts: Account[]; positions: Position[] } {
  const numbers = AccountNumbersSchema.parse(rawNumbers);
  const prefs = UserPreferenceSchema.parse(rawPrefs);
  const raw = AccountsSchema.parse(rawAccounts);
  const hashOf = new Map(numbers.map((n) => [n.accountNumber, n.hashValue]));
  const prefOf = new Map(prefs.accounts.map((p) => [p.accountNumber, p]));

  const accounts: Account[] = [];
  const positions: Position[] = [];
  raw.forEach(({ securitiesAccount: sa }, i) => {
    const id = hashOf.get(sa.accountNumber) ?? sa.accountNumber;
    const pref = prefOf.get(sa.accountNumber);
    const o = overrides[sa.accountNumber];
    const name = o?.name || pref?.nickName || `Account ${sa.accountNumber.slice(-4)}`;
    const b = sa.currentBalances;
    accounts.push({
      id,
      accountNumber: sa.accountNumber,
      mask: `•••${sa.accountNumber.slice(-4)}`,
      name,
      taxTreatment: o?.taxTreatment ?? guessTaxTreatment(name),
      color: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length],
      cash: b.cashBalance ?? 0,
      liquidationValue: b.liquidationValue ?? 0,
      longMarketValue: b.longMarketValue ?? 0,
      buyingPower: b.buyingPower ?? 0,
    });
    for (const p of sa.positions) {
      const qty = p.longQuantity - p.shortQuantity;
      if (qty === 0) continue;
      const cost = p.averagePrice * qty;
      positions.push({
        accountId: id,
        symbol: p.instrument.symbol,
        assetType: assetTypeOf(p.instrument.assetType, p.instrument.type),
        quantity: qty,
        averagePrice: p.averagePrice,
        costBasis: cost,
        marketValue: p.marketValue,
        dayPL: p.currentDayProfitLoss,
        dayPLPct: p.currentDayProfitLossPercentage / 100,
        openPL: p.longOpenProfitLoss ?? p.marketValue - cost,
      });
    }
  });
  return { accounts, positions };
}

const DEPOSIT_TYPES = new Set(["ACH_RECEIPT", "CASH_RECEIPT", "WIRE_IN", "ELECTRONIC_FUND"]);
const WITHDRAW_TYPES = new Set(["ACH_DISBURSEMENT", "CASH_DISBURSEMENT", "WIRE_OUT"]);

export function normalizeTransactions(raw: unknown, accountIdByNumber: Map<string, string>): Transaction[] {
  const rows = TransactionsSchema.parse(raw);
  const out: Transaction[] = [];
  for (const r of rows) {
    if (r.status && r.status !== "VALID") continue;
    const security = r.transferItems.find((t) => t.instrument.assetType !== "CURRENCY");
    const fees = r.transferItems.filter((t) => t.feeType).reduce((s, t) => s + Math.abs(t.cost), 0);
    const symbol = security?.instrument.symbol;
    let kind: TxnKind = "OTHER";
    let quantity = 0;
    if (r.type === "TRADE" && security) {
      quantity = security.amount;
      kind = quantity >= 0 ? "BUY" : "SELL";
    } else if (r.type === "DIVIDEND_OR_INTEREST") {
      kind = (r.description ?? "").toUpperCase().includes("DIVIDEND") ? "DIVIDEND" : "INTEREST";
    } else if (DEPOSIT_TYPES.has(r.type)) {
      kind = r.netAmount >= 0 ? "DEPOSIT" : "WITHDRAWAL";
    } else if (WITHDRAW_TYPES.has(r.type)) {
      kind = "WITHDRAWAL";
    } else if (r.type === "JOURNAL") {
      kind = r.netAmount >= 0 ? "DEPOSIT" : "WITHDRAWAL";
    } else if (r.type === "RECEIVE_AND_DELIVER" && security) {
      quantity = security.amount;
    }
    const time = r.time.replace(/\+0000$/, "Z");
    out.push({
      id: String(r.activityId),
      accountId: accountIdByNumber.get(r.accountNumber) ?? r.accountNumber,
      date: etDate(new Date(time)),
      time,
      kind,
      symbol: kind === "DEPOSIT" || kind === "WITHDRAWAL" || kind === "INTEREST" ? undefined : symbol,
      quantity,
      price: security?.price,
      netAmount: r.netAmount,
      fees,
      description: r.description ?? r.type,
    });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function normalizeQuotes(raw: unknown): Record<string, Quote> {
  const parsed = QuotesSchema.parse(raw);
  const out: Record<string, Quote> = {};
  for (const [symbol, q] of Object.entries(parsed)) {
    const last = q.quote.lastPrice ?? 0;
    const prev = q.quote.closePrice ?? last;
    const f = q.fundamental;
    out[symbol] = {
      symbol,
      name: q.reference.description ?? symbol,
      last,
      prevClose: prev,
      change: q.quote.netChange ?? last - prev,
      changePct: prev ? last / prev - 1 : 0,
      open: q.quote.openPrice ?? last,
      high: q.quote.highPrice ?? last,
      low: q.quote.lowPrice ?? last,
      volume: q.quote.totalVolume ?? 0,
      avgVolume10d: f.avg10DaysVolume ?? 0,
      week52High: q.quote["52WeekHigh"] ?? last,
      week52Low: q.quote["52WeekLow"] ?? last,
      pe: f.peRatio ? f.peRatio : null,
      eps: f.eps ? f.eps : null,
      divYield: (f.divYield ?? 0) / 100,
      divAmount: f.divAmount ?? 0,
      nextExDate: f.nextDivExDate?.slice(0, 10),
      nextPayDate: f.nextDivPayDate?.slice(0, 10),
    };
  }
  return out;
}

export function normalizePriceHistory(raw: unknown): Bar[] {
  const ph = PriceHistorySchema.parse(raw);
  return ph.candles.map((c) => ({
    t: c.datetime,
    date: etDate(new Date(c.datetime)),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export function normalizeInstrumentSearch(raw: unknown) {
  return InstrumentSearchSchema.parse(raw).instruments.map((i) => ({
    symbol: i.symbol,
    name: i.description ?? i.symbol,
    assetType: (i.assetType === "ETF" ? "ETF" : "EQUITY") as AssetType,
  }));
}
