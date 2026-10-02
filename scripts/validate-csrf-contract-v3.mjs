import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [publicBundlePath, privateBundlePath, ...args] = process.argv.slice(2);
if (!publicBundlePath || !privateBundlePath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/validate-csrf-contract-v3.mjs <public-v2-dereferenced.json> <private-v2-dereferenced.json> [--self-test]");
}
const selfTest = args.includes("--self-test");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const publicApi = await json(resolve(publicBundlePath));
const privateApi = await json(resolve(privateBundlePath));
const manifest = await json(resolve(root, "openapi/csrf-v3-fixtures.json"));
const policy = await json(resolve(root, "openapi/identity-gateway-delegation-policy-v2.json"));
const catalogV2 = await json(resolve(root, "errors/error-catalog-v2.json"));
const catalogV3 = await json(resolve(root, "errors/error-catalog-v3.json"));
const problem = await json(resolve(root, manifest.csrf_error.fixture));
const fail = (message) => { throw new Error(message); };
const assert = (ok, message) => { if (!ok) fail(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function operation(api, method, path, id) {
  const op = api.paths?.[path]?.[method];
  assert(op?.operationId === id, `${method.toUpperCase()} ${path} must remain ${id}`);
  return op;
}
function allOperations(api) {
  const rows = [];
  for (const [path, item] of Object.entries(api.paths ?? {})) for (const method of ["get", "post", "put", "patch", "delete"]) {
    if (item?.[method]?.operationId) rows.push({ method, path, operationId: item[method].operationId, operation: item[method] });
  }
  return rows;
}
function responseHeader(op, status, name) { return op.responses?.[status]?.headers?.[name]; }
function hasNoStore(op, status) {
  const header = responseHeader(op, status, "Cache-Control");
  const schema = header?.schema;
  return schema?.const === "no-store" || schema?.example === "no-store" || header?.example === "no-store";
}
function validateCatalog(base, candidate) {
  assert(base.version === 2 && base.errors.length === 19, "v2 baseline must have exactly 19 entries");
  assert(candidate.version === 3 && candidate.errors.length === 20, "v3 catalog must contain 19 prior entries and one addition");
  assert(same(candidate.errors.slice(0, 19), base.errors), "v3 must preserve all 19 v2 entries exactly and in order");
  const codes = candidate.errors.map((entry) => entry.code);
  assert(new Set(codes).size === 20, "v3 error codes must be unique");
  const additions = candidate.errors.slice(19);
  assert(additions.length === 1 && same(additions[0], {
    code: "gateway_csrf_invalid", owner: "gateway-bff", domain: "gateway",
    description: additions[0]?.description, statuses: [403], retryable_by_default: false,
    exposure: "public", allowed_parameters: [], deprecated: false,
  }) && typeof additions[0].description === "string" && additions[0].description.length > 0,
  "v3 must add only gateway_csrf_invalid with owner/status/retry/parameter metadata");
}
function validatePublic(api, candidateManifest = manifest, candidateCatalog = catalogV3, fixture = problem) {
  assert(api.info?.version === "2.1.0", "public identity OpenAPI must be v2.1.0");
  const csrfPolicy = api.info?.description ?? "";
  assert(/Origin exacto/i.test(csrfPolicy) && /allowlist/i.test(csrfPolicy) && /Origin ausente, null o ajeno/i.test(csrfPolicy) && /solo en memoria/i.test(csrfPolicy), "public contract must document exact-Origin allowlist, rejection cases and in-memory PWA token handling");
  validateCatalog(catalogV2, candidateCatalog);
  assert(candidateManifest.csrf_error?.status === 403 && candidateManifest.csrf_error?.code === "gateway_csrf_invalid" && candidateManifest.csrf_error?.fixture === "openapi/examples/gateway-csrf-invalid-v3.json", "CSRF error fixture inventory must identify the exact v3 status, code and path");
  assert(candidateCatalog.errors.some((entry) => entry.code === candidateManifest.csrf_error.code && entry.statuses.includes(candidateManifest.csrf_error.status)), "CSRF status/code is not present in catalog v3");
  assert(fixture.status === 403 && fixture.code === "gateway_csrf_invalid" && fixture.type === "urn:opencomerix:problem:gateway_csrf_invalid" && fixture.retryable === false,
    "CSRF Problem Details fixture must be generic 403 gateway_csrf_invalid");
  assert(Object.keys(fixture).sort().join(",") === "code,instance,retryable,status,title,trace_id,type", "CSRF fixture must not carry parameters or sensitive details");
  const tokenRows = candidateManifest.token_delivery;
  assert(tokenRows.length === 8, "exactly eight responses must issue or rotate CSRF tokens");
  const seen = new Set();
  for (const row of tokenRows) {
    const key = `${row.method} ${row.path} ${row.operationId} ${row.status}`;
    assert(!seen.has(key), `duplicate token delivery inventory row: ${key}`); seen.add(key);
    const op = operation(api, row.method, row.path, row.operationId);
    assert(row.status === (row.operationId === "createInitialOrganization" ? "201" : "200"), `${row.operationId}: wrong token delivery status`);
    const csrf = responseHeader(op, row.status, "X-CSRF-Token")?.schema;
    assert(csrf?.type === "string" && csrf.minLength >= 1, `${row.operationId} ${row.status}: missing X-CSRF-Token response header`);
    assert(hasNoStore(op, row.status), `${row.operationId} ${row.status}: token response must set Cache-Control no-store`);
  }
  assert(same([...seen].sort(), [
    "post /identity/sessions createSession 200", "get /identity/session getCurrentSession 200",
    "post /identity/mfa/challenges completeMfaChallenge 200", "post /identity/device-authentications proveRegisteredDevicePossession 200",
    "post /identity/device-approval-confirmations confirmOwnerDeviceSelfApproval 200", "post /tenancy/organization-onboardings createInitialOrganization 201",
    "post /tenancy/context-selections selectActiveOrganization 200",
    "post /identity/step-up-confirmations completeSessionStepUp 200",
  ].sort()), "CSRF token delivery inventory is incomplete or misplaced");
  for (const id of ["createSession", "completeMfaChallenge", "proveRegisteredDevicePossession", "confirmOwnerDeviceSelfApproval", "createInitialOrganization", "selectActiveOrganization", "completeSessionStepUp"]) {
    const row = allOperations(api).find((item) => item.operationId === id);
    const status = id === "createInitialOrganization" ? "201" : "200";
    assert(responseHeader(row.operation, status, "Set-Cookie"), `${id} ${status}: expected session cookie issuance or rotation`);
  }
  const mutationIds = candidateManifest.authenticated_mutations;
  assert(mutationIds.length === 15 && new Set(mutationIds).size === 15, "expected the 15 authenticated mutation operations exactly once");
  assert(same([...mutationIds].sort(), [
    "logoutCurrentSession", "revokeOtherSessions", "beginTotpEnrollment", "confirmTotpEnrollment",
    "completeMfaChallenge", "createDeviceRegistrationChallenge", "createRegisteredDeviceAuthenticationChallenge",
    "proveRegisteredDevicePossession", "registerWebDevice", "requestOwnerDeviceSelfApproval",
    "confirmOwnerDeviceSelfApproval", "createInitialOrganization", "selectActiveOrganization",
    "createSessionStepUpChallenge", "completeSessionStepUp",
  ].sort()), "authenticated mutation inventory omits or adds an operation");
  for (const id of mutationIds) {
    const row = allOperations(api).find((item) => item.operationId === id);
    assert(row && row.operation.security?.length === 1 && same(Object.keys(row.operation.security[0]).sort(), ["csrfToken", "sessionCookie"]), `${id}: public mutation must require cookie and X-CSRF-Token`);
    const denied = row.operation.responses?.["403"];
    const media = denied?.content?.["application/problem+json"];
    assert(denied && media?.schema && media.examples?.csrf_invalid, `${id}: missing public Problem Details 403 CSRF example`);
    const csrfExample = media.examples.csrf_invalid;
    assert(same(csrfExample.value, fixture), `${id}: CSRF 403 example must match the versioned fixture exactly`);
    assert(hasNoStore(row.operation, "403"), `${id}: CSRF rejection must not be cached`);
  }
  const authChallenge = operation(api, "post", "/identity/device-authentication-challenges", "createRegisteredDeviceAuthenticationChallenge");
  assert(authChallenge.security?.length === 1 && same(Object.keys(authChallenge.security[0]).sort(), ["csrfToken", "sessionCookie"]), "registered device authentication challenge must require csrfToken publicly");
  const logout = operation(api, "delete", "/identity/session", "logoutCurrentSession");
  assert(responseHeader(logout, "204", "Set-Cookie") && !responseHeader(logout, "204", "X-CSRF-Token") && hasNoStore(logout, "204"), "logout expires cookie without issuing a new CSRF token and is no-store");
  for (const id of ["getCurrentSession", "listMyMemberships", "getActiveTenantContext", "getEmailVerificationDeliveryMaterial", "getOwnerDeviceApprovalDeliveryMaterial"]) {
    const row = allOperations(api).find((item) => item.operationId === id);
    assert(row && !row.operation.responses?.["403"]?.content?.["application/problem+json"]?.examples?.csrf_invalid, `${id}: GET/internal 403 must not be reclassified as CSRF`);
  }
  const headerPlacements = [];
  for (const row of allOperations(api)) for (const [status, response] of Object.entries(row.operation.responses ?? {})) if (response.headers?.["X-CSRF-Token"]) headerPlacements.push(`${row.operationId} ${status}`);
  assert(same(headerPlacements.sort(), [...seen].map((key) => key.split(" ").slice(2).join(" ")).sort()), "X-CSRF-Token response header appears outside the eight approved responses");
}
function validatePrivate(api, candidatePolicy = policy) {
  assert(api.info?.version === "2.1.0", "private delegation OpenAPI must be v2.1.0");
  const external = allOperations(publicApi).filter((row) => !row.operation["x-internal"] && !row.path.startsWith("/internal/"));
  const rows = [...candidatePolicy.service_only_operations, ...candidatePolicy.delegated_operations];
  const excluded = candidatePolicy.excluded_internal_operations;
  const key = (row) => `${row.method} ${row.path} ${row.operationId}`;
  assert(external.length === 21 && candidatePolicy.service_only_operations.length === 4 && candidatePolicy.delegated_operations.length === 17 && excluded.length === 2, "private H1 matrix must remain 21 external: 4 service, 17 delegated, 2 excluded");
  assert(new Set(rows.map(key)).size === 21 && same(rows.map(key).sort(), external.map(key).sort()), "private matrix no longer matches all 21 public operations");
  assert(!candidatePolicy.delegated_operations.some((row) => row.operationId === "completeMfaChallenge"), "MFA must remain service-only private");
  const ids = allOperations(api);
  const fakeAttestation = ids.some(({ operation: op }) =>
    (op.parameters ?? []).some((parameter) => /^x-csrf-validated$/i.test(parameter.name ?? "")) ||
    Object.values(op.responses ?? {}).some((response) => Object.keys(response.headers ?? {}).some((name) => /^x-csrf-validated$/i.test(name))),
  );
  assert(!fakeAttestation, "private API must not trust a fictional CSRF-attested header or parameter");
  const delegation = operation(api, "post", "/api/v1/internal/identity/delegations", "createGatewayUserDelegation");
  const csrfResponsibility = `${api.info?.description ?? ""}\n${delegation.description ?? ""}`;
  assert(/CSRF/i.test(csrfResponsibility) && /not.*attestation|not.*header/i.test(csrfResponsibility), "private contract must distinguish gateway CSRF checks from workload JWT");
}

validatePublic(publicApi);
validatePrivate(privateApi);
let negatives = 0;
async function reject(fn, label, expectedMessage) {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(expectedMessage)) {
      fail(`negative self-control ${label} failed for an unexpected reason; expected validator message containing ${JSON.stringify(expectedMessage)}, received ${error instanceof Error ? error.message : String(error)}`);
    }
    negatives++;
    return;
  }
  fail(`negative self-control failed to reject ${label}; expected validator message containing ${JSON.stringify(expectedMessage)}`);
}
if (selfTest) {
  const missingToken = structuredClone(publicApi); delete missingToken.paths["/identity/sessions"].post.responses["200"].headers["X-CSRF-Token"];
  await reject(() => validatePublic(missingToken), "missing token response header", "createSession 200: missing X-CSRF-Token response header");
  const wrongPlacement = structuredClone(publicApi); wrongPlacement.paths["/identity/sessions"].post.responses["401"].headers ??= {}; wrongPlacement.paths["/identity/sessions"].post.responses["401"].headers["X-CSRF-Token"] = {schema:{type:"string",minLength:1}}; delete wrongPlacement.paths["/identity/sessions"].post.responses["200"].headers["X-CSRF-Token"];
  await reject(() => validatePublic(wrongPlacement), "token header at wrong response status", "createSession 200: missing X-CSRF-Token response header");
  const cacheable = structuredClone(publicApi); delete cacheable.paths["/identity/session"].get.responses["200"].headers["Cache-Control"];
  await reject(() => validatePublic(cacheable), "missing no-store", "getCurrentSession 200: token response must set Cache-Control no-store");
  const logoutIssues = structuredClone(publicApi); logoutIssues.paths["/identity/session"].delete.responses["204"].headers["X-CSRF-Token"] = {schema:{type:"string"}};
  await reject(() => validatePublic(logoutIssues), "logout issuing CSRF token", "logout expires cookie without issuing a new CSRF token and is no-store");
  const noRotatedCookie = structuredClone(publicApi); delete noRotatedCookie.paths["/identity/mfa/challenges"].post.responses["200"].headers["Set-Cookie"];
  await reject(() => validatePublic(noRotatedCookie), "missing rotated session cookie header", "completeMfaChallenge 200: expected session cookie issuance or rotation");
  const noSecurity = structuredClone(publicApi); noSecurity.paths["/identity/device-authentication-challenges"].post.security = [{sessionCookie:[]}];
  await reject(() => validatePublic(noSecurity), "missing csrfToken security", "createRegisteredDeviceAuthenticationChallenge: public mutation must require cookie and X-CSRF-Token");
  const csrfMutationPath = "/tenancy/organization-onboardings";
  const noError = structuredClone(publicApi); delete noError.paths[csrfMutationPath].post.responses["403"];
  await reject(() => validatePublic(noError), "missing or misplaced 403 gateway_csrf_invalid", "createInitialOrganization: missing public Problem Details 403 CSRF example");
  const wrongErrorExample = structuredClone(publicApi);
  const wrongErrorValue = wrongErrorExample.paths[csrfMutationPath].post.responses["403"].content["application/problem+json"].examples.csrf_invalid.value;
  assert(wrongErrorValue && typeof wrongErrorValue === "object", "self-test setup failed: dereferenced CSRF example must have an object value");
  wrongErrorValue.code = "identity_invalid_request";
  await reject(() => validatePublic(wrongErrorExample), "incorrect public 403 error example", "createInitialOrganization: CSRF 403 example must match the versioned fixture exactly");
  const missingOriginPolicy = structuredClone(publicApi); missingOriginPolicy.info.description = "Authentication responses are not cacheable.";
  await reject(() => validatePublic(missingOriginPolicy), "missing exact-Origin public policy", "public contract must document exact-Origin allowlist, rejection cases and in-memory PWA token handling");
  const wrongError = structuredClone(problem); wrongError.code = "identity_invalid_request";
  await reject(() => validatePublic(publicApi, manifest, catalogV3, wrongError), "wrong CSRF status/code", "CSRF Problem Details fixture must be generic 403 gateway_csrf_invalid");
  const fakeHeader = structuredClone(privateApi); fakeHeader.paths["/api/v1/internal/identity/delegations"].post.parameters ??= []; fakeHeader.paths["/api/v1/internal/identity/delegations"].post.parameters.push({name:"X-CSRF-Validated",in:"header",required:true,schema:{type:"boolean"}});
  await reject(() => validatePrivate(fakeHeader), "fictional internal CSRF validation header", "private API must not trust a fictional CSRF-attested header or parameter");
  const alteredMatrix = structuredClone(policy); alteredMatrix.delegated_operations.pop();
  await reject(() => validatePrivate(privateApi, alteredMatrix), "accidentally changed delegation matrix", "private H1 matrix must remain 21 external: 4 service, 17 delegated, 2 excluded");
  const duplicateError = structuredClone(catalogV3); duplicateError.errors[19].code = duplicateError.errors[0].code;
  await reject(() => validatePublic(publicApi, manifest, duplicateError), "duplicate/altered error catalog", "v3 error codes must be unique");
}
console.log(`CSRF contract gate passed: public=${manifest.public_contract_version}; token_delivery=8; authenticated_mutations=15; private_matrix=21 (4 service+17 delegated)+2 excluded; error_catalog_v3=${catalogV3.errors.length}; self_test_rejections=${negatives}; HMAC/session binding and dynamic Origin validation demonstrated=false (gateway PF1-06C).`);
