import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { read, root } from "../../scripts/catalog/validate-security-v1.mjs";
import {
  normalizePriceBody,
  validatePriceReplayHeaders,
  priceOwner,
  normalizedPriceRequest,
  instant,
  priceRecord,
  definitions,
} from "../../scripts/catalog/pricing-http-v1-common.mjs";
import { validatePriceSemantic } from "../../scripts/catalog/pricing-http-v1-semantics.mjs";
import { apiFiles } from "../../scripts/catalog/validate-http-v1.mjs";
import {
  manifestFile,
  cHashes,
} from "../../scripts/catalog/validate-pricing-http-v1.mjs";
import {
  hash,
  jcs,
  loadJSON,
} from "../../scripts/catalog/security-v1-common.mjs";
const manifest = await read(manifestFile),
  policy = await read("catalog/http/shared/v1/catalog-security-policy-v1.json");
const fixture = (name) =>
  read("catalog/fixtures/pricing/v1/semantics/" + name + ".json");
const rejects = (fn, reason) =>
  assert.throws(
    fn,
    (e) => e instanceof assert.AssertionError && e.message.includes(reason),
  );
for (const row of manifest.semantic_cases)
  test("price owner fixture " + row.id, async () => {
    const f = await read(row.fixture);
    if (row.expected === "accept") validatePriceSemantic(f, policy);
    else rejects(() => validatePriceSemantic(f, policy), row.reason);
  });
for (const amount of ["0.01", "1", "10.00", "999999999999.99"])
  test("price positive exact amount " + amount, () => {
    assert.equal(
      normalizePriceBody("createPresentationPrice", {
        amount,
        expected_version: 0,
      }).expected_version,
      0,
    );
  });
for (const amount of [
  "0",
  "0.0",
  "0.00",
  "-1",
  "+1",
  "1e2",
  "01",
  "1.001",
  "10.000",
  "1000000000000",
  "1,50",
  "1.",
  " 1",
  "1 ",
  1,
  null,
  {},
  [],
])
  test("price invalid amount " + JSON.stringify(amount), () =>
    rejects(
      () =>
        normalizePriceBody("createPresentationPrice", {
          amount,
          expected_version: 0,
        }),
      "DECIMAL_",
    ),
  );
for (const v of [-1, "0", null, Infinity, NaN, 9007199254740992])
  test("price invalid expected version " + String(v), () =>
    rejects(
      () =>
        normalizePriceBody("createPresentationPrice", {
          amount: "1",
          expected_version: v,
        }),
      "PRICE_EXPECTED_VERSION",
    ),
  );
for (const key of [
  "organization_id",
  "account_id",
  "presentation_id",
  "price_list_id",
  "currency",
  "valid_from",
  "valid_to",
  "version",
  "status",
])
  test("price rejects client-owned " + key, () =>
    rejects(
      () =>
        normalizePriceBody("createPresentationPrice", {
          amount: "1",
          expected_version: 0,
          [key]: "free",
        }),
      "PRICE_REQUEST_FIELDS",
    ),
  );
for (const key of ["amount", "expected_version"])
  test("price request requires " + key, () => {
    const b = { amount: "1", expected_version: 0 };
    delete b[key];
    rejects(
      () => normalizePriceBody("createPresentationPrice", b),
      "PRICE_REQUEST_FIELDS",
    );
  });
for (const op of Object.keys(definitions).filter((k) => !definitions[k][0]))
  test("price GET requires null body " + op, () => {
    assert.equal(normalizePriceBody(op, null), null);
    rejects(() => normalizePriceBody(op, {}), "GET_BODY");
  });
test("price scale is validated before normalization/hash", async () => {
  const f = await fixture("first-price"),
    a = f.context.request,
    b = structuredClone(a);
  b.body.amount = "10.00";
  assert.equal(
    normalizedPriceRequest(a, policy).hash,
    normalizedPriceRequest(b, policy).hash,
  );
  b.body.amount = "10.000";
  rejects(() => normalizedPriceRequest(b, policy), "DECIMAL_FORMAT_OR_SCALE");
});
test("price JSON duplicate key rejected before canonicalization", () =>
  assert.throws(
    () => loadJSON('{"amount":"1","amount":"2","expected_version":0}'),
    /duplicate|duplicad/i,
  ));
for (const [key, value] of [
  ["query", null],
  ["query", []],
  ["query", { sort: "version" }],
  ["signal", "v1.synthetic"],
  ["organization_id", "other"],
])
  test(
    "price canonical rejects malformed/free field " +
      key +
      JSON.stringify(value),
    async () => {
      const { context: c } = await fixture("first-price");
      c.request[key] = value;
      assert.throws(
        () => normalizedPriceRequest(c.request, policy),
        assert.AssertionError,
      );
    },
  );
