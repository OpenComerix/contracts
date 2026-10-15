import { validateSemantic } from "./http-v1-semantics.mjs";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import {
  root,
  read,
  at,
  selectSchema,
  validatePolicy,
  validateProblem,
} from "./validate-security-v1.mjs";
import { jcs, hash, loadJSON, requestHash } from "./security-v1-common.mjs";
import {
  definitions,
  operationErrors,
  normalizeBody,
  normalizedRequest,
  entities,
} from "./http-v1-common.mjs";
const same = (a, b, reason) => assert.equal(jcs(a), jcs(b), reason);
const esc = (v) => v.replaceAll("~", "~0").replaceAll("/", "~1");
export const apiFiles = {
  public: "catalog/http/public/v1/catalog-pricing-v1.yaml",
  private: "catalog/http/private/v1/catalog-pricing-internal-v1.yaml",
};
export const manifestFile =
  "catalog/fixtures/http/v1/catalog-http-v1-fixtures.json";
const schemaRef = (n) =>
  "../../shared/v1/catalog-entities-v1.schema.json#/$defs/" + n;
// These examples describe one execution and its replay, not two independent writes.
export function validateReplayPair(original, replay) {
  for (const r of [original, replay]) {
    assert(r && typeof r === "object", "HTTP_REPLAY_REQUIRED");
    for (const k of [
      "status",
      "media_type",
      "schema_pointer",
      "body",
      "headers",
    ])
      assert(Object.hasOwn(r, k) && r[k] !== undefined, "HTTP_REPLAY_REQUIRED");
    assert(r.headers && typeof r.headers === "object", "HTTP_REPLAY_REQUIRED");
    assert(
      r.body && typeof r.body === "object" && !Array.isArray(r.body),
      "HTTP_REPLAY_REQUIRED",
    );
  }
  for (const k of ["status", "media_type", "schema_pointer", "body"])
    assert.deepEqual(original[k], replay[k], "HTTP_REPLAY_RESULT");
  assert.equal(
    original.headers["Idempotency-Replayed"],
    false,
    "HTTP_REPLAY_INDICATOR",
  );
  assert.equal(
    replay.headers["Idempotency-Replayed"],
    true,
    "HTTP_REPLAY_INDICATOR",
  );
  const stable = (headers) =>
    Object.fromEntries(
      Object.entries(headers).filter(([k]) => k !== "Idempotency-Replayed"),
    );
  // C has no tracing headers; every other declared header must remain identical.
  assert.deepEqual(
    stable(original.headers),
    stable(replay.headers),
    "HTTP_REPLAY_HEADERS",
  );
}

