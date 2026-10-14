import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseJSON } from "../../tools/architecture/consumer-gate.mjs";

export const uuid7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const hash = (bytes) =>
  createHash("sha256").update(bytes, "utf8").digest("hex");
export const loadJSON = (text) => parseJSON(text);

// RFC 8785: serialize sorted member names directly. Rebuilding an object would
// let JSON.stringify reorder integer-like names, unlike the required UTF-16 order.
export function jcs(value) {
  if (typeof value === "string") {
    assert(value.isWellFormed(), "JCS_INVALID_UNICODE");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "JCS_NONFINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value)) {
    assert(
      Object.keys(value).length === value.length &&
        Array.from({ length: value.length }, (_, i) =>
          Object.hasOwn(value, i),
        ).every(Boolean),
      "JCS_NOT_JSON_ARRAY",
    );
    return "[" + value.map(jcs).join(",") + "]";
  }
  assert(
    value &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype,
    "JCS_NOT_JSON",
  );
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => jcs(k) + ":" + jcs(value[k]))
      .join(",") +
    "}"
  );
}
export function decimal(value, scale, positive = false) {
  assert(
    typeof value === "string" &&
      new RegExp(
        "^(?:0|[1-9][0-9]{0,11})" +
          (scale ? "(?:\\.[0-9]{1," + scale + "})?" : "") +
          "$",
      ).test(value),
    "DECIMAL_FORMAT_OR_SCALE",
  );
  assert(!positive || !/^0(?:\.0+)?$/.test(value), "DECIMAL_MUST_BE_POSITIVE");
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}
export function text(value, maximum, multiline = false) {
  assert(typeof value === "string" && value.isWellFormed(), "TEXT_UNICODE");
  const normalized = value.normalize("NFC");
  assert(
    [...normalized].length <= maximum &&
      (multiline ||
        (normalized.length > 0 && normalized.trim() === normalized)),
    "TEXT_BOUNDS",
  );
  assert(
    !(multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(
      normalized,
    ),
    "TEXT_CONTROL",
  );
  return normalized;
}
export function sku(value) {
  assert(
    typeof value === "string" && /^[A-Za-z0-9_./-]{1,64}$/.test(value),
    "SKU_FORMAT",
  );
  return value.toUpperCase();
}
export function query(pairs, operation) {
  assert(Array.isArray(pairs), "QUERY_PAIRS_REQUIRED");
  const result = {};
  for (const [name, value] of pairs) {
    assert(
      operation.query.includes(name) && !Object.hasOwn(result, name),
      "QUERY_UNKNOWN_OR_DUPLICATE",
    );
    assert(
      typeof value === "string" && value.isWellFormed(),
      "QUERY_STRING_REQUIRED",
    );
    let normalized = value;
    if (["limit", "barcode_limit"].includes(name))
      assert(/^(?:[1-9]|[1-9][0-9]|100)$/.test(value), "QUERY_LIMIT");
    if (["cursor", "barcode_cursor"].includes(name))
      assert(value.length >= 1 && [...value].length <= 2048, "QUERY_CURSOR");
    if (name === "sku") normalized = sku(value);
    if (name === "q") normalized = text(value, 160);
    if (name === "plu") assert(/^[0-9]{1,12}$/.test(value), "QUERY_PLU");
    if (name === "category_id") assert(uuid7.test(value), "QUERY_CATEGORY");
    if (name === "status")
      assert(
        ["draft", "active", "inactive", "discontinued"].includes(value),
        "QUERY_STATUS",
      );
    Object.defineProperty(result, name, {
      value: normalized,
      enumerable: true,
    });
  }
  const exact = ["sku", "plu", "barcode"].filter((k) =>
    Object.hasOwn(result, k),
  );
  assert(
    exact.length <= 1 && !(exact.length && Object.hasOwn(result, "q")),
    "QUERY_SEARCH_SELECTORS",
  );
  return result;
}
export function requestBytes(request, policy) {
  assert(
    request && typeof request === "object" && !Array.isArray(request),
    "CANONICAL_OBJECT",
  );
  assert.deepEqual(
    Object.keys(request).sort(),
    [
      "canonicalization_version",
      "operation_id",
      "method",
      "path",
      "query",
      "body",
      "idempotency_key",
    ].sort(),
    "CANONICAL_FIELDS",
  );
  assert.equal(
    request.canonicalization_version,
    "catalog-request-v1",
    "CANONICAL_VERSION",
  );
  const operation = policy.operations.find(
    (o) => o.operation_id === request.operation_id,
  );
  assert(operation, "CANONICAL_OPERATION");
  assert.equal(request.method, operation.method, "CANONICAL_METHOD");
  const segments = operation.path.split(/(\{[^}]+\})/);
  const pattern =
    "^" +
    segments
      .map((s) =>
        s.startsWith("{")
          ? "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
          : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("") +
    "$";
  assert(
    typeof request.path === "string" && new RegExp(pattern).test(request.path),
    "CANONICAL_PATH",
  );
  assert(
    request.query &&
      typeof request.query === "object" &&
      !Array.isArray(request.query),
    "CANONICAL_QUERY",
  );
  assert.deepEqual(
    request.query,
    query(Object.entries(request.query), operation),
    "CANONICAL_QUERY_NORMALIZATION",
  );
  if (operation.method === "GET") {
    assert.equal(request.body, null, "CANONICAL_GET_BODY");
    assert.equal(request.idempotency_key, null, "CANONICAL_GET_KEY");
  } else {
    assert(
      request.body &&
        typeof request.body === "object" &&
        !Array.isArray(request.body),
      "CANONICAL_BODY",
    );
    assert(uuid7.test(request.idempotency_key), "CANONICAL_KEY");
  }
  // Body must already pass its C/D request schema and business normalization.
  // This B gate validates binding and JCS, not unimplemented CRUD semantics.
  return jcs(request);
}
export const requestHash = (request, policy) =>
  hash(requestBytes(request, policy));

// Static semantic fixture evaluator: no JWT verification, DB or authorization
// runtime. Inputs represent the owner's already verified state, never PWA claims.
export function validateAuthorityFixture(fixture, policy) {
  const {
    claims,
    issued,
    current,
    request,
    response,
    workload,
    now_seconds,
    elapsed_ms,
  } = fixture;
  assert.deepEqual(
    workload,
    {
      caller: "catalog-pricing",
      aud: "identity-tenancy.catalog-authority",
      type: "service",
    },
    "AUTHORITY_WORKLOAD",
  );
  assert(
    typeof claims.iss === "string" &&
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(claims.iss),
    "DELEGATED_ISSUER_URI",
  );
  assert.equal(claims.iss, fixture.configured_issuer, "DELEGATED_ISSUER");
  assert.equal(claims.aud, "catalog-pricing.user-api", "DELEGATED_AUDIENCE");
  assert.equal(claims.caller, "gateway-bff", "DELEGATED_CALLER");
  assert.equal(claims.type, "delegated", "DELEGATED_TYPE");
  assert.equal(fixture.jwt_header.alg, "ES256", "DELEGATED_ALGORITHM");
  assert(
    typeof fixture.jwt_header.kid === "string" &&
      fixture.jwt_header.kid.length > 0,
    "DELEGATED_KID",
  );
  assert(uuid4.test(claims.jti), "DELEGATED_JTI");
  assert(
    Number.isSafeInteger(now_seconds) &&
      Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) &&
      claims.iat <= now_seconds &&
      claims.exp > now_seconds &&
      claims.exp > claims.iat &&
      claims.exp - claims.iat <= 60,
    "DELEGATED_LIFETIME",
  );
  const op = policy.operations.find(
    (o) => o.operation_id === request.operation_id,
  );
  assert(op, "AUTHORITY_OPERATION");
  for (const key of [
    "operation_id",
    "canonicalization_version",
    "request_hash",
  ]) {
    assert.equal(claims[key], request[key], "DELEGATED_REQUEST_BINDING");
    assert.equal(issued[key], request[key], "ISSUANCE_REQUEST_BINDING");
    assert.equal(response[key], request[key], "AUTHORITY_REQUEST_BINDING");
  }
  assert.equal(
    request.canonicalization_version,
    "catalog-request-v1",
    "AUTHORITY_PROFILE",
  );
  assert(/^[0-9a-f]{64}$/.test(request.request_hash), "AUTHORITY_HASH_FORMAT");
  assert.equal(issued.delegation_id, claims.jti, "ISSUANCE_DELEGATION");
  assert.equal(response.delegation_id, claims.jti, "AUTHORITY_DELEGATION");
  assert.equal(fixture.signal, issued.signal, "ISSUANCE_SIGNAL");
  assert(
    new RegExp(policy.private_security.client_signal_pattern).test(
      fixture.signal,
    ),
    "CLIENT_SIGNAL_SYNTAX",
  );
  assert(
    current.account_active &&
      current.session_active &&
      current.organization_active &&
      current.membership_active &&
      current.device_approved &&
      current.mfa_valid,
    "CURRENT_AUTHORITY_INACTIVE",
  );
  for (const key of [
    "account",
    "session",
    "organization",
    "membership",
    "device",
    "approval",
  ]) {
    const fields =
      key === "account"
        ? ["account_id", "security_version"]
        : key === "session"
          ? ["session_id", "credential_version"]
          : [key + "_id", "version"];
    assert(
      response[key] &&
        typeof response[key] === "object" &&
        !Array.isArray(response[key]),
      "CURRENT_REFERENCE_VERSION",
    );
    for (const field of fields) {
      assert.equal(
        response[key][field],
        current[key][field],
        "CURRENT_REFERENCE_VERSION",
      );
      assert(
        typeof response[key][field] === "string" &&
          response[key][field].length > 0,
        "IDENTITY_STRING_REFERENCE_VERSION",
      );
    }
  }
  assert.equal(claims.sub, current.account.account_id, "ACCOUNT_BINDING");
  assert.equal(
    claims.security_version,
    current.account.security_version,
    "ACCOUNT_SECURITY_VERSION",
  );
  assert.equal(
    claims.session_id,
    current.session.session_id,
    "SESSION_BINDING",
  );
  assert.equal(
    issued.credential_version,
    current.session.credential_version,
    "CREDENTIAL_CHANGED",
  );
  assert.equal(
    claims.organization_id,
    current.organization.organization_id,
    "ORGANIZATION_BINDING",
  );
  assert.equal(
    claims.membership_id,
    current.membership.membership_id,
    "MEMBERSHIP_BINDING",
  );
  assert.equal(claims.device_id, current.device.device_id, "DEVICE_BINDING");
  assert.equal(response.decision, "authorized", "AUTHORITY_DECISION");
  assert(uuid7.test(response.decision_id), "AUTHORITY_DECISION_ID");
  assert.equal(response.permission, op.permission, "AUTHORITY_PERMISSION");
  assert(current.permissions.includes(op.permission), "CURRENT_PERMISSION");
  assert.equal(response.scope.kind, "organization", "AUTHORITY_SCOPE");
  assert.equal(
    response.scope.organization_id,
    current.organization.organization_id,
    "AUTHORITY_SCOPE_ORGANIZATION",
  );
  assert(!Object.hasOwn(response.scope, "branch_id"), "AUTHORITY_NO_BRANCH");
  assert(
    Number.isInteger(response.valid_for_ms) &&
      response.valid_for_ms >= 1 &&
      response.valid_for_ms <= 2000,
    "AUTHORITY_DURATION",
  );
  assert(
    Number.isInteger(response.step_up_valid_for_ms) &&
      response.step_up_valid_for_ms >= 0 &&
      response.step_up_valid_for_ms <= response.valid_for_ms,
    "STEP_UP_DURATION",
  );
  assert(
    Number.isFinite(elapsed_ms) &&
      elapsed_ms >= 0 &&
      elapsed_ms < response.valid_for_ms,
    "AUTHORITY_EXPIRED",
  );
  assert(
    response.valid_for_ms <= current.remaining_authority_ms &&
      response.valid_for_ms <= (claims.exp - now_seconds) * 1000,
    "AUTHORITY_CANNOT_EXTEND",
  );
  const step = Math.min(900000, current.remaining_step_up_ms);
  assert(
    response.step_up_valid_for_ms <= Math.max(0, step),
    "STEP_UP_CANNOT_EXTEND",
  );
  if (fixture.active_product_tax_change) {
    assert.equal(op.operation_id, "updateCatalogProduct", "STEP_UP_OPERATION");
    assert(response.step_up_valid_for_ms > elapsed_ms, "STEP_UP_REQUIRED");
  }
}
