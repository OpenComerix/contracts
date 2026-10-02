import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const manifestPath = resolve(root, "openapi/session-step-up-v1-fixtures.json");
export const fixtureRoot = resolve(root, "openapi/examples/session-step-up-v1");
export const parse = async (path) => JSON.parse(await readFile(path, "utf8"));
export const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
export const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
export const fail = (message) => { throw new Error(message); };
export const assert = (condition, message) => { if (!condition) fail(message); };
const unescape = (part) => part.replaceAll("~1", "/").replaceAll("~0", "~");
export const at = (value, pointer) => pointer.slice(1).split("/").map(unescape).reduce((current, part) => current?.[part], value);
export const pointerEscape = (part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1");
export const requestPointer = (path, method) => `/paths/${pointerEscape(path)}/${method}/requestBody/content/application~1json/schema`;
export const responsePointer = (path, method, status, mediaType = "application/json") => `/paths/${pointerEscape(path)}/${method}/responses/${status}/content/${pointerEscape(mediaType)}/schema`;

export function operation(api, method, path, id, label = "operation") {
  const value = api.paths?.[path]?.[method];
  assert(value?.operationId === id, `${label}: expected ${method.toUpperCase()} ${path} operationId=${id}`);
  return value;
}
function rows(api) {
  return Object.entries(api.paths ?? {}).flatMap(([path, item]) => ["get", "post", "put", "patch", "delete"].flatMap((method) => {
    const op = item?.[method]; return op?.operationId ? [{ method, path, operation: op }] : [];
  }));
}
function param(op, name) { return (op.parameters ?? []).find((entry) => entry.name === name && entry.in === "header"); }
function responseHeader(op, status, name) { return op.responses?.[String(status)]?.headers?.[name]; }
function noStore(op, status) {
  const schema = responseHeader(op, status, "Cache-Control")?.schema;
  return schema?.const === "no-store" || schema?.example === "no-store";
}
function isReplayHeader(header, label) {
  assert(header?.required === true, `${label}: Idempotency-Replayed must be required for the HTTP result`);
  assert(header?.schema?.type === "boolean" && !Object.hasOwn(header.schema, "enum"), `${label}: Idempotency-Replayed must be boolean`);
  const examples = header.examples;
  assert(examples?.first_effect?.value === false && typeof examples.first_effect.value === "boolean" && examples?.exact_replay?.value === true && typeof examples.exact_replay.value === "boolean", `${label}: Idempotency-Replayed examples must be boolean false/true`);
}
function mediaExamples(media) {
  if (media?.examples && Object.keys(media.examples).length) return Object.entries(media.examples);
  return media && Object.hasOwn(media, "example") ? [["default", { value: media.example }]] : [];
}
function exampleRows(op, id, method, path, status) {
  const content = status === "request" ? op.requestBody?.content ?? {} : op.responses?.[status]?.content ?? {};
  return Object.entries(content).flatMap(([mediaType, media]) => mediaExamples(media).map(([name, example]) => ({
    operation_id: id, method, path, status, media_type: mediaType, example_name: name,
    schema_pointer: status === "request" ? requestPointer(path, method) : responsePointer(path, method, status, mediaType),
    schema: media.schema, value: example.value, externalValue: example.externalValue,
  })));
}

function sourceOperationBlock(source, operationId) {
  const start = source.indexOf(`operationId: ${operationId}`);
  assert(start >= 0, `${operationId}: operation is missing from source OpenAPI`);
  const candidates = [source.indexOf("\n  /", start), source.indexOf("\ncomponents:", start)].filter((index) => index >= 0);
  return source.slice(start, candidates.length ? Math.min(...candidates) : source.length);
}
function declaresExternalExample(source, row) {
  const block = sourceOperationBlock(source, row.operation_id);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const name = escape(row.example_name), file = escape(row.external_value_path);
  return new RegExp(`(?:^|\\n)\\s*${name}:\\s*(?:\\{[^\\n}]*externalValue:\\s*${file}\\s*\\}|\\r?\\n[ \\t]+externalValue:\\s*${file}\\s*(?:\\r?\\n|$))`).test(block);
}

const expectedProblemCodes = {
  createSessionStepUpChallenge: {
    "400": { default: "identity_invalid_request" },
    "401": { session_invalid: "identity_session_invalid_or_expired" },
    "403": { reauthentication_required: "identity_reauthentication_required", mfa_required: "identity_mfa_required", csrf_invalid: "gateway_csrf_invalid" },
    "409": { key_reused: "identity_idempotency_key_reused", request_in_progress: "identity_idempotency_request_in_progress", state_conflict: "identity_state_or_version_conflict" },
    "429": { rate_limited: "platform_rate_limited" },
    "500": { internal_error: "platform_internal_error" },
    "503": { dependency_unavailable: "platform_dependency_unavailable" },
    "504": { default: "gateway_deadline_exceeded" },
  },
  completeSessionStepUp: {
    "400": { default: "identity_invalid_request" },
    "401": { session_invalid: "identity_session_invalid_or_expired" },
    "403": { reauthentication_required: "identity_reauthentication_required", mfa_required: "identity_mfa_required", csrf_invalid: "gateway_csrf_invalid" },
    "409": { key_reused: "identity_idempotency_key_reused", request_in_progress: "identity_idempotency_request_in_progress", state_conflict: "identity_state_or_version_conflict" },
    "422": { mfa_invalid: "identity_mfa_invalid" },
    "429": { rate_limited: "platform_rate_limited" },
    "500": { internal_error: "platform_internal_error" },
    "503": { dependency_unavailable: "platform_dependency_unavailable" },
    "504": { default: "gateway_deadline_exceeded" },
  },
};

export async function validateContract(publicApi, privateApi, policy, manifest, options = {}) {
  const validateFixtures = options.validateFixtures !== false;
  const loadFixture = options.fixtureLoader ?? parse;
  const [publicSource, privateSource] = await Promise.all([
    readFile(resolve(root, "openapi/identity-onboarding-v2.yaml"), "utf8"),
    readFile(resolve(root, "openapi/identity-gateway-delegation-v2.yaml"), "utf8"),
  ]);
  assert(publicApi.info?.version === "2.1.0" && privateApi.info?.version === "2.1.0", "both candidate contracts must be 2.1.0");
  assert(!JSON.stringify(publicApi).includes("session_credential"), "public contract must not expose session_credential");
  const external = rows(publicApi).filter(({ path, operation: op }) => !path.startsWith("/internal/") && op["x-internal"] !== true);
  assert(external.length === 21 && new Set(external.map(({ operation: op }) => op.operationId)).size === 21, "public candidate must contain exactly 21 unique external operations");
  assert(policy.service_only_operations?.length === 4 && policy.delegated_operations?.length === 17 && policy.excluded_internal_operations?.length === 2, "private policy must remain 4 service-only + 17 delegated + 2 excluded");
  const matrix = [...policy.service_only_operations, ...policy.delegated_operations];
  const publicMatrix = external.map(({ method, path, operation: op }) => ({ method, path, operationId: op.operationId }));
  assert(same(matrix.slice().sort((a, b) => a.operationId.localeCompare(b.operationId)), publicMatrix.slice().sort((a, b) => a.operationId.localeCompare(b.operationId))), "private matrix must match all public operations exactly");
  const challenge = operation(publicApi, "post", "/identity/step-up-challenges", "createSessionStepUpChallenge", "challenge selector");
  const complete = operation(publicApi, "post", "/identity/step-up-confirmations", "completeSessionStepUp", "confirmation selector");
  const replay = operation(privateApi, "post", "/api/v1/internal/identity/session-rotation-replays", "recoverSessionRotationReplay", "private replay selector");
  assert(["createSessionStepUpChallenge", "completeSessionStepUp"].every((id) => policy.delegated_operations.some((row) => row.operationId === id)), "both step-up operations must be delegated privately");
  for (const [op, id, path] of [[challenge, "createSessionStepUpChallenge", "/identity/step-up-challenges"], [complete, "completeSessionStepUp", "/identity/step-up-confirmations"]]) {
    assert(same(op.security, [{ sessionCookie: [], csrfToken: [] }]), `${id}: public security must require current cookie and CSRF in the same alternative`);
    assert(param(op, "Idempotency-Key")?.required === true && /-7/.test(param(op, "Idempotency-Key")?.schema?.pattern ?? ""), `${id}: public operation must require UUIDv7 Idempotency-Key`);
    const target = manifest.operations.find((row) => row.operation_id === id);
    assert(target?.method === "post" && target.path === path, `${id}: operation inventory method/path mismatch`);
    assert(target.request_schema_pointer === requestPointer(path, "post"), `${id}: request schema selector is not exact`);
    assert(target.success_schema_pointer === responsePointer(path, "post", target.success_status), `${id}: success schema selector is not exact`);
    assert(at(publicApi, target.request_schema_pointer) && at(publicApi, target.success_schema_pointer), `${id}: exact request/success schema selector missing`);
    const requestSchema = at(publicApi, target.request_schema_pointer);
    const successSchema = at(publicApi, target.success_schema_pointer);
    assert(requestSchema.type === "object" && requestSchema.additionalProperties === false, `${id}: request schema must remain a strict object`);
    if (id === "createSessionStepUpChallenge") {
      const password = requestSchema.properties?.password;
      assert(target.success_status === "201" && same(requestSchema.required, ["password"]) && password?.type === "string" && password.writeOnly === true && password.minLength === 1 && password.maxLength === 128, `${id}: must require only a writeOnly local password of the published bounds`);
      assert(successSchema.type === "object" && successSchema.additionalProperties === false && same(Object.keys(successSchema.properties ?? {}).sort(), ["challenge_id", "expires_at", "status"]) && same(successSchema.required, ["challenge_id", "status", "expires_at"]), `${id}: 201 response must be a strict object with exactly the challenge result fields`);
      assert(successSchema.properties?.challenge_id?.pattern === "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" && successSchema.properties?.status?.const === "mfa_required" && successSchema.properties?.expires_at?.format === "date-time", `${id}: response challenge id/status/expiry wire constraints must remain exact`);
    } else {
      const code = requestSchema.properties?.code;
      assert(target.success_status === "200" && same(requestSchema.required, ["challenge_id", "code"]) && code?.type === "string" && code.writeOnly === true && code.minLength === 6 && code.maxLength === 128, `${id}: confirmation must bind challenge_id and a writeOnly TOTP/recovery code`);
      assert(requestSchema.properties?.challenge_id?.pattern === "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", `${id}: challenge_id must remain canonical UUIDv7`);
      assert(successSchema.type === "object" && successSchema.additionalProperties === false && same(Object.keys(successSchema.properties ?? {}).sort(), ["expires_at", "reauthenticated_at", "status"]) && same([...(successSchema.required ?? [])].sort(), ["expires_at", "reauthenticated_at", "status"]) && successSchema.properties?.status?.const === "step_up_completed" && successSchema.properties?.reauthenticated_at?.type === "string" && successSchema.properties?.reauthenticated_at?.format === "date-time" && successSchema.properties?.expires_at?.type === "string" && successSchema.properties?.expires_at?.format === "date-time", `${id}: 200 fixed schema must require exactly status and both date-time timestamps in a strict object`);
      assert(typeof complete.description === "string" && /desaf[ií]o `?step_up`?/i.test(complete.description) && /bucket[^.\n]*session_step_up/i.test(complete.description) && !/desaf[ií]o session_step_up/i.test(complete.description), `${id}: description must distinguish challenge purpose step_up from shared rate-limit bucket session_step_up`);
    }
    const statusCodes = Object.keys(op.responses ?? {});
    const requiredStatuses = id === "completeSessionStepUp" ? ["400", "401", "403", "409", "422", "429", "500", "503", "504"] : ["400", "401", "403", "409", "429", "500", "503", "504"];
    for (const status of requiredStatuses) assert(statusCodes.includes(status), `${id}: missing required cataloged response ${status}`);
    assert(same(statusCodes.slice().sort(), [...requiredStatuses, String(target.success_status)].sort()), `${id}: response status inventory must remain exact`);
    for (const status of statusCodes.filter((item) => item !== target.success_status)) {
      if (op.responses[status]?.content?.["application/problem+json"]) assert(noStore(op, status), `${id}: Problem Details ${status} must be no-store`);
    }
  }
  assert(!challenge.responses?.["201"]?.headers?.["Set-Cookie"] && !challenge.responses?.["201"]?.headers?.["X-CSRF-Token"], "challenge creation must not rotate session cookie or CSRF token");
  const challengeResponse = challenge.responses?.["201"];
  const location = challengeResponse?.headers?.Location;
  const challengeExamples = challengeResponse?.content?.["application/json"]?.examples ?? {};
  const challengeId = challengeExamples.first_effect?.value?.challenge_id;
  assert(location?.schema?.type === "string" && location.schema.format === "uri-reference" && location.schema.pattern === "^/api/v1/identity/step-up-challenges/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", "challenge 201 Location must retain its exact UUIDv7 route pattern");
  assert(challengeId && location.example === `/api/v1/identity/step-up-challenges/${challengeId}` && challengeExamples.exact_replay?.value?.challenge_id === challengeId, "challenge Location example must match both published challenge response IDs");
  assert(same(challengeExamples.first_effect?.value, challengeExamples.exact_replay?.value), "challenge first response and replay must retain the same published body");
  assert(noStore(challenge, "201"), "challenge 201 must be no-store");
  isReplayHeader(responseHeader(challenge, "201", "Idempotency-Replayed"), "challenge");
  assert(complete.responses?.["200"]?.headers?.["Set-Cookie"] && complete.responses?.["200"]?.headers?.["X-CSRF-Token"] && noStore(complete, "200"), "confirmation 200 must rotate cookie/CSRF and be no-store");
  assert(complete.responses["200"].headers["Set-Cookie"].required === true && complete.responses["200"].headers["X-CSRF-Token"].required === true, "confirmation 200 must require both rotation headers in HTTP serialization");
  isReplayHeader(responseHeader(complete, "200", "Idempotency-Replayed"), "confirmation");
  assert(replay.security?.length === 1 && same(Object.keys(replay.security[0]).sort(), ["gatewayServiceBearer", "previousSessionCookie"].sort()), "private result recovery must require service JWT and previous session cookie");
  assert(param(replay, "Idempotency-Key")?.required === true, "private replay must require original Idempotency-Key");
  assert(replay.parameters?.some((entry) => entry.name === "X-OC-Client-Signal"), "private replay must retain the signal parameter");
  assert(noStore(replay, "200") && replay.responses?.["200"]?.headers?.Pragma?.schema?.const === "no-cache", "private replay response must remain no-store/no-cache");
  const requestSchema = at(privateApi, manifest.operations.find((row) => row.operation_id === "recoverSessionRotationReplay").request_schema_pointer);
  const responseSchema = at(privateApi, manifest.operations.find((row) => row.operation_id === "recoverSessionRotationReplay").success_schema_pointer);
  assert(requestSchema?.oneOf?.length === 5 && responseSchema?.oneOf?.length === 5, "private replay must have exactly five strict operation branches");
  const replayOperationIds = ["proveRegisteredDevicePossession", "confirmOwnerDeviceSelfApproval", "createInitialOrganization", "selectActiveOrganization", "completeSessionStepUp"];
  const strictBranch = (branch, label, keys) => {
    assert(branch?.type === "object" && branch.additionalProperties === false && same([...(branch.required ?? [])].sort(), keys.slice().sort()), `${label}: replay branch must be a strict object with every required field`);
    assert(same(Object.keys(branch.properties ?? {}).sort(), keys.slice().sort()), `${label}: replay branch must not drop or add fields`);
  };
  for (const id of replayOperationIds) {
    const requestBranch = requestSchema.oneOf.find((branch) => branch.properties?.operation_id?.const === id);
    const responseBranch = responseSchema.oneOf.find((branch) => branch.properties?.operation_id?.const === id);
    assert(requestBranch && responseBranch, `private replay branch missing operation ${id}`);
    strictBranch(requestBranch, `${id} request`, ["operation_id", "original_request"]);
    strictBranch(responseBranch, `${id} response`, ["operation_id", "public_status", "public_body", "session_credential", "replayed"]);
    const publicRow = rows(publicApi).find(({ operation: op }) => op.operationId === id);
    assert(publicRow, `${id}: public selector missing for replay branch`);
    const publicOperation = publicRow.operation;
    const requestBodySchema = publicOperation.requestBody?.content?.["application/json"]?.schema;
    assert(requestBranch.properties?.operation_id?.const === id && same(requestBranch.properties?.original_request, requestBodySchema), `${id}: replay original_request must be identical to its public request schema`);
    const publicSuccess = Object.entries(publicOperation.responses ?? {}).find(([, response]) => response.content?.["application/json"]?.schema && !response.content?.["application/problem+json"]);
    assert(publicSuccess, `${id}: public success response selector missing`);
    const [publicStatus, publicResponse] = publicSuccess;
    assert(responseBranch.properties?.operation_id?.const === id && responseBranch.properties?.public_status?.const === Number(publicStatus) && same(responseBranch.properties?.public_body, publicResponse.content["application/json"].schema) && responseBranch.properties?.replayed?.const === true, `${id}: replay result must match the exact public operation/status/body and replay marker`);
    if (id === "completeSessionStepUp") assert(responseBranch.properties.public_body.type === "object" && responseBranch.properties.public_body.additionalProperties === false && same(Object.keys(responseBranch.properties.public_body.properties ?? {}).sort(), ["expires_at", "reauthenticated_at", "status"]) && same([...(responseBranch.properties.public_body.required ?? [])].sort(), ["expires_at", "reauthenticated_at", "status"]) && responseBranch.properties.public_body.properties.status?.const === "step_up_completed" && responseBranch.properties.public_body.properties.reauthenticated_at?.type === "string" && responseBranch.properties.public_body.properties.reauthenticated_at?.format === "date-time" && responseBranch.properties.public_body.properties.expires_at?.type === "string" && responseBranch.properties.public_body.properties.expires_at?.format === "date-time", "completeSessionStepUp: replay public_body must retain the fixed strict success schema with both required date-time timestamps");
    const priorCredential = responseBranch.properties?.session_credential;
    assert(priorCredential?.type === "string" && priorCredential.minLength === 43 && priorCredential.maxLength === 43 && priorCredential.pattern === "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$" && priorCredential["x-sensitive"] === true, `${id}: replay credential must remain canonical, fixed length, and sensitive`);
    assert(!JSON.stringify(publicResponse.content["application/json"].schema).includes("session_credential"), `${id}: session credential must not appear in the public response schema`);
  }
  const requestBranch = requestSchema.oneOf.find((branch) => branch.properties?.operation_id?.const === "completeSessionStepUp");
  const responseBranch = responseSchema.oneOf.find((branch) => branch.properties?.operation_id?.const === "completeSessionStepUp");
  const stepUpRequestSchema = at(publicApi, manifest.operations.find((row) => row.operation_id === "completeSessionStepUp").request_schema_pointer);
  const stepUpSuccessSchema = at(publicApi, manifest.operations.find((row) => row.operation_id === "completeSessionStepUp").success_schema_pointer);
  assert(requestBranch.properties?.operation_id?.const === "completeSessionStepUp" && same(requestBranch.properties?.original_request, stepUpRequestSchema), "fifth replay request must bind exactly to operation completeSessionStepUp and its public request schema");
  const credential = responseBranch.properties?.session_credential;
  assert(responseBranch.properties?.operation_id?.const === "completeSessionStepUp" && responseBranch.properties?.public_status?.const === 200 && same(responseBranch.properties?.public_body, stepUpSuccessSchema) && responseBranch.properties?.replayed?.const === true, "fifth replay response must preserve operation_id, public status/body and replay marker");
  assert(credential?.type === "string" && credential.minLength === 43 && credential.maxLength === 43 && credential.pattern === "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$" && credential["x-sensitive"] === true, "fifth replay credential must remain canonical sensitive 32-byte base64url");
  const actual = [
    ...exampleRows(challenge, "createSessionStepUpChallenge", "post", "/identity/step-up-challenges", "request"),
    ...exampleRows(challenge, "createSessionStepUpChallenge", "post", "/identity/step-up-challenges", "201"),
    ...exampleRows(complete, "completeSessionStepUp", "post", "/identity/step-up-confirmations", "request"),
    ...exampleRows(complete, "completeSessionStepUp", "post", "/identity/step-up-confirmations", "200"),
    ...Object.keys(challenge.responses ?? {}).filter((status) => challenge.responses[status]?.content?.["application/problem+json"]).flatMap((status) => exampleRows(challenge, "createSessionStepUpChallenge", "post", "/identity/step-up-challenges", status).filter((row) => row.media_type === "application/problem+json")),
    ...Object.keys(complete.responses ?? {}).filter((status) => complete.responses[status]?.content?.["application/problem+json"]).flatMap((status) => exampleRows(complete, "completeSessionStepUp", "post", "/identity/step-up-confirmations", status).filter((row) => row.media_type === "application/problem+json")),
    ...exampleRows(replay, "recoverSessionRotationReplay", "post", "/api/v1/internal/identity/session-rotation-replays", "request").filter((row) => row.example_name === "session_step_up"),
    ...exampleRows(replay, "recoverSessionRotationReplay", "post", "/api/v1/internal/identity/session-rotation-replays", "200").filter((row) => row.example_name === "session_step_up"),
  ];
  const mapKey = (row) => [row.operation_id, row.method, row.path, row.status, row.media_type, row.example_name].join("|");
  const seenExamples = new Set();
  for (const row of manifest.published_examples) {
    const key = mapKey(row);
    assert(!seenExamples.has(key), `published example inventory duplicated: ${key}`); seenExamples.add(key);
    assert(row.schema_pointer === (row.status === "request" ? requestPointer(row.path, row.method) : responsePointer(row.path, row.method, row.status, row.media_type)), `${row.operation_id}: published example schema selector mismatch`);
    const found = actual.find((item) => mapKey(item) === key);
    assert(found, `published example missing from contract: ${key}`);
    assert(found.schema && same(row.schema_pointer, row.status === "request" ? requestPointer(row.path, row.method) : responsePointer(row.path, row.method, row.status, row.media_type)), `${row.operation_id}: published example exact schema selector missing: ${key}`);
    const fixturePath = resolve(fixtureRoot, row.fixture);
    assert(fixturePath.startsWith(fixtureRoot + sep), `fixture path escapes step-up folder: ${row.fixture}`);
    const fixture = validateFixtures ? await loadFixture(fixturePath) : null;
    if (validateFixtures) {
      let published = found.value;
      if (row.example_source === "external") {
        const source = row.operation_id === "recoverSessionRotationReplay" ? privateSource : publicSource;
        assert(typeof row.external_value_path === "string" && declaresExternalExample(source, row), `${row.operation_id}: manifest external example is not declared by the selected source operation: ${key}`);
        const externalPath = resolve(root, "openapi", row.external_value_path);
        assert(externalPath.startsWith(resolve(root, "openapi") + sep), `${row.operation_id}: external example path escapes OpenAPI directory`);
        const external = await parse(externalPath);
        assert(same(external, fixture), `${row.operation_id}: external example differs from its static fixture ${row.fixture}`);
        if (published === undefined && typeof found.externalValue === "string") published = await parse(resolve(root, "openapi", found.externalValue));
      } else {
        assert(!Object.hasOwn(row, "external_value_path"), `${row.operation_id}: inline example must not inventory an externalValue path`);
      }
      assert(published !== undefined && same(published, fixture), `${row.operation_id}: published example differs from static fixture ${row.fixture}`);
      if (row.media_type === "application/problem+json") {
        const catalog = await parse(resolve(root, "errors/error-catalog-v5.json"));
        const item = catalog.errors.find((entry) => entry.code === fixture.code);
        assert(item && item.statuses.includes(fixture.status) && fixture.retryable === item.retryable_by_default, `${row.operation_id}: Problem Details code/status/retryable differs from error catalog v5: ${row.fixture}`);
      }
    }
  }
  assert(actual.length === manifest.published_examples.length, "published step-up examples and manifest inventory differ bidirectionally");
  const fixtureFiles = validateFixtures ? (await readdir(fixtureRoot)).filter((name) => name.endsWith(".json")).sort() : [];
  const indexedFiles = [...new Set([...manifest.published_examples.map((row) => row.fixture), ...manifest.cases.map((row) => row.fixture)])].sort();
  assert(!validateFixtures || same(fixtureFiles, indexedFiles), "step-up fixture directory has missing, duplicate, or unindexed JSON artifacts");
  const caseIds = new Set();
  for (const id of Object.keys(expectedProblemCodes)) {
    const rowsForOperation = actual.filter((row) => row.operation_id === id && row.media_type === "application/problem+json");
    const expectedRows = expectedProblemCodes[id];
    const expectedKeys = Object.entries(expectedRows).flatMap(([status, examples]) => Object.entries(examples).map(([name, code]) => `${status}|${name}|${code}`)).sort();
    const manifestProblemRows = manifest.published_examples.filter((row) => row.operation_id === id && row.media_type === "application/problem+json");
    const foundKeys = await Promise.all(manifestProblemRows.map(async (row) => {
      const problem = await loadFixture(resolve(fixtureRoot, row.fixture));
      return `${row.status}|${row.example_name}|${problem.code}`;
    }));
    foundKeys.sort();
    assert(same(foundKeys, expectedKeys), `${id}: Problem Details examples must exhaustively match the approved error/status inventory`);
    for (const row of rowsForOperation) {
      const responseHeaders = (id === "createSessionStepUpChallenge" ? challenge : complete).responses[row.status]?.headers ?? {};
      assert(!responseHeaders["Set-Cookie"] && !responseHeaders["X-CSRF-Token"], `${id} ${row.status}: error response must not publish success rotation headers`);
      if (row.status === "429") assert(responseHeaders["Retry-After"]?.required === true && responseHeaders["Retry-After"]?.schema?.type === "integer" && responseHeaders["Retry-After"].schema.minimum === 1 && responseHeaders["Retry-After"].schema.example === 60, `${id}: rate limit must include an exact integer Retry-After header example`);
    }
  }
  for (const item of manifest.cases) {
    assert(!caseIds.has(item.id), `duplicate fixture case ${item.id}`); caseIds.add(item.id);
    const selectedOperation = manifest.operations.find((row) => row.operation_id === item.operation_id);
    assert(selectedOperation && selectedOperation.method === item.method && selectedOperation.path === item.path, `${item.id}: operationId/method/path selector must match the manifest operation`);
    assert(item.media_type === "application/json", `${item.id}: fixture selector media type must be application/json`);
    const isProblemExample = item.media_type === "application/problem+json" && selectedOperation.operation_id !== "recoverSessionRotationReplay";
    assert(item.status === "request" || String(selectedOperation.success_status) === String(item.status) || (isProblemExample && actual.some((row) => row.operation_id === item.operation_id && row.status === item.status && row.media_type === item.media_type)), `${item.id}: exact success status or published Problem Details response selector required`);
    const selector = item.status === "request" ? requestPointer(item.path, item.method) : responsePointer(item.path, item.method, item.status, item.media_type);
    assert(item.schema_pointer === selector, `${item.id}: schema must be extracted from the exact method/path/status/media selector`);
    const schema = at(item.operation_id === "recoverSessionRotationReplay" ? privateApi : publicApi, selector);
    assert(schema && typeof schema === "object" && !schema.$ref, `${item.id}: exact schema selector is missing or not dereferenced`);
    if (validateFixtures) await loadFixture(resolve(fixtureRoot, item.fixture));
  }
  for (const scenario of manifest.semantic_scenarios) {
    if (scenario.expected === "accept") validateSemantics(scenario);
    else {
      assert(scenario.expected === "reject" && typeof scenario.invariant === "string", `${scenario.id}: semantic scenario must declare accept or reject and its invariant`);
      let rejected = false;
      try { validateSemantics(scenario); } catch (error) { rejected = error.message.startsWith(`${scenario.invariant}:`); }
      assert(rejected, `${scenario.id}: expected semantic invariant ${scenario.invariant} to reject scenario`);
    }
  }
  const transitionResults = [];
  for (const scenario of manifest.transition_scenarios ?? []) {
    const template = manifest.transition_templates?.[scenario.template_id];
    assert(template, `${scenario.id}: transition template missing`);
    const materialized = deepMerge(template, scenario.overrides ?? {});
    try {
      validateSemantics(materialized);
      assert(scenario.expected === "accept", `${scenario.id}: transition scenario unexpectedly accepted`);
      transitionResults.push(`${scenario.id}=accepted`);
    } catch (error) {
      if (scenario.expected !== "reject" || typeof scenario.invariant !== "string" || !error.message.startsWith(`${scenario.invariant}:`)) throw new Error(`${scenario.id}: ${error.message}`, { cause: error });
      transitionResults.push(`${scenario.id}=rejected(${scenario.invariant})`);
    }
  }
  return { actualExamples: actual.length, problemExamples: actual.filter((row) => row.media_type === "application/problem+json").length, cases: manifest.cases.length, semantics: manifest.semantic_scenarios.length + (manifest.transition_scenarios?.length ?? 0), transitionResults };
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) result[key] = value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key]) ? deepMerge(result[key], value) : structuredClone(value);
  return result;
}

