import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundlePath, ...args] = process.argv.slice(2);
if (!bundlePath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/validate-gateway-deadline-exceeded-v5.mjs <identity-onboarding-v2-dereferenced.json> [--self-test]");
}
const selfTest = args.includes("--self-test");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const [api, problemV1, problemV2, catalogV4, catalogV5, fixture] = await Promise.all([
  readJson(bundlePath), readJson("openapi/problem-details-v1.schema.json"),
  readJson("openapi/problem-details-v2.schema.json"), readJson("errors/error-catalog-v4.json"),
  readJson("errors/error-catalog-v5.json"), readJson("openapi/examples/gateway-deadline-exceeded-v5.json"),
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const clone = (value) => structuredClone(value);
const publicIds = [
  "registerGlobalAccount", "verifyEmail", "createSession", "getCurrentSession", "logoutCurrentSession",
  "revokeOtherSessions", "beginTotpEnrollment", "confirmTotpEnrollment", "completeMfaChallenge",
  "createDeviceRegistrationChallenge", "createRegisteredDeviceAuthenticationChallenge", "proveRegisteredDevicePossession",
  "registerWebDevice", "requestOwnerDeviceSelfApproval", "confirmOwnerDeviceSelfApproval", "createInitialOrganization",
  "listMyMemberships", "selectActiveOrganization", "getActiveTenantContext",
];
const excluded = [
  ["/internal/identity/email-verification-delivery-material/{deliveryMaterialId}", "getEmailVerificationDeliveryMaterial"],
  ["/internal/identity/device-approval-delivery-material/{deliveryMaterialId}", "getOwnerDeviceApprovalDeliveryMaterial"],
];
function validateProblemSchema(previous, next) {
  const comparable = clone(next);
  comparable.$id = previous.$id;
  comparable.title = previous.title;
  comparable.properties.status.enum = [...comparable.properties.status.enum].filter((status) => status !== 504);
  assert(same(comparable, previous), "Problem v2 must preserve v1 structure and constraints, adding only status 504 and v2 identity");
  assert(next.$id.endsWith("problem-details-v2.schema.json") && next.title.endsWith("v2"), "Problem v2 identity is incorrect");
  assert(same(next.properties.status.enum, [...previous.properties.status.enum, 504]), "Problem v2 status must add only 504");
}
function validateCatalog(previous, next) {
  assert(previous.version === 4 && previous.errors.length === 23, "v4 baseline must retain exactly 23 errors");
  assert(next.version === 5 && next.errors.length === 24, "v5 must contain 23 v4 errors and one addition");
  assert(same(next.errors.slice(0, 23), previous.errors), "v5 must preserve all v4 entries exactly and in order");
  assert(new Set(next.errors.map((item) => item.code)).size === next.errors.length, "v5 error codes must be unique");
  const addition = next.errors[23];
  assert(addition?.code === "gateway_deadline_exceeded" && addition.owner === "gateway-bff" && addition.domain === "gateway" &&
    addition.statuses?.length === 1 && addition.statuses[0] === 504 && addition.retryable_by_default === true &&
    addition.exposure === "public" && same(addition.allowed_parameters, []) && addition.deprecated === false &&
    typeof addition.description === "string" && addition.description.length > 0,
  "v5 addition metadata must match the approved public gateway 504 error");
  const dependency = next.errors.find((item) => item.code === "platform_dependency_unavailable");
  assert(dependency && same(dependency.statuses, [503]), "platform_dependency_unavailable must remain exclusively 503");
}
function operationRows(document) {
  const rows = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = item?.[method];
      if (operation?.operationId) rows.push({ path, method, operation });
    }
  }
  return rows;
}
function validProblem(example, schema) {
  const props = schema.properties ?? {};
  return schema.type === "object" && schema.additionalProperties === false &&
    schema.required.every((key) => Object.hasOwn(example, key)) &&
    Object.keys(example).every((key) => Object.hasOwn(props, key)) &&
    example.status === 504 && props.status.enum.includes(example.status) &&
    example.code === "gateway_deadline_exceeded" && example.type === `urn:opencomerix:problem:${example.code}` &&
    example.retryable === true && typeof example.title === "string" && typeof example.detail === "string" &&
    typeof example.instance === "string" && typeof example.trace_id === "string";
}
function validateBundle(document) {
  assert(document.info?.version === "2.0.7", "public OpenAPI must be version 2.0.7");
  const problem = document.components?.schemas?.Problem;
  assert(problem && same(problem, problemV2), "public Problem component must dereference to the new Problem v2 schema");
  const rows = operationRows(document);
  const external = rows.filter(({ path, operation }) => !path.startsWith("/internal/") && operation["x-internal"] !== true);
  assert(external.length === 19 && same(external.map(({ operation }) => operation.operationId).sort(), [...publicIds].sort()), "the public Owner surface must remain exactly the 19 published operations");
  for (const [path, id] of excluded) {
    const row = rows.find((item) => item.path === path && item.operation.operationId === id);
    assert(row && !row.operation.responses?.["504"], `${id} notification material route must remain excluded from public 504 responses`);
  }
  for (const { operation } of external) {
    const media = operation.responses?.["504"]?.content?.["application/problem+json"];
    assert(media?.schema && same(media.schema, problem), `${operation.operationId}: 504 must use the referenced common Problem schema`);
    assert(validProblem(media.example, problem), `${operation.operationId}: 504 example must match gateway_deadline_exceeded/504/retryable`);
    assert(same(media.example, fixture), `${operation.operationId}: 504 example must match the positive fixture exactly`);
    const details = `${media.example.detail} ${media.description ?? ""}`.toLowerCase();
    assert(!/(identity-tenancy|https?:\/\/|credential|secret|token|dependency|dependencia)/.test(details), `${operation.operationId}: 504 example must not reveal dependency or sensitive details`);
  }
  const unavailable = document.components?.responses?.Unavailable?.content?.["application/problem+json"]?.example;
  assert(unavailable?.code === "platform_dependency_unavailable" && unavailable.status === 503 && unavailable.retryable === true,
    "platform_dependency_unavailable example must remain 503/retryable");
  assert(!rows.some(({ path }) => path.startsWith("/internal/") && excluded.some(([internalPath]) => path === internalPath) && rows.find((r) => r.path === path).operation.responses?.["504"]),
    "notification material routes must not gain a gateway deadline response");
}
validateProblemSchema(problemV1, problemV2);
validateCatalog(catalogV4, catalogV5);
validateBundle(api);

