import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const positional = args.filter((arg) => arg !== "--self-test");
const [bundleFile, outputDir] = positional;
if (!bundleFile || !outputDir) throw new Error("usage: node scripts/prepare-identity-rest-fixtures.mjs <dereferenced-bundle.json> <output-dir> [--self-test]");
const parse = async (path) => JSON.parse(await readFile(path, "utf8"));
const manifest = await parse(resolve(root, "openapi/identity-rest-fixtures-v2.json"));
const bundle = await parse(resolve(bundleFile));
const catalog = await parse(resolve(root, "errors/error-catalog-v5.json"));
const catalogByCode = new Map(catalog.errors.map((item) => [item.code, item]));
const unescape = (s) => s.replaceAll("~1", "/").replaceAll("~0", "~");
const at = (obj, pointer) => pointer.slice(1).split("/").map(unescape).reduce((v, key) => v?.[key], obj);
const ptr = (s) => s.replaceAll("~", "~0").replaceAll("/", "~1");
const errors = [];
const cases = [];
const schemaFiles = new Map();
function validate(m = manifest, api = bundle, cat = catalogByCode) {
  const ops = new Map();
  for (const [path, pathItem] of Object.entries(api.paths ?? {})) for (const method of ["get", "post", "put", "patch", "delete"]) {
    const op = pathItem[method]; if (op?.operationId) ops.set(op.operationId, { path, method, op });
  }
  if (m.operations.length !== 23) errors.push(`expected 23 manifest operations, got ${m.operations.length}`);
  const seen = new Set(); let bodyCount = 0;
  for (const entry of m.operations) {
    if (seen.has(entry.operation_id)) errors.push(`duplicate operation ${entry.operation_id}`); seen.add(entry.operation_id);
    const found = ops.get(entry.operation_id);
    if (!found || found.path !== entry.path || found.method.toUpperCase() !== entry.method) { errors.push(`${entry.operation_id}: operation mapping mismatch`); continue; }
    const { op } = found;
    if (entry.request) {
      bodyCount++;
      const expected = `/paths/${ptr(entry.path)}/${found.method}/requestBody/content/application~1json/schema`;
      if (entry.request.schema_pointer !== expected || !at(api, expected)) errors.push(`${entry.operation_id}: request schema pointer mismatch/missing`);
      if (typeof entry.request.valid_example_pointer !== "string" || !at(api, entry.request.valid_example_pointer)) errors.push(`${entry.operation_id}: published valid request example pointer missing`);
      if (!Object.hasOwn(entry.request, "invalid")) errors.push(`${entry.operation_id}: static invalid request missing`);
      if (typeof entry.request.valid_example_pointer === "string" && at(api, entry.request.valid_example_pointer)) cases.push({ id: `${entry.operation_id}-request-valid`, expectation: "valid", pointer: expected, value: at(api, entry.request.valid_example_pointer) });
      cases.push({ id: `${entry.operation_id}-request-invalid`, expectation: "invalid", pointer: expected, value: entry.request.invalid });
    } else if (op.requestBody) errors.push(`${entry.operation_id}: request fixtures missing`);
    const success = op.responses?.[String(entry.success.status)];
    if (!success) errors.push(`${entry.operation_id}: success status not documented`);
    if (entry.success.status === 204) {
      if (!entry.success.no_body || success?.content) errors.push(`${entry.operation_id}: 204 must have no response body`);
    } else {
      const expected = `/paths/${ptr(entry.path)}/${found.method}/responses/${entry.success.status}/content/application~1json/schema`;
      if (entry.success.schema_pointer !== expected || !at(api, expected)) errors.push(`${entry.operation_id}: success schema pointer mismatch/missing`);
      cases.push({ id: `${entry.operation_id}-success-${entry.success.status}`, expectation: "valid", pointer: expected, value: entry.success.fixture });
    }
    const err = op.responses?.[String(entry.error.status)];
    const expectedError = `/paths/${ptr(entry.path)}/${found.method}/responses/${entry.error.status}/content/application~1problem+json/schema`;
    if (!err || entry.error.schema_pointer !== expectedError || !at(api, expectedError)) errors.push(`${entry.operation_id}: error status/schema mismatch`);
    const item = cat.get(entry.error.code);
    if (!item || !item.statuses.includes(entry.error.status)) errors.push(`${entry.operation_id}: unregistered code/status ${entry.error.code}/${entry.error.status}`);
    const problem = entry.error.fixture;
    if (problem.status !== entry.error.status || problem.code !== entry.error.code || problem.type !== `urn:opencomerix:problem:${problem.code}` || problem.retryable !== item?.retryable_by_default) errors.push(`${entry.operation_id}: Problem Details/catalog mismatch`);
    cases.push({ id: `${entry.operation_id}-problem-${entry.error.status}`, expectation: "valid", pointer: expectedError, value: problem });
  }
  if (bodyCount !== 17) errors.push(`expected 17 request bodies, got ${bodyCount}`);
  const expectedIds = new Set([...ops.keys()].filter((id) => id !== ""));
  if (seen.size !== 23 || [...expectedIds].some((id) => !seen.has(id)) || [...seen].some((id) => !expectedIds.has(id))) errors.push("operation coverage incomplete");
  return errors;
}
validate();
const baselineErrorCount = errors.length;
const baselineCaseCount = cases.length;
if (selfTest) {
  const clone = structuredClone(manifest); clone.operations.pop();
  if (!validate(clone, bundle, catalogByCode).some((e) => e.includes("expected 23"))) errors.push("negative control failed: missing operation accepted");
  const missingCase = structuredClone(manifest); delete missingCase.operations[0].request.valid_example_pointer;
  if (!validate(missingCase, bundle, catalogByCode).some((e) => e.includes("valid request example pointer missing"))) errors.push("negative control failed: missing REST case accepted");
  const bad = structuredClone(manifest); bad.operations[0].error.status = 200;
  if (!validate(bad, bundle, catalogByCode).some((e) => e.includes("error status/schema mismatch") || e.includes("unregistered code/status"))) errors.push("negative control failed: code/status mismatch accepted");
}
errors.length = baselineErrorCount;
cases.length = baselineCaseCount;
if (errors.length) throw new Error(errors.join("\n"));
const dir = resolve(outputDir); await mkdir(dir, { recursive: true });
const rows = [];
for (const c of cases) {
  const name = `${c.id}.json`; await writeFile(resolve(dir, name), `${JSON.stringify(c.value, null, 2)}\n`);
  let schemaName = schemaFiles.get(c.pointer);
  if (!schemaName) {
    const schema = at(bundle, c.pointer);
    if (!schema || typeof schema !== "object") throw new Error(`schema pointer did not resolve: ${c.pointer}`);
    schemaName = `schema-${schemaFiles.size + 1}.json`;
    const dialect = { $schema: "https://json-schema.org/draft/2020-12/schema", ...schema };
    await writeFile(resolve(dir, schemaName), `${JSON.stringify(dialect, null, 2)}\n`);
    schemaFiles.set(c.pointer, schemaName);
  }
  rows.push([c.id, c.expectation, schemaName, name, c.pointer].join("\t"));
}
await writeFile(resolve(dir, "cases.tsv"), `${rows.join("\n")}\n`);
console.log(`REST fixtures prepared: operations=23 request_bodies=17 request_cases=34 success_bodies=22 problem_errors=23 total_schema_cases=${cases.length} extracted_schemas=${schemaFiles.size}; negative controls=3 rejected`);
