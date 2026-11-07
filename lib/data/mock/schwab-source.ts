/**
 * Sample implementation of the Schwab API. Every method returns JSON shaped
 * like the real Trader API response so it runs through the same normalizer.
 *
 * Note: the real transactions endpoint only reaches back a limited window;
 * the sample returns the full ledger so reconstruction can be tested.
 */
import { addDays, etToEpoch } from "@/lib/dates";
import type { PriceHistoryParams, SchwabSource } from "@/lib/data/source";
import { ACCOUNT_DEFS, type LedgerTxn } from "./ledger";
import { round2 } from "./prng";
import { findMock, UNIVERSE } from "./universe";
import { getMockWorld } from "./world";

const iso = (epoch: number) => new Date(epoch).toISOString().replace(".000Z", "+0000");
const cusipOf = (symbol: string) => `${symbol.padEnd(5, "0").slice(0, 5)}${(symbol.charCodeAt(0) * 37).toString().slice(-4)}`.toUpperCase();
const isEtf = (symbol: string) => findMock(symbol)?.assetType === "ETF" || symbol === "SPY";
const nameOf = (symbol: string) => (symbol === "SPY" ? "SPDR S&P 500 ETF Trust" : (findMock(symbol)?.name ?? symbol));

function instrument(symbol: string) {
  return isEtf(symbol)
    ? { assetType: "COLLECTIVE_INVESTMENT", type: "EXCHANGE_TRADED_FUND", cusip: cusipOf(symbol), symbol, description: nameOf(symbol) }
    : { assetType: "EQUITY", type: "COMMON_STOCK", cusip: cusipOf(symbol), symbol, description: nameOf(symbol) };
}

const EX_DATE_OVERRIDES: Record<string, number> = { KO: 4, AAPL: 8, SCHD: 13, JPM: 19 };

function nextExDate(symbol: string, asOf: string): string | undefined {
  const y = findMock(symbol)?.divYield ?? (symbol === "SPY" ? 1.2 : 0);
  if (!y || y < 0.05) return undefined;
  if (EX_DATE_OVERRIDES[symbol]) return addDays(asOf, EX_DATE_OVERRIDES[symbol]);
  let [yy, mm] = asOf.split("-").map(Number);
  for (let k = 0; k < 4; k++) {
    mm += 1;
    if (mm > 12) {
      mm = 1;
      yy += 1;
    }
    if ([3, 6, 9, 12].includes(mm)) break;
  }
  return `${yy}-${String(mm).padStart(2, "0")}-14`;
}

function txnToSchwab(t: LedgerTxn) {
  const def = ACCOUNT_DEFS[t.account];
  const base = {
    activityId: t.id,
    time: iso(t.epoch),
    accountNumber: def.accountNumber,
    status: "VALID",
    subAccount: def.schwabType === "MARGIN" ? "MARGIN" : "CASH",
    tradeDate: iso(t.epoch),
    netAmount: t.amount,
    description: t.description,
  };
  const usd = (amount: number, feeType?: string) => ({
    instrument: { assetType: "CURRENCY", symbol: "CURRENCY_USD", description: "USD currency" },
    amount,
    cost: amount,
    ...(feeType ? { feeType } : {}),
  });
  switch (t.kind) {
    case "BUY":
    case "SELL": {
      const sign = t.kind === "BUY" ? 1 : -1;
      return {
        ...base,
        type: "TRADE",
        orderId: t.id + 1_000_000,
        positionId: t.id + 2_000_000,
        settlementDate: iso(etToEpoch(addDays(t.date, 1), 0, 0)),
        transferItems: [
          { ...usd(0, "COMMISSION"), cost: 0 },
          ...(t.fee ? [{ ...usd(-t.fee, "SEC_FEE"), cost: -t.fee }] : []),
          {
            instrument: instrument(t.symbol!),
            amount: sign * t.qty!,
            cost: round2(-sign * t.qty! * t.price!),
            price: t.price,
            positionEffect: t.kind === "BUY" ? "OPENING" : "CLOSING",
          },
        ],
      };
    }
    case "DIV":
      return {
        ...base,
        type: "DIVIDEND_OR_INTEREST",
        description: `QUALIFIED DIVIDEND (${t.symbol})`,
        transferItems: [usd(t.amount), { instrument: instrument(t.symbol!), amount: 0, cost: 0 }],
      };
    case "DEP":
      return { ...base, type: t.description.includes("ROLLOVER") ? "WIRE_IN" : "ACH_RECEIPT", transferItems: [usd(t.amount)] };
    case "WD":
      return { ...base, type: "ACH_DISBURSEMENT", transferItems: [usd(t.amount)] };
  }
}

