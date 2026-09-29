import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [publicPath, privatePath, outputPath, ...args] = process.argv.slice(2);
if (!publicPath || !privatePath || !outputPath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/prepare-session-rotation-replay-v5.mjs <public-v2-dereferenced.json> <private-v2-dereferenced.json> <output-dir> [--self-test]");
}
const selfTest = args.includes("--self-test");
const parse = async (path) => JSON.parse(await readFile(path, "utf8"));
const publicApi = await parse(resolve(publicPath));
const privateApi = await parse(resolve(privatePath));
const manifest = await parse(resolve(root, "openapi/session-rotation-replay-v5-fixtures.json"));
const fail = (message) => { throw new Error(message); };
const assert = (ok, message) => { if (!ok) fail(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const operation = (api, method, path, id) => {
  const op = api.paths?.[path]?.[method];
  assert(op?.operationId === id, `${method.toUpperCase()} ${path} must remain ${id}`);
  return op;
};
function fixtureInventory(candidate, filenames) {
  assert(candidate.public_contract_version === "2.0.5" && candidate.private_contract_version === "2.0.6", "R5 fixture manifest must target public v2.0.5 and private v2.0.6 OpenAPI bundles");
  assert(candidate.rotations?.length === 4 && candidate.challenges?.length === 2, "manifest must inventory exactly four rotations and two challenge operations");
  const paths = [
    ...candidate.rotations.flatMap((row) => [row.body_fixture, row.request_fixture, row.response_fixture]),
    ...candidate.challenges.map((row) => row.body_fixture), ...candidate.errors.map((row) => row.fixture),
    ...candidate.negative_requests, ...candidate.negative_responses, ...candidate.negative_public_bodies,
  ];
  const expectedNames = [...new Set(paths)].map((path) => path.split("/").at(-1)).sort();
  const foundNames = filenames.filter((name) => name.startsWith("identity-session-rotation-replay-v5-") && name.endsWith(".json")).sort();
  assert(same(foundNames, expectedNames), "R5 fixture directory and manifest inventory differ (missing or unindexed fixture)");
  return expectedNames;
}
const expectedNames = fixtureInventory(manifest, await readdir(resolve(root, "openapi/examples")));

const schemas = new Map();
const cases = [];
function addSchema(name, schema) {
  assert(schema && !schema.$ref, `${name}: source must be an actual dereferenced Redocly schema`);
  schemas.set(name, { $schema: "https://json-schema.org/draft/2020-12/schema", ...schema });
}
async function addCase(schemaName, fixturePath, valid) {
  const instance = await parse(resolve(root, fixturePath));
  const instanceFile = fixturePath.split("/").at(-1);
  cases.push({ schema: schemaName, instance: instanceFile, valid });
}
for (const row of manifest.rotations) {
  const op = operation(publicApi, row.method, row.path, row.operationId);
  addSchema(`schema-public-${row.operationId}.json`, op.responses?.[row.status]?.content?.["application/json"]?.schema);
  await addCase(`schema-public-${row.operationId}.json`, row.body_fixture, true);
}
for (const row of manifest.challenges) {
  const op = operation(publicApi, row.method, row.path, row.operationId);
  addSchema(`schema-public-${row.operationId}.json`, op.responses?.[row.status]?.content?.["application/json"]?.schema);
  await addCase(`schema-public-${row.operationId}.json`, row.body_fixture, true);
}
const privateOp = operation(privateApi, manifest.private_operation.method, manifest.private_operation.path, manifest.private_operation.operationId);
addSchema("schema-private-request.json", privateOp.requestBody?.content?.["application/json"]?.schema);
addSchema("schema-private-response.json", privateOp.responses?.["200"]?.content?.["application/json"]?.schema);
const firstPublicOp = operation(publicApi, manifest.rotations[0].method, manifest.rotations[0].path, manifest.rotations[0].operationId);
addSchema("schema-problem-details.json", firstPublicOp.responses?.["401"]?.content?.["application/problem+json"]?.schema ?? publicApi.components?.schemas?.Problem);
for (const row of manifest.rotations) {
  await addCase("schema-private-request.json", row.request_fixture, true);
  await addCase("schema-private-response.json", row.response_fixture, true);
}
for (const row of manifest.errors) await addCase("schema-problem-details.json", row.fixture, true);
for (const path of manifest.negative_requests) await addCase("schema-private-request.json", path, false);
for (const path of manifest.negative_responses) await addCase("schema-private-response.json", path, false);
for (const path of manifest.negative_public_bodies) await addCase("schema-public-proveRegisteredDevicePossession.json", path, false);
assert(cases.filter((row) => row.valid).length === 19, `expected 19 valid schema cases, got ${cases.filter((row) => row.valid).length}`);
assert(cases.filter((row) => !row.valid).length === 10, `expected 10 negative schema cases, got ${cases.filter((row) => !row.valid).length}`);

const output = resolve(outputPath);
await mkdir(output, { recursive: true });
for (const [name, schema] of schemas) await writeFile(resolve(output, name), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
await writeFile(resolve(output, "cases.json"), `${JSON.stringify(cases, null, 2)}\n`, "utf8");
await writeFile(resolve(output, "cases.tsv"), `${cases.map((row) => `${row.schema}\t${row.instance}\t${row.valid ? "valid" : "invalid"}`).join("\n")}\n`, "utf8");
if (selfTest) {
  const bad = structuredClone(manifest); bad.rotations.pop();
  try {
    fixtureInventory(bad, expectedNames);
    fail("self-test did not reject incomplete operation inventory");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("manifest must inventory exactly four rotations and two challenge operations")) throw error;
  }
  const extra = [...expectedNames, "identity-session-rotation-replay-v5-unindexed.json"].sort();
  try {
    fixtureInventory(manifest, extra);
    fail("self-test did not reject an unindexed fixture");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("R5 fixture directory and manifest inventory differ")) throw error;
  }
}
console.log(`Prepared R5 Sourcemeta cases from actual Redocly bundles: schemas=${schemas.size}; valid=${cases.filter((row) => row.valid).length}; invalid_expected=${cases.filter((row) => !row.valid).length}; inventory=${expectedNames.length}; self_test_rejections=${selfTest ? 2 : 0}.`);
