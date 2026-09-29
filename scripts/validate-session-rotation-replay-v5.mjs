import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [publicPath, privatePath, ...args] = process.argv.slice(2);
if (!publicPath || !privatePath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/validate-session-rotation-replay-v5.mjs <public-v2-dereferenced.json> <private-v2-dereferenced.json> [--self-test]");
}
const selfTest = args.includes("--self-test");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const publicApi = await readJson(resolve(publicPath));
const privateApi = await readJson(resolve(privatePath));
const manifest = await readJson(resolve(root, "openapi/session-rotation-replay-v5-fixtures.json"));
const catalog = await readJson(resolve(root, "errors/error-catalog-v3.json"));
const fixture = async (path) => readJson(resolve(root, path));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function operation(api, method, path, id) {
  const op = api.paths?.[path]?.[method];
  assert(op?.operationId === id, `${method.toUpperCase()} ${path} must remain ${id}`);
  return op;
}
function byId(api, id) {
  for (const [path, item] of Object.entries(api.paths ?? {})) for (const method of ["get", "post", "put", "patch", "delete"]) {
    if (item?.[method]?.operationId === id) return { path, method, operation: item[method] };
  }
  fail(`operationId ${id} missing from bundle`);
}
function exampleValue(examples, name, context) {
  const value = examples?.[name]?.value;
  assert(value && typeof value === "object" && !Array.isArray(value), `${context}: Redocly dereferenced example ${name} must contain an object value`);
  return value;
}
function jsonSchema(op, status, context) {
  const schema = op.responses?.[status]?.content?.["application/json"]?.schema;
  assert(schema && !schema.$ref, `${context}: JSON response schema must be present and dereferenced`);
  return schema;
}
function requestSchema(op, context) {
  const schema = op.requestBody?.content?.["application/json"]?.schema;
  assert(schema && !schema.$ref, `${context}: JSON request schema must be present and dereferenced`);
  return schema;
}
function responseExamples(op, status, context) {
  const examples = op.responses?.[status]?.content?.["application/json"]?.examples;
  assert(examples && typeof examples === "object", `${context}: JSON response examples missing`);
  return examples;
}
function hasNoStore(op, status) {
  const header = op.responses?.[status]?.headers?.["Cache-Control"];
  const schema = header?.schema;
  return schema?.const === "no-store" || schema?.example === "no-store" || header?.example === "no-store";
}
function hasNoCache(op, status) {
  const header = op.responses?.[status]?.headers?.Pragma;
  const schema = header?.schema;
  return schema?.const === "no-cache" || schema?.example === "no-cache" || header?.example === "no-cache";
}
function walk(value, visit, at = "$", seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visit(value, at);
  for (const [key, child] of Object.entries(value)) walk(child, visit, `${at}.${key}`, seen);
}
function fixturePaths(candidateManifest) {
  return [
    ...candidateManifest.rotations.flatMap((row) => [row.body_fixture, row.request_fixture, row.response_fixture]),
    ...candidateManifest.challenges.map((row) => row.body_fixture),
    ...candidateManifest.errors.map((row) => row.fixture),
    ...candidateManifest.negative_requests, ...candidateManifest.negative_responses, ...candidateManifest.negative_public_bodies,
  ];
}
function validateFixtureInventory(candidateManifest, filenames) {
  const paths = fixturePaths(candidateManifest);
  const names = [...new Set(paths)].map((path) => path.split("/").at(-1));
  const published = filenames.filter((name) => name.startsWith("identity-session-rotation-replay-v5-") && name.endsWith(".json")).sort();
  assert(same(published, names.sort()), "R5 fixture inventory has an unindexed, missing or duplicated artifact");
}

