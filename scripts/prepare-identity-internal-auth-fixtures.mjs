import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const positional = args.filter((arg) => !arg.startsWith("--"));
if (positional.length !== 2) {
  throw new Error("usage: node scripts/prepare-identity-internal-auth-fixtures.mjs <dereferenced-bundle.json> <output-dir> [--self-test]");
}
const bundleFile = resolve(positional[0]);
const outputDir = resolve(positional[1]);
const bundle = JSON.parse(await readFile(bundleFile, "utf8"));

const operations = {
  issueInternalServiceToken: { path: "/internal/identity/oauth/token", method: "post" },
  getInternalIdentityJwks: { path: "/internal/identity/jwks.json", method: "get" },
};
const positives = [
  { id: "token-request-client-credentials", operationId: "issueInternalServiceToken", section: "request", mediaType: "application/x-www-form-urlencoded", schemaName: "ClientCredentialsRequest", exampleName: "valid_client_credentials", fixture: "token-request-client-credentials.json" },
  { id: "token-response-success", operationId: "issueInternalServiceToken", section: "response", status: "200", mediaType: "application/json", schemaName: "TokenResponse", exampleName: "synthetic_service_token", fixture: "token-response-success.json" },
  ...[
    ["token-error-invalid-request", "400", "invalid_request"],
    ["token-error-unsupported-grant-type", "400", "unsupported_grant_type"],
    ["token-error-invalid-client", "401", "invalid_client"],
    ["token-error-server-error", "500", "server_error"],
    ["token-error-temporarily-unavailable", "503", "temporarily_unavailable"],
  ].map(([id, status, exampleName]) => ({ id, operationId: "issueInternalServiceToken", section: "response", status, mediaType: "application/json", schemaName: "OAuthError", exampleName, fixture: `${id}.json` })),
  { id: "jwks-current", operationId: "getInternalIdentityJwks", section: "response", status: "200", mediaType: "application/json", schemaName: "JsonWebKeySet", exampleName: "current_key_only", fixture: "jwks-current.json" },
  { id: "jwks-rotation-overlap", operationId: "getInternalIdentityJwks", section: "response", status: "200", mediaType: "application/json", schemaName: "JsonWebKeySet", exampleName: "rotation_overlap", fixture: "jwks-rotation-overlap.json" },
].map((entry) => ({ ...entry, relativeExample: `examples/identity-internal-auth-v1/${entry.fixture}` }));

