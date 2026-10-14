import { validateSemantic } from "../../scripts/catalog/http-v1-semantics.mjs";
import {
  extractHttpSchema,
  validateReplayPair,
} from "../../scripts/catalog/validate-http-v1.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { read } from "../../scripts/catalog/validate-security-v1.mjs";
import {
  normalizeBody,
  quantities,
  barcodeKey,
  normalizedRequest,
  definitions,
} from "../../scripts/catalog/http-v1-common.mjs";
import { loadJSON } from "../../scripts/catalog/security-v1-common.mjs";
const m = await read("catalog/fixtures/http/v1/catalog-http-v1-fixtures.json");
const policy = await read(
  "catalog/http/shared/v1/catalog-security-policy-v1.json",
);
for (const row of m.semantic_cases)
  test("owner fixture " + row.id, async () => {
    const f = await read(row.fixture);
    if (row.expected === "accept") validateSemantic(f);
    else
      assert.throws(
        () => validateSemantic(f),
        (e) =>
          e instanceof assert.AssertionError && e.message.includes(row.reason),
      );
  });
for (const op of Object.keys(definitions).filter((k) => definitions[k][0]))
  test("normalize valid request " + op, async () => {
    const body = await read("catalog/fixtures/http/v1/" + op + "-request.json");
    const result = normalizeBody(op, body);
    assert(result);
    assert.deepEqual(
      body,
      await read("catalog/fixtures/http/v1/" + op + "-request.json"),
    );
  });
const invalids = [
  [
    "unknown actor",
    "createCatalogCategory",
    { name: "Nombre", account_id: "free" },
    "REQUEST_UNKNOWN_FIELD",
  ],
  [
    "missing variant",
    "createCatalogProduct",
    { name: "Producto", type: "SERVICE", base_presentation: {} },
    "REQUEST_REQUIRED_FIELD",
  ],
  [
    "empty patch",
    "updateCatalogProduct",
    { expected_version: 1 },
    "EMPTY_PATCH",
  ],
  [
    "empty variant",
    "updateCatalogProduct",
    { expected_version: 1, default_variant: {} },
    "EMPTY_VARIANT_PATCH",
  ],
  [
    "null SKU",
    "updateCatalogProduct",
    { expected_version: 1, default_variant: { sku: null } },
    "SKU_FORMAT",
  ],
  [
    "base version absent",
    "updateCatalogProduct",
    { expected_version: 1, default_variant: { base_unit: "kg" } },
    "BASE_VERSION_REQUIRED",
  ],
  [
    "base orphan version",
    "updateCatalogProduct",
    {
      expected_version: 1,
      expected_base_presentation_version: 1,
      name: "Nombre",
    },
    "BASE_VERSION_WITHOUT_CHANGE",
  ],
  [
    "version zero",
    "updateCatalogCategory",
    { name: "Nombre", expected_version: 0 },
    "EXPECTED_VERSION",
  ],
  [
    "version string",
    "updateCatalogCategory",
    { name: "Nombre", expected_version: "1" },
    "EXPECTED_VERSION",
  ],
  [
    "tax free form",
    "updateCatalogProduct",
    {
      expected_version: 1,
      tax_classification: { code: "TEST.TAX", version: 1, rate: "21" },
    },
    "REQUEST_UNKNOWN_FIELD",
  ],
  [
    "PLU number",
    "updateCatalogProduct",
    { expected_version: 1, default_variant: { plu: 1 } },
    "PLU_FORMAT",
  ],
  [
    "SKU unicode",
    "updateCatalogProduct",
    { expected_version: 1, default_variant: { sku: "Ñ" } },
    "SKU_FORMAT",
  ],
  [
    "null name",
    "updateCatalogProduct",
    { expected_version: 1, name: null },
    "TEXT_UNICODE",
  ],
  [
    "status patch",
    "updateCatalogPresentation",
    { expected_version: 1, status: "active" },
    "REQUEST_UNKNOWN_FIELD",
  ],
  [
    "unknown action",
    "transitionCatalogProduct",
    { expected_version: 1, action: "delete" },
    "TRANSITION_ACTION",
  ],
  ["GET body", "getCatalogProduct", {}, "GET_BODY"],
  [
    "invalid checksum",
    "addCatalogPresentationBarcode",
    { type: "GTIN_13", value: "4006381333932", expected_version: 1 },
    "GTIN_CHECKSUM",
  ],
  [
    "factor number",
    "updateCatalogPresentation",
    { conversion_factor: 2, expected_version: 1 },
    "DECIMAL_FORMAT_OR_SCALE",
  ],
  [
    "scale before trim",
    "updateCatalogPresentation",
    { conversion_factor: "1.0000000", expected_version: 1 },
    "DECIMAL_FORMAT_OR_SCALE",
  ],
];
for (const [name, op, b, reason] of invalids)
  test("strict normalization " + name, () =>
    assert.throws(
      () => normalizeBody(op, b),
      (e) => e instanceof assert.AssertionError && e.message.includes(reason),
    ),
  );