test("UTC comparison preserves PostgreSQL microseconds", () => {
  assert.equal(
    instant("2026-10-15T10:00:00.000002Z") -
      instant("2026-10-15T10:00:00.000001Z"),
    1n,
  );
  assert.equal(
    instant("2026-10-15T10:00:00Z"),
    instant("2026-10-15T10:00:00.000000Z"),
  );
});
for (const stamp of [
  "2026-02-30T10:00:00Z",
  "2026-10-15T25:00:00Z",
  "2026-10-15T10:00:00+00:00",
  "2026-10-15T10:00:00.0000001Z",
  "2026-10-15",
  null,
])
  test("invalid price instant " + stamp, () =>
    rejects(() => instant(stamp), "PRICE_INSTANT"),
  );
test("price interval includes lower and excludes upper bound", async () => {
  const f = await fixture("historical-price-get");
  priceRecord(f.context.result);
  const end = instant(f.context.result.valid_to);
  assert(instant(f.context.result.valid_from) < end);
  assert.equal(end, instant(f.context.history[0].valid_from));
});
for (const [name, fields] of [
  [
    "replace-price",
    [
      "organization_id",
      "product",
      "product.organization_id",
      "product.product_id",
      "product.status",
      "product.version",
      "product.default_variant",
      "product.default_variant.variant_id",
      "presentation",
      "presentation.organization_id",
      "presentation.presentation_id",
      "presentation.product_id",
      "presentation.variant_id",
      "list",
      "list_after",
      "request",
      "before_history",
      "after_history",
      "result",
      "written_at",
      "product_after",
      "presentation_after",
      "previous_etag",
      "closed_etag",
      "authority_current",
    ],
  ],
  [
    "history-cursor",
    [
      "bound.organization_id",
      "presented.organization_id",
      "bound.presentation_id",
      "presented.presentation_id",
      "bound.price_list_id",
      "presented.price_list_id",
      "bound.limit",
      "presented.limit",
      "bound.filters",
      "presented.filters",
      "bound.before_version",
      "presented.before_version",
      "signature_verified",
      "version_supported",
      "issued_at",
      "expires_at",
      "read_at",
    ],
  ],
  [
    "replay-after-replacement",
    [
      "original",
      "replay",
      "original_request",
      "replay_request",
      "history_before",
      "history_after",
      "list_after",
      "original_at",
      "replayed_at",
      "authority_current",
    ],
  ],
])
  for (const field of fields)
    for (const mode of ["absent", "wrong-type"])
      test(
        "price complete context " + name + " " + field + " " + mode,
        async () => {
          const f = await fixture(name);
          const keys = field.split("."),
            k = keys.pop();
          let p = f.context;
          for (const n of keys) p = p[n];
          if (mode === "absent") delete p[k];
          else p[k] = Array.isArray(p[k]) ? {} : [];
          rejects(() => validatePriceSemantic(f, policy), "PRICE_CONTEXT");
        },
      );
for (const key of ["organization_id", "product_id", "variant_id"])
  test("price owner cross-record binding " + key, async () => {
    const f = await fixture("replace-price");
    f.context.presentation[key] =
      key === "organization_id"
        ? "other"
        : "01998d00-0000-7000-8000-000000000199";
    rejects(() => validatePriceSemantic(f, policy), "PRICE_OWNER_");
  });
test("missing tenant on both records cannot pass by undefined equality", async () => {
  const f = await fixture("replace-price");
  delete f.context.product.organization_id;
  delete f.context.presentation.organization_id;
  rejects(() => validatePriceSemantic(f, policy), "PRICE_CONTEXT");
});
for (const key of ["valid_from", "valid_to", "amount", "version", "price_id"])
  test(
    "replay preserves captured " + key + " after history closes",
    async () => {
      const f = await fixture("replay-after-replacement");
      const b = f.context.replay.body;
      b[key] =
        key === "version"
          ? b[key] + 1
          : key === "valid_to"
            ? "2026-10-15T10:03:00Z"
            : key === "valid_from"
              ? "2026-10-15T10:02:00Z"
              : key === "amount"
                ? "11"
                : "01998d00-0000-7000-8000-000000000199";
      rejects(() => validatePriceSemantic(f, policy), "HTTP_REPLAY_RESULT");
    },
  );