// Negative controls are intentionally not OpenAPI examples. Each names the exact
// request/response schema it must violate and is validated separately by Sourcemeta.
const negatives = [
  { id: "token-request-missing-grant-type", schemaName: "ClientCredentialsRequest", fixture: "token-request-missing-grant-type.json" },
  { id: "jwks-private-key-rejected", schemaName: "JsonWebKeySet", fixture: "jwks-private-key-rejected.json" },
].map((entry) => ({ ...entry, relativeExample: `examples/identity-internal-auth-v1/${entry.fixture}` }));
const inlineCases = [
  ...["400", "500", "503"].map((status) => ({
    id: `jwks-problem-${status}`,
    operationId: "getInternalIdentityJwks",
    section: "response",
    status,
    mediaType: "application/problem+json",
    exampleName: "$inline",
    schemaName: "Problem",
  })),
  {
    id: "token-www-authenticate-header",
    operationId: "issueInternalServiceToken",
    section: "header",
    status: "401",
    mediaType: "WWW-Authenticate",
    exampleName: "$inline",
    expectedSchema: { type: "string" },
  },
  {
    id: "jwks-cache-control-header",
    operationId: "getInternalIdentityJwks",
    section: "header",
    status: "200",
    mediaType: "Cache-Control",
    exampleName: "current_key",
    expectedSchema: {
      type: "string",
      pattern: "^private, max-age=(?:[0-9]|[12][0-9]|30), must-revalidate$",
    },
  },
];
const positiveValues = new Map();
for (const entry of positives) {
  positiveValues.set(entry.id, JSON.parse(await readFile(resolve(root, "openapi", entry.relativeExample), "utf8")));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function stable(value) { return JSON.stringify(canonical(value)); }
function findOperation(source, operationId) {
  const matches = [];
  for (const [path, item] of Object.entries(source.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head", "trace"]) {
      const operation = item[method];
      if (operation?.operationId === operationId) matches.push({ path, method, operation });
    }
  }
  assert(matches.length === 1, `${operationId}: expected exactly one operation, found ${matches.length}`);
  const expected = operations[operationId];
  assert(expected && matches[0].path === expected.path && matches[0].method === expected.method, `${operationId}: path or method is incorrect`);
  return matches[0].operation;
}
function schemaFor(operation, entry) {
  const media = entry.section === "request"
    ? operation.requestBody?.content?.[entry.mediaType]
    : operation.responses?.[entry.status]?.content?.[entry.mediaType];
  assert(media?.schema && typeof media.schema === "object", `${entry.id}: schema missing at its exact request/response location`);
  const component = bundle.components?.schemas?.[entry.schemaName];
  assert(component && stable(media.schema) === stable(component), `${entry.id}: schema at route/status/media type is not components.schemas.${entry.schemaName}`);
  return media;
}
function keyOf(entry) {
  return JSON.stringify([entry.operationId, entry.section, entry.status ?? "", entry.mediaType, entry.exampleName]);
}
function enumeratePublishedExamples(source) {
  const found = [];
  for (const operationId of Object.keys(operations)) {
    const operation = findOperation(source, operationId);
    const addContent = (section, status, content) => {
      for (const [mediaType, media] of Object.entries(content ?? {})) {
        for (const [exampleName, exampleObject] of Object.entries(media.examples ?? {})) {
          found.push({ operationId, section, status, mediaType, exampleName, exampleObject });
        }
        if (Object.hasOwn(media, "example")) {
          found.push({ operationId, section, status, mediaType, exampleName: "$inline", exampleObject: { value: media.example } });
        }
      }
    };
    addContent("request", "", operation.requestBody?.content);
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      addContent("response", status, response.content);
      for (const [headerName, header] of Object.entries(response.headers ?? {})) {
        for (const [exampleName, exampleObject] of Object.entries(header.examples ?? {})) {
          found.push({ operationId, section: "header", status, mediaType: headerName, exampleName, exampleObject, schema: header.schema });
        }
        if (Object.hasOwn(header, "example")) {
          found.push({ operationId, section: "header", status, mediaType: headerName, exampleName: "$inline", exampleObject: { value: header.example }, schema: header.schema });
        }
      }
    }
  }
  return found;
}
function checkCoverage(source) {
  const actual = enumeratePublishedExamples(source);
  const expectedByKey = new Map([...positives, ...inlineCases].map((entry) => [keyOf(entry), entry]));
  const actualByKey = new Map();
  for (const published of actual) {
    const key = keyOf(published);
    assert(!actualByKey.has(key), `duplicate published example slot: ${key}`);
    actualByKey.set(key, published);
    assert(expectedByKey.has(key), `published example has no positive fixture coverage: ${key}`);
  }
  for (const entry of positives) {
    const key = keyOf(entry);
    const published = actualByKey.get(key);
    assert(published, `${entry.id}: expected published example is missing`);
    const externalValue = published.exampleObject?.externalValue;
    if (externalValue !== undefined) {
      assert(externalValue === entry.relativeExample, `${entry.id}: external fixture path mismatch`);
    } else {
      const bundledValue = published.exampleObject?.example?.value ?? published.exampleObject?.value;
      assert(bundledValue !== undefined, `${entry.id}: published example does not resolve to a value`);
      assert(stable(bundledValue) === stable(positiveValues.get(entry.id)), `${entry.id}: published example differs from its versioned positive fixture`);
    }
  }
  assert(actual.length === positives.length + inlineCases.length, `expected ${positives.length} fixture-backed and ${inlineCases.length} inline examples, found ${actual.length}`);
  for (const entry of positives) {
    const operation = findOperation(source, entry.operationId);
    schemaFor(operation, entry);
  }
  assert(source.components?.schemas?.TokenResponse?.required?.includes("access_token"), "TokenResponse.access_token must remain required");
  assert(!Object.hasOwn(source.components.schemas.TokenResponse.properties?.access_token ?? {}, "writeOnly"), "TokenResponse.access_token must be readable in the OAuth response");
  for (const entry of inlineCases) {
    const published = actualByKey.get(keyOf(entry));
    assert(published, `${entry.id}: expected inline example is missing`);
    assert(published.exampleObject?.value !== undefined, `${entry.id}: inline example value is missing`);
    if (entry.schemaName) {
      const operation = findOperation(source, entry.operationId);
      const media = operation.responses?.[entry.status]?.content?.[entry.mediaType];
      assert(media?.schema && stable(media.schema) === stable(source.components?.schemas?.[entry.schemaName]), `${entry.id}: inline example schema is incorrect`);
    } else {
      assert(stable(published.schema) === stable(entry.expectedSchema), `${entry.id}: inline header schema is incorrect`);
    }
  }
  return actual;
}
function expectRejected(mutated, label) {
  let rejected = false;
  try { checkCoverage(mutated); } catch { rejected = true; }
  assert(rejected, `self-test failed: coverage gate accepted ${label}`);
}
function insertExample(source, operationId, section, status, mediaType, name, externalValue) {
  const operation = findOperation(source, operationId);
  const media = section === "request"
    ? operation.requestBody.content[mediaType]
    : operation.responses[status].content[mediaType];
  media.examples ??= {};
  media.examples[name] = { externalValue };
}