test("NFC and uppercase SKU precede hash", () => {
  const op = policy.operations.find(
      (o) => o.operation_id === "updateCatalogProduct",
    ),
    r = {
      canonicalization_version: "catalog-request-v1",
      operation_id: op.operation_id,
      method: op.method,
      path: "/api/v1/catalog/products/01998d00-0000-7000-8000-000000000002",
      query: {},
      body: {
        name: "Cafe\u0301",
        expected_version: 1,
        default_variant: { sku: "abc-1" },
      },
      idempotency_key: "01998d00-0000-7000-8000-000000000090",
    };
  const a = normalizedRequest(r, policy),
    b = normalizedRequest(
      {
        ...r,
        body: {
          name: "Café",
          expected_version: 1,
          default_variant: { sku: "ABC-1" },
        },
      },
      policy,
    );
  assert.equal(a.hash, b.hash);
  assert.equal(a.request.body.name, "Café");
  assert.equal(a.request.body.default_variant.sku, "ABC-1");
});
test("PATCH omission and null different hashes", () => {
  const r = {
    canonicalization_version: "catalog-request-v1",
    operation_id: "updateCatalogProduct",
    method: "PATCH",
    path: "/api/v1/catalog/products/01998d00-0000-7000-8000-000000000002",
    query: {},
    body: { name: "Nuevo", expected_version: 1 },
    idempotency_key: "01998d00-0000-7000-8000-000000000090",
  };
  assert.notEqual(
    normalizedRequest(r, policy).hash,
    normalizedRequest({ ...r, body: { ...r.body, description: null } }, policy)
      .hash,
  );
});
test("duplicate JSON rejected before normalizing", () =>
  assert.throws(
    () => loadJSON('{"name":"A","name":"B"}'),
    /duplicate|duplicad/i,
  ));
test("PLU zeros and decimal strings retained", () =>
  assert.deepEqual(
    normalizeBody("updateCatalogProduct", {
      expected_version: 1,
      default_variant: { plu: "0001" },
    }).default_variant,
    { plu: "0001" },
  ));
test("exact decimal multiple without floating point", () =>
  assert.doesNotThrow(() =>
    quantities(
      {
        unit_code: "kg",
        conversion_factor: "0.1",
        allows_fractions: true,
        minimum_quantity: "999999999999.999",
        quantity_increment: "0.001",
      },
      "g",
    ),
  ));
test("GTIN 13 and 14 share key retaining input", () =>
  assert.equal(
    barcodeKey("GTIN_13", "4006381333931"),
    barcodeKey("GTIN_14", "04006381333931"),
  ));
test("known private signal never appears in public hash object", () => {
  const r = {
    canonicalization_version: "catalog-request-v1",
    operation_id: "listCatalogUnits",
    method: "GET",
    path: "/api/v1/catalog/units",
    query: {},
    body: null,
    idempotency_key: null,
    signal: "synthetic",
  };
  assert.throws(() => normalizedRequest(r, policy), /CANONICAL_FIELDS/);
});
test("inventory covers 20 operations on both surfaces", () => {
  assert.equal(m.operations.length, 20);
  for (const op of m.operations)
    for (const surface of ["public", "private"]) {
      const rows = m.examples.filter(
        (r) => r.surface === surface && r.operation_id === op,
      );
      assert(
        rows.some(
          (r) => r.media_type === "application/json" && r.status !== "request",
        ),
      );
      assert(rows.some((r) => r.media_type === "application/problem+json"));
      assert.equal(
        rows.some((r) => r.status === "request"),
        definitions[op][0] !== null,
      );
    }
});