export function validateSemantics(item) {
  if (item.transition) return validateTransition(item);
  const { account, session, password, factor, challenge, effect } = item;
  assert(account?.active === true, "account.active: account must be active");
  assert(account?.email_verified === true, "account.email_verified: email must be verified");
  assert(["restricted", "active"].includes(session?.status), "session.status: session must be restricted or active");
  assert(session?.login_mfa_pending === false, "session.login_mfa_pending: login MFA challenge must not be pending");
  assert(typeof session.id === "string" && session.id.length > 0 && ["account-a", "account-b"].includes(session.account_id), "session.account_binding: session/account binding is required");
  assert(password?.verified === true && password.method === "local" && Number.isFinite(Date.parse(password.at)), "password.method: verified local password is required");
  assert(["totp", "recovery"].includes(factor?.method) && factor.eligible === true && factor.used === false, "factor.method: eligible unused TOTP or one-use recovery code is required");
  assert(challenge?.account_id === session.account_id && challenge.session_id === session.id, "challenge.account_session_binding: challenge must match authenticated account and session");
  assert(challenge.purpose === "step_up", "challenge.purpose: step-up challenge purpose must be step_up, independent of rate limiting");
  assert(item.rate_limit_purpose === "session_step_up", "rate_limit.purpose: independent shared rate-limit bucket must be session_step_up");
  const created = Date.parse(challenge.created_at), expires = Date.parse(challenge.expires_at);
  assert(Number.isFinite(created) && Number.isFinite(expires) && expires > created && expires - created <= 300_000, "challenge.duration: challenge lifetime must be at most five minutes");
  assert(Number.isInteger(challenge.attempts) && challenge.attempts >= 0 && challenge.attempts < 5, "challenge.attempts: challenge must remain within five attempts");
  assert(effect?.session_id === session.id, "effect.session_binding: step-up must remain in the same session");
  const passwordAt = Date.parse(password.at), reauthenticatedAt = Date.parse(effect.reauthenticated_at);
  const sessionExpiry = Date.parse(session.expires_at);
  assert(Number.isFinite(reauthenticatedAt) && reauthenticatedAt >= Math.max(passwordAt, created), "challenge.confirmation_not_before_creation: confirmation cannot precede challenge creation or password verification");
  assert(reauthenticatedAt < expires, "challenge.not_expired: confirmation must occur before challenge expiration");
  assert(reauthenticatedAt <= passwordAt + 900_000, "effect.reauthenticated_at: confirmation must be within the password verification window");
  const expectedExpiry = Math.min(sessionExpiry, passwordAt + 900_000);
  assert(Date.parse(effect.expires_at) === expectedExpiry, "effect.expires_at: step-up expiry must be min(session expiry, password time + 900 seconds)");
  assert(effect.active_tenant === session.active_tenant && same(effect.permissions, session.permissions) && same(effect.scopes, session.scopes), "effect.authority_preserved: step-up must not grant tenant, permissions, or scopes");
  return true;
}