async function validatePublic(api, candidateManifest = manifest, bodies = new Map()) {
  assert(api.info?.version === "2.0.5", "public OpenAPI version must be 2.0.5");
  walk(api, (value, path) => {
    assert(!Object.hasOwn(value.properties ?? {}, "session_credential") && !Object.hasOwn(value, "session_credential"), `public schema or example leaks session_credential at ${path}`);
  });
  const rotations = candidateManifest.rotations;
  const challenges = candidateManifest.challenges;
  assert(Array.isArray(rotations) && rotations.length === 4, "manifest must inventory exactly four rotating public operations");
  assert(Array.isArray(challenges) && challenges.length === 2, "manifest must inventory exactly two challenge operations");
  const expectedRotationIds = ["proveRegisteredDevicePossession", "confirmOwnerDeviceSelfApproval", "createInitialOrganization", "selectActiveOrganization"];
  const expectedChallengeIds = ["createDeviceRegistrationChallenge", "createRegisteredDeviceAuthenticationChallenge"];
  assert(same(rotations.map((row) => row.operationId).sort(), expectedRotationIds.sort()), "rotation manifest operations must be exact");
  assert(same(challenges.map((row) => row.operationId).sort(), expectedChallengeIds.sort()), "challenge manifest operations must be exact");
  const expectedReplayHeaderIds = [...expectedRotationIds, ...expectedChallengeIds].sort();
  assert(Array.isArray(candidateManifest.idempotency_replayed_headers) && same(candidateManifest.idempotency_replayed_headers.map((row) => row.operationId).sort(), expectedReplayHeaderIds), "manifest must inventory exactly six Idempotency-Replayed headers");
  for (const row of candidateManifest.idempotency_replayed_headers) {
    const firstValue = Object.hasOwn(row, "first_effect") ? row.first_effect : row.first_issue;
    assert(row.schema_type === "boolean" && firstValue === false && row.exact_replay === true, `${row.operationId}: manifest replay-header values must be boolean false/true`);
  }
  const validateReplayHeader = (op, id, firstName, status) => {
    const declaration = op.responses?.[status]?.headers?.["Idempotency-Replayed"];
    const schema = declaration?.schema;
    assert(schema?.type === "boolean" && !Object.hasOwn(schema, "enum"), `${id}: Idempotency-Replayed schema must be boolean`);
    assert(/HTTP serializa los valores como `false` o `true`/i.test(declaration.description ?? ""), `${id}: Idempotency-Replayed must document HTTP string serialization`);
    const examples = declaration.examples;
    assert(examples?.[firstName]?.value === false && typeof examples?.[firstName]?.value === "boolean" && examples?.exact_replay?.value === true && typeof examples?.exact_replay?.value === "boolean", `${id}: replay header examples must be JSON booleans false/true`);
  };
  const rotationKeys = rotations.map((row) => row.original_and_replay_idempotency_key);
  assert(rotationKeys.every((key) => UUID7.test(key ?? "")) && new Set(rotationKeys).size === 4, "each public rotation must map the exact original/replay Idempotency-Key as a unique UUIDv7");
  for (const row of rotations) {
    const op = operation(api, row.method, row.path, row.operationId);
    assert(row.status === (row.operationId === "createInitialOrganization" ? "201" : "200"), `${row.operationId}: manifest status mismatch`);
    const response = op.responses?.[row.status];
    assert(hasNoStore(op, row.status), `${row.operationId}: rotating response must be no-store`);
    assert(response?.headers?.["Set-Cookie"], `${row.operationId}: rotating response must issue Set-Cookie`);
    assert(response?.headers?.["X-CSRF-Token"], `${row.operationId}: rotating response must issue X-CSRF-Token`);
    validateReplayHeader({ responses: { [row.status]: response } }, row.operationId, "first_effect", row.status);
    const ex = responseExamples(op, row.status, row.operationId);
    assert(same(Object.keys(ex).sort(), ["exact_replay", "first_effect"]), `${row.operationId}: body examples must inventory first effect and exact replay`);
    const publishedSchema = jsonSchema(op, row.status, row.operationId);
    const expectedSchema = api.components?.schemas?.[row.schema];
    assert(expectedSchema && same(publishedSchema, expectedSchema), `${row.operationId}: published response schema mapping changed`);
    const body = bodies.get(row.body_fixture) ?? await fixture(row.body_fixture);
    for (const name of ["first_effect", "exact_replay"]) {
      assert(same(exampleValue(ex, name, row.operationId), body), `${row.operationId}: ${name} body must equal versioned public fixture`);
    }
    assert(!Object.hasOwn(body, "session_credential"), `${row.operationId}: public fixture must not expose session_credential`);
  }
  for (const row of challenges) {
    const op = operation(api, row.method, row.path, row.operationId);
    const response = op.responses?.[row.status];
    assert(hasNoStore(op, row.status), `${row.operationId}: challenge response must be no-store`);
    validateReplayHeader({ responses: { [row.status]: response } }, row.operationId, "first_issue", row.status);
    const examples = responseExamples(op, row.status, row.operationId);
    assert(same(Object.keys(examples).sort(), ["exact_replay", "first_issue"]), `${row.operationId}: challenge response examples must distinguish issue and replay`);
    const body = bodies.get(row.body_fixture) ?? await fixture(row.body_fixture);
    assert(same(exampleValue(examples, "first_issue", row.operationId), body), `${row.operationId}: first challenge example differs from fixture`);
    assert(same(exampleValue(examples, "exact_replay", row.operationId), body), `${row.operationId}: replay must preserve original challenge nonce and expiry`);
    assert(typeof body.expires_at === "string" && typeof body.challenge === "string", `${row.operationId}: fixture must include original challenge and expiry`);
    const description = `${op.description ?? ""} ${response.description ?? ""}`;
    assert(/misma Idempotency-Key/i.test(description) && /expir|venc/i.test(description) && /cinco minutos/i.test(description) && /Una clave nueva/i.test(description) && /logs ni eventos/i.test(description), `${row.operationId}: replay expiry, new-key and sensitive-channel rules missing`);
  }
  const logout = operation(api, "delete", "/identity/session", "logoutCurrentSession");
  const logoutDescription = `${logout.description ?? ""} ${logout.responses?.["204"]?.description ?? ""}`;
  assert(logout.parameters?.some((parameter) => parameter.name === "Idempotency-Key" && parameter.required === true && parameter.schema?.pattern?.includes("-7")), "logout must require UUIDv7 Idempotency-Key");
  assert(logout.responses?.["204"]?.headers?.["Set-Cookie"] && hasNoStore(logout, "204"), "logout 204 must expire cookie and be no-store");
  assert(!logout.responses?.["204"]?.headers?.["X-CSRF-Token"], "logout must not emit a replacement CSRF token");
  assert(logout.responses?.["204"] && logout.responses?.["401"] && logout.responses?.["403"] && logout.responses?.["503"], "logout must distinguish success, invalid session, CSRF rejection and unavailability");
  assert(/no duplica el efecto/i.test(logoutDescription) && /solo.*limpiar localmente/i.test(logoutDescription) && /Cookie ausente.*no se convierten en logout exitoso/i.test(logoutDescription) && /indisponibilidad.*no/i.test(logoutDescription), "logout false-success and cleanup restrictions missing");
  for (const item of Object.values(api.paths ?? {})) for (const [method, op] of Object.entries(item ?? {})) {
    if (!op?.operationId || method === "parameters" || item[method]?.["x-internal"] || op.operationId.startsWith("getEmailVerificationDelivery") || op.operationId.startsWith("getOwnerDeviceApprovalDelivery")) continue;
    const securityText = JSON.stringify(op.security ?? []);
    assert(!/gatewayServiceBearer|delegatedBearer|serviceToService/i.test(securityText), `${op.operationId}: public operation must not require an internal JWT`);
  }
  for (const row of [...rotations, ...challenges]) {
    const body = bodies.get(row.body_fixture) ?? await fixture(row.body_fixture);
    walk(body, (value, path) => assert(!Object.hasOwn(value, "session_credential"), `public fixture leaks session_credential at ${path}`));
  }
}