const operationRefs = Object.fromEntries(Object.keys(operations).map((operationId) => [operationId, findOperation(bundle, operationId)]));
checkCoverage(bundle);

const prepared = [];
for (const entry of positives) {
  const media = schemaFor(operationRefs[entry.operationId], entry);
  const value = positiveValues.get(entry.id);
  if (entry.operationId === "getInternalIdentityJwks") {
    assert(Array.isArray(value.keys) && value.keys.length >= 1 && value.keys.length <= 2, `${entry.id}: expected one or two public keys`);
    const kids = value.keys.map((key) => key.kid);
    assert(new Set(kids).size === kids.length, `${entry.id}: duplicate kid values`);
    assert(value.keys.every((key) => key.kty === "EC" && key.crv === "P-256" && key.alg === "ES256" && !("d" in key)), `${entry.id}: JWKS example contains an invalid or private key`);
  }
  prepared.push({ ...entry, schema: media.schema, value });
}
assert(prepared.length === 9, `expected 9 published positive cases, got ${prepared.length}`);

const publishedExamples = enumeratePublishedExamples(bundle);
const inlinePrepared = inlineCases.map((entry) => {
  const published = publishedExamples.find((candidate) => keyOf(candidate) === keyOf(entry));
  const schema = entry.schemaName ? bundle.components.schemas[entry.schemaName] : entry.expectedSchema;
  return { ...entry, schema, value: published.exampleObject.value };
});
assert(inlinePrepared.length === 5, `expected 5 inline positive cases, got ${inlinePrepared.length}`);

const negativePrepared = [];
for (const entry of negatives) {
  const schema = bundle.components?.schemas?.[entry.schemaName];
  assert(schema && typeof schema === "object", `${entry.id}: exact negative-control schema ${entry.schemaName} missing`);
  negativePrepared.push({ ...entry, schema });
}

