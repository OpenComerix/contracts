import assert from "node:assert/strict";
import {
  decimal,
  text,
  sku,
  uuid7,
  query,
  requestHash,
} from "./security-v1-common.mjs";

// Contract fixture semantics only. This module is not imported by a service or PWA.
export const entities =
  "catalog/http/shared/v1/catalog-entities-v1.schema.json";
export const definitions = {
  listCatalogUnits: [null, "Units"],
  listCatalogTaxClassifications: [null, "TaxClassifications"],
  listCatalogCategories: [null, "CategoriesPage"],
  createCatalogCategory: ["CategoryCreate", "Category"],
  getCatalogCategory: [null, "Category"],
  updateCatalogCategory: ["CategoryUpdate", "Category"],
  moveCatalogCategory: ["CategoryMove", "Category"],
  inactivateCatalogCategory: ["VersionCommand", "Category"],
  listCatalogProducts: [null, "ProductsPage"],
  createCatalogProduct: ["ProductCreate", "Product"],
  getCatalogProduct: [null, "Product"],
  updateCatalogProduct: ["ProductUpdate", "Product"],
  transitionCatalogProduct: ["Transition", "Product"],
  listCatalogProductPresentations: [null, "PresentationsPage"],
  createCatalogPresentation: ["PresentationCreate", "Presentation"],
  getCatalogPresentation: [null, "PresentationWithBarcodes"],
  updateCatalogPresentation: ["PresentationUpdate", "Presentation"],
  transitionCatalogPresentation: ["Transition", "Presentation"],
  addCatalogPresentationBarcode: ["BarcodeInput", "BarcodeResult"],
  retireCatalogPresentationBarcode: ["VersionCommand", "BarcodeResult"],
};
export const dimension = {
  unit: "count",
  kg: "mass",
  g: "mass",
  l: "volume",
  ml: "volume",
  m: "length",
  cm: "length",
  m2: "area",
};
const record = (v, reason) =>
  assert(v && typeof v === "object" && !Array.isArray(v), reason);
const closed = (v, allowed, required = []) => {
  record(v, "REQUEST_OBJECT");
  assert(
    Object.keys(v).every((k) => allowed.includes(k)),
    "REQUEST_UNKNOWN_FIELD",
  );
  assert(
    required.every((k) => Object.hasOwn(v, k)),
    "REQUEST_REQUIRED_FIELD",
  );
};
const version = (v) =>
  assert(Number.isSafeInteger(v) && v >= 1, "EXPECTED_VERSION");
const id = (v) => assert(typeof v === "string" && uuid7.test(v), "CATALOG_ID");
const fiscal = (v) => {
  closed(v, ["code", "version"], ["code", "version"]);
  assert(
    typeof v.code === "string" && /^[A-Z][A-Z0-9_.:-]{0,63}$/.test(v.code),
    "TAX_CODE",
  );
  version(v.version);
};
const allows = (v) => assert(typeof v === "boolean", "FRACTION_FLAG");
const positive = (v, s) => decimal(v, s, true);
const integerUnits = (v) =>
  BigInt(
    positive(v, 3)
      .replace(".", "")
      .padEnd(positive(v, 3).split(".")[0].length + 3, "0"),
  );