test("HTTP extraction emits schema rather than OpenAPI root", () => {
  const schema = { type: "object", properties: { name: { type: "string" } } };
  const api = {
    openapi: "3.1.0",
    paths: {
      "/catalog/units": {
        get: {
          responses: { 200: { content: { "application/json": { schema } } } },
        },
      },
    },
  };
  const actual = extractHttpSchema(
    api,
    "/paths/~1catalog~1units/get/responses/200/content/application~1json/schema",
  );
  assert.deepEqual(actual, schema);
  assert(!Object.hasOwn(actual, "paths"));
  actual.properties.name.type = "integer";
  assert.equal(schema.properties.name.type, "string");
});
test("missing HTTP selector fails with AssertionError", () =>
  assert.throws(
    () => extractHttpSchema({ paths: {} }, "/paths/~1catalog/schema"),
    (e) =>
      e instanceof assert.AssertionError &&
      e.message.includes("HTTP_SCHEMA_REQUIRED"),
  ));
test("invalid HTTP selector fails closed", () =>
  assert.throws(
    () => extractHttpSchema({}, "/components"),
    (e) =>
      e instanceof assert.AssertionError &&
      e.message.includes("HTTP_SCHEMA_POINTER"),
  ));
test("unknown transition owner entity rejected", () =>
  assert.throws(
    () =>
      validateSemantic({
        kind: "transition",
        context: {
          entity: "unknown",
          status: "draft",
          action: "activate",
          result_status: "active",
          tax_supported: true,
          price_eligible: true,
        },
      }),
    (e) =>
      e instanceof assert.AssertionError &&
      e.message.includes("TRANSITION_ENTITY"),
  ));

for (const [name, query, reason] of [
  ["empty barcode", { barcode: "" }, "BARCODE_TYPE"],
  ["null query", null, "CANONICAL_QUERY"],
  ["missing query", undefined, "CANONICAL_QUERY"],
])
  test("canonical invalid query " + name, () => {
    const r = {
      canonicalization_version: "catalog-request-v1",
      operation_id: "listCatalogProducts",
      method: "GET",
      path: "/api/v1/catalog/products",
      query,
      body: null,
      idempotency_key: null,
    };
    if (query === undefined) delete r.query;
    assert.throws(
      () => normalizedRequest(r, policy),
      (e) => e instanceof assert.AssertionError && e.message.includes(reason),
    );
  });

const semanticFixture = (name) =>
  read("catalog/fixtures/semantics/v1/" + name + ".json");
const rejects = (fn, reason) =>
  assert.throws(
    fn,
    (e) => e instanceof assert.AssertionError && e.message.includes(reason),
  );
for (const [name, paths] of [
  [
    "cursor-valid",
    [
      "bound.organization_id",
      "bound.filters",
      "bound.limit",
      "presented.organization_id",
      "presented.filters",
      "presented.limit",
      "signature_verified",
      "version_supported",
      "authority_current",
      "now",
      "issued",
      "expires",
    ],
  ],
  [
    "replay-exact",
    [
      "effects_before",
      "effects_after",
      "authority_current",
      "original.request",
      "original.status",
      "original.body",
      "original.location",
      "original.version",
      "replay.request",
      "replay.status",
      "replay.body",
      "replay.location",
      "replay.version",
    ],
  ],
  [
    "product-active-tax-step-up",
    [
      "body",
      "product.status",
      "product.version",
      "product.tax_classification",
      "ever_activated",
      "base_ever_activated",
      "base_presentation",
      "presentation_count",
      "tax_supported",
      "step_up_remaining_ms",
    ],
  ],
  [
    "lookup-barcode-valid",
    [
      "query_pairs",
      "barcode",
      "barcode.organization_id",
      "presentation",
      "result",
      "result.default_variant",
    ],
  ],
])
  for (const field of paths)
    for (const invalid of ["absent", "wrong-type"])
      test(
        "semantic context " + name + " " + field + " " + invalid,
        async () => {
          const f = await semanticFixture(name),
            parts = field.split("."),
            key = parts.pop();
          let target = f.context;
          for (const part of parts) target = target[part];
          if (invalid === "absent") delete target[key];
          else target[key] = field === "query_pairs" ? {} : [];
          rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
        },
      );