async function validatePrivate(api, candidateManifest = manifest, candidateCatalog = catalog, bodies = new Map()) {
  assert(api.info?.version === "2.0.5", "private OpenAPI version must be 2.0.5");
  const ordinaryDelegation = operation(api, "post", "/api/v1/internal/identity/delegations", "createGatewayUserDelegation");
  assert(ordinaryDelegation.security?.length === 1 && same(Object.keys(ordinaryDelegation.security[0]).sort(), ["currentSessionCookie", "gatewayServiceBearer"]), "ordinary delegation must require the current session cookie, never the prior cookie");
  const currentCookie = api.components?.securitySchemes?.currentSessionCookie;
  const previousCookie = api.components?.securitySchemes?.previousSessionCookie;
  assert(currentCookie?.type === "apiKey" && currentCookie.in === "cookie" && currentCookie.name === "__Host-oc_session" && /vigente/i.test(currentCookie.description ?? "") && /no acepta la credencial anterior/i.test(currentCookie.description ?? ""), "currentSessionCookie must describe a current cookie that rejects the prior credential");
  assert(previousCookie?.type === "apiKey" && previousCookie.in === "cookie" && previousCookie.name === "__Host-oc_session" && /anterior/i.test(previousCookie.description ?? "") && /nunca autentica delegaciones ordinarias/i.test(previousCookie.description ?? ""), "previousSessionCookie must be restricted to prior-cookie replay");
  const row = candidateManifest.private_operation;
  assert(row?.method === "post" && row.path === "/api/v1/internal/identity/session-rotation-replays" && row.operationId === "recoverSessionRotationReplay", "private operation inventory changed");
  const op = operation(api, row.method, row.path, row.operationId);
  assert(op.security?.length === 1 && same(Object.keys(op.security[0]).sort(), ["gatewayServiceBearer", "previousSessionCookie"]), "private replay must require service JWT and previous opaque cookie simultaneously");
  const idem = op.parameters?.find((parameter) => parameter.name === "Idempotency-Key" && parameter.in === "header");
  assert(op.parameters?.filter((parameter) => parameter.name === "Idempotency-Key" && parameter.in === "header").length === 1, "private replay must declare exactly one Idempotency-Key header");
  assert(idem?.required === true && idem.schema?.pattern === "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", "private replay must require original UUIDv7 Idempotency-Key");
  assert(!op.parameters?.some((parameter) => /^(method|path|route|url)$/i.test(parameter.name ?? "")), "private replay must derive method and path from operation_id");
  const request = op.requestBody?.content?.["application/json"]?.schema;
  const response = op.responses?.["200"]?.content?.["application/json"]?.schema;
  assert(request && !request.$ref && response && !response.$ref, "private replay request/response schemas must be dereferenced in real bundle");
  assert(op.responses?.["200"] && hasNoStore(op, "200") && hasNoCache(op, "200"), "private replay 200 must be no-store/no-cache");
  const noCacheStatuses = ["400", "401", "409", "429", "503"];
  for (const status of noCacheStatuses) assert(hasNoStore(op, status) && hasNoCache(op, status), `private replay ${status} must be no-store/no-cache`);
  for (const status of ["400", "401", "409"]) assert(op.responses?.[status]?.content?.["application/problem+json"]?.schema, `private replay ${status} must use Problem Details`);
  const requestBranches = request.oneOf;
  const responseBranches = response.oneOf;
  assert(Array.isArray(requestBranches) && requestBranches.length === 4, "private replay request schema must have exactly four operation branches");
  assert(Array.isArray(responseBranches) && responseBranches.length === 4, "private replay response schema must have exactly four operation branches");
  const rotationRows = candidateManifest.rotations;
  for (const rotation of rotationRows) {
    const publicOp = operation(publicApi, rotation.method, rotation.path, rotation.operationId);
    const requestPublic = publicOp.requestBody?.content?.["application/json"]?.schema;
    const publicResponse = jsonSchema(publicOp, rotation.status, rotation.operationId);
    assert(requestPublic && !requestPublic.$ref, `${rotation.operationId}: public request schema must be dereferenced`);
    const publicIdem = publicOp.parameters?.find((parameter) => parameter.name === "Idempotency-Key" && parameter.in === "header");
    assert(publicIdem?.required === true && same(publicIdem.schema, idem.schema), `${rotation.operationId}: private replay Idempotency-Key must match the original public operation header`);
    const requestBranch = requestBranches.find((branch) => branch.properties?.operation_id?.const === rotation.operationId);
    const responseBranch = responseBranches.find((branch) => branch.properties?.operation_id?.const === rotation.operationId);
    assert(requestBranch && responseBranch, `${rotation.operationId}: private replay schema branch missing`);
    assert(requestBranch.type === "object" && requestBranch.additionalProperties === false && same(requestBranch.required, ["operation_id", "original_request"]) && same(Object.keys(requestBranch.properties ?? {}).sort(), ["operation_id", "original_request"]), `${rotation.operationId}: private original request branch must be strict JSON with no route selector`);
    assert(responseBranch.type === "object" && responseBranch.additionalProperties === false && same(responseBranch.required, ["operation_id", "public_status", "public_body", "session_credential", "replayed"]) && same(Object.keys(responseBranch.properties ?? {}).sort(), ["operation_id", "public_status", "public_body", "session_credential", "replayed"].sort()), `${rotation.operationId}: private replay response branch must be a closed required object`);
    assert(same(requestBranch.properties?.original_request, requestPublic), `${rotation.operationId}: private original_request must equal exact public request schema`);
    assert(responseBranch.properties?.public_status?.const === Number(rotation.status), `${rotation.operationId}: private public_status differs from public operation`);
    assert(same(responseBranch.properties?.public_body, publicResponse), `${rotation.operationId}: private public_body must equal exact public success schema`);
    const credentialSchema = responseBranch.properties?.session_credential;
    assert(credentialSchema?.type === "string" && credentialSchema.minLength === 43 && credentialSchema.maxLength === 43 && credentialSchema.pattern === "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$" && credentialSchema["x-sensitive"] === true, `${rotation.operationId}: private credential must require canonical unpadded base64url encoding of exactly 32 bytes`);
    assert(/no demuestra entropía/i.test(credentialSchema.description ?? "") && /generar los 32 bytes con CSPRNG/i.test(credentialSchema.description ?? ""), `${rotation.operationId}: credential schema must distinguish encoding shape from runtime CSPRNG generation`);
    assert(responseBranch.properties?.replayed?.const === true, `${rotation.operationId}: replay response must be marked replayed`);
    const responseFixture = bodies.get(rotation.response_fixture) ?? await fixture(rotation.response_fixture);
    const publicBodyFixture = bodies.get(rotation.body_fixture) ?? await fixture(rotation.body_fixture);
    assert(responseFixture.operation_id === rotation.operationId && responseFixture.public_status === Number(rotation.status) && responseFixture.replayed === true, `${rotation.operationId}: private response fixture metadata mismatch`);
    assert(same(responseFixture.public_body, publicBodyFixture), `${rotation.operationId}: private fixture does not preserve exact public body`);
    assert(typeof responseFixture.session_credential === "string" && responseFixture.session_credential === "SYNTHETIC-NON-FUNCTIONAL-000000000000000004" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(responseFixture.session_credential), `${rotation.operationId}: private credential fixture must be explicitly synthetic/nonfunctional and match the exact 32-byte base64url shape`);
  }
  const allExamples = op.requestBody.content["application/json"].examples;
  assert(same(Object.keys(allExamples ?? {}).sort(), ["initial_organization", "organization_selection", "owner_device_self_approval", "registered_device_possession"]), "private request examples must exactly cover four operations");
  const privateResponseExamples = op.responses["200"].content["application/json"].examples;
  assert(same(Object.keys(privateResponseExamples ?? {}).sort(), ["initial_organization", "organization_selection", "owner_device_self_approval", "registered_device_possession"]), "private response examples must exactly cover four operations");
  for (const rotation of rotationRows) {
    const requestName = ({ proveRegisteredDevicePossession: "registered_device_possession", confirmOwnerDeviceSelfApproval: "owner_device_self_approval", createInitialOrganization: "initial_organization", selectActiveOrganization: "organization_selection" })[rotation.operationId];
    const requestFixture = bodies.get(rotation.request_fixture) ?? await fixture(rotation.request_fixture);
    const responseFixture = bodies.get(rotation.response_fixture) ?? await fixture(rotation.response_fixture);
    assert(same(exampleValue(allExamples, requestName, "private request"), requestFixture), `${rotation.operationId}: published private request example differs from fixture`);
    assert(same(exampleValue(privateResponseExamples, requestName, "private response"), responseFixture), `${rotation.operationId}: published private response example differs from fixture`);
    assert(rotation.original_and_replay_idempotency_key && UUID7.test(rotation.original_and_replay_idempotency_key), `${rotation.operationId}: fixture inventory must map the original Idempotency-Key UUIDv7`);
  }
  const allowedCodes = new Map([["identity_invalid_request", 400], ["identity_session_invalid_or_expired", 401], ["identity_idempotency_key_reused", 409], ["identity_idempotency_request_in_progress", 409], ["identity_state_or_version_conflict", 409]]);
  assert(candidateManifest.errors.length === 5, "private error fixture inventory must have exactly five cases");
  for (const err of candidateManifest.errors) {
    assert(allowedCodes.get(err.code) === Number(err.status), `${err.code}: unexpected error code/status mapping`);
    const entry = candidateCatalog.errors?.find((item) => item.code === err.code);
    assert(entry?.statuses?.includes(Number(err.status)), `${err.code}: private response uses uncatalogued status`);
    const body = bodies.get(err.fixture) ?? await fixture(err.fixture);
    assert(body.status === Number(err.status) && body.code === err.code && body.retryable === entry.retryable_by_default, `${err.code}: error fixture body mismatch`);
    assert(!("parameters" in body), `${err.code}: error fixture must not expose parameters`);
  }
  const expectedRejections = ["service_jwt_invalid_or_expired", "prior_cookie_not_bound", "session_revoked_or_expired", "different_operation_same_key", "different_original_payload_same_key", "result_expired", "credential_rotated_again", "authorization_or_approval_changed", "original_operation_still_in_progress"];
  assert(Array.isArray(candidateManifest.rejections) && candidateManifest.rejections.length === expectedRejections.length && same(candidateManifest.rejections.map((item) => item.condition).sort(), [...expectedRejections].sort()), "rejection manifest must inventory all nine authentication, replay, and in-progress cases");
  for (const item of candidateManifest.rejections) {
    assert(allowedCodes.get(item.code) === Number(item.status), `${item.condition}: rejection must use its existing status/code`);
    const errorRow = candidateManifest.errors.find((entry) => entry.code === item.code && entry.status === item.status && entry.fixture === item.fixture);
    assert(errorRow, `${item.condition}: rejection must reuse a versioned existing Problem Details fixture`);
    const body = bodies.get(item.fixture) ?? await fixture(item.fixture);
    assert(body.status === Number(item.status) && body.code === item.code, `${item.condition}: rejection fixture status/code mismatch`);
  }
  const authRejections = candidateManifest.rejections.filter((item) => item.status === "401");
  assert(authRejections.length === 3 && new Set(authRejections.map((item) => item.fixture)).size === 1 && new Set(authRejections.map((item) => item.code)).size === 1, "invalid service JWT and unbound/revoked/expired session rejections must share one non-enumerating 401 fixture");
  const errorExamples = [
    ["400", "invalid_request", "identity_invalid_request"],
    ["401", "invalid_or_unbound_identity", "identity_session_invalid_or_expired"],
    ["409", "key_reused", "identity_idempotency_key_reused"],
    ["409", "request_in_progress", "identity_idempotency_request_in_progress"],
    ["409", "stale_rotation_result", "identity_state_or_version_conflict"],
  ];
  for (const [status, name, code] of errorExamples) assert(same(exampleValue(op.responses[status].content["application/problem+json"].examples, name, `private ${status}`), bodies.get(candidateManifest.errors.find((e) => e.code === code).fixture) ?? await fixture(candidateManifest.errors.find((e) => e.code === code).fixture)), `${code}: private published error example differs from fixture`);
  assert(/no se repite el efecto/i.test(op.description) && /no se extienden los vencimientos/i.test(op.description) && /identity_idempotency_key_reused/i.test(op.description) && /identity_idempotency_request_in_progress/i.test(op.description) && /no se incluye cookie/i.test(op.description), "private replay operation must document no duplicate effect/extension, generic conflicts and redaction");
  assert(/cookie no ligada[\s\S]*mismo 401 gen\u00e9rico/i.test(op.description) && /resultado expirado[\s\S]*409/i.test(op.description) && /autorizaci\u00f3n\/estado produce 409/i.test(op.description) && /rotaci\u00f3n posterior/i.test(op.description), "private replay must document generic authentication rejection and stale-result state conflicts");
  assert(/no revela si fall\u00f3 JWT de servicio, cookie anterior o vigencia de sesi\u00f3n/i.test(op.responses?.["401"]?.description ?? ""), "private 401 must not reveal which authentication condition failed");
  assert(/prior session cookie never obtains an ordinary delegation/i.test(api.info?.description ?? ""), "private API must limit previous cookie to replay, not ordinary delegation");
}

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fixtureNames = await readdir(resolve(root, "openapi/examples"));
validateFixtureInventory(manifest, fixtureNames);
const loaded = new Map();
for (const path of new Set(fixturePaths(manifest))) loaded.set(path, await fixture(path));

