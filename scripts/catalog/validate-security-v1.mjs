import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import {
  loadJSON,
  jcs,
  hash,
  validateAuthorityFixture,
} from "./security-v1-common.mjs";
export const root = path.resolve(import.meta.dirname, "../..");
export const read = async (relative) =>
  loadJSON(await readFile(path.join(root, relative), "utf8"));
const same = (a, b, message) => assert.equal(jcs(a), jcs(b), message);
const esc = (v) => v.replaceAll("~", "~0").replaceAll("/", "~1");
export const at = (v, p) =>
  p
    ? p
        .slice(1)
        .split("/")
        .reduce(
          (current, k) =>
            current?.[k.replaceAll("~1", "/").replaceAll("~0", "~")],
          v,
        )
    : v;
export const portErrors = [
  "identity_invalid_request",
  "identity_session_invalid_or_expired",
  "catalog_delegation_invalid",
  "catalog_delegation_request_mismatch",
  "identity_access_denied",
  "identity_device_not_approved",
  "identity_mfa_required",
  "identity_reauthentication_required",
  "tenancy_membership_invalid",
  "platform_rate_limited",
  "platform_internal_error",
  "platform_dependency_unavailable",
  "platform_payload_too_large",
  "platform_unsupported_media_type",
  "platform_not_acceptable",
];
export const newErrors = [
  ...["catalog", "pricing"].flatMap((d) =>
    [
      ["invalid_request", 400, false],
      ["invalid_cursor", 400, false],
      ["resource_not_found", 404, false],
      ["version_conflict", 409, false],
      ["state_conflict", 409, false],
      ["idempotency_key_reused", 409, false],
      ["idempotency_request_in_progress", 409, true],
      ["semantic_validation_failed", 422, false],
    ].map(([s, status, retry]) => [d + "_" + s, status, retry]),
  ),
  ["catalog_uniqueness_conflict", 409, false],
  ["pricing_price_not_set", 404, false],
  ["pricing_default_list_not_initialized", 404, false],
  ["platform_payload_too_large", 413, false],
  ["platform_unsupported_media_type", 415, false],
  ["platform_not_acceptable", 406, false],
  ["platform_capacity_exhausted", 503, true],
  ["catalog_delegation_invalid", 401, false],
  ["catalog_delegation_request_mismatch", 403, false],
];
export function validatePolicy(p) {
  assert.equal(p.policy_version, 1, "POLICY_VERSION");
  assert.equal(p.status, "candidate", "POLICY_ADMISSION");
  assert.equal(
    p.canonicalization_version,
    "catalog-request-v1",
    "POLICY_CANONICALIZATION",
  );
  // Normative A values, not tunable runtime configuration. Exact comparisons
  // reject missing fields, coercion and extra rules for these policy blocks.
  assert.deepEqual(
    p.public_security,
    {
      cookie: "__Host-oc_session",
      origin_csrf_owner: "gateway-bff",
      private_tokens_to_browser: false,
      free_tenant_headers_grant_authority: false,
    },
    "PUBLIC_POLICY",
  );
  assert.deepEqual(
    p.budgets,
    {
      gateway_total_ms: 10000,
      ordinary_private_call_ms: 3000,
      authority_call_ms: 1000,
      catalog_total_ms: 5000,
      sql_lock_wait_ms: 1000,
      json_bytes: 1048576,
      replay_days: 7,
    },
    "POLICY_BUDGETS",
  );
  assert.equal(
    hash(jcs(p.operations)),
    "1f11bf59433613cd43ca8f0b59acacaa229e3765ae1b9dbfa8663b6c28aadb6c",
    "APPROVED_A_MATRIX",
  );
  same(
    p.ports,
    [
      {
        operation_id: "createCatalogDelegation",
        method: "post",
        path: "/internal/identity/catalog-delegations",
        caller: "gateway-bff",
        audience: "identity-tenancy.gateway",
        cookie_required: true,
        request_schema: "DelegationRequest",
        response_schema: "DelegationResponse",
      },
      {
        operation_id: "checkCatalogAuthorization",
        method: "post",
        path: "/internal/identity/catalog-authorizations",
        caller: "catalog-pricing",
        audience: "identity-tenancy.catalog-authority",
        cookie_required: false,
        request_schema: "AuthorizationRequest",
        response_schema: "AuthorizationResponse",
      },
    ],
    "PRIVATE_PORT_MATRIX",
  );
  same(
    p.private_security,
    {
      delegated_audience: "catalog-pricing.user-api",
      delegated_caller: "gateway-bff",
      delegated_type: "delegated",
      algorithm: "ES256",
      maximum_seconds: 60,
      client_signal_required: true,
      client_signal_in_public_hash: false,
      client_signal_pattern: "^v1\\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
    },
    "PRIVATE_POLICY",
  );
  same(
    p.authority,
    {
      owner: "identity-tenancy",
      maximum_valid_for_ms: 2000,
      clock: "monotonic_before_send",
      cache: false,
      scope: "organization",
      query_before_sql_locks: true,
      check_after_locks_before_commit: true,
      check_before_read_or_replay: true,
      distributed_atomicity: false,
      step_up_maximum_seconds: 900,
      step_up_condition: "tax_classification_change_of_already_active_product",
    },
    "AUTHORITY_POLICY",
  );
  assert.equal(p.runtime_demonstrated, false, "RUNTIME_NOT_DEMONSTRATED");
}
export function validateCatalog(oldCatalog, catalog, oldProblem, problem) {
  assert.equal(catalog.version, 6, "ERROR_CATALOG_VERSION");
  same(
    catalog.errors.slice(0, oldCatalog.errors.length),
    oldCatalog.errors,
    "PUBLISHED_ERRORS_CHANGED",
  );
  assert.equal(
    catalog.errors.length,
    oldCatalog.errors.length + 25,
    "ERROR_CATALOG_SIZE",
  );
  const codes = new Set(catalog.errors.map((e) => e.code));
  assert.equal(codes.size, catalog.errors.length, "ERROR_CODE_DUPLICATE");
  for (const [code, status, retry] of newErrors) {
    const e = catalog.errors.find((x) => x.code === code);
    assert(e, "NEW_ERROR_MISSING");
    same(e.statuses, [status], "ERROR_STATUS");
    assert.equal(e.retryable_by_default, retry, "ERROR_RETRY");
    assert.equal(
      e.owner,
      code.startsWith("platform_") ? "platform" : "catalog-pricing",
      "ERROR_OWNER",
    );
    assert.equal(e.domain, code.split("_")[0], "ERROR_DOMAIN");
    same(e.allowed_parameters, [], "ERROR_PARAMETERS");
    assert.equal(e.deprecated, false, "ERROR_DEPRECATED");
    assert.equal(e.exposure, "public", "ERROR_EXPOSURE");
  }
  const expected = structuredClone(oldProblem);
  expected.$id =
    "https://contracts.opencomerix.example/common/http/shared/v3/problem-details-v3.schema.json";
  expected.title = expected.title.replace("v2", "v3");
  expected.properties.status.enum.push(406, 413, 415);
  expected.properties.status.enum.sort((a, b) => a - b);
  same(problem, expected, "PROBLEM_SUCCESSOR_ONLY_ADDITIVE");
}
export function validateApi(api, source, policy, manifest) {
  assert.equal(api.openapi, "3.1.0", "OPENAPI_VERSION");
  assert.equal(api.info.version, "1.0.0", "ARTIFACT_VERSION");
  assert.equal(
    api.info.license.identifier,
    "LicenseRef-Proprietary",
    "LICENSE",
  );
  assert.equal(api.servers.length, 1, "PRIVATE_SERVER");
  assert.equal(
    api.servers[0].url,
    "https://identity-tenancy.internal.example/api/v1",
    "PRIVATE_SERVER",
  );
  same(
    Object.keys(api.paths).sort(),
    policy.ports.map((p) => p.path).sort(),
    "PRIVATE_PATHS",
  );
  const discovered = [];
  for (const p of policy.ports) {
    const op = api.paths[p.path]?.post;
    const original = source.paths[p.path]?.post;
    same(Object.keys(api.paths[p.path]), ["post"], "PRIVATE_METHOD");
    assert.equal(op.operationId, p.operation_id, "PRIVATE_OPERATION_ID");
    assert.equal(op["x-internal"], true, "PRIVATE_ONLY");
    same(
      op["x-workload"],
      { caller: p.caller, audience: p.audience, type: "service" },
      "WORKLOAD_POLICY",
    );
    same(
      op.security,
      p.cookie_required
        ? [{ gatewayServiceBearer: [], currentSessionCookie: [] }]
        : [{ catalogServiceBearer: [] }],
      "PRIVATE_SECURITY",
    );
    assert.equal(op.parameters.length, 1, "SIGNAL_PARAMETER_COUNT");
    const signal = op.parameters[0];
    assert.equal(signal.name, "X-OC-Client-Signal", "SIGNAL_HEADER");
    assert.equal(signal.required, true, "SIGNAL_REQUIRED");
    assert.equal(
      signal.schema.pattern,
      policy.private_security.client_signal_pattern,
      "SIGNAL_PATTERN",
    );
    assert.equal(
      original.requestBody.content["application/json"].schema.$ref,
      "identity-catalog-authority-v1.schema.json#/$defs/" + p.request_schema,
      "REQUEST_SOURCE_REF",
    );
    assert.equal(
      original.responses["200"].content["application/json"].schema.$ref,
      "identity-catalog-authority-v1.schema.json#/$defs/" + p.response_schema,
      "RESPONSE_SOURCE_REF",
    );
    const schema = op.requestBody.content["application/json"].schema;
    assert.equal(op.requestBody.required, true, "REQUEST_REQUIRED");
    assert.equal(schema.additionalProperties, false, "REQUEST_STRICT");
    same(
      schema.required.slice().sort(),
      [
        ...(p.cookie_required ? [] : ["delegated_token"]),
        "operation_id",
        "canonicalization_version",
        "request_hash",
      ].sort(),
      "REQUEST_FIELDS",
    );
    same(
      Object.keys(schema.properties).sort(),
      schema.required.slice().sort(),
      "REQUEST_FIELDS",
    );
    assert.equal(
      op.responses["200"].content["application/json"].schema
        .additionalProperties,
      true,
      "RESPONSE_COMPATIBLE",
    );
    const statuses = [
      "200",
      ...new Set(
        portErrors.map((code) =>
          code.startsWith("platform_payload")
            ? "413"
            : code === "platform_unsupported_media_type"
              ? "415"
              : code === "platform_not_acceptable"
                ? "406"
                : code === "platform_rate_limited"
                  ? "429"
                  : code === "platform_internal_error"
                    ? "500"
                    : code === "platform_dependency_unavailable"
                      ? "503"
                      : code.includes("invalid_request")
                        ? "400"
                        : code === "identity_session_invalid_or_expired" ||
                            code === "catalog_delegation_invalid"
                          ? "401"
                          : "403",
        ),
      ),
    ].sort();
    same(
      Object.keys(op.responses).sort(),
      statuses,
      "RESPONSE_STATUS_INVENTORY",
    );
    for (const [status, r] of Object.entries(op.responses)) {
      assert.equal(
        r.headers["Cache-Control"].required,
        true,
        "NO_STORE_REQUIRED",
      );
      assert.equal(
        r.headers["Cache-Control"].schema.const,
        "no-store",
        "NO_STORE",
      );
      const media =
        status === "200" ? "application/json" : "application/problem+json";
      same(Object.keys(r.content), [media], "RESPONSE_MEDIA_TYPE");
      if (status === "429")
        assert.equal(
          r.headers["Retry-After"].required,
          true,
          "RETRY_AFTER_REQUIRED",
        );
      if (status !== "200") {
        assert.equal(
          original.responses[status].content[media].schema.$ref,
          "../../../../common/http/shared/v3/problem-details-v3.schema.json",
          "PROBLEM_SOURCE_REF",
        );
      }
      for (const [name, e] of Object.entries(r.content[media].examples ?? {})) {
        const external =
          original.responses[status].content[media].examples?.[name];
        assert(
          external?.externalValue && !Object.hasOwn(external, "value"),
          "FIXTURE_EXTERNAL",
        );
        discovered.push({
          operation_id: p.operation_id,
          method: "post",
          path: p.path,
          status,
          media_type: media,
          example_name: name,
          schema_pointer:
            "/paths/" +
            esc(p.path) +
            "/post/responses/" +
            status +
            "/content/" +
            esc(media) +
            "/schema",
          fixture: path.posix.normalize(
            path.posix.join("identity/http/private/v1", external.externalValue),
          ),
        });
      }
    }
    same(
      Object.values(op.responses)
        .flatMap((r) =>
          Object.keys(r.content?.["application/problem+json"]?.examples ?? {}),
        )
        .sort(),
      portErrors.slice().sort(),
      "PORT_ERROR_CODES",
    );
    for (const [name, e] of Object.entries(
      op.requestBody.content["application/json"].examples ?? {},
    )) {
      const external =
        original.requestBody.content["application/json"].examples?.[name];
      assert(
        external?.externalValue && !Object.hasOwn(external, "value"),
        "FIXTURE_EXTERNAL",
      );
      discovered.push({
        operation_id: p.operation_id,
        method: "post",
        path: p.path,
        status: "request",
        media_type: "application/json",
        example_name: name,
        schema_pointer:
          "/paths/" +
          esc(p.path) +
          "/post/requestBody/content/application~1json/schema",
        fixture: path.posix.normalize(
          path.posix.join("identity/http/private/v1", external.externalValue),
        ),
      });
    }
  }
  same(
    discovered.slice().sort((a, b) => jcs(a).localeCompare(jcs(b))),
    manifest.examples.slice().sort((a, b) => jcs(a).localeCompare(jcs(b))),
    "EXAMPLE_INVENTORY",
  );
  assert.equal(
    manifest.runtime_cryptography_demonstrated,
    false,
    "FIXTURE_RUNTIME_LIMIT",
  );
}
export function selectSchema(source, pointer) {
  assert(
    typeof pointer === "string" && (pointer === "" || pointer.startsWith("/")),
    "SCHEMA_CASE_POINTER",
  );
  assert(at(source, pointer), "SCHEMA_CASE_POINTER");
  return pointer === ""
    ? structuredClone(source)
    : { ...structuredClone(source), $ref: "#" + pointer };
}
export async function validate(bundle, output, selfTest = false) {
  const [policy, manifest, catalog, oldCatalog, problem, oldProblem, semantic] =
    await Promise.all(
      [
        "catalog/http/shared/v1/catalog-security-policy-v1.json",
        "identity/fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json",
        "common/errors/v6/error-catalog-v6.json",
        "errors/error-catalog-v5.json",
        "common/http/shared/v3/problem-details-v3.schema.json",
        "openapi/problem-details-v2.schema.json",
        "identity/fixtures/catalog-authority/v1/catalog-authority-semantic-v1-fixtures.json",
      ].map(read),
    );
  validatePolicy(policy);
  validateCatalog(oldCatalog, catalog, oldProblem, problem);
  const api = loadJSON(await readFile(bundle, "utf8"));
  const source = parse(
    await readFile(
      path.join(
        root,
        "identity/http/private/v1/identity-catalog-authority-v1.yaml",
      ),
      "utf8",
    ),
  );
  validateApi(api, source, policy, manifest);
  const fixtures = new Set(
    [
      ...manifest.examples,
      ...manifest.additional_errors,
      ...manifest.schema_cases,
      ...semantic.cases,
    ].map((c) => c.fixture),
  );
  const directories = [
    "identity/fixtures/catalog-authority/v1",
    "catalog/fixtures/base/v1",
    "catalog/fixtures/errors/v6",
    "common/fixtures/errors/v6",
  ];
  const fixtureMetadata = new Set([
    "identity/fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json",
    "identity/fixtures/catalog-authority/v1/catalog-authority-semantic-v1-fixtures.json",
  ]);
  const actual = [];
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const file = path.posix.join(relative, entry.name);
      assert(!entry.isSymbolicLink(), "FIXTURE_LINK_FORBIDDEN");
      if (entry.isDirectory()) await visit(file);
      else if (!fixtureMetadata.has(file)) actual.push(file);
    }
  }
  for (const directory of directories) await visit(directory);
  same([...fixtures].sort(), actual.sort(), "FIXTURE_FILE_COVERAGE");
  const cases = [];
  for (const row of manifest.examples) {
    const value = await read(row.fixture);
    const container = at(api, row.schema_pointer.slice(0, -7));
    const emitted = container.examples?.[row.example_name];
    assert(emitted && Object.hasOwn(emitted, "value"), "BUNDLE_EXAMPLE_VALUE");
    same(emitted.value, value, "BUNDLE_FIXTURE_CONTENT");
    if (row.status !== "request" && row.status !== "200")
      validateProblem(value, Number(row.status), catalog);
    cases.push({
      id: row.operation_id + "-" + row.status + "-" + row.example_name,
      schema: at(api, row.schema_pointer),
      value,
      expected: "accept",
    });
  }
  same(
    manifest.additional_errors.map((r) => [r.code, r.status, r.retryable]),
    newErrors,
    "ADDITIONAL_ERROR_INVENTORY",
  );
  for (const row of manifest.additional_errors) {
    const value = await read(row.fixture);
    validateProblem(value, row.status, catalog);
    cases.push({ id: row.code, schema: problem, value, expected: "accept" });
  }
  const requiredNegatives = [
    "schema-delegation-request-missing-hash",
    "schema-authorization-request-missing-hash",
    "schema-delegation-request-extra-tenant",
    "schema-authorization-request-extra-tenant",
    "schema-claims-h2-audience",
    "schema-canonical-extra",
    "schema-canonical-version",
    "schema-canonical-path",
    "schema-canonical-method",
    "schema-canonical-hash-query",
    "schema-canonical-key",
  ];
  assert.equal(
    new Set(manifest.schema_cases.map((c) => c.id)).size,
    manifest.schema_cases.length,
    "SCHEMA_CASE_DUPLICATE",
  );
  for (const id of requiredNegatives)
    assert(
      manifest.schema_cases.some((c) => c.id === id && c.expected === "reject"),
      "NEGATIVE_COVERAGE",
    );
  assert.equal(
    hash(jcs(manifest.schema_cases)),
    "6390a287c013af9fce44fbe28585f0d21f68c948c2e66537890aeb80d3132b54",
    "SCHEMA_CASE_INVENTORY",
  );
  for (const row of manifest.schema_cases) {
    assert(
      ["accept", "reject"].includes(row.expected),
      "SCHEMA_CASE_EXPECTATION",
    );
    const sourceSchema = await read(row.schema);
    assert(at(sourceSchema, row.pointer), "SCHEMA_CASE_POINTER");
    const schema = selectSchema(sourceSchema, row.pointer);
    cases.push({
      id: row.id,
      schema,
      value: await read(row.fixture),
      expected: row.expected,
    });
  }
  assert.equal(semantic.cases.length, 33, "SEMANTIC_COVERAGE");
  for (const row of semantic.cases) {
    const value = await read(row.fixture);
    if (row.expected === "accept") validateAuthorityFixture(value, policy);
    else {
      assert.equal(row.expected, "reject", "SEMANTIC_EXPECTATION");
      assert.throws(
        () => validateAuthorityFixture(value, policy),
        (e) =>
          e instanceof assert.AssertionError &&
          String(e.message).includes(row.reason),
        "SEMANTIC_NEGATIVE_REASON",
      );
    }
  }
  if (selfTest) {
    for (const [mutate, reason] of [
      [
        (p) => (p.canonicalization_version = "catalog-request-v2"),
        "POLICY_CANONICALIZATION",
      ],
      [
        (p) => (p.public_security.private_tokens_to_browser = true),
        "PUBLIC_POLICY",
      ],
      [
        (p) => (p.public_security.free_tenant_headers_grant_authority = true),
        "PUBLIC_POLICY",
      ],
      [(p) => (p.budgets.authority_call_ms = 60000), "POLICY_BUDGETS"],
      [(p) => delete p.public_security, "PUBLIC_POLICY"],
      [(p) => delete p.budgets, "POLICY_BUDGETS"],
    ]) {
      const altered = structuredClone(policy);
      mutate(altered);
      assert.throws(
        () => validatePolicy(altered),
        (e) => e instanceof assert.AssertionError && e.message.includes(reason),
        "POLICY_SELF_TEST_REASON",
      );
    }
    const p = structuredClone(policy);
    p.operations[0].permission = "catalog.manage";
    assert.throws(() => validatePolicy(p), /APPROVED_A_MATRIX/);
    const a = structuredClone(api);
    a.paths[policy.ports[0].path].post.security = [
      { gatewayServiceBearer: [] },
    ];
    assert.throws(
      () => validateApi(a, source, policy, manifest),
      /PRIVATE_SECURITY/,
    );
    const m = structuredClone(manifest);
    m.examples.pop();
    assert.throws(
      () => validateApi(api, source, policy, m),
      /EXAMPLE_INVENTORY/,
    );
    const c = structuredClone(catalog);
    c.errors[0].statuses = [500];
    assert.throws(
      () => validateCatalog(oldCatalog, c, oldProblem, problem),
      /PUBLISHED_ERRORS_CHANGED/,
    );
  }
  if (output) {
    await mkdir(output, { recursive: true });
    const lines = [];
    for (const c of cases) {
      assert(/^[a-zA-Z0-9_-]+$/.test(c.id), "OUTPUT_CASE_NAME");
      await writeFile(
        path.join(output, c.id + ".schema.json"),
        JSON.stringify(
          {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            ...c.schema,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      await writeFile(
        path.join(output, c.id + ".json"),
        JSON.stringify(c.value, null, 2) + "\n",
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
  console.log(
    `F1-07B contract gate passed: ports=2 A_operations=25 examples=${manifest.examples.length} schema_cases=${cases.length} semantic=${semantic.cases.length} new_errors=25; cryptography/runtime not demonstrated.`,
  );
}
export function validateProblem(value, status, catalog) {
  const entry = catalog.errors.find((e) => e.code === value.code);
  assert(entry, "PROBLEM_CODE");
  assert(entry.statuses.includes(status), "PROBLEM_STATUS_CODE");
  assert.equal(value.status, status, "PROBLEM_STATUS");
  assert.equal(
    value.type,
    "urn:opencomerix:problem:" + value.code,
    "PROBLEM_TYPE",
  );
  assert.equal(value.retryable, entry.retryable_by_default, "PROBLEM_RETRY");
  assert(
    !/token|request_hash|client.signal|cookie|credential|stack|sql/i.test(
      value.detail ?? "",
    ),
    "PROBLEM_PRIVACY",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const self = args.includes("--self-test");
  const positional = args.filter((a) => !a.startsWith("--"));
  assert.equal(
    positional.length,
    2,
    "usage: node validate-catalog-security-v1.mjs <dereferenced-bundle.json> <new-output-directory> [--self-test]",
  );
  await validate(
    path.resolve(positional[0]),
    path.resolve(positional[1]),
    self,
  );
}
