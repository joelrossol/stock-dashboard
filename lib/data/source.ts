/**
 * Data-source contracts. Both the sample source and the live Schwab/Finnhub
 * clients return *raw API-shaped JSON*; normalizers turn it into domain types.
 */

export interface PriceHistoryParams {
  periodType: "day" | "month" | "year" | "ytd";
  period?: number;
  frequencyType: "minute" | "daily" | "weekly" | "monthly";
  frequency: number;
  startDate?: number;
  endDate?: number;
}

export interface SchwabSource {
  /** GET /trader/v1/accounts/accountNumbers */
  accountNumbers(): Promise<unknown>;
  /** GET /trader/v1/userPreference */
  userPreference(): Promise<unknown>;
  /** GET /trader/v1/accounts?fields=positions */
  accounts(): Promise<unknown>;
  /** GET /trader/v1/accounts/{hash}/transactions */
  transactions(accountHash: string, startDate: string, endDate: string): Promise<unknown>;
  /** GET /marketdata/v1/quotes */
  quotes(symbols: string[]): Promise<unknown>;
  /** GET /marketdata/v1/pricehistory */
  priceHistory(symbol: string, params: PriceHistoryParams): Promise<unknown>;
  /** GET /marketdata/v1/instruments?projection=symbol-search */
  searchInstruments(query: string): Promise<unknown>;
}

export interface FinnhubSource {
  /** GET /calendar/earnings */
  earningsCalendar(from: string, to: string): Promise<unknown>;
  /** GET /stock/profile2 */
  profile(symbol: string): Promise<unknown>;
  /** GET /stock/recommendation */
  recommendations(symbol: string): Promise<unknown>;
  /** GET /company-news */
  news(symbol: string, from: string, to: string): Promise<unknown>;
}

export type DataMode = "mock" | "live";

export function dataMode(): DataMode {
  return process.env.DATA_MODE === "live" ? "live" : "mock";
}
