/**
 * Environment lookups that forgive the usual dashboard mistakes: any letter
 * case, a few common alternate names, and stray spaces or quotes.
 */

const clean = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

export interface EnvHit {
  value: string;
  name: string | null; // the variable name actually found
}

export function readEnv(names: string[]): EnvHit {
  const all = Object.keys(process.env);
  for (const want of names) {
    const exact = process.env[want];
    if (exact && clean(exact)) return { value: clean(exact), name: want };
    const loose = all.find((k) => k.trim().toUpperCase() === want.toUpperCase());
    if (loose && process.env[loose] && clean(process.env[loose]!)) return { value: clean(process.env[loose]!), name: loose };
  }
  return { value: "", name: null };
}

export const ENV_NAMES = {
  schwabKey: ["SCHWAB_APP_KEY", "SCHWAB_CLIENT_ID", "CLIENT_ID", "APP_KEY"],
  schwabSecret: ["SCHWAB_APP_SECRET", "SCHWAB_CLIENT_SECRET", "CLIENT_SECRET", "APP_SECRET"],
  finnhub: ["FINNHUB_API_KEY", "FINNHUB_KEY", "FINNHUB_TOKEN"],
};

/** Names (never values) of variables that look related but weren't matched — catches typos. */
export function similarEnvNames(used: (string | null)[]): string[] {
  const taken = new Set(used.filter(Boolean));
  return Object.keys(process.env)
    .filter((k) => /schwab|client|finnhub|app_?key|app_?secret|^auth_/i.test(k) && !taken.has(k))
    .sort();
}
