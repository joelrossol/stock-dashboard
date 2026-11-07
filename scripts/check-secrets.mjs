// Pre-commit guard: refuses to commit secret files or any file containing a value from .env.local.
// Prints only file names and variable names, never the secret values.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const envFile = process.env.SECRETS_ENV_FILE ?? ".env.local";
const SECRET_VARS = /(KEY|SECRET|TOKEN|PASSWORD|HASH)$/;
const BLOCKED_NAMES = [/(^|\/)\.env(\..*)?$/, /\.pem$/, /\.key$/, /\.db$/, /\.sqlite3?$/, /^certificates\//, /^data\//];
const ALLOWED_NAMES = [/(^|\/)\.env\.example$/];

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" }).split("\n").filter(Boolean);

const secrets = [];
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && SECRET_VARS.test(m[1]) && m[2].trim().length >= 8) secrets.push([m[1], m[2].trim()]);
  }
}

const problems = [];
for (const f of staged) {
  if (BLOCKED_NAMES.some((r) => r.test(f)) && !ALLOWED_NAMES.some((r) => r.test(f))) {
    problems.push(`${f}: this file type holds secrets or local data and must not be committed`);
    continue;
  }
  let text = "";
  try {
    text = execFileSync("git", ["show", `:${f}`], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch {
    continue;
  }
  for (const [name, value] of secrets) if (text.includes(value)) problems.push(`${f}: contains the value of ${name} from ${envFile}`);
}

if (problems.length) {
  console.error("\n✋ Commit blocked: secrets detected\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error("\nUnstage with: git restore --staged <file>\n");
  process.exit(1);
}