if (selfTest) {
  const newExample = structuredClone(bundle);
  insertExample(newExample, "issueInternalServiceToken", "request", "", "application/x-www-form-urlencoded", "uncovered_new_example", "examples/identity-internal-auth-v1/untracked.json");
  expectRejected(newExample, "an uncovered new published example");

  const missingExample = structuredClone(bundle);
  delete missingExample.paths[operations.issueInternalServiceToken.path].post.requestBody.content["application/x-www-form-urlencoded"].examples.valid_client_credentials;
  expectRejected(missingExample, "a missing published example");

  const wrongRoute = structuredClone(bundle);
  wrongRoute.paths["/incorrect/internal/token"] = wrongRoute.paths[operations.issueInternalServiceToken.path];
  delete wrongRoute.paths[operations.issueInternalServiceToken.path];
  expectRejected(wrongRoute, "an incorrect operation path");

  const wrongStatus = structuredClone(bundle);
  const successResponse = wrongStatus.paths[operations.issueInternalServiceToken.path].post.responses["200"];
  wrongStatus.paths[operations.issueInternalServiceToken.path].post.responses["201"] = successResponse;
  delete wrongStatus.paths[operations.issueInternalServiceToken.path].post.responses["200"];
  expectRejected(wrongStatus, "an incorrect response status");

  const wrongSchema = structuredClone(bundle);
  wrongSchema.paths[operations.issueInternalServiceToken.path].post.requestBody.content["application/x-www-form-urlencoded"].schema = { type: "object", additionalProperties: true };
  expectRejected(wrongSchema, "an incorrect request schema");

  const wrongFixtureValue = structuredClone(bundle);
  const publishedValue = wrongFixtureValue.paths[operations.issueInternalServiceToken.path].post.requestBody.content["application/x-www-form-urlencoded"].examples.valid_client_credentials;
  const value = publishedValue.example?.value ?? publishedValue.value;
  value.grant_type = "unsupported_grant";
  expectRejected(wrongFixtureValue, "a published example with uncovered content");

  const publishedNegative = structuredClone(bundle);
  insertExample(publishedNegative, "issueInternalServiceToken", "request", "", "application/x-www-form-urlencoded", "negative_control", negatives[0].relativeExample);
  expectRejected(publishedNegative, "a published negative fixture");

  const uncoveredInline = structuredClone(bundle);
  uncoveredInline.paths[operations.issueInternalServiceToken.path].post.responses["200"].content["application/json"].example = { unexpected: true };
  expectRejected(uncoveredInline, "an uncovered inline example");
}

await mkdir(outputDir, { recursive: true });
const schemaNames = new Map();
const rows = [];
async function emit(entry, expectation) {
  const schemaKey = entry.schemaName ?? entry.id;
  let schemaFile = schemaNames.get(schemaKey);
  if (!schemaFile) {
    schemaFile = `schema-${schemaNames.size + 1}.json`;
    const component = entry.schema ?? bundle.components.schemas[entry.schemaName];
    await writeFile(resolve(outputDir, schemaFile), `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...component }, null, 2)}\n`);
    schemaNames.set(schemaKey, schemaFile);
  }
  const fixtureName = `${entry.id}.json`;
  const value = entry.value ?? positiveValues.get(entry.id) ?? JSON.parse(await readFile(resolve(root, "openapi", entry.relativeExample), "utf8"));
  await writeFile(resolve(outputDir, fixtureName), `${JSON.stringify(value, null, 2)}\n`);
  rows.push([entry.id, expectation, schemaFile, fixtureName].join("\t"));
}
for (const entry of prepared) await emit(entry, "valid");
for (const entry of inlinePrepared) await emit(entry, "valid");
for (const entry of negativePrepared) await emit(entry, "invalid");
await writeFile(resolve(outputDir, "cases.tsv"), `${rows.join("\n")}\n`);

console.log(`Internal auth examples prepared: operations=2 versioned_positive=${prepared.length} inline_positive=${inlinePrepared.length} separate_negative=${negativePrepared.length} schemas=${schemaNames.size}${selfTest ? "; coverage negative controls=8 rejected" : ""}`);