let negatives = 0;
function reject(label, fn) {
  try { fn(); } catch { negatives += 1; return; }
  throw new Error(`R7 negative control did not reject ${label}`);
}
if (selfTest) {
  const omitted = clone(api); delete omitted.paths["/identity/sessions"].post.responses["504"];
  reject("operation missing 504", () => validateBundle(omitted));
  const wrongSchema = clone(api); wrongSchema.paths["/identity/sessions"].post.responses["504"].content["application/problem+json"].schema = { type: "object" };
  reject("wrong Problem schema", () => validateBundle(wrongSchema));
  const wrongCode = clone(api); wrongCode.paths["/identity/sessions"].post.responses["504"].content["application/problem+json"].example.code = "platform_dependency_unavailable";
  reject("wrong 504 code", () => validateBundle(wrongCode));
  const wrongStatus = clone(api); wrongStatus.paths["/identity/sessions"].post.responses["504"].content["application/problem+json"].example.status = 503;
  reject("wrong 504 status", () => validateBundle(wrongStatus));
  const alteredHistory = clone(catalogV5); alteredHistory.errors[0].description += " altered";
  reject("v4 entry altered", () => validateCatalog(catalogV4, alteredHistory));
  const duplicateHistory = clone(catalogV5); duplicateHistory.errors[23] = clone(duplicateHistory.errors[0]);
  reject("duplicate historical code", () => validateCatalog(catalogV4, duplicateHistory));
  const changed503 = clone(api); changed503.components.responses.Unavailable.content["application/problem+json"].example.status = 504;
  reject("503 behavior changed", () => validateBundle(changed503));
  const changedSchema = clone(problemV2); changedSchema.properties.status.enum.push(418);
  reject("Problem v2 extra status", () => validateProblemSchema(problemV1, changedSchema));
}
console.log(`PF1-06A-R7 gate passed: public=2.0.7; Problem schema additive=true; catalog v4 preserved=${catalogV4.errors.length}; catalog v5=${catalogV5.errors.length}; public 504 operations=${publicIds.length}; notification exclusions=${excluded.length}; self-test rejections=${negatives}.`);
