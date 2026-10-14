import test from "node:test";
import assert from "node:assert/strict";

import {
  jcs,
  decimal,
  text,
  sku,
  query,
  requestBytes,
  requestHash,
  validateAuthorityFixture,
  loadJSON,
} from "../../scripts/catalog/security-v1-common.mjs";
import {
  read,
  validatePolicy,
  validateCatalog,
  validateProblem,
  selectSchema,
} from "../../scripts/catalog/validate-security-v1.mjs";
const policy = await read(
  "catalog/http/shared/v1/catalog-security-policy-v1.json",
);
const semantic = await read(
  "identity/fixtures/catalog-authority/v1/catalog-authority-semantic-v1-fixtures.json",
);
for (const row of semantic.cases)
  test(row.id, async () => {
    const value = await read(row.fixture);
    if (row.expected === "accept") validateAuthorityFixture(value, policy);
    else
      assert.throws(
        () => validateAuthorityFixture(value, policy),
        (e) =>
          e instanceof assert.AssertionError && e.message.includes(row.reason),
      );
  });
function normalizedFixture(value) {
  const result = structuredClone(value);
  if (result.body?.name) result.body.name = text(result.body.name, 160);
  if (result.body?.default_variant?.sku)
    result.body.default_variant.sku = sku(result.body.default_variant.sku);
  if (result.body?.amount)
    result.body.amount = decimal(result.body.amount, 2, true);
  return result;
}
const vectors = (
  await read("catalog/fixtures/request/v1/catalog-request-v1-vectors.json")
).vectors;
for (const vector of vectors)
  test("canonical " + vector.id, () => {
    const normalized = normalizedFixture(vector.input);
    assert.deepEqual(normalized, vector.normalized);
    assert.equal(requestBytes(normalized, policy), vector.canonical_utf8);
    assert.equal(requestHash(normalized, policy), vector.sha256);
  });
test("equivalent NFC/SKU/price/query vectors and distinct omission/null/default", () => {
  const by = (id) => vectors.find((v) => v.id === id).sha256;
  for (const [a, b] of [
    ["product-nfc-uppercase", "product-nfc-lowercase"],
    ["price-short", "price-trailing-zeros"],
    ["query-cursor", "query-reversed"],
  ])
    assert.equal(by(a), by(b));
  assert.notEqual(by("default-omitted"), by("default-present"));
  assert.notEqual(by("patch-omitted"), by("patch-null"));
});
test("each public binding dimension changes digest", () => {
  const original = structuredClone(
    vectors.find((v) => v.id === "patch-omitted").normalized,
  );
  const baseline = requestHash(original, policy);
  for (const change of [
    (v) => (v.path = v.path.replace(/1$/, "2")),
    (v) => (v.body.name = "Other"),
    (v) => (v.idempotency_key = v.idempotency_key.replace(/1$/, "2")),
  ]) {
    const v = structuredClone(original);
    change(v);
    assert.notEqual(requestHash(v, policy), baseline);
  }
  const op = policy.operations.find(
    (o) => o.operation_id === "getCatalogProduct",
  );
  const get = {
    ...original,
    method: op.method,
    operation_id: op.operation_id,
    body: null,
    idempotency_key: null,
  };
  assert.notEqual(requestHash(get, policy), baseline);
});
for (const [name, change, reason] of [
  [
    "profile",
    (v) => (v.canonicalization_version = "catalog-request-v2"),
    "CANONICAL_VERSION",
  ],
  ["extra", (v) => (v.cookie = "forbidden"), "CANONICAL_FIELDS"],
  ["missing", (v) => delete v.body, "CANONICAL_FIELDS"],
  [
    "private-path",
    (v) => (v.path = "/api/v1/internal/catalog/products"),
    "CANONICAL_PATH",
  ],
  ["method", (v) => (v.method = "GET"), "CANONICAL_METHOD"],
  [
    "unknown-operation",
    (v) => (v.operation_id = "invented"),
    "CANONICAL_OPERATION",
  ],
  [
    "unknown-query",
    (v) => (v.query = { tenant: "freely-chosen" }),
    "QUERY_UNKNOWN_OR_DUPLICATE",
  ],
  ["idempotency", (v) => (v.idempotency_key = null), "CANONICAL_KEY"],
])
  test("reject canonical " + name, () => {
    const v = structuredClone(vectors[0].normalized);
    change(v);
    assert.throws(() => requestBytes(v, policy), new RegExp(reason));
  });
