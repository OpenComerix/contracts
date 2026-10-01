import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [publicBundlePath, privateBundlePath, ...args] = process.argv.slice(2);
if (!publicBundlePath || !privateBundlePath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/validate-client-signal-v1.mjs <public-v2-bundle.json> <private-v2.0.6-bundle.json> [--self-test]");
}
const selfTest = args.includes("--self-test");
const readJson = async (path) => JSON.parse(await readFile(resolve(path), "utf8"));
const publicApi = await readJson(publicBundlePath);
const privateApi = await readJson(privateBundlePath);
const policy = await readJson(resolve(root, "openapi/identity-gateway-delegation-policy-v2.json"));
const fixtures = await readJson(resolve(root, "openapi/client-signal-v1-fixtures.json"));
const errorCatalog = await readJson(resolve(root, "errors/error-catalog-v3.json"));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const operationIds = (rows) => rows.map((row) => row.operationId);
const serviceIds = operationIds(policy.service_only_operations);
const delegatedIds = operationIds(policy.delegated_operations);
const excludedIds = operationIds(policy.excluded_internal_operations);
const appliedIds = [...serviceIds, ...delegatedIds];
const expectedIds = [
  "registerGlobalAccount", "verifyEmail", "createSession", "completeMfaChallenge",
  "getCurrentSession", "logoutCurrentSession", "revokeOtherSessions", "beginTotpEnrollment",
  "confirmTotpEnrollment", "createDeviceRegistrationChallenge",
  "createRegisteredDeviceAuthenticationChallenge", "proveRegisteredDevicePossession",
  "registerWebDevice", "requestOwnerDeviceSelfApproval", "confirmOwnerDeviceSelfApproval",
  "createInitialOrganization", "listMyMemberships", "selectActiveOrganization", "getActiveTenantContext",
];
const expectedExcluded = ["getEmailVerificationDeliveryMaterial", "getOwnerDeviceApprovalDeliveryMaterial"];
const expectedExcludedRows = [
  { method: "get", path: "/internal/identity/email-verification-delivery-material/{deliveryMaterialId}", operationId: "getEmailVerificationDeliveryMaterial" },
  { method: "get", path: "/internal/identity/device-approval-delivery-material/{deliveryMaterialId}", operationId: "getOwnerDeviceApprovalDeliveryMaterial" },
];
const extension = privateApi["x-oc-client-signal-policy"];
const definition = privateApi.components?.parameters?.OCClientSignal;
const regex = /^v1\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

