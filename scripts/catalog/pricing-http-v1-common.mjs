import assert from "node:assert/strict";
import { decimal, query, requestHash, uuid7 } from "./security-v1-common.mjs";
import { operationErrors } from "./http-v1-common.mjs";
import common from "../../catalog/http/shared/v1/catalog-common-v1.schema.json" with { type: "json" };

// Contract test helpers only; not a pricing engine, authorizer or service SDK.
export const prices = "catalog/http/shared/v1/catalog-prices-v1.schema.json";
export const definitions = {
  getDefaultPriceList: [null, "PriceList"],
  getPresentationCurrentPrice: [null, "Price"],
  listPresentationPrices: [null, "PricesPage"],
  createPresentationPrice: ["PriceSet", "Price"],
  getPrice: [null, "Price"],
};
export const schemaRef = (name) =>
  "../../shared/v1/catalog-prices-v1.schema.json#/$defs/" + name;
export function priceErrors(op, privateSurface) {
  const codes = operationErrors(op, privateSurface)
    .filter((c) => c !== "catalog_uniqueness_conflict")
    .map((c) =>
      c.startsWith("catalog_") && !c.startsWith("catalog_delegation_")
        ? c.replace("catalog_", "pricing_")
        : c,
    );
  if (op.operation_id === "createPresentationPrice")
    codes.push("pricing_version_conflict");
  if (op.operation_id === "getDefaultPriceList")
    codes.push("pricing_default_list_not_initialized");
  if (op.operation_id === "getPresentationCurrentPrice")
    codes.push("pricing_price_not_set");
  return [...new Set(codes)].sort();
}
export function normalizePriceBody(operation, body) {
  assert(Object.hasOwn(definitions, operation), "D_OPERATION");
  if (!definitions[operation][0]) {
    assert.equal(body, null, "GET_BODY");
    return null;
  }
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    "PRICE_REQUEST_OBJECT",
  );
  assert.deepEqual(
    Object.keys(body).sort(),
    ["amount", "expected_version"],
    "PRICE_REQUEST_FIELDS",
  );
  assert(
    Number.isSafeInteger(body.expected_version) && body.expected_version >= 0,
    "PRICE_EXPECTED_VERSION",
  );
  return {
    amount: decimal(body.amount, 2, true),
    expected_version: body.expected_version,
  };
}
export function normalizedPriceRequest(request, policy) {
  assert(
    request && typeof request === "object" && !Array.isArray(request),
    "CANONICAL_OBJECT",
  );
  const op = policy.operations.find(
    (o) => o.operation_id === request.operation_id,
  );
  assert(op && Object.hasOwn(definitions, op.operation_id), "D_OPERATION");
  assert(
    request.query &&
      typeof request.query === "object" &&
      !Array.isArray(request.query),
    "CANONICAL_QUERY",
  );
  const normalized = {
    ...request,
    query: query(Object.entries(request.query), op),
    body: normalizePriceBody(op.operation_id, request.body),
  };
  return { request: normalized, hash: requestHash(normalized, policy) };
}
export const profile = {
  definitions,
  count: 5,
  permission: "pricing.",
  schemaRef,
  operationErrors: priceErrors,
  scope: "D",
  locationRoots: { createPresentationPrice: "/api/v1/pricing/prices" },
};
export const record = (v, name) =>
  assert(
    v && typeof v === "object" && !Array.isArray(v),
    "PRICE_CONTEXT:" + name,
  );
export function required(v, fields, name) {
  record(v, name);
  for (const [key, type] of Object.entries(fields)) {
    assert(Object.hasOwn(v, key), "PRICE_CONTEXT:" + name + "." + key);
    const x = v[key];
    assert(
      type === "array"
        ? Array.isArray(x)
        : type === "object"
          ? x && typeof x === "object" && !Array.isArray(x)
          : type === "nullable-object"
            ? x === null || (x && typeof x === "object" && !Array.isArray(x))
            : typeof x === type,
      "PRICE_CONTEXT:" + name + "." + key,
    );
    if (type === "string")
      assert(x.length > 0, "PRICE_CONTEXT:" + name + "." + key);
  }
}
export const id = (v) =>
  assert(typeof v === "string" && uuid7.test(v), "PRICE_ID");
export const version = (v) =>
  assert(Number.isSafeInteger(v) && v >= 1, "PRICE_VERSION");
