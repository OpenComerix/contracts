import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundleArg, outputArg, ...args] = process.argv.slice(2);
if (!bundleArg || !outputArg || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/prepare-owner-session-flow-v1.mjs <public-v2-dereferenced.json> <output-dir> [--self-test]");
}
const api = JSON.parse(await readFile(resolve(bundleArg), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "openapi/owner-session-flow-v1-fixtures.json"), "utf8"));
const assert = (value, message) => { if (!value) throw new Error(message); };
assert(api.openapi === "3.1.0" && api.info?.version === "2.1.0", "owner-session-flow requires the real public OpenAPI 2.1.0 bundle");
assert(manifest.fixture_set === "owner-session-flow-v1" && manifest.public_contract?.version === "2.1.0", "owner-session-flow manifest version mismatch");
function selectedSchema(row) {
  const op = api.paths?.[row.path]?.[row.method];
  assert(op?.operationId === row.operationId, `${row.id}: selector method/path/operationId mismatch`);
  const response = op.responses?.[row.status];
  const media = response?.content?.[row.media_type];
  const schema = media?.schema;
  assert(response && media && schema && !schema.$ref, `${row.id}: exact response status/media-type schema must be dereferenced`);
  assert(row.fixture_schema && sameSchema(schema, api.components?.schemas?.[row.fixture_schema]), `${row.id}: selected response schema differs from fixture_schema`);
  return schema;
}
function sameSchema(a, b) { return JSON.stringify(sort(a)) === JSON.stringify(sort(b)); }
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])) : value; }
const selectedRows = manifest.scenarios.filter((row) => row.fixture_schema);
const schemaNames = [...new Set([
  ...selectedRows.map((row) => row.fixture_schema),
  ...manifest.semantic_negatives.map((row) => row.schema),
  ...manifest.schema_negatives.map((row) => row.schema),
].filter(Boolean))];
const schemas = Object.fromEntries(schemaNames.map((name) => {
  const schema = api.components?.schemas?.[name];
  assert(schema && !schema.$ref, `${name} must be present and dereferenced in the Redocly bundle`);
  return [name, schema];
}));
for (const row of selectedRows) selectedSchema(row);
const target = resolve(outputArg);
await mkdir(target, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  await writeFile(resolve(target, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}
await writeFile(resolve(target, "owner-session-flow-v1-fixture-list.json"), `${JSON.stringify({
  positive: selectedRows.map((row) => ({ fixture: row.fixture, schema: row.fixture_schema })),
  semantic_negative: manifest.semantic_negatives.filter((row) => row.schema).map((row) => ({ fixture: row.fixture, schema: row.schema })),
  schema_negative: manifest.schema_negatives,
}, null, 2)}\n`, "utf8");
const plan = JSON.parse(await readFile(resolve(target, "owner-session-flow-v1-fixture-list.json"), "utf8"));
for (const group of ["positive", "semantic_negative", "schema_negative"]) for (const row of plan[group]) {
  const destination = resolve(target, group, row.schema, row.fixture.split("/").at(-1));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, row.fixture), destination);
}
console.log(`owner-session-flow-v1 schemas extracted from real Redocly bundle: ${schemaNames.join(", ")}; fixtures remain static independent source files.`);