test("same instant cannot create an empty historical interval", async () => {
  const f = await fixture("replace-price"),
    c = f.context;
  c.result.valid_from = c.before_history[0].valid_from;
  c.written_at = c.result.valid_from;
  c.after_history[0].valid_from = c.result.valid_from;
  c.after_history[1].valid_to = c.result.valid_from;
  rejects(() => validatePriceSemantic(f, policy), "PRICE_INTERVAL");
});
test("replay may return open captured price after its persisted record closes", async () => {
  const f = await fixture("replay-after-replacement");
  assert.equal(f.context.original.body.valid_to, null);
  assert.notEqual(f.context.history_before[1].valid_to, null);
  validatePriceSemantic(f, policy);
});
test("default list creation never mutates product/presentation or their versions", async () => {
  const f = await fixture("first-price");
  validatePriceSemantic(f, policy);
  assert.deepEqual(f.context.product, f.context.product_after);
  assert.deepEqual(f.context.presentation, f.context.presentation_after);
});
for (const surface of ["public", "private"])
  test(
    "25 source operations and preserved C selectors " + surface,
    async () => {
      const api = parse(
        await readFile(path.join(root, apiFiles[surface]), "utf8"),
      );
      const paths = Object.fromEntries(
        Object.entries(api.paths).filter(([p]) => p.startsWith("/catalog/")),
      );
      assert.equal(hash(jcs(paths)), cHashes[surface]);
      const discovered = Object.entries(api.paths).flatMap(([p, ms]) =>
        Object.entries(ms).map(([method, o]) => [
          o.operationId,
          method.toUpperCase(),
          "/api/v1" + p,
        ]),
      );
      assert.deepEqual(
        discovered.sort(),
        policy.operations.map((o) => [o.operation_id, o.method, o.path]).sort(),
      );
    },
  );

test("same amount with a new key still creates the next price version", async () => {
  const f = await fixture("replace-price"),
    c = f.context;
  c.request.body.amount = c.before_history[0].amount;
  c.result.amount = c.request.body.amount;
  c.after_history[0].amount = c.request.body.amount;
  validatePriceSemantic(f, policy);
  assert.equal(c.result.version, c.before_history[0].version + 1);
});
test("empty initialized history is an explicit empty page", async () => {
  const f = await fixture("history-page");
  f.context.page.items = [];
  validatePriceSemantic(f, policy);
});
test("discontinuation does not erase historical price reads", async () => {
  const f = await fixture("historical-price-get");
  f.context.product.status = "discontinued";
  validatePriceSemantic(f, policy);
});

for (const which of ["original", "replay"]) {
  for (const key of [
    "Cache-Control",
    "ETag",
    "Idempotency-Replayed",
    "Location",
  ]) {
    for (const mode of ["missing", "wrong-type"])
      test(
        "replay requires typed " + which + "." + key + " " + mode,
        async () => {
          const f = await fixture("replay-after-replacement");
          if (mode === "missing") delete f.context[which].headers[key];
          else
            f.context[which].headers[key] =
              key === "Idempotency-Replayed" ? "true" : 42;
          rejects(
            () => validatePriceSemantic(f, policy),
            "PRICE_CONTEXT:replay.headers." + key,
          );
        },
      );
  }
}
for (const etag of [
  "unquoted",
  '"contains space"',
  '"line\nbreak"',
  "",
  null,
  42,
])
  test("replay rejects invalid ETag " + JSON.stringify(etag), async () => {
    const { context: c } = await fixture("replay-after-replacement");
    c.original.headers.ETag = etag;
    assert.throws(
      () => validatePriceReplayHeaders(c.original.headers),
      assert.AssertionError,
    );
  });
test("replay accepts an opaque valid ETag using common schema", async () => {
  const { context: c } = await fixture("replay-after-replacement");
  c.original.headers.ETag = '"opaque-123"';
  validatePriceReplayHeaders(c.original.headers);
});
test("price cannot precede list creation by one microsecond", async () => {
  const { context: c } = await fixture("first-price");
  c.list_after.created_at = "2026-10-15T10:00:00.000002Z";
  c.list_after.updated_at = c.list_after.created_at;
  rejects(() => priceOwner(c.result, c, c.list_after), "PRICE_LIST_PRICE_TIME");
});
test("price may share the atomic list creation instant", async () => {
  const { context: c } = await fixture("first-price");
  priceOwner(c.result, c, c.list_after);
});
test("chronology compares equivalent fractional timestamp representations", async () => {
  const { context: c } = await fixture("first-price");
  c.result.valid_from = "2026-10-15T10:00:00Z";
  c.list_after.created_at = "2026-10-15T10:00:00.000000Z";
  priceOwner(c.result, c, c.list_after);
});

for (const [name, field, reason] of [
  ["current-price", "read_at", "PRICE_CURRENT_FUTURE"],
  ["historical-price-get", "read_at", "PRICE_GET_FUTURE"],
  ["history-page", "read_at", "PRICE_HISTORY_FUTURE"],
  ["history-continuation", "read_at", "PRICE_HISTORY_FUTURE"],
  ["replay-after-replacement", "replayed_at", "PRICE_REPLAY_HISTORY_FUTURE"],
]) {
  for (const [offset, time] of [
    [-1, "2026-10-15T10:00:01.000001Z"],
    [0, "2026-10-15T10:00:01.000002Z"],
    [1, "2026-10-15T10:00:01.000003Z"],
  ])
    test(
      "persisted history observation boundary " + name + " " + offset + "us",
      async () => {
        const f = await fixture(name);
        f.context[field] = time;
        if (offset < 0) rejects(() => validatePriceSemantic(f, policy), reason);
        else validatePriceSemantic(f, policy);
      },
    );
}
