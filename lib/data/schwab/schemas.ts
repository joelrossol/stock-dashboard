/** Zod schemas for the Schwab Trader API responses we consume (lenient on purpose). */
import { z } from "zod";

const num = z.number().catch(0);
const optNum = z.number().optional();
const optStr = z.string().optional();

export const AccountNumbersSchema = z.array(z.object({ accountNumber: z.string(), hashValue: z.string() }));

export const UserPreferenceSchema = z.object({
  accounts: z
    .array(
      z.object({
        accountNumber: z.string(),
        nickName: optStr,
        accountColor: optStr,
        displayAcctId: optStr,
        primaryAccount: z.boolean().optional(),
      }),
    )
    .default([]),
});

const InstrumentSchema = z.object({
  assetType: z.string(),
  symbol: z.string(),
  description: optStr,
  cusip: optStr,
  type: optStr,
  netChange: optNum,
});

const PositionSchema = z.object({
  longQuantity: num,
  shortQuantity: num,
  averagePrice: num,
  marketValue: num,
  currentDayProfitLoss: num,
  currentDayProfitLossPercentage: num,
  longOpenProfitLoss: optNum,
  instrument: InstrumentSchema,
});

export const AccountsSchema = z.array(
  z.object({
    securitiesAccount: z.object({
      type: z.string(),
      accountNumber: z.string(),
      positions: z.array(PositionSchema).default([]),
      currentBalances: z
        .object({
          cashBalance: num,
          liquidationValue: num,
          longMarketValue: num,
          buyingPower: num,
        })
        .partial()
        .default({}),
    }),
  }),
);

const TransferItemSchema = z.object({
  instrument: z.object({ assetType: z.string(), symbol: z.string().optional(), description: optStr }),
  amount: num,
  cost: num,
  price: optNum,
  feeType: optStr,
  positionEffect: optStr,
});

export const TransactionsSchema = z.array(
  z.object({
    activityId: z.union([z.number(), z.string()]),
    time: z.string(),
    accountNumber: z.string(),
    type: z.string(),
    status: optStr,
    netAmount: num,
    description: optStr,
    transferItems: z.array(TransferItemSchema).default([]),
  }),
);

export const QuotesSchema = z.record(
  z.string(),
  z.object({
    symbol: z.string(),
    assetMainType: optStr,
    reference: z.object({ description: optStr }).partial().default({}),
    quote: z
      .object({
        "52WeekHigh": num,
        "52WeekLow": num,
        closePrice: num,
        highPrice: num,
        lowPrice: num,
        lastPrice: num,
        netChange: num,
        netPercentChange: num,
        openPrice: num,
        totalVolume: num,
      })
      .partial()
      .default({}),
    fundamental: z
      .object({
        avg10DaysVolume: num,
        divAmount: num,
        divYield: num,
        eps: num,
        peRatio: num,
        nextDivExDate: optStr,
        nextDivPayDate: optStr,
      })
      .partial()
      .default({}),
  }),
);

export const PriceHistorySchema = z.object({
  symbol: z.string(),
  empty: z.boolean().optional(),
  candles: z
    .array(z.object({ open: num, high: num, low: num, close: num, volume: num, datetime: z.number() }))
    .default([]),
});

export const InstrumentSearchSchema = z.object({
  instruments: z
    .array(z.object({ symbol: z.string(), description: optStr, assetType: optStr, exchange: optStr }))
    .default([]),
});
