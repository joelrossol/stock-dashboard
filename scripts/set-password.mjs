// Sets the dashboard login. Run: npm run set-password
// Prompts for email and password (input hidden) and writes AUTH_EMAIL, AUTH_PASSWORD_HASH,
// and AUTH_SECRET (if missing) to .env.local. Only a salted scrypt hash is stored.
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";

const FILE = ".env.local";

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write("*".repeat(s.length));
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

function hash(password) {
  const salt = randomBytes(16);
  const h = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), h.toString("base64url")].join(":");
}

function setVar(lines, name, value) {
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
}

const env = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const current = env.match(/^AUTH_EMAIL=(.*)$/m)?.[1];

const email = (process.env.SET_EMAIL ?? (await ask(`Email${current ? ` [${current}]` : ""}: `))).trim() || current;
const password = process.env.SET_PASSWORD ?? (await ask("New password: ", true));
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
if (password.length < 10) throw new Error("Use at least 10 characters.");
if (!process.env.SET_PASSWORD) {
  const again = await ask("Confirm password: ", true);
  if (again !== password) throw new Error("Passwords don't match.");
}

const lines = env.split("\n");
if (lines.at(-1) === "") lines.pop();
if (!lines.some((l) => l.startsWith("AUTH_"))) lines.push("", "# Dashboard login (set with: npm run set-password)");
setVar(lines, "AUTH_EMAIL", email.toLowerCase());
setVar(lines, "AUTH_PASSWORD_HASH", hash(password));
if (!/^AUTH_SECRET=.{32,}$/m.test(env)) setVar(lines, "AUTH_SECRET", randomBytes(32).toString("base64url"));
writeFileSync(FILE, lines.join("\n") + "\n");
console.log(`Login saved for ${email.toLowerCase()} in ${FILE}. Restart the dev server to apply it.`);
