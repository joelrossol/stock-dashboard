// Creates a self-signed certificate for https://127.0.0.1 (Schwab requires an https callback).
// Your browser will warn once; choose "proceed". Files live in ./certificates (gitignored).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

const dir = "certificates";
const key = `${dir}/localhost-key.pem`;
const cert = `${dir}/localhost.pem`;
if (existsSync(key) && existsSync(cert)) process.exit(0);
mkdirSync(dir, { recursive: true });
const cnf = `${dir}/openssl.cnf`;
writeFileSync(
  cnf,
  `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825", "-keyout", key, "-out", cert, "-config", cnf], { stdio: "ignore" });
rmSync(cnf);
console.log("Created a local HTTPS certificate in ./certificates");