export function quantities(value, baseUnit) {
  record(value, "QUANTITY_OBJECT");
  assert(
    Object.hasOwn(dimension, baseUnit) &&
      Object.hasOwn(dimension, value.unit_code),
    "UNIT_CODE",
  );
  assert.equal(
    dimension[baseUnit],
    dimension[value.unit_code],
    "UNIT_DIMENSION",
  );
  positive(value.conversion_factor, 6);
  allows(value.allows_fractions);
  const minimum = positive(
      value.minimum_quantity,
      value.allows_fractions ? 3 : 0,
    ),
    increment = positive(
      value.quantity_increment,
      value.allows_fractions ? 3 : 0,
    );
  assert(
    integerUnits(minimum) % integerUnits(increment) === 0n,
    "MINIMUM_INCREMENT_MULTIPLE",
  );
  return {
    ...value,
    conversion_factor: decimal(value.conversion_factor, 6, true),
    minimum_quantity: minimum,
    quantity_increment: increment,
  };
}
export function barcodeKey(type, value) {
  assert(typeof value === "string", "BARCODE_STRING");
  if (type === "INTERNAL") {
    assert(
      value.length <= 64 && /^OC:[A-Z0-9_.-]+$/.test(value),
      "INTERNAL_CODE",
    );
    return "internal:" + value;
  }
  assert(
    ["GTIN_8", "GTIN_12", "GTIN_13", "GTIN_14"].includes(type),
    "BARCODE_TYPE",
  );
  const n = Number(type.slice(5));
  assert(new RegExp("^[0-9]{" + n + "}$").test(value), "GTIN_LENGTH");
  let sum = 0;
  for (let i = n - 2, weight = 3; i >= 0; i--, weight = 4 - weight)
    sum += Number(value[i]) * weight;
  assert.equal((10 - (sum % 10)) % 10, Number(value[n - 1]), "GTIN_CHECKSUM");
  return "gtin:" + value.padStart(14, "0");
}
export function normalizeBody(operation, body) {
  assert(Object.hasOwn(definitions, operation), "C_OPERATION");
  if (!definitions[operation][0]) {
    assert.equal(body, null, "GET_BODY");
    return null;
  }
  const b = structuredClone(body);
  record(b, "REQUEST_OBJECT");
  const fields = {
    createCatalogCategory: ["name", "parent_id"],
    updateCatalogCategory: ["name", "expected_version"],
    moveCatalogCategory: ["parent_id", "expected_version"],
    inactivateCatalogCategory: ["expected_version"],
    createCatalogProduct: [
      "name",
      "type",
      "default_variant",
      "base_presentation",
      "description",
      "category_id",
      "tax_classification",
    ],
    updateCatalogProduct: [
      "expected_version",
      "expected_base_presentation_version",
      "name",
      "description",
      "category_id",
      "tax_classification",
      "type",
      "default_variant",
    ],
    transitionCatalogProduct: ["action", "expected_version"],
    createCatalogPresentation: [
      "name",
      "unit_code",
      "conversion_factor",
      "allows_fractions",
      "minimum_quantity",
      "quantity_increment",
    ],
    updateCatalogPresentation: [
      "expected_version",
      "name",
      "unit_code",
      "conversion_factor",
      "allows_fractions",
      "minimum_quantity",
      "quantity_increment",
    ],
    transitionCatalogPresentation: ["action", "expected_version"],
    addCatalogPresentationBarcode: ["type", "value", "expected_version"],
    retireCatalogPresentationBarcode: ["expected_version"],
  };
  const required = {
    createCatalogCategory: ["name"],
    updateCatalogCategory: ["name", "expected_version"],
    moveCatalogCategory: ["parent_id", "expected_version"],
    inactivateCatalogCategory: ["expected_version"],
    createCatalogProduct: [
      "name",
      "type",
      "default_variant",
      "base_presentation",
    ],
    updateCatalogProduct: ["expected_version"],
    transitionCatalogProduct: ["action", "expected_version"],
    createCatalogPresentation: fields.createCatalogPresentation,
    updateCatalogPresentation: ["expected_version"],
    transitionCatalogPresentation: ["action", "expected_version"],
    addCatalogPresentationBarcode: ["type", "value", "expected_version"],
    retireCatalogPresentationBarcode: ["expected_version"],
  };
  closed(b, fields[operation], required[operation]);
  if (Object.hasOwn(b, "expected_version")) version(b.expected_version);
  if (Object.hasOwn(b, "name"))
    b.name = text(b.name, operation.includes("Product") ? 160 : 80);
  if (Object.hasOwn(b, "description") && b.description !== null)
    b.description = text(b.description, 1000, true);
  for (const key of ["parent_id", "category_id"])
    if (Object.hasOwn(b, key) && b[key] !== null) id(b[key]);
  if (Object.hasOwn(b, "tax_classification") && b.tax_classification !== null)
    fiscal(b.tax_classification);
  if (Object.hasOwn(b, "type") && operation !== "addCatalogPresentationBarcode")
    assert(
      ["STOCKED_GOOD", "NON_STOCK_GOOD", "SERVICE"].includes(b.type),
      "PRODUCT_TYPE",
    );
  if (Object.hasOwn(b, "action"))
    assert(
      ["activate", "inactivate", "reactivate", "discontinue"].includes(
        b.action,
      ),
      "TRANSITION_ACTION",
    );
  if (Object.hasOwn(b, "default_variant")) {
    const v = b.default_variant;
    closed(
      v,
      ["sku", "base_unit", "plu"],
      operation === "createCatalogProduct" ? ["sku", "base_unit"] : [],
    );
    assert(Object.keys(v).length > 0, "EMPTY_VARIANT_PATCH");
    if (Object.hasOwn(v, "sku")) v.sku = sku(v.sku);
    if (Object.hasOwn(v, "plu") && v.plu !== null)
      assert(
        typeof v.plu === "string" && /^[0-9]{1,12}$/.test(v.plu),
        "PLU_FORMAT",
      );
    if (operation === "createCatalogProduct")
      assert(v.plu !== null, "PLU_CREATE_NULL");
    if (Object.hasOwn(v, "base_unit"))
      assert(Object.hasOwn(dimension, v.base_unit), "UNIT_CODE");
    if (operation === "updateCatalogProduct") {
      assert(
        Object.hasOwn(v, "base_unit") ===
          Object.hasOwn(b, "expected_base_presentation_version"),
        "BASE_VERSION_REQUIRED",
      );
      if (Object.hasOwn(v, "base_unit"))
        version(b.expected_base_presentation_version);
    }
  } else
    assert(
      !Object.hasOwn(b, "expected_base_presentation_version"),
      "BASE_VERSION_WITHOUT_CHANGE",
    );
  if (operation === "createCatalogProduct") {
    const base = b.base_presentation;
    closed(
      base,
      ["name", "allows_fractions", "minimum_quantity", "quantity_increment"],
      ["name", "allows_fractions", "minimum_quantity", "quantity_increment"],
    );
    base.name = text(base.name, 80);
    const n = quantities(
      {
        ...base,
        unit_code: b.default_variant.base_unit,
        conversion_factor: "1",
      },
      b.default_variant.base_unit,
    );
    base.minimum_quantity = n.minimum_quantity;
    base.quantity_increment = n.quantity_increment;
  }
  if (["updateCatalogProduct", "updateCatalogPresentation"].includes(operation))
    assert(
      Object.keys(b).some(
        (k) =>
          !["expected_version", "expected_base_presentation_version"].includes(
            k,
          ),
      ),
      "EMPTY_PATCH",
    );
  if (operation === "createCatalogPresentation")
    Object.assign(b, quantities(b, b.unit_code));
  if (operation === "updateCatalogPresentation") {
    if (Object.hasOwn(b, "unit_code"))
      assert(Object.hasOwn(dimension, b.unit_code), "UNIT_CODE");
    if (Object.hasOwn(b, "conversion_factor"))
      b.conversion_factor = positive(b.conversion_factor, 6);
    if (Object.hasOwn(b, "allows_fractions")) allows(b.allows_fractions);
    for (const k of ["minimum_quantity", "quantity_increment"])
      if (Object.hasOwn(b, k))
        b[k] = positive(b[k], b.allows_fractions === false ? 0 : 3);
  }
  if (operation === "addCatalogPresentationBarcode")
    barcodeKey(b.type, b.value);
  return b;
}
export function normalizedRequest(request, policy) {
  record(request, "CANONICAL_OBJECT");
  const op = policy.operations.find(
    (o) => o.operation_id === request.operation_id,
  );
  assert(op && Object.hasOwn(definitions, op.operation_id), "C_OPERATION");
  record(request.query, "CANONICAL_QUERY");
  const q = query(Object.entries(request.query), op);
  if (Object.hasOwn(q, "barcode"))
    barcodeKey(
      q.barcode.startsWith("OC:") ? "INTERNAL" : "GTIN_" + q.barcode.length,
      q.barcode,
    );
  const normalized = {
    ...request,
    query: q,
    body: normalizeBody(op.operation_id, request.body),
  };
  return { request: normalized, hash: requestHash(normalized, policy) };
}
export function operationErrors(op, privateSurface) {
  const codes = [
    "catalog_invalid_request",
    "identity_access_denied",
    "identity_device_not_approved",
    "identity_mfa_required",
    "tenancy_membership_invalid",
    "platform_not_acceptable",
    "platform_rate_limited",
    "platform_internal_error",
    "platform_dependency_unavailable",
    "platform_capacity_exhausted",
  ];
  if (privateSurface)
    codes.push(
      "catalog_delegation_invalid",
      "catalog_delegation_request_mismatch",
    );
  else
    codes.push(
      "identity_session_invalid_or_expired",
      "gateway_deadline_exceeded",
    );
  if (op.path.includes("{")) codes.push("catalog_resource_not_found");
  if (op.query.some((k) => k.includes("cursor")))
    codes.push("catalog_invalid_cursor");
  if (op.method !== "GET")
    codes.push(
      "catalog_state_conflict",
      "catalog_semantic_validation_failed",
      "catalog_uniqueness_conflict",
      "catalog_idempotency_key_reused",
      "catalog_idempotency_request_in_progress",
      "platform_payload_too_large",
      "platform_unsupported_media_type",
      ...(privateSurface ? [] : ["gateway_csrf_invalid"]),
    );
  if (op.method !== "GET" && !op.operation_id.startsWith("create"))
    codes.push("catalog_version_conflict");
  if (op.operation_id === "updateCatalogProduct")
    codes.push("identity_reauthentication_required");
  return codes.sort();
}