export function validateHttpApi(
  api,
  source,
  policy,
  manifest,
  surface,
  catalog,
  profile = null,
) {
  const defs = profile?.definitions ?? definitions;
  const ref = profile?.schemaRef ?? schemaRef;
  const errorCodes = profile?.operationErrors ?? operationErrors;
  const scope = profile?.scope ?? "C";
  assert(["public", "private"].includes(surface), "SURFACE");
  validatePolicy(policy);
  assert.equal(api.openapi, "3.1.0", "OPENAPI_VERSION");
  assert.equal(api.info.version, "1.0.0", "ARTIFACT_VERSION");
  assert.equal(
    api.info.license.identifier,
    "LicenseRef-Proprietary",
    "LICENSE",
  );
  same(
    api.servers,
    [
      {
        url:
          surface === "public"
            ? "https://api.opencomerix.example/api/v1"
            : "https://catalog-pricing.internal.example/api/v1",
      },
    ],
    "SERVER",
  );
  same(
    Object.keys(api.components.securitySchemes),
    [surface === "public" ? "sessionCookie" : "delegatedBearer"],
    "SECURITY_SCHEMES",
  );
  if (surface === "public")
    same(
      api.components.securitySchemes.sessionCookie,
      {
        type: "apiKey",
        in: "cookie",
        name: "__Host-oc_session",
        description:
          "Opaque active verified session; no authority from free headers.",
      },
      "PUBLIC_COOKIE",
    );
  else {
    assert.equal(
      api.components.securitySchemes.delegatedBearer.scheme,
      "bearer",
      "PRIVATE_BEARER",
    );
    assert.equal(
      api.components.securitySchemes.delegatedBearer.type,
      "http",
      "PRIVATE_BEARER",
    );
  }
  const ops = policy.operations.filter((o) =>
    o.permission.startsWith(profile?.permission ?? "catalog."),
  );
  same(
    manifest.operations,
    ops.map((o) => o.operation_id),
    "C_OPERATION_INVENTORY",
  );
  assert.equal(ops.length, profile?.count ?? 20, scope + "_OPERATION_COUNT");
  // C remains independently testable; once any pricing path exists the closed
  // surface inventory must contain all 25 operations approved in policy A.
  const fullSurface =
    profile !== null ||
    Object.keys(api.paths).some((p) => p.startsWith("/pricing/"));
  const surfaceOps = fullSurface ? policy.operations : ops;
  assert.equal(manifest.runtime_demonstrated, false, "RUNTIME_LIMIT");
  assert.equal(manifest.status, "candidate", "ADMISSION_LIMIT");
  same(
    Object.keys(api.paths).sort(),
    [...new Set(surfaceOps.map((o) => o.path.slice(7)))].sort(),
    "PATH_INVENTORY",
  );
  const discovered = [];
  for (const p of Object.keys(api.paths))
    same(
      Object.keys(api.paths[p]).sort(),
      surfaceOps
        .filter((o) => o.path.slice(7) === p)
        .map((o) => o.method.toLowerCase())
        .sort(),
      "METHOD_INVENTORY",
    );
  for (const o of ops) {
    const p = o.path.slice(7),
      m = o.method.toLowerCase(),
      op = api.paths[p]?.[m],
      original = source.paths[p]?.[m],
      priv = surface === "private",
      mut = m !== "get";
    assert(op && original, "OPERATION_REQUIRED");
    assert.equal(op.operationId, o.operation_id, "OPERATION_ID");
    assert.equal(op["x-permission"], o.permission, "PERMISSION");
    assert.equal(op["x-internal"], priv, "SURFACE_EXPOSURE");
    same(
      op.security,
      [priv ? { delegatedBearer: [] } : { sessionCookie: [] }],
      "SECURITY",
    );
    if (priv) assert.equal(op["x-caller"], "gateway-bff", "PRIVATE_CALLER");
    assert(Array.isArray(op.parameters), "PARAMETERS");
    const expected = [
      ...[...o.path.matchAll(/\{([^}]+)\}/g)].map((x) => ["path", x[1], true]),
      ...o.query.map((k) => ["query", k, false]),
      ...(mut ? [["header", "Idempotency-Key", true]] : []),
      ...(priv
        ? [["header", "X-OC-Client-Signal", true]]
        : mut
          ? [
              ["header", "Origin", true],
              ["header", "X-CSRF-Token", true],
            ]
          : []),
    ];
    same(
      op.parameters.map((p) => [p.in, p.name, p.required]),
      expected,
      "PARAMETER_INVENTORY",
    );
    for (const param of op.parameters) {
      if (param.in === "path" || param.name === "Idempotency-Key")
        assert.equal(
          param.schema.pattern,
          "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
          "UUID_PARAMETER",
        );
      if (param.name === "X-OC-Client-Signal")
        assert.equal(
          param.schema.pattern,
          policy.private_security.client_signal_pattern,
          "SIGNAL_PATTERN",
        );
      if (param.name.endsWith("limit"))
        same(
          param.schema,
          { type: "integer", minimum: 1, maximum: 100, default: 50 },
          "QUERY_LIMIT_SCHEMA",
        );
      if (param.name.endsWith("cursor")) {
        assert.equal(param.schema.maxLength, 2048, "QUERY_CURSOR_SCHEMA");
        assert.equal(param.schema.minLength, 1, "QUERY_CURSOR_SCHEMA");
      }
    }
    if (mut) {
      assert.equal(op.requestBody?.required, true, "REQUEST_REQUIRED");
      assert.equal(
        original.requestBody.content["application/json"].schema.$ref,
        ref(defs[o.operation_id][0]),
        "REQUEST_SCHEMA_REF",
      );
      assert.equal(
        op.requestBody.content["application/json"].schema.additionalProperties,
        defs[o.operation_id][0] === "BarcodeInput" ? undefined : false,
        "REQUEST_CLOSED",
      );
    } else assert(!Object.hasOwn(op, "requestBody"), "GET_WITHOUT_BODY");
    const codes = errorCodes(o, priv),
      errorStatuses = [
        ...new Set(
          codes.map((code) => {
            const e = catalog.errors.find((e) => e.code === code);
            assert(e, "ERROR_REGISTERED");
            return String(e.statuses[0]);
          }),
        ),
      ];
    same(
      Object.keys(op.responses).sort(),
      [String(o.success_status), ...errorStatuses].sort(),
      "STATUS_INVENTORY",
    );
    const emittedCodes = [];
    const inspect = (
      container,
      originalContainer,
      status,
      media,
      pointer,
      headers,
    ) => {
      assert(container?.schema && originalContainer?.schema, "SCHEMA_SELECTOR");
      assert(
        container.examples && Object.keys(container.examples).length > 0,
        "EXAMPLES_REQUIRED",
      );
      for (const [name, e] of Object.entries(container.examples)) {
        const src = originalContainer.examples?.[name];
        assert(
          src?.externalValue && !Object.hasOwn(src, "value"),
          "EXTERNAL_EXAMPLE",
        );
        assert(Object.hasOwn(e, "value"), "DEREFERENCED_EXAMPLE");
        const fixture = path.posix.normalize(
          path.posix.join(
            path.posix.dirname(apiFiles[surface]),
            src.externalValue,
          ),
        );
        assert(
          fixture.startsWith("catalog/fixtures/") ||
            fixture.startsWith("common/fixtures/"),
          "FIXTURE_PATH",
        );
        discovered.push({
          surface,
          operation_id: o.operation_id,
          method: m,
          path: p,
          status,
          media_type: media,
          example_name: name,
          schema_pointer: "/paths/" + esc(p) + "/" + m + pointer,
          fixture,
          headers:
            status === "request"
              ? {}
              : (manifest.examples.find(
                  (r) =>
                    r.surface === surface &&
                    r.operation_id === o.operation_id &&
                    r.status === status &&
                    r.example_name === name,
                )?.headers ?? headers),
          ...(status === "request" || status === String(o.success_status)
            ? {
                definition: defs[o.operation_id][status === "request" ? 0 : 1],
              }
            : {}),
        });
        if (status !== String(o.success_status) && status !== "request") {
          emittedCodes.push(name);
          assert.equal(e.value.code, name, "EXAMPLE_CODE");
          validateProblem(e.value, Number(status), catalog);
        }
      }
    };
    if (mut)
      inspect(
        op.requestBody.content["application/json"],
        original.requestBody.content["application/json"],
        "request",
        "application/json",
        "/requestBody/content/application~1json/schema",
        {},
      );
    for (const [status, response] of Object.entries(op.responses)) {
      const success = status === String(o.success_status),
        media = success ? "application/json" : "application/problem+json";
      same(Object.keys(response.content), [media], "MEDIA_TYPE");
      if (success)
        same(
          Object.keys(response.content[media].examples).sort(),
          (mut
            ? ["valid", "replay"]
            : o.operation_id === "listCatalogProducts"
              ? ["valid", "barcode_match"]
              : ["valid"]
          ).sort(),
          "SUCCESS_EXAMPLE_INVENTORY",
        );
      const names = [
        "Cache-Control",
        ...(success && !o.operation_id.startsWith("list") ? ["ETag"] : []),
        ...(success && mut ? ["Idempotency-Replayed"] : []),
        ...(success && status === "201" ? ["Location"] : []),
        ...(status === "429" ? ["Retry-After"] : []),
      ];
      same(
        Object.keys(response.headers).sort(),
        names.sort(),
        "HEADER_INVENTORY",
      );
      for (const [name, h] of Object.entries(response.headers)) {
        assert.equal(h.required, true, "HEADER_REQUIRED");
        assert(h.schema, "HEADER_SCHEMA");
        if (name === "Cache-Control")
          assert.equal(h.schema.const, "no-store", "NO_STORE");
        if (name === "Idempotency-Replayed")
          assert.equal(h.schema.type, "boolean", "REPLAY_HEADER");
        if (name === "Location")
          assert.equal(
            h.schema.pattern,
            "^/api/v1/(?:catalog|pricing)/[^?#]+$",
            "LOCATION_SCHEMA",
          );
        if (name === "ETag")
          assert.equal(
            h.schema.pattern,
            '^"[^"\\x00-\\x20\\x7f]+"$',
            "ETAG_SCHEMA",
          );
        if (name === "Retry-After")
          assert.equal(h.schema.pattern, "^(?:0|[1-9][0-9]*)$", "RETRY_SCHEMA");
      }
      assert.equal(
        original.responses[status].content[media].schema.$ref,
        success
          ? ref(defs[o.operation_id][1])
          : "../../../../common/http/shared/v3/problem-details-v3.schema.json",
        "RESPONSE_SCHEMA_REF",
      );
      const rows = manifest.examples.filter(
        (r) =>
          r.surface === surface &&
          r.operation_id === o.operation_id &&
          r.status === status,
      );
      assert(rows.length > 0, "RESPONSE_COVERAGE");
      if (success && mut) {
        const pair = ["valid", "replay"].map((name) => {
          const selected = rows.filter(
            (r) => r.example_name === name && r.media_type === media,
          );
          assert.equal(selected.length, 1, "HTTP_REPLAY_REQUIRED");
          const row = selected[0];
          return {
            ...row,
            body: response.content[media].examples[name]?.value,
          };
        });
        validateReplayPair(...pair);
      }
      // Header values are examples, not generated from schema. Each row checked independently below.
      for (const row of rows) {
        same(
          Object.keys(row.headers).sort(),
          Object.keys(response.headers).sort(),
          "EXAMPLE_HEADER_INVENTORY",
        );
        assert.equal(
          row.headers["Cache-Control"],
          "no-store",
          "EXAMPLE_NO_STORE",
        );
        if (success && mut)
          assert.equal(
            row.headers["Idempotency-Replayed"],
            row.example_name === "replay",
            "EXAMPLE_REPLAY",
          );
        if (row.headers.ETag)
          assert(
            /^"[^"\x00-\x20\x7f]+"$/.test(row.headers.ETag),
            "EXAMPLE_ETAG",
          );
        if (status === "429")
          assert(
            /^(?:0|[1-9][0-9]*)$/.test(row.headers["Retry-After"]),
            "EXAMPLE_RETRY",
          );
        if (status === "201") {
          const target = {
            createCatalogCategory: "categories",
            createCatalogProduct: "products",
            createCatalogPresentation: "presentations",
          }[o.operation_id];
          assert(
            new RegExp(
              "^" +
                (profile?.locationRoots?.[o.operation_id] ??
                  "/api/v1/catalog/" + target) +
                "/[0-9a-f-]{36}$",
            ).test(row.headers.Location),
            "EXAMPLE_LOCATION",
          );
        }
      }
      inspect(
        response.content[media],
        original.responses[status].content[media],
        status,
        media,
        "/responses/" + status + "/content/" + esc(media) + "/schema",
        rows[0].headers,
      );
    }
    same(emittedCodes.sort(), codes, "ERROR_CODE_INVENTORY");
  }
  const rows = manifest.examples.filter((r) => r.surface === surface);
  same(
    discovered.sort((a, b) => jcs(a).localeCompare(jcs(b))),
    rows.slice().sort((a, b) => jcs(a).localeCompare(jcs(b))),
    "EXAMPLE_INVENTORY",
  );
}
export function extractHttpSchema(api, pointer) {
  assert(
    typeof pointer === "string" &&
      pointer.startsWith("/paths/") &&
      pointer.endsWith("/schema"),
    "HTTP_SCHEMA_POINTER",
  );
  const schema = at(api, pointer);
  assert(
    schema && typeof schema === "object" && !Array.isArray(schema),
    "HTTP_SCHEMA_REQUIRED",
  );
  return structuredClone(schema);
}
export async function validateHttp(
  publicBundle,
  privateBundle,
  output,
  selfTest = false,
) {
  const [policy, manifest, catalog] = await Promise.all(
    [
      "catalog/http/shared/v1/catalog-security-policy-v1.json",
      manifestFile,
      "common/errors/v6/error-catalog-v6.json",
    ].map(read),
  );
  assert.equal(manifest.format_version, 1, "MANIFEST_FORMAT");
  assert.equal(manifest.scope, "F1-07C", "MANIFEST_SCOPE");
  assert.equal(
    hash(jcs(manifest.schema_cases)),
    "bb7a347b265e4838d239f2a2db0f63d78a39958cef0bd3890634a2300499def9",
    "STRUCTURAL_MATRIX",
  );
  assert.equal(
    hash(jcs(manifest.semantic_cases)),
    "eff3ef02507e3da9b5d7b5d43d5a25991a8b21de4496902c1800243b363c6089",
    "SEMANTIC_MATRIX",
  );
  const entitySchemas = await read(entities);
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
    validateHttpApi(api, source, policy, manifest, surface, catalog);
    for (const o of policy.operations.filter((o) =>
      Object.hasOwn(definitions, o.operation_id),
    )) {
      const p = o.path.slice(7),
        m = o.method.toLowerCase(),
        op = api.paths[p][m];
      for (const [i, param] of op.parameters.entries()) {
        const value =
          param.in === "path" || param.name === "Idempotency-Key"
            ? "01998d00-0000-7000-8000-000000000090"
            : param.name === "X-OC-Client-Signal"
              ? "v1." + "A".repeat(43)
              : param.name === "Origin"
                ? "https://pos.opencomerix.example"
                : param.name === "X-CSRF-Token"
                  ? "synthetic-csrf"
                  : param.name.endsWith("limit")
                    ? 50
                    : param.name.endsWith("cursor")
                      ? "opaque-cursor"
                      : param.name === "category_id"
                        ? "01998d00-0000-7000-8000-000000000090"
                        : param.name === "status"
                          ? "draft"
                          : param.name === "plu"
                            ? "001"
                            : param.name === "barcode"
                              ? "OC:UNIDAD"
                              : param.name === "sku"
                                ? "SKU-001"
                                : "Producto";
        cases.push({
          id: surface + "-" + o.operation_id + "-parameter-" + i,
          schema: param.schema,
          value,
          expected: "accept",
        });
        if (param.in === "path" || param.name === "Idempotency-Key")
          cases.push({
            id: surface + "-" + o.operation_id + "-parameter-" + i + "-v4",
            schema: param.schema,
            value: "01998d00-0000-4000-8000-000000000090",
            expected: "reject",
          });
      }
    }
    for (const row of manifest.examples.filter((r) => r.surface === surface)) {
      const value = await read(row.fixture),
        container = at(api, row.schema_pointer.slice(0, -7));
      same(container.examples[row.example_name].value, value, "FIXTURE_BYTES");
      if (row.status === "request") normalizeBody(row.operation_id, value);
      if (row.headers.Location) {
        const idfield = {
          createCatalogCategory: "category_id",
          createCatalogProduct: "product_id",
          createCatalogPresentation: "presentation_id",
        }[row.operation_id];
        assert.equal(
          row.headers.Location.split("/").at(-1),
          value[idfield],
          "LOCATION_BODY_LINK",
        );
      }
      cases.push({
        id:
          surface +
          "-" +
          row.operation_id +
          "-" +
          row.status +
          "-" +
          row.example_name,
        schema: at(api, row.schema_pointer),
        value,
        expected: "accept",
      });
      // Success header examples validated with runner schemas as well as their exact set.
      if (row.status !== "request")
        for (const [name, val] of Object.entries(row.headers)) {
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
          );
          const key = hash(jcs({ schema, value: val }));
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
              value: val,
              expected: "accept",
            });
          }
        }
    }
  }
  assert(
    new Set(manifest.schema_cases.map((c) => c.id)).size ===
      manifest.schema_cases.length,
    "SCHEMA_CASE_DUPLICATE",
  );
  assert(manifest.schema_cases.length >= 30, "STRUCTURAL_COVERAGE");
  for (const row of manifest.schema_cases) {
    assert(["accept", "reject"].includes(row.expected), "CASE_EXPECTED");
    assert(row.id && /^[A-Za-z0-9_-]+$/.test(row.id), "CASE_ID");
    let source;
    if (row.surface) {
      assert(loaded[row.surface], "CASE_SURFACE");
      source = loaded[row.surface].api;
    } else {
      assert.equal(row.schema, entities, "CASE_SOURCE");
      source = await read(row.schema);
    }
    const selected = row.surface
      ? extractHttpSchema(source, row.pointer)
      : selectSchema(source, row.pointer);
    cases.push({
      id: row.id,
      schema: selected,
      value: await read(row.fixture),
      expected: row.expected,
    });
  }
  const kinds = new Set();
  assert(manifest.semantic_cases.length >= 30, "SEMANTIC_COVERAGE");
  for (const row of manifest.semantic_cases) {
    const f = await read(row.fixture);
    kinds.add(f.kind);
    const beforeEntities =
      f.kind === "product-edit"
        ? [
            ["product", "Product"],
            ["base_presentation", "Presentation"],
          ]
        : f.kind === "presentation-edit"
          ? [
              ["product", "Product"],
              ["presentation", "Presentation"],
            ]
          : [];
    for (const [key, definition] of beforeEntities)
      cases.push({
        id: "semantic-before-" + row.id + "-" + key,
        schema: selectSchema(entitySchemas, "/$defs/" + definition),
        value: f.context[key],
        expected: "accept",
      });
    if (row.expected === "accept") validateSemantic(f);
    else {
      assert.equal(row.expected, "reject", "SEMANTIC_EXPECTED");
      assert(
        typeof row.reason === "string" && row.reason.length > 0,
        "SEMANTIC_REASON",
      );
      assert.throws(
        () => validateSemantic(f),
        (e) =>
          e instanceof assert.AssertionError && e.message.includes(row.reason),
        "SEMANTIC_NEGATIVE_REASON",
      );
    }
  }
  same(
    [...kinds].sort(),
    [
      "quantities",
      "barcode",
      "retire-barcode",
      "transition",
      "category-move",
      "category-inactivate",
      "category-assignment",
      "product-edit",
      "presentation-edit",
      "uniqueness",
      "cursor",
      "version",
      "replay",
      "created-product",
      "lookup",
    ].sort(),
    "SEMANTIC_KIND_COVERAGE",
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
      assert(!e.isSymbolicLink(), "FIXTURE_LINK");
      const f = path.posix.join(dir, e.name);
      if (e.isDirectory()) await visit(f);
      else if (f !== manifestFile) actual.push(f);
    }
  }
  await visit("catalog/fixtures/http/v1");
  await visit("catalog/fixtures/semantics/v1");
  same(
    [...referenced]
      .filter(
        (p) =>
          p.startsWith("catalog/fixtures/http/v1/") ||
          p.startsWith("catalog/fixtures/semantics/v1/"),
      )
      .sort(),
    actual.sort(),
    "FIXTURE_FILE_INVENTORY",
  );
  if (selfTest) {
    for (const [change, reason] of [
      [
        (a) =>
          (a.paths["/catalog/units"].get.security = [{ delegatedBearer: [] }]),
        "SECURITY",
      ],
      [
        (a) =>
          (a.paths["/catalog/units"].get.responses["200"].headers[
            "Cache-Control"
          ].required = false),
        "HEADER_REQUIRED",
      ],
      [(a) => delete a.paths["/catalog/units"], "PATH_INVENTORY"],
    ]) {
      const a = structuredClone(loaded.public.api);
      change(a);
      assert.throws(
        () =>
          validateHttpApi(
            a,
            loaded.public.source,
            policy,
            manifest,
            "public",
            catalog,
          ),
        (e) => e instanceof assert.AssertionError && e.message.includes(reason),
        "SELF_TEST_REASON",
      );
    }
    for (const surface of ["public", "private"])
      for (const o of policy.operations.filter(
        (o) => Object.hasOwn(definitions, o.operation_id) && o.method !== "GET",
      )) {
        const p = o.path.slice(7),
          method = o.method.toLowerCase(),
          status = String(o.success_status);
        for (const [change, reason] of [
          [
            (a) => {
              a.paths[p][method].responses[status].content[
                "application/json"
              ].examples.replay.value.audit_changed = true;
            },
            "HTTP_REPLAY_RESULT",
          ],
          [
            (a) => {
              const body =
                a.paths[p][method].responses[status].content["application/json"]
                  .examples.replay.value;
              const entity = body.presentation ?? body;
              entity.version += 1;
            },
            "HTTP_REPLAY_RESULT",
          ],
        ]) {
          const a = structuredClone(loaded[surface].api);
          change(a);
          assert.throws(
            () =>
              validateHttpApi(
                a,
                loaded[surface].source,
                policy,
                manifest,
                surface,
                catalog,
              ),
            (e) =>
              e instanceof assert.AssertionError && e.message.includes(reason),
            "SELF_TEST_REPLAY",
          );
        }
        const altered = structuredClone(manifest);
        altered.examples.find(
          (r) =>
            r.surface === surface &&
            r.operation_id === o.operation_id &&
            r.example_name === "replay" &&
            r.status === status,
        ).headers.ETag = '"other-version"';
        assert.throws(
          () =>
            validateHttpApi(
              loaded[surface].api,
              loaded[surface].source,
              policy,
              altered,
              surface,
              catalog,
            ),
          (e) =>
            e instanceof assert.AssertionError &&
            e.message.includes("HTTP_REPLAY_HEADERS"),
          "SELF_TEST_REPLAY_HEADERS",
        );
      }
    const m = structuredClone(manifest);
    m.examples.pop();
    assert.throws(
      () =>
        validateHttpApi(
          loaded.private.api,
          loaded.private.source,
          policy,
          m,
          "private",
          catalog,
        ),
      (e) =>
        e instanceof assert.AssertionError &&
        e.message.includes("HTTP_REPLAY_REQUIRED"),
      "SELF_TEST_INVENTORY",
    );
  }
  if (output) await writeHttpCases(cases, output);
  console.log(
    "F1-07C contract gate passed: public=20 private=20 examples=" +
      manifest.examples.length +
      " schema_cases=" +
      cases.length +
      " semantic=" +
      manifest.semantic_cases.length +
      "; static fixtures only.",
  );
}
export async function writeHttpCases(cases, output) {
  await mkdir(output, { recursive: true });
  const lines = [];
  assert(
    new Set(cases.map((c) => c.id)).size === cases.length,
    "PREPARED_CASE_DUPLICATE",
  );
  for (const c of cases) {
    assert(c.schema && typeof c.schema === "object", "EXTRACTED_SCHEMA");
    assert(/^[A-Za-z0-9_-]+$/.test(c.id), "PREPARED_ID");
    await writeFile(
      path.join(output, c.id + ".schema.json"),
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...c.schema,
      }) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      path.join(output, c.id + ".json"),
      JSON.stringify(c.value) + "\n",
      { flag: "wx" },
    );
    lines.push(
      [c.id, c.expected, c.id + ".schema.json", c.id + ".json"].join("\t"),
    );
  }
  await writeFile(path.join(output, "cases.tsv"), lines.join("\n") + "\n", {
    flag: "wx",
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2),
    self = args.includes("--self-test"),
    pos = args.filter((a) => !a.startsWith("--"));
  assert.equal(
    pos.length,
    3,
    "usage: validate-http-v1.mjs <public-bundle> <private-bundle> <new-output-dir> [--self-test]",
  );
  await validateHttp(...pos.map((p) => path.resolve(p)), self);
}
