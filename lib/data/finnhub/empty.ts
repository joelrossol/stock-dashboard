import type { FinnhubSource } from "@/lib/data/source";

/** Used in live mode until a Finnhub key is added (Phase 3): no earnings, news, ratings, or sectors. */
export function createEmptyFinnhubSource(): FinnhubSource {
  return {
    earningsCalendar: async () => ({ earningsCalendar: [] }),
    profile: async () => ({}),
    recommendations: async () => [],
    news: async () => [],
    insiderTransactions: async () => ({ data: [] }),
  };
}