// Compare UTC instants exactly through PostgreSQL microsecond precision, never
// by lexicographic strings or Date.parse's truncated fractional milliseconds.
export function instant(value) {
  assert(typeof value === "string", "PRICE_INSTANT");
  const m =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.([0-9]{1,6}))?Z$/.exec(value);
  assert(m, "PRICE_INSTANT");
  const base = m[1] + "T" + m[2] + ".000Z",
    ms = Date.parse(base);
  assert(
    Number.isFinite(ms) && new Date(ms).toISOString() === base,
    "PRICE_INSTANT",
  );
  return BigInt(ms) * 1000n + BigInt((m[3] ?? "").padEnd(6, "0"));
}
export function priceRecord(p) {
  required(
    p,
    {
      price_id: "string",
      organization_id: "string",
      price_list_id: "string",
      product_id: "string",
      presentation_id: "string",
      amount: "string",
      currency: "string",
      tax_included: "boolean",
      version: "number",
      valid_from: "string",
    },
    "price",
  );
  for (const k of [
    "price_id",
    "price_list_id",
    "product_id",
    "presentation_id",
  ])
    id(p[k]);
  version(p.version);
  decimal(p.amount, 2, true);
  assert.equal(p.currency, "ARS", "PRICE_CURRENCY");
  assert.equal(p.tax_included, true, "PRICE_TAX_INCLUDED");
  assert(
    Object.hasOwn(p, "valid_to") &&
      (p.valid_to === null || typeof p.valid_to === "string"),
    "PRICE_CONTEXT:price.valid_to",
  );
  const from = instant(p.valid_from);
  if (p.valid_to !== null) assert(instant(p.valid_to) > from, "PRICE_INTERVAL");
}
export function listRecord(list) {
  required(
    list,
    {
      price_list_id: "string",
      organization_id: "string",
      currency: "string",
      tax_included: "boolean",
      version: "number",
      created_at: "string",
      updated_at: "string",
    },
    "list",
  );
  id(list.price_list_id);
  version(list.version);
  assert.equal(list.currency, "ARS", "PRICE_LIST_CURRENCY");
  assert.equal(list.tax_included, true, "PRICE_LIST_TAX_INCLUDED");
  assert(
    instant(list.updated_at) >= instant(list.created_at),
    "PRICE_LIST_TIME",
  );
}
export function ownerContext(c, nullableList = false) {
  required(
    c,
    {
      organization_id: "string",
      product: "object",
      presentation: "object",
      list: nullableList ? "nullable-object" : "object",
    },
    "owner",
  );
  required(
    c.product,
    {
      product_id: "string",
      organization_id: "string",
      status: "string",
      version: "number",
      default_variant: "object",
    },
    "product",
  );
  required(
    c.product.default_variant,
    { variant_id: "string", base_unit: "string" },
    "variant",
  );
  required(
    c.presentation,
    {
      presentation_id: "string",
      product_id: "string",
      variant_id: "string",
      organization_id: "string",
      status: "string",
      version: "number",
    },
    "presentation",
  );
  for (const p of [c.product, c.presentation]) {
    assert.equal(p.organization_id, c.organization_id, "PRICE_OWNER_TENANT");
    version(p.version);
    assert(
      ["draft", "active", "inactive", "discontinued"].includes(p.status),
      "PRICE_OWNER_STATUS",
    );
  }
  id(c.product.product_id);
  id(c.presentation.presentation_id);
  id(c.product.default_variant.variant_id);
  assert.equal(
    c.presentation.product_id,
    c.product.product_id,
    "PRICE_OWNER_PRODUCT",
  );
  assert.equal(
    c.presentation.variant_id,
    c.product.default_variant.variant_id,
    "PRICE_OWNER_VARIANT",
  );
  if (c.list !== null) {
    listRecord(c.list);
    assert.equal(
      c.list.organization_id,
      c.organization_id,
      "PRICE_LIST_TENANT",
    );
  }
}
export function priceOwner(p, c, list = c.list) {
  priceRecord(p);
  listRecord(list);
  for (const [k, v] of Object.entries({
    organization_id: c.organization_id,
    price_list_id: list.price_list_id,
    product_id: c.product.product_id,
    presentation_id: c.presentation.presentation_id,
  }))
    assert.equal(p[k], v, "PRICE_SCOPE:" + k);
  assert.equal(p.currency, list.currency, "PRICE_LIST_CURRENCY");
  assert.equal(p.tax_included, list.tax_included, "PRICE_LIST_TAX_INCLUDED");
  assert(
    instant(p.valid_from) >= instant(list.created_at),
    "PRICE_LIST_PRICE_TIME",
  );
}

// These are the four modelled headers of a pricing 201, not a raw HTTP capture.
// Compare the same known schema patterns used by the two OpenAPI surfaces.
export function validatePriceReplayHeaders(headers) {
  required(
    headers,
    {
      "Cache-Control": "string",
      ETag: "string",
      "Idempotency-Replayed": "boolean",
      Location: "string",
    },
    "replay.headers",
  );
  assert.deepEqual(
    Object.keys(headers).sort(),
    ["Cache-Control", "ETag", "Idempotency-Replayed", "Location"],
    "PRICE_REPLAY_HEADER_INVENTORY",
  );
  assert.equal(
    headers["Cache-Control"],
    common.$defs.CacheControl.const,
    "PRICE_REPLAY_CACHE",
  );
  assert(
    new RegExp(common.$defs.ETag.pattern).test(headers.ETag),
    "PRICE_REPLAY_ETAG",
  );
  assert(
    new RegExp(common.$defs.Location.pattern).test(headers.Location),
    "PRICE_REPLAY_LOCATION_FORMAT",
  );
}
