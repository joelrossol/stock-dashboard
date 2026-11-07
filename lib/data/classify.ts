/**
 * Categories for funds (ETFs, mutual funds, money markets). Finnhub's free tier
 * has no sector for funds, so without this every fund lands in "Unclassified".
 * Sector funds (XLK, VGT, ...) map onto the same sector names stocks use, so they
 * count toward that sector; diversified funds get an asset-class category.
 */

/** Diversified categories: spread across many sectors, so exempt from concentration caps. */
export const DIVERSIFIED = new Set([
  "US stock market",
  "US large cap",
  "US mid/small cap",
  "International",
  "Emerging markets",
  "Global stocks",
  "Bonds",
  "Target date",
  "Balanced",
  "Cash",
  "Commodities",
  "Broad market",
  "Other funds",
  "Unclassified",
]);

export function isDiversified(category: string): boolean {
  return DIVERSIFIED.has(category);
}

const BY_SYMBOL: Record<string, string> = {
  // Total market
  VTI: "US stock market", ITOT: "US stock market", SCHB: "US stock market", SPTM: "US stock market", VTSAX: "US stock market", FSKAX: "US stock market", SWTSX: "US stock market", FZROX: "US stock market",
  // Large cap
  SPY: "US large cap", VOO: "US large cap", IVV: "US large cap", SPLG: "US large cap", SCHX: "US large cap", VV: "US large cap", QQQ: "US large cap", QQQM: "US large cap", DIA: "US large cap", RSP: "US large cap",
  VUG: "US large cap", VTV: "US large cap", SCHG: "US large cap", SCHD: "US large cap", IWF: "US large cap", IWD: "US large cap", MGK: "US large cap", VIG: "US large cap", DGRO: "US large cap", JEPI: "US large cap", JEPQ: "US large cap",
  SWPPX: "US large cap", VFIAX: "US large cap", FXAIX: "US large cap", FNILX: "US large cap", SNXFX: "US large cap",
  // Mid/small
  VO: "US mid/small cap", IJH: "US mid/small cap", MDY: "US mid/small cap", VB: "US mid/small cap", IJR: "US mid/small cap", IWM: "US mid/small cap", SCHA: "US mid/small cap", SCHM: "US mid/small cap", VBR: "US mid/small cap", AVUV: "US mid/small cap", SWSSX: "US mid/small cap",
  // International
  VXUS: "International", VEA: "International", IEFA: "International", EFA: "International", SCHF: "International", IXUS: "International", SWISX: "International", VTIAX: "International", FTIHX: "International", FZILX: "International",
  VWO: "Emerging markets", IEMG: "Emerging markets", EEM: "Emerging markets", SCHE: "Emerging markets",
  VT: "Global stocks", ACWI: "Global stocks",
  // Bonds
  BND: "Bonds", AGG: "Bonds", SCHZ: "Bonds", BNDX: "Bonds", TLT: "Bonds", IEF: "Bonds", SHY: "Bonds", SGOV: "Bonds", BIL: "Bonds", VGIT: "Bonds", VGSH: "Bonds", VCIT: "Bonds", LQD: "Bonds", HYG: "Bonds", MUB: "Bonds", TIP: "Bonds", SCHP: "Bonds", SCHO: "Bonds", SCHR: "Bonds", SWAGX: "Bonds", VBTLX: "Bonds", FXNAX: "Bonds",
  // Cash
  SWVXX: "Cash", SNVXX: "Cash", SNOXX: "Cash", SNSXX: "Cash", SWTXX: "Cash", VMFXX: "Cash", SPAXX: "Cash", FDRXX: "Cash",
  // Commodities
  GLD: "Commodities", IAU: "Commodities", GLDM: "Commodities", SLV: "Commodities", DBC: "Commodities", PDBC: "Commodities", USO: "Commodities",
  // Sector funds → stock sector names
  XLK: "Technology", VGT: "Technology", FTEC: "Technology", SMH: "Technology", SOXX: "Technology", IGV: "Technology", ARKK: "Technology",
  XLF: "Financials", VFH: "Financials", KRE: "Financials",
  XLV: "Health Care", VHT: "Health Care", IBB: "Health Care", XBI: "Health Care",
  XLE: "Energy", VDE: "Energy",
  XLI: "Industrials", VIS: "Industrials", ITA: "Industrials",
  XLY: "Consumer", VCR: "Consumer",
  XLP: "Staples", VDC: "Staples",
  XLU: "Utilities", VPU: "Utilities",
  XLB: "Materials", VAW: "Materials",
  XLC: "Communication", VOX: "Communication",
  XLRE: "Real Estate", VNQ: "Real Estate", SCHH: "Real Estate", IYR: "Real Estate",
  IBIT: "Crypto", FBTC: "Crypto", GBTC: "Crypto", ETHA: "Crypto",
};

/** Ordered keyword rules on the fund's name; first match wins. */
const BY_NAME: [RegExp, string][] = [
  [/money market|treasury obligations|government money|prime money|cash reserves|\bmmf\b/i, "Cash"],
  [/target|retirement \d{4}|\b20[2-7]\d\b fund|lifecycle|freedom (index )?20/i, "Target date"],
  [/balanced|allocation|wellington|lifestrategy|moderate|conservative|growth & income/i, "Balanced"],
  [/bond|treasury|t-bill|fixed income|aggregate|municipal|muni\b|tips|income fund|credit|debt|mortgage/i, "Bonds"],
  [/emerging/i, "Emerging markets"],
  [/international|intl|developed|ex[- ]us|foreign|world ex|eafe|europe|pacific|japan|china/i, "International"],
  [/total world|global|all[- ]world|acwi/i, "Global stocks"],
  [/small|mid[- ]?cap|russell 2000|extended market|completion/i, "US mid/small cap"],
  [/total (stock )?market|total us|broad market/i, "US stock market"],
  [/s&p 500|500 index|large[- ]?cap|nasdaq|dow jones|growth|value|dividend|blue chip|index/i, "US large cap"],
  [/gold|silver|commodit|oil/i, "Commodities"],
  [/bitcoin|ether|crypto/i, "Crypto"],
  [/real estate|reit/i, "Real Estate"],
  [/tech|semiconductor|software|innovation/i, "Technology"],
  [/health|biotech|pharma/i, "Health Care"],
  [/financ|bank/i, "Financials"],
  [/energy/i, "Energy"],
  [/utilit/i, "Utilities"],
];

export function fundCategory(symbol: string, name: string | undefined): string {
  const bySymbol = BY_SYMBOL[symbol.toUpperCase()];
  if (bySymbol) return bySymbol;
  if (name) for (const [re, cat] of BY_NAME) if (re.test(name)) return cat;
  return "Other funds";
}