export function createMockSchwabSource(): SchwabSource {
  return {
    async accountNumbers() {
      return ACCOUNT_DEFS.map((d) => ({ accountNumber: d.accountNumber, hashValue: d.hash }));
    },

    async userPreference() {
      return {
        accounts: ACCOUNT_DEFS.map((d, i) => ({
          accountNumber: d.accountNumber,
          primaryAccount: i === 0,
          type: "BROKERAGE",
          nickName: d.nickname,
          accountColor: d.color,
          displayAcctId: `...${d.accountNumber.slice(-3)}`,
          autoPositionEffect: false,
        })),
      };
    },

    async accounts() {
      const w = getMockWorld();
      const n = w.sessions.length;
      return w.ledger.accounts.map((st) => {
        let longMV = 0;
        const positions = Object.entries(st.lots)
          .map(([symbol, lots]) => {
            const qty = lots.reduce((s, l) => s + l.qty, 0);
            if (qty <= 0) return null;
            const cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
            const bars = w.daily[symbol];
            const last = bars[n - 1].close;
            const prev = bars[n - 2].close;
            const mv = round2(qty * last);
            longMV += mv;
            return {
              shortQuantity: 0,
              averagePrice: round2(cost / qty),
              currentDayProfitLoss: round2(qty * (last - prev)),
              currentDayProfitLossPercentage: round2((last / prev - 1) * 100),
              longQuantity: qty,
              settledLongQuantity: qty,
              settledShortQuantity: 0,
              instrument: { ...instrument(symbol), netChange: round2(last - prev) },
              marketValue: mv,
              maintenanceRequirement: round2(mv * 0.25),
              averageLongPrice: round2(cost / qty),
              taxLotAverageLongPrice: round2(cost / qty),
              longOpenProfitLoss: round2(mv - cost),
              previousSessionLongQuantity: qty,
              currentDayCost: 0,
            };
          })
          .filter(Boolean);
        const liq = round2(st.cash + longMV);
        return {
          securitiesAccount: {
            type: st.def.schwabType,
            accountNumber: st.def.accountNumber,
            roundTrips: 0,
            isDayTrader: false,
            isClosingOnlyRestricted: false,
            pfcbFlag: false,
            positions,
            currentBalances: {
              cashBalance: st.cash,
              liquidationValue: liq,
              longMarketValue: round2(longMV),
              equity: liq,
              buyingPower: st.def.schwabType === "MARGIN" ? round2(st.cash * 2) : st.cash,
              availableFunds: st.cash,
            },
          },
          aggregatedBalance: { currentLiquidationValue: liq, liquidationValue: liq },
        };
      });
    },

    async transactions(accountHash, startDate, endDate) {
      const w = getMockWorld();
      const a = ACCOUNT_DEFS.findIndex((d) => d.hash === accountHash);
      const start = startDate.slice(0, 10);
      const end = endDate.slice(0, 10);
      return w.ledger.txns.filter((t) => t.account === a && t.date >= start && t.date <= end).map(txnToSchwab);
    },

    async quotes(symbols) {
      const w = getMockWorld();
      const n = w.sessions.length;
      const out: Record<string, unknown> = {};
      for (const symbol of symbols) {
        const bars = w.daily[symbol];
        if (!bars) continue;
        const def = findMock(symbol);
        const b = bars[n - 1];
        const prev = bars[n - 2].close;
        const yr = bars.slice(-252);
        const divYield = def?.divYield ?? (symbol === "SPY" ? 1.2 : 0);
        const ex = nextExDate(symbol, w.asOf);
        out[symbol] = {
          assetMainType: isEtf(symbol) ? "MUTUAL_FUND" : "EQUITY",
          assetSubType: isEtf(symbol) ? "ETF" : "COE",
          symbol,
          quoteType: "NBBO",
          realtime: true,
          reference: { description: nameOf(symbol), exchange: "Q", exchangeName: "NASDAQ", cusip: cusipOf(symbol) },
          quote: {
            "52WeekHigh": Math.max(...yr.map((x) => x.high)),
            "52WeekLow": Math.min(...yr.map((x) => x.low)),
            askPrice: round2(b.close + 0.02),
            bidPrice: round2(b.close - 0.02),
            closePrice: prev,
            highPrice: b.high,
            lowPrice: b.low,
            lastPrice: b.close,
            mark: b.close,
            netChange: round2(b.close - prev),
            netPercentChange: round2((b.close / prev - 1) * 100),
            openPrice: b.open,
            totalVolume: b.volume,
            tradeTime: b.t,
            quoteTime: b.t,
          },
          fundamental: {
            avg10DaysVolume: Math.round(bars.slice(-11, -1).reduce((s, x) => s + x.volume, 0) / 10),
            avg1YearVolume: Math.round(yr.reduce((s, x) => s + x.volume, 0) / yr.length),
            divAmount: round2((b.close * divYield) / 100),
            divFreq: divYield ? 4 : 0,
            divPayAmount: round2((b.close * divYield) / 100 / 4),
            divYield,
            eps: def?.pe ? round2(b.close / def.pe) : 0,
            peRatio: def?.pe ?? 0,
            ...(ex ? { nextDivExDate: `${ex}T00:00:00Z`, nextDivPayDate: `${addDays(ex, 14)}T00:00:00Z` } : {}),
          },
        };
      }
      return out;
    },

    async priceHistory(symbol, params: PriceHistoryParams) {
      const w = getMockWorld();
      const daily = w.daily[symbol];
      if (!daily) return { symbol, empty: true, candles: [] };
      let bars = daily;
      if (params.frequencyType === "minute") {
        const intra = w.intraday[symbol] ?? [];
        const days = params.period ?? 1;
        const keep = new Set(w.sessions.slice(-days));
        bars = intra.filter((b) => keep.has(b.date));
      } else if (params.startDate || params.endDate) {
        bars = daily.filter((b) => (!params.startDate || b.t >= params.startDate) && (!params.endDate || b.t <= params.endDate));
      } else if (params.periodType === "year") {
        bars = daily.slice(-(params.period ?? 1) * 252);
      } else if (params.periodType === "month") {
        bars = daily.slice(-(params.period ?? 1) * 21);
      }
      const prev = daily[daily.length - 2];
      return {
        symbol,
        empty: bars.length === 0,
        previousClose: prev.close,
        previousCloseDate: prev.t,
        candles: bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, datetime: b.t })),
      };
    },

    async searchInstruments(query) {
      const q = query.trim().toUpperCase();
      const instruments = UNIVERSE.filter((u) => u.symbol.startsWith(q) || u.name.toUpperCase().includes(q))
        .slice(0, 12)
        .map((u) => ({ cusip: cusipOf(u.symbol), symbol: u.symbol, description: u.name, exchange: "NASDAQ", assetType: u.assetType === "ETF" ? "ETF" : "EQUITY" }));
      return { instruments };
    },
  };
}