test("query repeated/unknown and mutually exclusive selectors rejected", () => {
  const op = policy.operations.find(
    (o) => o.operation_id === "listCatalogProducts",
  );
  assert.throws(
    () =>
      query(
        [
          ["limit", "50"],
          ["limit", "50"],
        ],
        op,
      ),
    /QUERY_UNKNOWN_OR_DUPLICATE/,
  );
  assert.throws(
    () => query([["unknown", "x"]], op),
    /QUERY_UNKNOWN_OR_DUPLICATE/,
  );
  assert.throws(
    () =>
      query(
        [
          ["sku", "abc"],
          ["plu", "01"],
        ],
        op,
      ),
    /QUERY_SEARCH_SELECTORS/,
  );
  assert.throws(
    () =>
      query(
        [
          ["q", "name"],
          ["plu", "01"],
        ],
        op,
      ),
    /QUERY_SEARCH_SELECTORS/,
  );
  assert.deepEqual(query([["sku", "abc-1"]], op), { sku: "ABC-1" });
});
test("duplicate raw JSON names rejected including escaped and nested names", () => {
  for (const raw of [
    '{"name":1,"name":2}',
    '{"name":1,"na\\u006de":2}',
    '{"outer":{"key":1,"key":2}}',
  ])
    assert.throws(() => loadJSON(raw), /Duplicate JSON key/);
});
test("JCS uses UTF-16 sorted names, array order and ECMAScript numeric primitives", () => {
  assert.equal(
    jcs({ 2: 2, 10: 10, a: [true, null, "x"] }),
    '{"10":10,"2":2,"a":[true,null,"x"]}',
  );
  assert.equal(
    jcs([333333333.33333329, 1e30, 4.5, 2e-3, 1e-27]),
    "[333333333.3333333,1e+30,4.5,0.002,1e-27]",
  );
  assert.equal(
    jcs({ "\u20ac": 1, "\ud83d\ude00": 2, "\ufffd": 3 }),
    '{"€":1,"😀":2,"�":3}',
  );
});
test("JCS fails closed for nonfinite numbers, lone surrogates and non-JSON", () => {
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    () => {},
    new Date(),
    "\udead",
    { key: "\ud800" },
  ])
    assert.throws(() => jcs(value));
  assert.throws(() => jcs(loadJSON('{"n":1e400}')), /JCS_NONFINITE_NUMBER/);
});
test("precision checked before decimal normalization, no exponent/number/range coercion", () => {
  assert.equal(decimal("10.00", 2, true), "10");
  assert.equal(decimal("0.001", 3), "0.001");
  for (const v of ["10.000", "01", "-1", "1e2", "1,00", "1000000000000", 10])
    assert.throws(() => decimal(v, 2), /DECIMAL_FORMAT_OR_SCALE/);
  assert.throws(() => decimal("0.0", 2, true), /DECIMAL_MUST_BE_POSITIVE/);
  assert.throws(() => decimal("1.0", 0), /DECIMAL_FORMAT_OR_SCALE/);
});
test("text NFC Unicode bounds and description line breaks", () => {
  assert.equal(text("Cafe\u0301", 4), "Café");
  assert.equal(text("😀", 1), "😀");
  assert.throws(() => text(" name ", 160), /TEXT_BOUNDS/);
  assert.throws(() => text("a\nb", 80), /TEXT_CONTROL/);
  assert.equal(text("a\nb", 1000, true), "a\nb");
  assert.throws(() => text("a\u0000b", 1000, true), /TEXT_CONTROL/);
});
test("matrix mutation, omission and additional port fail for intended invariant", () => {
  for (const change of [
    (p) => p.operations.pop(),
    (p) => (p.operations[0].permission = "catalog.manage"),
    (p) => p.operations.push(p.operations[0]),
  ]) {
    const p = structuredClone(policy);
    change(p);
    assert.throws(() => validatePolicy(p), /APPROVED_A_MATRIX/);
  }
  const p = structuredClone(policy);
  p.ports.pop();
  assert.throws(() => validatePolicy(p), /PRIVATE_PORT_MATRIX/);
});
test("policy approved values remain valid without mutating the input", () => {
  const input = structuredClone(policy);
  validatePolicy(input);
  assert.deepEqual(input, policy);
});

function rejectedPolicy(change, reason) {
  const input = structuredClone(policy);
  change(input);
  assert.throws(
    () => validatePolicy(input),
    (e) => e instanceof assert.AssertionError && e.message.includes(reason),
  );
}

for (const [name, change] of [
  ["changed", (p) => (p.canonicalization_version = "catalog-request-v2")],
  ["wrong-type", (p) => (p.canonicalization_version = 1)],
  ["null", (p) => (p.canonicalization_version = null)],
  ["missing", (p) => delete p.canonicalization_version],
])
  test("policy canonicalization rejects " + name, () =>
    rejectedPolicy(change, "POLICY_CANONICALIZATION"),
  );