assert(publicApi.info?.version === "2.0.8", "public identity OpenAPI must be v2.0.8");
assert(privateApi.info?.version === "2.0.7", "private delegation OpenAPI must be v2.0.7");
assert(definition?.name === "X-OC-Client-Signal" && definition.in === "header" && definition.required === false, "private reusable parameter must be optional on infrastructure routes; matrix requiredness is enforced by private policy");
assert(definition.schema?.type === "string" && definition.schema.minLength === 46 && definition.schema.maxLength === 46 && definition.schema.pattern === "^v1\\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$", "signal parameter must require canonical v1 + 32-byte unpadded base64url syntax");
assert(same(serviceIds, expectedIds.slice(0, 4)), "service-only matrix must retain the exact four operationIds");
assert(same(delegatedIds, expectedIds.slice(4)), "delegated matrix must retain the exact fifteen operationIds");
assert(same(excludedIds, expectedExcluded), "the two notifications material operations must remain excluded");
assert(same(policy.excluded_internal_operations, expectedExcludedRows), "excluded operations must remain exactly the two notifications material routes");
assert(new Set(appliedIds).size === 19 && same(appliedIds, expectedIds), "the signal must cover exactly the 4+15 matrix operations in order");
assert(same(extension?.applies_to_operation_ids, appliedIds) && same(extension?.excluded_operation_ids, excludedIds), "private OpenAPI extension must link exact operationIds to the matrix");
assert(extension?.parameter_ref === "#/components/parameters/OCClientSignal" && extension?.policy_ref === "openapi/identity-gateway-delegation-policy-v2.json#/client_signal", "private extension must bind parameter and policy references");
assert(same(extension?.parameter, definition), "private extension must carry the actual reusable parameter from the dereferenced bundle");
const signalPolicy = policy.client_signal;
assert(signalPolicy?.header === "X-OC-Client-Signal" && signalPolicy.parameter_ref === extension.parameter_ref, "private policy must bind the parameter");
assert(signalPolicy.value_pattern === "^v1\\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$" && signalPolicy.value_encoding === "v1. + canonical unpadded base64url(HMAC-SHA-256, 32 bytes)", "private policy must state the exact canonical encoding");
assert(signalPolicy.required_for_matrix_operations === true && same(signalPolicy.optional_on_infrastructure_operations, ["createGatewayUserDelegation", "recoverSessionRotationReplay"]), "only the existing 19-operation matrix makes the optional infra declaration mandatory");
assert(same(signalPolicy.applies_to_operation_ids, appliedIds) && same(signalPolicy.excluded_operation_ids, excludedIds), "private policy operation inventory differs from the existing matrix");
assert(signalPolicy.derivation?.owner === "gateway-bff" && signalPolicy.derivation.input === "verified_public_origin" && signalPolicy.derivation.ipv4 === "complete_address" && signalPolicy.derivation.ipv6 === "network_prefix_64", "gateway must derive from the verified public origin using the agreed IPv4/IPv6 normalization");
assert(signalPolicy.derivation.mac === "HMAC-SHA-256" && signalPolicy.derivation.domain_separation === true && signalPolicy.derivation.secret_minimum_bytes >= 32 && signalPolicy.derivation.secret_generation === "CSPRNG" && signalPolicy.derivation.secret_exclusive_to === "gateway-bff", "signal derivation must use domain-separated HMAC and an exclusive CSPRNG secret");
assert(signalPolicy.trust_boundary?.browser_copy_removed_before_derivation === true && signalPolicy.trust_boundary.ingress_must_be_explicitly_trusted === true && signalPolicy.trust_boundary.implementation_phase === "PF1-06C", "policy must reserve derivation for the trusted PF1-06C boundary");
assert(signalPolicy.trust_boundary.identity_tenancy_authenticates_gateway_jwt_before_syntax_check === true && signalPolicy.trust_boundary.identity_tenancy_verifies_hmac === false && signalPolicy.trust_boundary.identity_tenancy_shares_hmac_secret === false && signalPolicy.trust_boundary.accept_forwarded_headers_as_substitute === false && signalPolicy.trust_boundary.authority_granted === false, "identity-tenancy must authenticate first, validate syntax only, ignore forwarded substitutes and grant no authority");
assert(signalPolicy.trust_boundary.transports_raw_ip_email_cookie_or_user_agent === false, "signal must not transport raw IP, email, cookie or User-Agent");
assert(signalPolicy.failure?.missing_duplicate_or_malformed === "identity_invalid_request" && signalPolicy.failure.status === 400 && signalPolicy.failure.generic === true && signalPolicy.failure.fail_closed === true, "signal failures must use generic cataloged identity_invalid_request and fail closed");
assert(errorCatalog.errors?.some((item) => item.code === "identity_invalid_request" && item.statuses?.includes(400)), "signal failure must use the existing cataloged generic 400 error");
assert(signalPolicy.limits?.account?.maximum === 10 && signalPolicy.limits.account.window_seconds === 900 && signalPolicy.limits.signal?.maximum === 100 && signalPolicy.limits.signal.window_seconds === 900 && signalPolicy.limits.windows_separate === true && signalPolicy.limits.purpose_scoped === true && signalPolicy.limits.environment_configurable === true && signalPolicy.limits.organization_configurable === false, "policy must preserve separate purpose-scoped account/signal limits and configuration boundary");
for (const [path, id] of [["/api/v1/internal/identity/delegations", "createGatewayUserDelegation"], ["/api/v1/internal/identity/session-rotation-replays", "recoverSessionRotationReplay"]]) {
  const op = privateApi.paths?.[path]?.post;
  assert(op?.operationId === id && op.parameters?.some((item) => item.name === "X-OC-Client-Signal" && item.required === false), `${id}: optional syntax component reference must not change v2.0.5 infrastructure semantics`);
}
const publicSerialized = JSON.stringify(publicApi);
assert(!publicSerialized.includes("X-OC-Client-Signal") && !publicSerialized.includes("x-oc-client-signal-policy"), "the public identity contract must not publish this private signal");

