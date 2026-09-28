import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyFile = resolve(root, "openapi/identity-gateway-delegation-policy-v1.json");
const examplesDir = resolve(root, "openapi/examples/identity-gateway-delegation-v1");
const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const positional = args.filter((arg) => !arg.startsWith("--"));
if (positional.length !== 2) throw new Error("usage: node scripts/validate-gateway-identity-policy.mjs <H1-dereferenced.json> <delegation-dereferenced.json> [--self-test]");
const h1 = JSON.parse(await readFile(resolve(positional[0]), "utf8"));
const delegation = JSON.parse(await readFile(resolve(positional[1]), "utf8"));
const policy = JSON.parse(await readFile(policyFile, "utf8"));

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
const encodingMarkers = [String.fromCharCode(0x00c3), String.fromCharCode(0x00c2), String.fromCodePoint(0x00e2, 0x20ac), String.fromCharCode(0x00ef, 0x00bb, 0x00bf), String.fromCharCode(0x00f0, 0x0178)];
function assertCleanEncoding(text, label) {
  assert(!encodingMarkers.some((marker) => text.includes(marker)), label + ": mojibake marker detected");
}
async function validateArtifactEncoding() {
  const artifactPaths = [resolve(root, "openapi/identity-gateway-delegation-v1.yaml"), resolve(root, "openapi/identity-gateway-delegation-v1.schema.json"), policyFile, resolve(root, "scripts/validate-gateway-identity-policy.mjs"), resolve(root, "scripts/validate-gateway-delegation-schemas.sh"), resolve(root, "README.md"), resolve(root, ".gitlab-ci.yml"), ...(await readdir(examplesDir)).filter((name) => name.endsWith(".json")).map((name) => resolve(examplesDir, name))];
  for (const path of artifactPaths) assertCleanEncoding(await readFile(path, "utf8"), path);
}
async function validateArtifactEncodingSelfControl() {
  const injectedArtifact = resolve(examplesDir, `.encoding-selftest-${process.pid}.json`);
  await writeFile(injectedArtifact, JSON.stringify({ text: "sesi" + String.fromCharCode(0x00c3, 0x00b3) + "n" }), "utf8");
  try {
    await expectFailure(() => validateArtifactEncoding(), "artifact traversal containing mojibake");
  } finally {
    await unlink(injectedArtifact);
  }
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function operations(document) {
  const rows = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head", "trace"]) {
      const op = pathItem?.[method];
      if (op?.operationId) rows.push({ method, path, operationId: op.operationId, operation: op });
    }
  }
  return rows;
}
function key(row) { return `${row.method} ${row.path} ${row.operationId}`; }
function assertUnique(rows, label) {
  const ids = rows.map((row) => row.operationId);
  assert(new Set(ids).size === ids.length, `${label}: operationId duplicado`);
  assert(new Set(rows.map(key)).size === rows.length, `${label}: duplicate operation`);
}
function validatePolicy(contract, candidate) {
  const external = operations(contract).filter((row) => !row.operation["x-internal"] && !row.path.startsWith("/internal/"));
  const actualInternal = operations(contract).filter((row) => row.operation["x-internal"] || row.path.startsWith("/internal/"));
  const service = candidate.service_only_operations ?? [];
  const delegated = candidate.delegated_operations ?? [];
  const excluded = candidate.excluded_internal_operations ?? [];
  assertUnique(external, "H1 externo");
  assertUnique([...service, ...delegated], "policy");
  assert(service.length === 3, `se esperaban 3 operaciones service, hay ${service.length}`);
  assert(delegated.length === 18, `se esperaban 18 operaciones delegated, hay ${delegated.length}`);
  assert(external.length === 21, `H1 debe tener exactamente 21 operaciones externas, hay ${external.length}`);
  assert(same([...service, ...delegated].map(({ method, path, operationId }) => ({ method, path, operationId })).sort((a, b) => key(a).localeCompare(key(b))), external.map(({ method, path, operationId }) => ({ method, path, operationId })).sort((a, b) => key(a).localeCompare(key(b)))), "la matriz debe coincidir exactamente con las operaciones externas H1 (method/path/operationId)");
  const expectedExcluded = actualInternal.map(({ method, path, operationId }) => ({ method, path, operationId })).sort((a, b) => key(a).localeCompare(key(b)));
  assert(expectedExcluded.length === 2 && same([...excluded].sort((a, b) => key(a).localeCompare(key(b))), expectedExcluded), "las dos rutas internas H1 deben estar excluidas exactamente de la matriz");
  for (const row of service) {
    const live = external.find((item) => item.operationId === row.operationId);
    assert(live && !(live.operation.security ?? []).some((requirement) => Object.hasOwn(requirement, "sessionCookie")), `${row.operationId}: service class conflicts with H1 pre-session route`);
  }
  for (const row of delegated) {
    const live = external.find((item) => item.operationId === row.operationId);
    assert(live, `${row.operationId}: delegated operation missing from H1`);
  }
}
async function validateEndpoint(contract, candidate) {
  const rows = operations(contract).filter((row) => row.operationId === "createGatewayUserDelegation");
  assert(rows.length === 1 && rows[0].method === "post" && rows[0].path === "/api/v1/internal/identity/delegations", "delegation method/path/operationId incorrect");
  const op = rows[0].operation;
  const security = op.security ?? [];
  assert(security.length === 1 && same(Object.keys(security[0]).sort(), ["gatewayServiceBearer", "opaqueSessionCookie"].sort()), "delegation requires both service bearer and opaque session cookie");
  const success = op.responses?.["200"];
  assert(success, "falta la respuesta 200");
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    for (const [name, headerValue] of [["Cache-Control", "no-store"], ["Pragma", "no-cache"]]) {
      const schema = response.headers?.[name]?.schema;
      assert(schema?.const === headerValue, `${status} debe declarar ${name}: ${headerValue}`);
    }
  }
  const responseSchema = success.content?.["application/json"]?.schema;
  assert(responseSchema && ["access_token", "token_type", "expires_in"].every((field) => responseSchema.required?.includes(field)), "respuesta 200 debe exigir token_type, access_token y expires_in");
  assert(responseSchema.properties?.expires_in?.maximum <= 60 && responseSchema.properties?.token_type?.const === "Bearer", "respuesta 200 debe limitar vigencia a 60 segundos y usar Bearer");
  const actual = [];
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    for (const [mediaType, media] of Object.entries(response.content ?? {})) {
      for (const [name, example] of Object.entries(media.examples ?? {})) actual.push({ status, name, example, mediaType });
      if (Object.hasOwn(media, "example")) actual.push({ status, name: "$inline", example: { value: media.example }, mediaType });
    }
  }
  const expected = candidate.published_examples.map(({ status, name, fixture }) => ({ status, name, fixture, mediaType: status === "200" ? "application/json" : "application/problem+json" }));
  assert(actual.length === expected.length, "cada ejemplo publicado debe estar inventariado exactamente una vez");
  for (const published of actual) {
    const item = expected.find((entry) => entry.status === published.status && entry.name === published.name && entry.mediaType === published.mediaType);
    assert(item, "ejemplo publicado no inventariado o con status/media type incorrecto: " + published.status + "/" + published.name);
    assert(item.fixture?.startsWith("examples/identity-gateway-delegation-v1/"), "fixture fuera de carpeta permitida: " + item.name);
    const fixturePath = resolve(root, "openapi", item.fixture);
    const openapiRoot = resolve(root, "openapi");
    assert(fixturePath.startsWith(openapiRoot + sep), "fixture path escapes OpenAPI tree: " + item.fixture);
    const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    if (published.example.externalValue !== undefined) assert(published.example.externalValue === item.fixture, item.name + ": externalValue no coincide con fixture inventariado");
    else assert(Object.hasOwn(published.example, "value") && same(published.example.value, fixture), item.name + ": ejemplo dereferenciado no coincide con fixture inventariado");
  }
}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLAIM_FIELDS = new Set(["iss", "aud", "type", "caller", "jti", "iat", "exp", "sub", "organization_id", "session_id", "device_id", "security_version", "authenticated_at", "correlation_id", "membership_id", "branch_id"]);
function isUri(value) { if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false; try { new URL(value); return true; } catch { return false; } }
function validateClaimShape(claims, configuredIssuer, label) {
  assert(claims && typeof claims === "object" && !Array.isArray(claims), label + ": claims must be an object");
  assert(Object.keys(claims).every((name) => CLAIM_FIELDS.has(name)), label + ": unsupported claim name (sid/auth_time are not aliases)");
  assert(isUri(claims.iss), label + ": iss must be an absolute URI");
  assert(claims.iss === configuredIssuer, label + ": iss contradicts configured issuer");
  assert(typeof claims.jti === "string" && UUID_V4.test(claims.jti), label + ": jti must be canonical lowercase UUIDv4");
  if (Object.hasOwn(claims, "session_id")) assert(typeof claims.session_id === "string" && claims.session_id.length > 0, label + ": session_id must be a string");
  if (Object.hasOwn(claims, "security_version")) assert(typeof claims.security_version === "string" && claims.security_version.length > 0, label + ": security_version must be a string");
  if (Object.hasOwn(claims, "authenticated_at")) assert(typeof claims.authenticated_at === "string" && Number.isFinite(Date.parse(claims.authenticated_at)), label + ": authenticated_at must be a date-time string");
}
function validateContext(context) {
  const issuer = context.configured_issuer, service = context.service_claims, session = context.session, delegated = context.delegated_claims;
  assert(isUri(issuer), "configured_issuer must be an absolute URI");
  assert(service && session && delegated, "service claims, session and delegated claims are required");
  validateClaimShape(service, issuer, "service"); validateClaimShape(delegated, issuer, "delegated");
  assert(service.aud === "identity-tenancy.gateway" && service.type === "service" && service.caller === "gateway-bff", "service claims incorrect");
  assert(Number.isSafeInteger(service.iat) && Number.isSafeInteger(service.exp) && service.exp > service.iat && service.exp - service.iat <= 300, "service lifetime invalid");
  assert(delegated.aud === "identity-tenancy.user-api" && delegated.type === "delegated" && delegated.caller === "gateway-bff", "delegated audience/type/caller incorrect");
  assert(Number.isSafeInteger(delegated.iat) && Number.isSafeInteger(delegated.exp) && delegated.exp > delegated.iat && delegated.exp - delegated.iat <= 60, "delegated lifetime invalid");
  assert(typeof session.session_id === "string" && typeof session.account_id === "string" && typeof session.security_version === "string" && typeof session.authenticated_at === "string", "session_id, authenticated_at and security_version must be strings");
  assert(session.device && ["not_registered", "pending_approval", "approved", "rejected", "revoked"].includes(session.device.status), "session.device must describe verified device context");
  if (Object.hasOwn(session.device, "device_id")) assert(typeof session.device.device_id === "string" && session.device.device_id.length > 0, "session.device.device_id must be a nonempty string");
  validateDelegatedSessionBinding(delegated, session, "delegated claims");
}
function validateDelegatedSessionBinding(delegated, session, label) {
  assert(delegated.session_id === session.session_id && delegated.sub === session.account_id && delegated.security_version === session.security_version && delegated.authenticated_at === session.authenticated_at, `${label} must match verified session account and authentication context`);
  const tenantFields = ["organization_id", "membership_id", "branch_id"];
  if (session.status === "restricted") {
    assert(session.tenant_context === null, "restricted session cannot declare tenant context");
    assert(tenantFields.every((field) => !Object.hasOwn(delegated, field)), "restricted session cannot produce tenant claims");
  } else if (session.tenant_context === null) {
    assert(tenantFields.every((field) => !Object.hasOwn(delegated, field)), "tenant claims are not allowed without tenant context");
  } else {
    assert(session.status === "active", "only an active session can receive tenant context");
    assert(session.device.status === "approved" && typeof session.device.device_id === "string", "tenant delegation requires an approved device in verified session");
    for (const field of ["organization_id", "membership_id"]) assert(delegated[field] === session.tenant_context[field], "claim " + field + " conflicts with verified session context");
    if (Object.hasOwn(delegated, "branch_id")) {
      assert(typeof session.tenant_context.branch_id === "string" && delegated.branch_id === session.tenant_context.branch_id, "delegated branch_id must match a verified branch context");
    }
  }
  if (Object.hasOwn(delegated, "device_id")) {
    assert(typeof session.device.device_id === "string" && delegated.device_id === session.device.device_id, "delegated device_id must equal device_id in verified session context");
  }
  if (Object.hasOwn(delegated, "branch_id")) {
    assert(session.tenant_context && typeof session.tenant_context.branch_id === "string" && delegated.branch_id === session.tenant_context.branch_id, "delegated branch_id must exist and match verified session context");
  }
  if (session.tenant_context !== null) {
    assert(typeof delegated.device_id === "string", "tenant delegation requires delegated device_id");
  }
}
function validateResponseToken(fixture, label, context) {
  const segments = fixture.access_token.split(".");
  assert(segments.length === 3, label + ": synthetic JWT shape");
  let payload; try { payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")); } catch { fail(label + ": synthetic JWT payload invalid"); }
  validateClaimShape(payload, context.configured_issuer, label + " synthetic JWT");
  assert(payload.aud === "identity-tenancy.user-api" && payload.type === "delegated" && payload.caller === "gateway-bff", label + ": synthetic JWT audience/type/caller");
  assert(typeof payload.session_id === "string" && typeof payload.security_version === "string" && typeof payload.authenticated_at === "string", label + ": synthetic JWT claims must use issuer field names and types");
  assert(!Object.hasOwn(payload, "sid") && !Object.hasOwn(payload, "auth_time"), label + ": legacy aliases are forbidden");
  validateDelegatedSessionBinding(payload, context.session, label + " synthetic JWT");
}
function replaceSyntheticClaim(response, name, value) {
  const copy = structuredClone(response);
  const segments = copy.access_token.split(".");
  const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  payload[name] = value;
  segments[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
  copy.access_token = segments.join(".");
  return copy;
}
async function expectFailure(fn, label) { let rejected = false; try { await fn(); } catch { rejected = true; } assert(rejected, `negative self-control did not reject ${label}`); }

validatePolicy(h1, policy);
await validateEndpoint(delegation, policy);
await validateArtifactEncoding();
const validRestricted = JSON.parse(await readFile(resolve(examplesDir, "delegation-context-restricted.json"), "utf8"));
const validTenant = JSON.parse(await readFile(resolve(examplesDir, "delegation-context-tenant.json"), "utf8"));
const validRestrictedWithDevice = JSON.parse(await readFile(resolve(examplesDir, "delegation-context-restricted-with-device.json"), "utf8"));
const validActiveWithoutTenant = JSON.parse(await readFile(resolve(examplesDir, "delegation-context-active-no-tenant.json"), "utf8"));
const validContexts = [validRestricted, validTenant, validRestrictedWithDevice, validActiveWithoutTenant];
assert(validContexts.every((context) => context.configured_issuer === validRestricted.configured_issuer), "synthetic fixtures must share their configured issuer");
for (const context of validContexts) validateContext(context);
const publishedResponses = new Map();
for (const entry of policy.published_examples) {
  const fixturePath = resolve(root, "openapi", entry.fixture);
  const openapiRoot = resolve(root, "openapi");
  assert(fixturePath.startsWith(openapiRoot + sep), "fixture path escapes OpenAPI tree: " + entry.fixture);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (entry.status === "200") {
    assert(fixture.token_type === "Bearer" && Number.isInteger(fixture.expires_in) && fixture.expires_in > 0 && fixture.expires_in <= 60 && typeof fixture.access_token === "string", `${entry.name}: response fixture shape is invalid`);
    assert(typeof entry.context_fixture === "string" && entry.context_fixture.startsWith("examples/identity-gateway-delegation-v1/"), `${entry.name}: published JWT must link to a context fixture`);
    const contextPath = resolve(root, "openapi", entry.context_fixture);
    const openapiRoot = resolve(root, "openapi");
    assert(contextPath.startsWith(openapiRoot + sep), `${entry.name}: context fixture path escapes OpenAPI tree`);
    const context = JSON.parse(await readFile(contextPath, "utf8"));
    validateContext(context);
    validateResponseToken(fixture, entry.name, context);
    publishedResponses.set(entry.name, { fixture, context });
  } else {
    assert(fixture.status === Number(entry.status) && typeof fixture.code === "string" && fixture.code.length > 0, `${entry.name}: Problem Details fixture does not match HTTP status`);
  }
}
for (const file of ["negative-audience.json", "negative-type.json", "negative-session-missing.json", "negative-session-mismatch.json", "negative-restricted-tenant-claims.json", "negative-issuer-invalid.json", "negative-issuer-mismatch.json", "negative-jti-invalid.json", "negative-claim-names.json", "negative-claim-types.json", "negative-tenant-device-missing.json", "negative-tenant-device-unapproved.json", "negative-tenant-device-mismatch.json", "negative-restricted-device-unbound.json", "negative-active-no-tenant-device-unbound.json", "negative-tenant-branch-unverified.json", "negative-tenant-branch-mismatch.json"]) {
  const sample = JSON.parse(await readFile(resolve(examplesDir, file), "utf8"));
  await expectFailure(() => validateContext(sample), file);
}

if (selfTest) {
  const wrongAudience = structuredClone(validTenant); wrongAudience.delegated_claims.aud = "identity-tenancy.delivery-material";
  const wrongType = structuredClone(validTenant); wrongType.delegated_claims.type = "service";
  const missingSession = structuredClone(validTenant); delete missingSession.session;
  const contradictorySession = structuredClone(validTenant); contradictorySession.delegated_claims.session_id = "another-session";
  const tenantOnRestricted = structuredClone(validRestricted); tenantOnRestricted.delegated_claims.organization_id = "org-forbidden";
  const invalidIssuer = structuredClone(validTenant); invalidIssuer.delegated_claims.iss = "not a URI";
  const contradictoryIssuer = structuredClone(validTenant); contradictoryIssuer.delegated_claims.iss = "https://other-identity.internal.example";
  const invalidJti = structuredClone(validTenant); invalidJti.service_claims.jti = "not-a-uuid";
  const incompatibleNames = structuredClone(validTenant); delete incompatibleNames.delegated_claims.session_id; incompatibleNames.delegated_claims.sid = "session-example"; incompatibleNames.delegated_claims.auth_time = 1780000000;
  const incompatibleTypes = structuredClone(validTenant); incompatibleTypes.session.security_version = 2; incompatibleTypes.delegated_claims.security_version = 2; incompatibleTypes.delegated_claims.authenticated_at = 1780000000;
  const missingTenantDevice = structuredClone(validTenant); delete missingTenantDevice.session.device.device_id;
  const unapprovedTenantDevice = structuredClone(validTenant); unapprovedTenantDevice.session.device.status = "pending_approval";
  const mismatchedTenantDevice = structuredClone(validTenant); mismatchedTenantDevice.delegated_claims.device_id = "another-device";
  const restrictedWithDevice = structuredClone(validRestricted);
  restrictedWithDevice.session.device = { status: "pending_approval", device_id: "restricted-device" };
  restrictedWithDevice.delegated_claims.device_id = "restricted-device";
  validateContext(restrictedWithDevice);
  const restrictedDeviceMismatch = structuredClone(restrictedWithDevice);
  restrictedDeviceMismatch.delegated_claims.device_id = "different-restricted-device";
  const restrictedClaimWithoutContext = structuredClone(validRestricted);
  restrictedClaimWithoutContext.delegated_claims.device_id = "invented-device";
  const activeWithoutTenant = structuredClone(validTenant);
  activeWithoutTenant.session.tenant_context = null;
  delete activeWithoutTenant.delegated_claims.organization_id;
  delete activeWithoutTenant.delegated_claims.membership_id;
  delete activeWithoutTenant.delegated_claims.branch_id;
  validateContext(activeWithoutTenant);
  const activeWithoutTenantDeviceMismatch = structuredClone(activeWithoutTenant);
  activeWithoutTenantDeviceMismatch.delegated_claims.device_id = "different-device";
  const activeWithoutTenantWithoutDevice = structuredClone(activeWithoutTenant);
  delete activeWithoutTenantWithoutDevice.session.device.device_id;
  delete activeWithoutTenantWithoutDevice.delegated_claims.device_id;
  validateContext(activeWithoutTenantWithoutDevice);
  const unverifiedBranch = structuredClone(validTenant);
  delete unverifiedBranch.session.tenant_context.branch_id;
  delete unverifiedBranch.delegated_claims.branch_id;
  unverifiedBranch.delegated_claims.branch_id = "invented-branch";
  const mismatchedBranch = structuredClone(validTenant);
  mismatchedBranch.delegated_claims.branch_id = "different-branch";
  for (const [name, fixture] of [["wrong audience", wrongAudience], ["wrong type", wrongType], ["missing session", missingSession], ["contradictory session", contradictorySession], ["tenant claims in restricted session", tenantOnRestricted], ["invalid issuer URI", invalidIssuer], ["contradictory issuer", contradictoryIssuer], ["invalid jti", invalidJti], ["incompatible claim names", incompatibleNames], ["incompatible claim types", incompatibleTypes], ["missing tenant device", missingTenantDevice], ["unapproved tenant device", unapprovedTenantDevice], ["contradictory tenant device", mismatchedTenantDevice], ["restricted device mismatch", restrictedDeviceMismatch], ["restricted device claim without context", restrictedClaimWithoutContext], ["active session without tenant device mismatch", activeWithoutTenantDeviceMismatch], ["tenant branch not present in verified context", unverifiedBranch], ["tenant branch differs from verified context", mismatchedBranch]]) await expectFailure(() => validateContext(fixture), name);
  const tenantResponse = publishedResponses.get("tenant_session");
  assert(tenantResponse, "tenant synthetic response must be indexed with its context");
  for (const [name, field, value] of [["account", "sub", "different-account"], ["session", "session_id", "different-session"], ["tenant", "organization_id", "different-organization"]]) {
    const contradictory = replaceSyntheticClaim(tenantResponse.fixture, field, value);
    await expectFailure(() => validateResponseToken(contradictory, `tenant response ${name} contradiction`, tenantResponse.context), `tenant response ${name} contradiction`);
  }
  await expectFailure(async () => assertCleanEncoding("sesi" + String.fromCharCode(0x00c3, 0x00b3) + "n", "synthetic encoding control"), "mojibake marker");
  await validateArtifactEncodingSelfControl();

  const missing = structuredClone(policy); missing.delegated_operations.pop(); await expectFailure(() => validatePolicy(h1, missing), "operation missing from matrix");
  const extra = structuredClone(policy); extra.delegated_operations.push({ method: "get", path: "/not-in-h1", operationId: "notInH1" }); await expectFailure(() => validatePolicy(h1, extra), "extra operation in matrix");
  const altered = structuredClone(policy); altered.delegated_operations[0].path = "/incorrect"; await expectFailure(() => validatePolicy(h1, altered), "ruta alterada en matriz");
  const unknownExample = structuredClone(delegation); unknownExample.paths[rowsPath(delegation)].post.responses["200"].content["application/json"].examples.unindexed = { externalValue: "examples/unindexed.json" };
  await expectFailure(() => validateEndpoint(unknownExample, policy), "ejemplo publicado sin inventariar");
  const missingExample = structuredClone(delegation); delete missingExample.paths[rowsPath(delegation)].post.responses["200"].content["application/json"].examples.restricted_session;
  await expectFailure(() => validateEndpoint(missingExample, policy), "ejemplo publicado faltante");
}
function rowsPath(document) { return operations(document).find((row) => row.operationId === "createGatewayUserDelegation")?.path; }
console.log(`Gateway identity policy passed: H1 external=21 service=3 delegated=18 excluded_internal=2; delegation_examples=${policy.published_examples.length}; semantic_context_fixtures=${validContexts.length}; semantic_negative_controls=${selfTest ? 18 : 0}; response_binding_negative_controls=${selfTest ? 3 : 0}; semantic_positive_controls=${selfTest ? 3 : 0}; encoding_negative_controls=${selfTest ? 2 : 0}; matrix_negative_controls=${selfTest ? 5 : 0}; crypto_signature_verified=false (schema/claims shape only).`);