await validatePublic(publicApi, manifest, loaded);
await validatePrivate(privateApi, manifest, catalog, loaded);
let rejected = 0;
async function expectReject(label, expected, fn) {
  try { await fn(); } catch (error) {
    assert(error instanceof Error && error.message.includes(expected), `${label}: unexpected preparation/runtime error; expected ${JSON.stringify(expected)}, got ${error instanceof Error ? error.message : String(error)}`);
    rejected += 1; return;
  }
  fail(`self-test did not reject ${label}; expected validator failure ${JSON.stringify(expected)}`);
}
if (selfTest) {
  const p = structuredClone(publicApi);
  delete p.paths["/tenancy/context-selections"].post.responses["200"].headers["Set-Cookie"];
  await expectReject("select rotation cookie missing", "selectActiveOrganization: rotating response must issue Set-Cookie", () => validatePublic(p));
  const p2 = structuredClone(publicApi);
  delete p2.paths["/identity/device-authentications"].post.responses["200"].headers["Idempotency-Replayed"];
  await expectReject("rotation replay header missing", "proveRegisteredDevicePossession: Idempotency-Replayed schema must be boolean", () => validatePublic(p2));
  const p2b = structuredClone(publicApi);
  p2b.paths["/tenancy/context-selections"].post.responses["200"].headers["Idempotency-Replayed"].schema = { type: "string", enum: ["false", "true"] };
  await expectReject("rotation replay header regressed to string", "selectActiveOrganization: Idempotency-Replayed schema must be boolean", () => validatePublic(p2b));
  const p2c = structuredClone(publicApi);
  p2c.paths["/identity/device-registration-challenges"].post.responses["200"].headers["Idempotency-Replayed"].examples.exact_replay.value = "true";
  await expectReject("challenge replay header string example", "createDeviceRegistrationChallenge: replay header examples must be JSON booleans false/true", () => validatePublic(p2c));
  const mHeader = structuredClone(manifest);
  mHeader.idempotency_replayed_headers[0].exact_replay = "true";
  await expectReject("manifest replay header string value", "proveRegisteredDevicePossession: manifest replay-header values must be boolean false/true", () => validatePublic(publicApi, mHeader, loaded));
  const p3 = structuredClone(publicApi);
  delete p3.paths["/identity/session"].delete.parameters[0];
  await expectReject("logout key missing", "logout must require UUIDv7 Idempotency-Key", () => validatePublic(p3));
  const p4 = structuredClone(publicApi);
  p4.paths["/identity/device-registration-challenges"].post.responses["200"].content["application/json"].examples.exact_replay.value.expires_at = "2026-09-25T12:10:00Z";
  await expectReject("challenge replay extended", "createDeviceRegistrationChallenge: replay must preserve original challenge nonce and expiry", () => validatePublic(p4));
  const p5 = structuredClone(publicApi);
  p5.components.schemas.SessionContext.properties.session_credential = { type: "string" };
  await expectReject("public credential leaked", "public schema or example leaks session_credential", () => validatePublic(p5));
  const q = structuredClone(privateApi);
  q.paths["/api/v1/internal/identity/session-rotation-replays"].post.security = [{ gatewayServiceBearer: [], currentSessionCookie: [] }];
  await expectReject("replay incorrectly uses current cookie", "private replay must require service JWT and previous opaque cookie simultaneously", () => validatePrivate(q));
  const qCookie = structuredClone(privateApi);
  qCookie.paths["/api/v1/internal/identity/delegations"].post.security = [{ gatewayServiceBearer: [], previousSessionCookie: [] }];
  await expectReject("ordinary delegation incorrectly uses prior cookie", "ordinary delegation must require the current session cookie, never the prior cookie", () => validatePrivate(qCookie));
  const q2 = structuredClone(privateApi);
  q2.paths["/api/v1/internal/identity/session-rotation-replays"].post.parameters.find((item) => item.name === "Idempotency-Key").schema.pattern = "^.*$";
  await expectReject("UUIDv7 constraint removed", "private replay must require original UUIDv7 Idempotency-Key", () => validatePrivate(q2));
  const q3 = structuredClone(privateApi);
  q3.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].schema.oneOf.pop();
  await expectReject("operation mapping removed", "private replay request schema must have exactly four operation branches", () => validatePrivate(q3));
  const q3b = structuredClone(privateApi);
  q3b.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].schema.oneOf[0].properties.path = { type: "string" };
  await expectReject("client-selected route added", "private original request branch must be strict JSON with no route selector", () => validatePrivate(q3b));
  const q4 = structuredClone(privateApi);
  q4.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf[0].properties.public_status.const = 201;
  await expectReject("public status mismatch", "proveRegisteredDevicePossession: private public_status differs from public operation", () => validatePrivate(q4));
  const q5 = structuredClone(privateApi);
  delete q5.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].headers.Pragma;
  await expectReject("private no-cache missing", "private replay 200 must be no-store/no-cache", () => validatePrivate(q5));
  const q6 = structuredClone(privateApi);
  q6.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].examples.registered_device_possession.value.path = "/arbitrary";
  await expectReject("request fixture altered", "published private request example differs from fixture", () => validatePrivate(q6));
  const q7 = structuredClone(privateApi);
  q7.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["409"].content["application/problem+json"].examples.key_reused.value.code = "identity_invalid_request";
  await expectReject("error fixture altered", "identity_idempotency_key_reused: private published error example differs from fixture", () => validatePrivate(q7));
  const q8 = structuredClone(privateApi);
  q8.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].schema.oneOf[1].properties.original_request = structuredClone(q8.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].schema.oneOf[0].properties.original_request);
  await expectReject("operation mapped to wrong public request schema", "confirmOwnerDeviceSelfApproval: private original_request must equal exact public request schema", () => validatePrivate(q8));
  const q9 = structuredClone(privateApi);
  q9.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf[0].properties.diagnostic = { type: "string" };
  await expectReject("private response extra field", "private replay response branch must be a closed required object", () => validatePrivate(q9));
  const qCredential = structuredClone(privateApi);
  const looseCredential = qCredential.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf[0].properties.session_credential;
  looseCredential.minLength = 1;
  looseCredential.pattern = "^.+$";
  delete looseCredential.maxLength;
  await expectReject("private credential schema loosened to any nonempty string", "proveRegisteredDevicePossession: private credential must require canonical unpadded base64url encoding of exactly 32 bytes", () => validatePrivate(qCredential));
  const q10 = structuredClone(privateApi);
  q10.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["401"].description = "Authentication failed.";
  await expectReject("auth condition disclosure", "private 401 must not reveal which authentication condition failed", () => validatePrivate(q10));
  const q11 = structuredClone(privateApi);
  q11.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["401"].content["application/problem+json"].examples.invalid_or_unbound_identity.value.code = "identity_invalid_credentials";
  await expectReject("401 code changed by authentication condition", "identity_session_invalid_or_expired: private published error example differs from fixture", () => validatePrivate(q11));
  const m = structuredClone(manifest); m.rotations.pop();
  await expectReject("fixture/operation coverage missing", "manifest must inventory exactly four rotating public operations", () => validatePublic(publicApi, m, loaded));
  await expectReject("unindexed positive/negative fixture", "R5 fixture inventory has an unindexed, missing or duplicated artifact", () => {
    validateFixtureInventory(manifest, [...fixtureNames, "identity-session-rotation-replay-v5-unindexed.json"]);
  });
  const missingFixture = structuredClone(manifest); missingFixture.negative_responses.pop();
  await expectReject("negative fixture removed from inventory", "R5 fixture inventory has an unindexed, missing or duplicated artifact", () => validateFixtureInventory(missingFixture, fixtureNames));
  const m2 = structuredClone(manifest); m2.errors[2].code = "unregistered_error";
  await expectReject("unregistered catalog code", "unexpected error code/status mapping", () => validatePrivate(privateApi, m2, catalog, loaded));
  const m3 = structuredClone(manifest); m3.rejections.pop();
  await expectReject("rejection case omitted", "rejection manifest must inventory all nine authentication, replay, and in-progress cases", () => validatePrivate(privateApi, m3, catalog, loaded));
}
console.log(`Session rotation replay v5 gate passed: public=2.0.5; private=2.0.5; rotations=4; challenge_replays=2; private_positive_request_response_fixtures=8; problem_fixtures=5; rejection_cases=${manifest.rejections.length}; negative_fixtures=${manifest.negative_requests.length + manifest.negative_responses.length + manifest.negative_public_bodies.length}; self_test_rejections=${rejected}; runtime HMAC/cookie/current-state validation demonstrated=false (service implementation out of scope).`);
