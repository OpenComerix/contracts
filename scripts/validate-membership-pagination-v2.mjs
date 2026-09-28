import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundlePath, ...args] = process.argv.slice(2);
if (!bundlePath || args.some((arg) => arg !== "--self-test")) throw new Error("usage: node scripts/validate-membership-pagination-v2.mjs <identity-onboarding-v2-dereferenced.json> [--self-test]");
const selfTest = args.includes("--self-test");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const bundle = await readJson(resolve(bundlePath));
const manifest = await readJson(resolve(root, "openapi/membership-pagination-v2-fixtures.json"));
const v1 = await readJson(resolve(root, "errors/error-catalog-v1.json"));
const catalog = await readJson(resolve(root, "errors/error-catalog-v2.json"));
const fixtureRoot = resolve(root, "openapi/examples");
const schema = await readJson(resolve(root, "openapi/membership-pagination-v2.schema.json"));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

function isProblemDetailsSchema(schema) {
  const required = ["type", "title", "status", "instance", "code", "trace_id", "retryable"];
  const properties = schema?.properties ?? {};
  return schema?.type === "object" && schema.additionalProperties === false && !schema.$ref &&
    required.every((field) => schema.required?.includes(field)) &&
    properties.type?.type === "string" && properties.title?.type === "string" &&
    properties.type.pattern === "^urn:opencomerix:problem:[a-z][a-z0-9]*(?:_[a-z0-9]+)*_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$" &&
    properties.status?.type === "integer" && properties.status.enum?.includes(400) &&
    properties.instance?.type === "string" && properties.code?.type === "string" &&
    properties.code.pattern === "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$" && properties.trace_id?.type === "string" &&
    properties.retryable?.type === "boolean";
}

function validateCatalog(base, candidate) {
  assert(candidate.version === 2, "v2 catalog version must be 2");
  assert(base.version === 1 && base.errors.length === 18, "v1 baseline must retain its 18 published entries");
  assert(candidate.errors.length === 19, "v2 catalog must contain the 18 v1 entries and one addition");
  assert(same(candidate.errors.slice(0, base.errors.length), base.errors), "v2 catalog must preserve every v1 entry unchanged and in order");
  const codes = candidate.errors.map((entry) => entry.code);
  assert(new Set(codes).size === codes.length, "catalog codes must be unique");
  const additions = candidate.errors.slice(base.errors.length);
  assert(additions.length === 1 && additions[0].code === "tenancy_invalid_cursor", "v2 catalog must add only tenancy_invalid_cursor");
  const cursor = additions[0];
  assert(cursor.owner === "identity-tenancy" && cursor.domain === "tenancy" && same(cursor.statuses, [400]));
  assert(cursor.retryable_by_default === false && cursor.exposure === "restricted" && same(cursor.allowed_parameters, []), "tenancy_invalid_cursor metadata incorrect");
}

function validateContract(api, candidateCatalog = catalog) {
  assert(api.info?.version === "2.0.4", "identity-onboarding v2 must be version 2.0.4");
  const op = api.paths?.["/tenancy/memberships"]?.get;
  assert(op?.operationId === "listMyMemberships", "membership list operation missing or changed");
  const params = op.parameters ?? [];
  assert(params.length === 2, "membership list must declare exactly limit and cursor parameters");
  const limit = params.find((parameter) => parameter.name === "limit");
  const cursor = params.find((parameter) => parameter.name === "cursor");
  assert(limit?.in === "query" && limit.required === false && limit.schema?.type === "integer" && limit.schema.minimum === 1 && limit.schema.maximum === 100 && limit.schema.default === 50, "limit must be optional query integer default 50 range 1..100");
  assert(cursor?.in === "query" && cursor.required === false && cursor.schema?.type === "string" && cursor.schema.maxLength === 2048, "cursor must be optional opaque query string maxLength 2048");
  assert(!params.some((parameter) => ["sort", "filter", "organization_id"].includes(parameter.name)), "membership pagination must not expose sort, filters or tenant selector");
  const response = op.responses?.["400"];
  const media = response?.content?.["application/problem+json"];
  assert(isProblemDetailsSchema(media?.schema), "dereferenced membership 400 schema must retain the Problem Details required fields and types");
  const examples = media.examples ?? {};
  assert(same(Object.keys(examples).sort(), ["invalid_cursor", "invalid_limit"]), "membership 400 must publish invalid_limit and invalid_cursor examples exactly");
  const fixtures = new Map(manifest.problem_fixtures.map((fixture) => [fixture.name, fixture]));
  for (const [name, code] of [["invalid_limit", "identity_invalid_request"], ["invalid_cursor", "tenancy_invalid_cursor"]]) {
    const entry = fixtures.get(name);
    assert(entry && entry.code === code && entry.status === 400, `${name} fixture inventory incorrect`);
    const expectedExample = entry.file.replace(/^openapi\//, "");
    if (examples[name]?.externalValue !== undefined) assert(examples[name].externalValue === expectedExample, `${name} OpenAPI example does not point to its inventory fixture`);
    else assert(same(examples[name]?.value, JSON.parse(requireText(`openapi/${entry.file}`))), `${name} OpenAPI example does not match its inventory fixture`);
    const problem = JSON.parse(requireText(`openapi/${entry.file}`));
    assert(problem.status === 400 && problem.code === code && problem.type === `urn:opencomerix:problem:${code}` && problem.retryable === false, `${name} Problem Details fixture incorrect`);
    assert(candidateCatalog.errors.some((item) => item.code === code && item.statuses.includes(400)), `${name} code/status is not catalogued`);
  }
}

// Fixtures are loaded synchronously after the paths above have been constrained to the repository.
import { readFileSync } from "node:fs";
function requireText(relativePath) { return readFileSync(resolve(root, relativePath), "utf8"); }

function checkQuery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !["limit", "cursor"].includes(key))) return false;
  if (Object.hasOwn(value, "limit") && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100)) return false;
  if (Object.hasOwn(value, "cursor") && (typeof value.cursor !== "string" || value.cursor.length > 2048)) return false;
  return true;
}