test("empty semantic barcode cannot bypass lookup", async () => {
  const f = await semanticFixture("lookup-barcode-valid");
  f.context.query_pairs = [["barcode", ""]];
  rejects(() => validateSemantic(f), "BARCODE_TYPE");
});
test("empty replay cannot pass by undefined equality", () =>
  rejects(
    () =>
      validateSemantic({
        kind: "replay",
        context: { authority_current: true, original: {}, replay: {} },
      }),
    "SEMANTIC_CONTEXT_FIELD",
  ));
test("cursor binding cannot omit scope on both sides", async () => {
  const f = await semanticFixture("cursor-valid");
  delete f.context.bound.organization_id;
  delete f.context.presented.organization_id;
  rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
});
test("cursor nested scope cannot disappear from replayed request", async () => {
  const f = await semanticFixture("cursor-valid");
  delete f.context.presented.presentation_id;
  rejects(() => validateSemantic(f), "CURSOR_BINDING");
});
test("generic cursor does not require a presentation scope", async () => {
  const f = await semanticFixture("cursor-valid");
  delete f.context.bound.presentation_id;
  delete f.context.presented.presentation_id;
  validateSemantic(f);
});
test("active prior product cannot have null tax", async () => {
  const f = await semanticFixture("product-active-tax-step-up");
  f.context.product.tax_classification = null;
  rejects(() => validateSemantic(f), "PRODUCT_CONTEXT_ACTIVE_TAX");
});
for (const [status, ever] of [
  ["active", false],
  ["inactive", false],
  ["draft", true],
])
  test("prior lifecycle rejects " + status + " history " + ever, async () => {
    const f = await semanticFixture("product-active-tax-step-up");
    f.context.body = { expected_version: 1, name: "Nuevo" };
    f.context.product.status = status;
    f.context.ever_activated = ever;
    rejects(() => validateSemantic(f), "ENTITY_HISTORY");
  });
test("type remains fixed after activation in a valid inactive context", async () => {
  const f = await semanticFixture("product-active-tax-step-up");
  f.context.product.status = "inactive";
  f.context.body = { expected_version: 1, type: "SERVICE" };
  rejects(() => validateSemantic(f), "TYPE_AFTER_ACTIVATION");
});
test("active tax fixture starts with a classified previously activated product", async () => {
  const f = await semanticFixture("product-active-tax-step-up");
  validateSemantic(f);
  assert(f.context.product.tax_classification);
  assert.equal(f.context.ever_activated, true);
  assert.equal(f.context.base_presentation.status, "active");
  assert.equal(f.context.base_ever_activated, true);
});
const replayPair = () => {
  const original = {
    status: "201",
    media_type: "application/json",
    schema_pointer: "/schema",
    body: { name: "Producto", version: 1 },
    headers: {
      "Idempotency-Replayed": false,
      ETag: '"v1"',
      "Cache-Control": "no-store",
      Location: "/api/v1/catalog/products/synthetic",
    },
  };
  const replay = structuredClone(original);
  replay.headers["Idempotency-Replayed"] = true;
  return [original, replay];
};
test("HTTP pair preserves result while flipping only replay indicator", () =>
  validateReplayPair(...replayPair()));
for (const [field, value, reason] of [
  ["body.name", "Otro", "HTTP_REPLAY_RESULT"],
  ["body.version", 2, "HTTP_REPLAY_RESULT"],
  ["status", "200", "HTTP_REPLAY_RESULT"],
  ["schema_pointer", "/other", "HTTP_REPLAY_RESULT"],
  ["media_type", "other", "HTTP_REPLAY_RESULT"],
  ["headers.ETag", '"v2"', "HTTP_REPLAY_HEADERS"],
  ["headers.Location", "/different", "HTTP_REPLAY_HEADERS"],
  ["headers.Cache-Control", "public", "HTTP_REPLAY_HEADERS"],
  ["headers.Idempotency-Replayed", false, "HTTP_REPLAY_INDICATOR"],
])
  test("HTTP replay rejects altered " + field, () => {
    const pair = replayPair(),
      parts = field.split("."),
      key = parts.pop();
    let target = pair[1];
    for (const part of parts) target = target[part];
    target[key] = value;
    rejects(() => validateReplayPair(...pair), reason);
  });
