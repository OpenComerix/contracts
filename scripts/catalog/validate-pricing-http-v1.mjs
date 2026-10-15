import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { root, read, at, selectSchema } from "./validate-security-v1.mjs";
import {
  apiFiles,
  validateHttpApi,
  extractHttpSchema,
  writeHttpCases,
} from "./validate-http-v1.mjs";
import {
  profile,
  prices,
  normalizePriceBody,
} from "./pricing-http-v1-common.mjs";
import { validatePriceSemantic } from "./pricing-http-v1-semantics.mjs";
import { hash, jcs, loadJSON } from "./security-v1-common.mjs";
export const manifestFile =
  "catalog/fixtures/pricing/v1/pricing-http-v1-fixtures.json";
export const cHashes = {
  public: "9b95d6a31f21d306fa427325d9e92b2e4b336029d96b0df088f13ca0a093e9fe",
  private: "85f619075d779164d670ea900fafaab66d6784df62ebafedc1e352456ab2dcee",
};
const esc = (v) => v.replaceAll("~", "~0").replaceAll("/", "~1");
export function validatePriceApi(
  api,
  source,
  policy,
  manifest,
  surface,
  catalog,
) {
  assert.equal(manifest.format_version, 1, "D_MANIFEST_FORMAT");
  assert.equal(manifest.scope, "F1-07D", "D_MANIFEST_SCOPE");
  assert.deepEqual(manifest.c_source_hashes, cHashes, "C_SOURCE_BASE");
  const cpaths = Object.fromEntries(
    Object.entries(source.paths).filter(([p]) => p.startsWith("/catalog/")),
  );
  assert.equal(hash(jcs(cpaths)), cHashes[surface], "C_OPERATION_PRESERVATION");
  validateHttpApi(api, source, policy, manifest, surface, catalog, profile);
}
export async function validatePricing(
  publicBundle,
  privateBundle,
  output,
  selfTest = false,
) {
  const [policy, manifest, catalog, priceSchemas, entitySchemas] =
    await Promise.all(
      [
        "catalog/http/shared/v1/catalog-security-policy-v1.json",
        manifestFile,
        "common/errors/v6/error-catalog-v6.json",
        prices,
        "catalog/http/shared/v1/catalog-entities-v1.schema.json",
      ].map(read),
    );
  assert.equal(
    hash(jcs(manifest.schema_cases)),
    "8a6c18efd1a463b307ef4da5dc5f619f1e47a51722603252d3d53b3b7a1179b4",
    "D_STRUCTURAL_MATRIX",
  );
  assert.equal(
    hash(jcs(manifest.semantic_cases)),
    "c010d2660881c320b88385af6d214ce06d89d2d313c4cd7c8f513374163a7fcd",
    "D_SEMANTIC_MATRIX",
  );
  const cases = [],
    loaded = {},
    headerPairs = new Set();
  for (const [surface, file] of Object.entries(apiFiles)) {
    const api = loadJSON(
        await readFile(
          surface === "public" ? publicBundle : privateBundle,
          "utf8",
        ),
      ),
      source = parse(await readFile(path.join(root, file), "utf8"));
    loaded[surface] = { api, source };
    validatePriceApi(api, source, policy, manifest, surface, catalog);
    for (const o of policy.operations.filter((o) =>
      o.permission.startsWith("pricing."),
    )) {
      const p = o.path.slice(7),
        method = o.method.toLowerCase();
      for (const [i, param] of api.paths[p][method].parameters.entries()) {
        const isId = param.in === "path" || param.name === "Idempotency-Key";
        const value = isId
          ? "01998d00-0000-7000-8000-000000000190"
          : param.name === "X-OC-Client-Signal"
            ? "v1." + "A".repeat(43)
            : param.name === "Origin"
              ? "https://pos.opencomerix.example"
              : param.name === "X-CSRF-Token"
                ? "synthetic-csrf"
                : param.name === "limit"
                  ? 50
                  : "opaque-cursor";
        cases.push({
          id: surface + "-" + o.operation_id + "-param-" + i,
          schema: param.schema,
          value,
          expected: "accept",
        });
        if (isId)
          cases.push({
            id: surface + "-" + o.operation_id + "-param-" + i + "-v4",
            schema: param.schema,
            value: "01998d00-0000-4000-8000-000000000190",
            expected: "reject",
          });
      }
    }
    for (const row of manifest.examples.filter((r) => r.surface === surface)) {
      const value = await read(row.fixture),
        container = at(api, row.schema_pointer.slice(0, -7));
      assert.deepEqual(
        container.examples[row.example_name].value,
        value,
        "D_FIXTURE_BYTES",
      );
      if (row.status === "request") normalizePriceBody(row.operation_id, value);
      if (row.headers.Location)
        assert.equal(
          row.headers.Location,
          "/api/v1/pricing/prices/" + value.price_id,
          "D_LOCATION_BODY_LINK",
        );
      cases.push({
        id:
          surface +
          "-" +
          row.operation_id +
          "-" +
          row.status +
          "-" +
          row.example_name,
        schema: extractHttpSchema(api, row.schema_pointer),
        value,
        expected: "accept",
      });
      for (const [name, value] of Object.entries(row.headers)) {
        const schema = at(
            api,
            "/paths/" +
              esc(row.path) +
              "/" +
              row.method +
              "/responses/" +
              row.status +
              "/headers/" +
              esc(name) +
              "/schema",
          ),
          key = hash(jcs({ schema, value }));
        if (!headerPairs.has(key)) {
          headerPairs.add(key);
          cases.push({
            id:
              surface +
              "-" +
              row.operation_id +
              "-" +
              row.status +
              "-" +
              row.example_name +
              "-" +
              name,
            schema,
            value,
            expected: "accept",
          });
        }
      }
    }
  }
  for (const row of manifest.schema_cases) {
    assert(["accept", "reject"].includes(row.expected), "D_CASE_EXPECTED");
    cases.push({
      id: row.id,
      schema: selectSchema(priceSchemas, "/$defs/" + row.definition),
      value: await read(row.fixture),
      expected: row.expected,
    });
  }
  const kinds = new Set(),
    records = new Set();
  const addRecord = (name, definition, value, schemas = priceSchemas) => {
    if (value === null || value === undefined) return;
    const key = hash(jcs({ definition, value }));
    if (records.has(key)) return;
    records.add(key);
    cases.push({
      id: "context-" + name + "-" + records.size,
      schema: selectSchema(schemas, "/$defs/" + definition),
      value,
      expected: "accept",
    });
  };
  for (const row of manifest.semantic_cases) {
    const f = await read(row.fixture),
      c = f.context;
    kinds.add(f.kind);
    for (const k of ["product", "product_after"])
      addRecord(k, "Product", c[k], entitySchemas);
    for (const k of ["presentation", "presentation_after"])
      addRecord(k, "Presentation", c[k], entitySchemas);
    for (const k of ["list", "list_after"]) addRecord(k, "PriceList", c[k]);
    for (const k of [
      "before_history",
      "after_history",
      "history",
      "history_before",
      "history_after",
    ])
      for (const p of c[k] ?? []) addRecord(k, "Price", p);
    // Invalid absence fallback is intentionally not a Price record.
    if (!["price-absence", "price-list"].includes(f.kind))
      addRecord("result", "Price", c.result);
    for (const k of ["original", "replay"]) addRecord(k, "Price", c[k]?.body);
    if (f.kind === "price-replay") {
      assert(
        row.header_expectations === undefined ||
          (row.header_expectations &&
            typeof row.header_expectations === "object" &&
            !Array.isArray(row.header_expectations) &&
            Object.keys(row.header_expectations).every((k) =>
              ["original", "replay"].includes(k),
            )),
        "D_REPLAY_HEADER_EXPECTATIONS",
      );
      for (const surface of ["public", "private"]) {
        const declared =
          loaded[surface].api.paths[
            "/pricing/presentations/{presentation_id}/prices"
          ].post.responses["201"].headers;
        const schema = {
          type: "object",
          additionalProperties: false,
          required: Object.keys(declared).filter((k) => declared[k].required),
          properties: Object.fromEntries(
            Object.entries(declared).map(([k, v]) => [k, v.schema]),
          ),
        };
        for (const which of ["original", "replay"]) {
          const expected = row.header_expectations?.[which] ?? "accept";
          assert(
            ["accept", "reject"].includes(expected),
            "D_REPLAY_HEADER_EXPECTED",
          );
          cases.push({
            id: "replay-headers-" + row.id + "-" + surface + "-" + which,
            schema,
            value: c[which].headers,
            expected,
          });
        }
      }
    }

    addRecord("page", "PricesPage", c.page);
    if (row.expected === "accept") validatePriceSemantic(f, policy);
    else {
      assert.equal(row.expected, "reject", "D_SEMANTIC_EXPECTED");
      assert(
        typeof row.reason === "string" && row.reason.length > 0,
        "D_NEGATIVE_REASON",
      );
      assert.throws(
        () => validatePriceSemantic(f, policy),
        (e) =>
          e instanceof assert.AssertionError && e.message.includes(row.reason),
        "D_NEGATIVE_CAUSE",
      );
    }
  }
  assert.deepEqual(
    [...kinds].sort(),
    [
      "price-change",
      "price-current",
      "price-get",
      "price-list",
      "price-history",
      "price-absence",
      "price-replay",
      "price-cursor",
    ].sort(),
    "D_SEMANTIC_KINDS",
  );
  const referenced = new Set(
    [
      ...manifest.examples,
      ...manifest.schema_cases,
      ...manifest.semantic_cases,
    ].map((r) => r.fixture),
  );
  const actual = [];
  async function visit(dir) {
    for (const e of await readdir(path.join(root, dir), {
      withFileTypes: true,
    })) {
      assert(!e.isSymbolicLink(), "D_FIXTURE_LINK");
      const file = path.posix.join(dir, e.name);
      if (e.isDirectory()) await visit(file);
      else if (file !== manifestFile) actual.push(file);
    }
  }
  await visit("catalog/fixtures/pricing/v1");
  assert.deepEqual(
    [...referenced]
      .filter((f) => f.startsWith("catalog/fixtures/pricing/v1/"))
      .sort(),
    actual.sort(),
    "D_FIXTURE_INVENTORY",
  );
  if (selfTest)
    for (const surface of ["public", "private"]) {
      const { api, source } = loaded[surface];
      const alterations = [
        [(a) => delete a.paths["/pricing/default-list"], "PATH_INVENTORY"],
        [
          (a) => (a.paths["/pricing/default-list"].get.security = []),
          "SECURITY",
        ],
        [
          (a) =>
            delete a.paths["/pricing/presentations/{presentation_id}/prices"]
              .post.responses["409"],
          "STATUS_INVENTORY",
        ],
        [
          (a) =>
            (a.paths["/pricing/prices/{price_id}"].get.responses[
              "200"
            ].headers.ETag.required = false),
          "HEADER_REQUIRED",
        ],
        [
          (a) =>
            (a.paths[
              "/pricing/presentations/{presentation_id}/prices"
            ].post.responses["201"].content[
              "application/json"
            ].examples.replay.value.valid_from = "2026-10-16T00:00:00Z"),
          "HTTP_REPLAY_RESULT",
        ],
      ];
      for (const [mutate, reason] of alterations) {
        const a = structuredClone(api);
        mutate(a);
        assert.throws(
          () => validatePriceApi(a, source, policy, manifest, surface, catalog),
          (e) =>
            e instanceof assert.AssertionError && e.message.includes(reason),
          "D_SELF_TEST_CAUSE",
        );
      }
      const changed = structuredClone(source);
      changed.paths["/catalog/units"].get.description += " changed";
      assert.throws(
        () =>
          validatePriceApi(api, changed, policy, manifest, surface, catalog),
        /C_OPERATION_PRESERVATION/,
      );
    }
  if (output) await writeHttpCases(cases, output);
  console.log(
    "F1-07D contract gate passed: public=5 private=5 total_surface=25 examples=" +
      manifest.examples.length +
      " schema_cases=" +
      cases.length +
      " semantic=" +
      manifest.semantic_cases.length +
      "; static fixtures only.",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2),
    pos = args.filter((a) => !a.startsWith("--"));
  assert.equal(
    pos.length,
    3,
    "usage: validate-pricing-http-v1.mjs <public-bundle> <private-bundle> <new-output-dir> [--self-test]",
  );
  await validatePricing(
    ...pos.map((p) => path.resolve(p)),
    args.includes("--self-test"),
  );
}