for (const [block, reason] of [
  ["public_security", "PUBLIC_POLICY"],
  ["budgets", "POLICY_BUDGETS"],
]) {
  for (const [field, value] of Object.entries(policy[block])) {
    for (const [name, change] of [
      [
        "changed",
        (p) => {
          p[block][field] =
            typeof value === "boolean"
              ? !value
              : typeof value === "number"
                ? value + 1
                : "other";
        },
      ],
      [
        "wrong-type",
        (p) => {
          p[block][field] = typeof value === "string" ? 123 : String(value);
        },
      ],
      ["missing", (p) => delete p[block][field]],
    ])
      test("policy " + block + "." + field + " rejects " + name, () =>
        rejectedPolicy(change, reason),
      );
  }
  for (const [name, change] of [
    ["missing-block", (p) => delete p[block]],
    ["null-block", (p) => (p[block] = null)],
    ["array-block", (p) => (p[block] = [])],
    ["string-block", (p) => (p[block] = "not-object")],
    ["empty-block", (p) => (p[block] = {})],
    ["extra-rule", (p) => (p[block].extra_rule = true)],
  ])
    test("policy " + block + " rejects " + name, () =>
      rejectedPolicy(change, reason),
    );
}

test("published catalog entries and problem schema unchanged by successor", async () => {
  const [oldCatalog, catalog, oldProblem, problem] = await Promise.all(
    [
      "errors/error-catalog-v5.json",
      "common/errors/v6/error-catalog-v6.json",
      "openapi/problem-details-v2.schema.json",
      "common/http/shared/v3/problem-details-v3.schema.json",
    ].map(read),
  );
  validateCatalog(oldCatalog, catalog, oldProblem, problem);
  const modified = structuredClone(catalog);
  modified.errors[0].retryable_by_default = true;
  assert.throws(
    () => validateCatalog(oldCatalog, modified, oldProblem, problem),
    /PUBLISHED_ERRORS_CHANGED/,
  );
  const weakened = structuredClone(problem);
  weakened.additionalProperties = true;
  assert.throws(
    () => validateCatalog(oldCatalog, catalog, oldProblem, weakened),
    /PROBLEM_SUCCESSOR_ONLY_ADDITIVE/,
  );
  const wrong = structuredClone(catalog);
  wrong.errors.find((e) => e.code === "catalog_delegation_invalid").statuses = [
    403,
  ];
  assert.throws(
    () => validateCatalog(oldCatalog, wrong, oldProblem, problem),
    /ERROR_STATUS/,
  );
});
test("Problem status/type/retry/code mismatches rejected", async () => {
  const catalog = await read("common/errors/v6/error-catalog-v6.json");
  const base = await read(
    "identity/fixtures/catalog-authority/v1/examples/problem-catalog_delegation_invalid.json",
  );
  validateProblem(base, 401, catalog);
  for (const [change, reason] of [
    [(p) => (p.status = 403), "PROBLEM_STATUS"],
    [(p) => (p.type = "urn:wrong"), "PROBLEM_TYPE"],
    [(p) => (p.retryable = true), "PROBLEM_RETRY"],
    [(p) => (p.code = "unknown"), "PROBLEM_CODE"],
    [(p) => (p.detail = "cookie"), "PROBLEM_PRIVACY"],
  ]) {
    const p = structuredClone(base);
    change(p);
    assert.throws(() => validateProblem(p, 401, catalog), new RegExp(reason));
  }
});

test("schema root selection does not introduce recursive root reference", () => {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    $defs: { Value: { type: "string" } },
  };
  assert.deepEqual(selectSchema(schema, ""), schema);
  assert(!Object.hasOwn(selectSchema(schema, ""), "$ref"));
  assert.equal(selectSchema(schema, "/$defs/Value").$ref, "#/$defs/Value");
  assert.throws(
    () => selectSchema(schema, "/$defs/Missing"),
    /SCHEMA_CASE_POINTER/,
  );
});

test("JCS rejects sparse arrays and arrays with extra named members", () => {
  assert.throws(() => jcs(Array(2)), /JCS_NOT_JSON_ARRAY/);
  const array = ["value"];
  array.extra = "not-JSON";
  assert.throws(() => jcs(array), /JCS_NOT_JSON_ARRAY/);
});

test("compatible extensions in authority response and reference objects are ignored", async () => {
  const fixture = await read(
    "identity/fixtures/catalog-authority/v1/semantic/authority-context-valid.json",
  );
  fixture.response.new_optional = 123;
  fixture.response.account.new_optional = 123;
  fixture.response.membership.new_optional = { future: true };
  fixture.response.scope.new_optional = true;
  validateAuthorityFixture(fixture, policy);
});

test("known reference or version changes still fail despite compatible extensions", async () => {
  const fixture = await read(
    "identity/fixtures/catalog-authority/v1/semantic/authority-context-valid.json",
  );
  fixture.response.membership.new_optional = true;
  fixture.response.membership.version = "other";
  assert.throws(
    () => validateAuthorityFixture(fixture, policy),
    /CURRENT_REFERENCE_VERSION/,
  );
});
