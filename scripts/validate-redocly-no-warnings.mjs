import { spawnSync } from "node:child_process";

const contract = process.argv[2] ?? "openapi/identity-onboarding-v1.yaml";
if (process.argv.length > 3) throw new Error("usage: node scripts/validate-redocly-no-warnings.mjs [openapi-file]");
const args = [
  "--yes",
  "@redocly/cli@2.53.3",
  "lint",
  contract,
  "--format",
  "json",
];
const result = spawnSync("npx", args, { encoding: "utf8", shell: process.platform === "win32" });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const start = result.stdout.indexOf("{\n  \"totals\"");
if (start < 0) throw new Error("Redocly did not emit a JSON totals report");
const end = result.stdout.indexOf("\n}", start);
if (end < 0) throw new Error("Redocly JSON report is incomplete");
const report = JSON.parse(result.stdout.slice(start, end + 2));
if (report.version !== "2.53.3") throw new Error(`Unexpected Redocly version: ${report.version}`);
if (report.totals.errors !== 0 || report.totals.warnings !== 0) {
  throw new Error(`${contract} must have zero Redocly errors and warnings; got ${report.totals.errors} errors and ${report.totals.warnings} warnings`);
}
console.log(`${contract}: zero Redocly warnings.`);