for (const field of [
  "status",
  "media_type",
  "schema_pointer",
  "body",
  "headers",
])
  test("HTTP replay requires " + field, () => {
    const pair = replayPair();
    delete pair[0][field];
    delete pair[1][field];
    rejects(() => validateReplayPair(...pair), "HTTP_REPLAY_REQUIRED");
  });

for (const name of ["product-base-unit-draft", "presentation-name-edit"]) {
  for (const [field, reason] of [
    ["organization_id", "PRESENTATION_CONTEXT_TENANT"],
    ["product_id", "PRESENTATION_CONTEXT_PRODUCT"],
    ["variant_id", "PRESENTATION_CONTEXT_VARIANT"],
  ])
    test("owner link " + name + " rejects other " + field, async () => {
      const f = await semanticFixture(name),
        presentation = f.context.base_presentation ?? f.context.presentation;
      presentation[field] =
        field === "organization_id"
          ? "other-organization"
          : "01998d00-0000-7000-8000-000000000099";
      rejects(() => validateSemantic(f), reason);
    });
  for (const field of [
    "product_id",
    "organization_id",
    "default_variant",
    "base_presentation_id",
  ])
    test("owner record " + name + " requires " + field, async () => {
      const f = await semanticFixture(name);
      delete f.context.product[field];
      rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
    });
  for (const field of [
    "presentation_id",
    "product_id",
    "variant_id",
    "organization_id",
    "unit_code",
    "conversion_factor",
  ])
    test("presentation record " + name + " requires " + field, async () => {
      const f = await semanticFixture(name),
        presentation = f.context.base_presentation ?? f.context.presentation;
      delete presentation[field];
      rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
    });
  for (const field of ["variant_id", "base_unit"])
    test("owner variant " + name + " requires " + field, async () => {
      const f = await semanticFixture(name);
      delete f.context.product.default_variant[field];
      rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
    });
  test("owner missing on both sides cannot pass " + name, async () => {
    const f = await semanticFixture(name),
      presentation = f.context.base_presentation ?? f.context.presentation;
    delete f.context.product.organization_id;
    delete presentation.organization_id;
    rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD");
  });
  test("equivalent factor-one decimal allowed " + name, async () => {
    const f = await semanticFixture(name);
    (f.context.base_presentation ?? f.context.presentation).conversion_factor =
      "1.000000";
    validateSemantic(f);
  });
}
for (const [field, value, reason] of [
  ["is_base", false, "PRESENTATION_CONTEXT_BASE_FLAG"],
  ["product_status", "inactive", "PRESENTATION_CONTEXT_PRODUCT_STATUS"],
  ["base_unit", "m", "PRESENTATION_CONTEXT_BASE_UNIT"],
])
  test("presentation owner prevents forged " + field, async () => {
    const f = await semanticFixture("presentation-name-edit");
    f.context[field] = value;
    rejects(() => validateSemantic(f), reason);
  });
test("presentation edit requires complete product owner", async () => {
  const f = await semanticFixture("presentation-name-edit");
  delete f.context.product;
  rejects(() => validateSemantic(f), "SEMANTIC_CONTEXT_FIELD:product");
});
test("non-base presentation may keep its own conversion factor", async () => {
  const f = await semanticFixture("presentation-name-edit");
  f.context.is_base = false;
  f.context.presentation.presentation_id =
    "01998d00-0000-7000-8000-000000000006";
  f.context.presentation.conversion_factor = "12";
  validateSemantic(f);
});
test("non-base presentation cannot be labeled as base", async () => {
  const f = await semanticFixture("presentation-name-edit");
  f.context.presentation.presentation_id =
    "01998d00-0000-7000-8000-000000000006";
  rejects(() => validateSemantic(f), "PRESENTATION_CONTEXT_BASE_FLAG");
});