function validateTransition(item) {
  const { account, session, password, challenge, factor, effect, replay, authority } = item;
  const at = Date.parse(item.at);
  assert(account?.active === true, "account.active: account must be active");
  assert(account?.email_verified === true, "account.email_verified: email must be verified");
  assert(account?.mfa_enrolled === true && account?.local_password === true, "account.step_up_eligible: local password and enrolled MFA are required");
  assert(typeof session?.id === "string" && session.id.length > 0 && session.account_id === account.id, "session.account_binding: session must belong to the tested account");
  assert(["restricted", "active"].includes(session.status) && session.login_mfa_pending === false && session.revoked === false, "session.current: session must be live, restricted or active, and past login MFA");
  assert(Number.isFinite(at) && Date.parse(session.expires_at) > at, "session.current: session must not be expired at the transition time");
  assert(password?.verified === true && password.method === "local" && Number.isFinite(Date.parse(password.at)) && password.at <= item.at, "password.evidence: a verified local password must precede the transition");
  const replayTransition = ["confirmation_replay", "private_recovery"].includes(item.transition);
  assert(replayTransition ? password.credential_hash === challenge.credential_hash : password.credential_hash === session.credential_hash, "password.credential_current: password evidence must match the credential bound to this session transition");
  assert(item.rate_limit_purpose === "session_step_up", "rate_limit.purpose: rate limiting uses the independent session_step_up bucket");
  assert(challenge?.account_id === account.id && challenge.session_id === session.id, "challenge.account_session_binding: challenge must be bound to the same account and session");
  assert(replayTransition ? challenge.credential_hash === replay.confirmed_challenge_credential_hash : challenge.credential_hash === session.credential_hash, "challenge.credential_binding: challenge must match the credential hash bound to the effect");
  assert(challenge.security_version === session.security_version, "challenge.security_version: challenge must match the current account security version");
  assert(challenge.password_verified_at === password.at, "challenge.password_evidence: challenge must retain the verified password evidence");
  assert(challenge.purpose === "step_up", "challenge.purpose: challenge purpose must be step_up, independent of session_step_up rate limiting");
  const created = Date.parse(challenge.created_at), expires = Date.parse(challenge.expires_at);
  assert(Number.isFinite(created) && Number.isFinite(expires) && expires > created && expires - created <= 300_000, "challenge.duration: challenge lifetime must be at most 300 seconds");
  assert(Number.isInteger(challenge.max_attempts) && challenge.max_attempts === 5 && Number.isInteger(challenge.attempts) && challenge.attempts >= 0 && challenge.attempts < 5, "challenge.attempts: challenge must retain five maximum attempts and remain below the limit");

  if (item.transition === "challenge_create" || item.transition === "challenge_replay") {
    assert(challenge.status === "pending" && !challenge.substituted, "challenge.pending: challenge creation/replay must refer to a pending, non-substituted challenge");
    assert(at >= created && at < expires, "challenge.replay_pending: challenge create/replay is valid only while the bound challenge is pending and unexpired");
    if (item.transition === "challenge_create") assert(created >= Date.parse(password.at), "challenge.created_after_password: challenge must follow password verification");
    assert(effect.session_id === session.id && effect.active_tenant === session.active_tenant && same(effect.permissions, session.permissions) && same(effect.scopes, session.scopes), "effect.authority_preserved: first factor cannot alter tenant, permissions, or scopes");
    assert(effect.credential_rotated === false && effect.step_up_installed === false && effect.session_created === false && effect.session_expiry_extended === false, "effect.first_factor_only: first factor cannot install step-up, rotate or extend a session");
    assert(typeof effect.prior_step_up_valid_before === "boolean" && typeof effect.prior_step_up_valid_after === "boolean" && effect.prior_step_up_valid_after === effect.prior_step_up_valid_before && Object.hasOwn(effect, "prior_step_up_expires_at_before") && Object.hasOwn(effect, "prior_step_up_expires_at_after"), "effect.prior_step_up_preserved: challenge metadata must explicitly describe whether prior step-up evidence exists");
    if (effect.prior_step_up_valid_before) assert(typeof effect.prior_step_up_expires_at_before === "string" && effect.prior_step_up_expires_at_before === effect.prior_step_up_expires_at_after && Date.parse(effect.prior_step_up_expires_at_before) > at && Date.parse(effect.prior_step_up_expires_at_before) <= Date.parse(session.expires_at), "effect.prior_step_up_preserved: a current prior step-up must retain its original unextended expiry");
    else assert(effect.prior_step_up_expires_at_before === null && effect.prior_step_up_expires_at_after === null, "effect.prior_step_up_preserved: absent prior step-up evidence must stay absent");
    if (item.transition === "challenge_replay") {
      assert(effect.challenge_id === challenge.id && effect.replayed === true && effect.expires_at === challenge.expires_at && effect.regenerated === false, "challenge.replay_exact: replay must return the same pending challenge and original expiry without regeneration");
    } else {
      assert(Object.hasOwn(item, "previous_pending_challenge") && typeof effect.previous_pending_challenge_substituted === "boolean", "challenge.previous_pending_substituted: prior challenge presence and substitution result must be explicit");
      const previous = item.previous_pending_challenge;
      if (previous === null) assert(effect.previous_pending_challenge_substituted === false, "challenge.previous_pending_substituted: no prior challenge exists to substitute");
      else assert(previous && previous.status === "pending" && previous.id !== challenge.id && previous.account_id === account.id && previous.session_id === session.id && effect.previous_pending_challenge_substituted === true, "challenge.previous_pending_substituted: only a pending challenge for the same account/session may be substituted");
    }
    return validateCurrentAuthority(item);
  }

  if (item.transition === "confirmation") {
    assert(challenge.status === "pending" && !challenge.substituted, "challenge.pending: confirmation requires a pending, non-substituted challenge");
    assert(created <= at, "challenge.confirmation_not_before_creation: confirmation cannot precede challenge creation");
    assert(at < expires, "challenge.not_expired: confirmation cannot use an expired challenge");
    assert(factor?.eligible === true && factor.used === false && ["totp", "recovery"].includes(factor.method), "factor.available: confirmation requires unused eligible TOTP or one-use recovery");
    assert(factor.account_id === account.id && factor.session_id === session.id, "factor.account_session_binding: factor evidence must belong to the same account and session");
    const expectedExpiry = Math.min(Date.parse(session.expires_at), Date.parse(password.at) + 900_000);
    assert(effect.session_id === session.id && effect.challenge_consumed === true && effect.factor_consumed === true && effect.credential_rotated === true && effect.session_created === false && effect.session_expiry_extended === false, "effect.atomic_same_session: confirmation consumes factor/challenge and rotates only the same session without extending it");
    assert(effect.reauthenticated_at === item.at && Date.parse(effect.reauthenticated_at) >= Math.max(created, Date.parse(password.at)), "effect.confirmation_time: confirmation must follow challenge creation and password verification");
    assert(Date.parse(effect.expires_at) === expectedExpiry && effect.session_expires_at === session.expires_at, "effect.expires_at: step-up expires at min(session expiry, password verification + 900 seconds), without session extension");
    assert(effect.active_tenant === session.active_tenant && same(effect.permissions, session.permissions) && same(effect.scopes, session.scopes), "effect.authority_preserved: step-up cannot activate tenant or grant permissions/scopes");
    return validateCurrentAuthority(item);
  }

  assert(["confirmation_replay", "private_recovery"].includes(item.transition), "transition.kind: unknown session step-up transition");
  assert(effect.confirmed === true && replay?.result_confirmed === true, "replay.result_confirmed: replay requires an already confirmed original result");
  assert(replay.operation_id === "completeSessionStepUp" && replay.stored_operation_id === replay.operation_id && replay.idempotency_key === replay.stored_idempotency_key && replay.canonical_request_matches === true, "replay.request_exact: replay must match operation, original key, and canonical request");
  assert(replay.fingerprint_algorithm === "HMAC-SHA-256" && typeof replay.fingerprint_key_id === "string" && replay.fingerprint_key_id.length > 0 && replay.persisted_key_available === true, "replay.hmac_version: persisted fingerprint algorithm and key_id must be available");
  const originalConfirmationAt = Date.parse(effect.reauthenticated_at);
  const originalPasswordAt = Date.parse(password.at);
  const originalSessionExpiry = Date.parse(session.expires_at);
  const originalChallengeCreated = Date.parse(challenge.created_at);
  const originalChallengeExpiry = Date.parse(challenge.expires_at);
  assert(Number.isFinite(originalConfirmationAt) && Number.isFinite(originalPasswordAt) && Number.isFinite(originalSessionExpiry) && Number.isFinite(originalChallengeCreated) && Number.isFinite(originalChallengeExpiry), "replay.original_effect_binding: original confirmation timing must include session, password, challenge, and persisted effect timestamps");
  assert(originalConfirmationAt <= at, "replay.original_confirmation_not_future: original confirmation cannot occur after recovery");
  assert(originalConfirmationAt >= Math.max(originalChallengeCreated, originalPasswordAt), "replay.original_confirmation_not_before: original confirmation must follow challenge creation and password verification");
  assert(originalConfirmationAt < originalChallengeExpiry, "replay.original_confirmation_before_challenge_expiry: original confirmation must occur before the original challenge expires");
  const originalExpectedExpiry = Math.min(originalSessionExpiry, originalPasswordAt + 900_000);
  assert(Date.parse(effect.expires_at) === originalExpectedExpiry && Date.parse(replay.original_effect_expires_at) === originalExpectedExpiry, "replay.original_effect_expiry: original step-up result must retain min(original session expiry, original password verification + 900 seconds)");
  assert(session.revoked === false && Date.parse(session.expires_at) > at && replay.credential_current === true && replay.result_credential_hash === session.credential_hash, "replay.session_current: session and resulting credential must remain current");
  assert(Date.parse(effect.expires_at) > at && replay.step_up_current === true && replay.step_up_current_before === true && replay.step_up_current_after === true, "replay.step_up_current: step-up evidence must remain unexpired before and after recovery");
  assert(replay.session_current_before === true && replay.session_current_after === true, "replay.session_current: session must remain current before and after decrypt");
  assert(replay.authority_current_before === true && replay.authority_current_after === true, "authority.current: authority must remain current before and after decrypt");
  if (item.transition === "private_recovery") {
    assert(replay.service_jwt_valid === true && replay.service_jwt_audience === "identity-tenancy.gateway", "replay.service_identity: private replay requires the authenticated gateway service JWT");
    assert(replay.previous_cookie_session_id === session.id && replay.previous_cookie_bound === true, "replay.previous_cookie_binding: previous cookie must be bound to the same session");
  }
  assert(effect.session_id === session.id && effect.challenge_consumed === true && effect.factor_consumed === true && effect.credential_rotated === true, "replay.no_second_effect: replay preserves the confirmed result without consuming, rotating, or extending again");
  assert(replay.factor_reconsumed === false && replay.credential_rotated_again === false && replay.evidence_renewed === false && replay.session_expiry_extended === false, "replay.no_second_effect: replay must not consume the factor, rotate again, renew evidence, or extend session expiry");
  return validateCurrentAuthority(item);
}

function validateCurrentAuthority({ session, authority, effect }) {
  assert(effect.active_tenant === session.active_tenant && same(effect.permissions, session.permissions) && same(effect.scopes, session.scopes), "effect.authority_preserved: step-up cannot add tenant authority");
  if (session.status === "restricted") {
    assert(session.active_tenant === null && same(session.permissions, []) && same(session.scopes, []), "authority.restricted: restricted session must remain tenantless with empty permissions/scopes");
    return true;
  }
  assert(authority?.organization_status === "active" && authority.membership_status === "active" && authority.membership_version === authority.expected_membership_version && authority.role_current === true && authority.capabilities_current === true && authority.approval_status === "approved" && authority.approval_unexpired === true && authority.device_status === "approved", "authority.current: active-session organization, membership, roles/capabilities, approval and device must remain current");
  return true;
}