assert(fixtures.manifest_version === 1 && fixtures.source_policy === "identity-gateway-delegation-policy-v2.json#/client_signal" && fixtures.runtime_cryptography_demonstrated === false, "synthetic fixture manifest must identify its private source and runtime limitation");
assert(fixtures.cases.length === 11 && new Set(fixtures.cases.map((item) => item.id)).size === fixtures.cases.length, "fixture inventory must contain eleven unique synthetic cases");
for (const item of fixtures.cases) {
  assert(appliedIds.includes(item.operation_id), `${item.id}: fixture operation must be one of the exact 19 protected operations`);
  const values = item.headers.client_signal;
  const accepted = Array.isArray(values) && values.length === 1 && regex.test(values[0]);
  assert((item.expected === "accept") === accepted, `${item.id}: expected decision does not match single-value canonical syntax`);
}
const ids = new Set(fixtures.cases.map((item) => item.id));
for (const id of ["valid-service-only-synthetic", "valid-delegated-synthetic", "missing-header", "duplicate-header", "raw-ip-value", "raw-text-value", "noncanonical-padding", "unknown-version-prefix", "forwarded-for-is-not-substitute", "raw-cookie-value", "raw-user-agent-value"]) assert(ids.has(id), `missing required synthetic fixture case: ${id}`);
const forwardedOnly = fixtures.cases.find((item) => item.id === "forwarded-for-is-not-substitute");
assert(!Array.isArray(forwardedOnly.headers.client_signal) && Array.isArray(forwardedOnly.headers.x_forwarded_for), "X-Forwarded-For alone must never substitute for the required signal");
assert(fixtures.cases.find((item) => item.id === "raw-cookie-value")?.expected === "reject" && fixtures.cases.find((item) => item.id === "raw-user-agent-value")?.expected === "reject", "synthetic cookie and User-Agent values must be rejected as client signals");

if (selfTest) {
  const tests = [
    ["missing", (row) => ({ ...row, headers: {} })],
    ["duplicate", (row) => ({ ...row, headers: { client_signal: ["v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"] } })],
    ["raw-ip", (row) => ({ ...row, headers: { client_signal: ["192.0.2.42"] } })],
    ["raw-text", (row) => ({ ...row, headers: { client_signal: ["origin=synthetic"] } })],
    ["padding", (row) => ({ ...row, headers: { client_signal: ["v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="] } })],
    ["forwarded-substitute", (row) => ({ ...row, headers: { x_forwarded_for: ["192.0.2.42"] } })],
  ];
  for (const [name, mutate] of tests) {
    const baseline = fixtures.cases[0];
    const changed = mutate(baseline);
    const values = changed.headers.client_signal;
    const accepted = Array.isArray(values) && values.length === 1 && regex.test(values[0]);
    assert(!accepted, `self-test failed to reject ${name}`);
  }
  const publicCopy = structuredClone(publicApi);
  publicCopy["x-oc-client-signal-policy"] = extension;
  assert(JSON.stringify(publicCopy).includes("x-oc-client-signal-policy"), "self-test could not detect accidental publication of the private extension");
}

console.log(`PF1-06A-R6 client-signal gate passed: public=2.0.8; private=2.0.7; protected_operations=19 (4 service-only + 15 delegated); excluded_notifications_operations=2; synthetic_cases=${fixtures.cases.length}; self_test_rejections=${selfTest ? 6 : 0}; runtime HMAC, trusted-origin derivation, spoofing resistance demonstrated=false.`);