validateCatalog(v1, catalog);
validateContract(bundle);
const validExamples = manifest.query_examples.filter((entry) => entry.expectation === "valid");
const invalidExamples = manifest.query_examples.filter((entry) => entry.expectation === "invalid");
assert(validExamples.length === 5 && invalidExamples.length === 4, "expected five positive and four negative query fixtures");
assert(new Set(manifest.query_examples.map((entry) => entry.name)).size === 9 && new Set(manifest.query_examples.map((entry) => entry.file)).size === 9, "query fixture inventory contains a duplicate name or path");
assert(same(manifest.query_examples.map(({ name, expectation }) => ({ name, expectation })).sort((a, b) => a.name.localeCompare(b.name)), [
  { name: "continued_with_signed_limit", expectation: "valid" }, { name: "cursor_over_maximum", expectation: "invalid" },
  { name: "maximum_limit", expectation: "valid" }, { name: "minimum_limit", expectation: "valid" },
  { name: "omitted_uses_default", expectation: "valid" }, { name: "opaque_cursor", expectation: "valid" },
  { name: "limit_above_maximum", expectation: "invalid" }, { name: "limit_below_minimum", expectation: "invalid" },
  { name: "limit_not_integer", expectation: "invalid" },
].sort((a, b) => a.name.localeCompare(b.name))), "query fixture inventory or classifications changed");
for (const entry of manifest.query_examples) {
  const value = await readJson(resolve(root, entry.file));
  assert(checkQuery(value) === (entry.expectation === "valid"), `${entry.name}: query fixture expectation mismatch`);
}

if (selfTest) {
  const missingParam = structuredClone(bundle); missingParam.paths["/tenancy/memberships"].get.parameters.pop();
  let rejected = false; try { validateContract(missingParam); } catch { rejected = true; }
  assert(rejected, "negative control did not reject a missing pagination parameter");
  const alteredParam = structuredClone(bundle); alteredParam.paths["/tenancy/memberships"].get.parameters.find((parameter) => parameter.name === "cursor").schema.maxLength = 2047;
  rejected = false; try { validateContract(alteredParam); } catch { rejected = true; }
  assert(rejected, "negative control did not reject an altered cursor parameter");
  const incorrectLimit = structuredClone(bundle); incorrectLimit.paths["/tenancy/memberships"].get.parameters.find((parameter) => parameter.name === "limit").schema.maximum = 99;
  rejected = false; try { validateContract(incorrectLimit); } catch { rejected = true; }
  assert(rejected, "negative control did not reject an incorrect limit boundary");
  const missingProblemSchema = structuredClone(bundle); delete missingProblemSchema.paths["/tenancy/memberships"].get.responses["400"].content["application/problem+json"].schema;
  rejected = false; try { validateContract(missingProblemSchema); } catch { rejected = true; }
  assert(rejected, "negative control did not reject an absent dereferenced Problem Details schema");
  const alteredProblemSchema = structuredClone(bundle); alteredProblemSchema.paths["/tenancy/memberships"].get.responses["400"].content["application/problem+json"].schema.required = ["type", "title", "status", "instance", "trace_id", "retryable"];
  rejected = false; try { validateContract(alteredProblemSchema); } catch { rejected = true; }
  assert(rejected, "negative control did not reject an altered dereferenced Problem Details schema");
  const unknownCode = structuredClone(catalog); unknownCode.errors[18].code = "tenancy_unknown_cursor";
  rejected = false; try { validateCatalog(v1, unknownCode); } catch { rejected = true; }
  assert(rejected, "negative control did not reject an unknown catalog code");
  const duplicateCode = structuredClone(catalog); duplicateCode.errors[18].code = duplicateCode.errors[0].code;
  rejected = false; try { validateCatalog(v1, duplicateCode); } catch { rejected = true; }
  assert(rejected, "negative control did not reject a duplicated catalog code");
}

console.log(`Membership pagination contract passed: parameters=2 valid_query_fixtures=${validExamples.length} invalid_query_fixtures=${invalidExamples.length} Problem_Details=2 catalog_v1_preserved=${v1.errors.length} catalog_v2=${catalog.errors.length} negative_controls=${selfTest ? 7 : 0}; cursor_signature_verified=false (contract fixtures only).`);
