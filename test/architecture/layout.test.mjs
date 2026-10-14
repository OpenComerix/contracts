import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  contractDirectories,
  validateContractPaths,
  checkContractLayout,
} from "../../tools/architecture/layout.mjs";
const registry = {
  domains: ["catalog", "identity", "common"],
  preserved: ["openapi/published.yaml", "events/published.schema.json"],
};

test("legacy paths and new domain/surface/version paths remain valid", () => {
  validateContractPaths(
    [
      "openapi/published.yaml",
      "events/published.schema.json",
      "identity/http/private/v1/authority.yaml",
      "catalog/http/shared/v1/types.schema.json",
      "catalog/http/public/v1/api.yaml",
      "common/http/shared/v3/problem.schema.json",
      "common/errors/v6/catalog.json",
      "catalog/events/v1/product.schema.json",
      "catalog/commands/v1/update.schema.json",
      "identity/fixtures/authority/v1/examples/valid.json",
    ],
    registry,
  );
});
for (const file of [
  "openapi/new.yaml",
  "errors/new.schema.json",
  "commands/new.schema.json",
  "events/new.schema.json",
])
  test("new global transport path rejected: " + file, () =>
    assert.throws(
      () => validateContractPaths([file], registry),
      /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/,
    ),
  );
for (const file of [
  "catalog/http/api.yaml",
  "identity/http/private/authority.yaml",
  "catalog/http/unknown/v1/api.yaml",
  "common/errors/v0/catalog.json",
  "catalog/fixtures/v1/valid.json",
  "catalog/http/shared/v1/nested/api.yaml",
  "catalog/unclassified/file.json",
])
  test("missing or misplaced surface/version rejected: " + file, () =>
    assert.throws(
      () => validateContractPaths([file], registry),
      /LAYOUT_SURFACE_VERSION_OR_FIXTURE/,
    ),
  );
test("unknown domain and path traversal rejected", () => {
  assert.throws(
    () => validateContractPaths(["other/http/public/v1/api.yaml"], registry),
    /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/,
  );
  assert.throws(
    () => validateContractPaths(["catalog/../openapi/api.yaml"], registry),
    /LAYOUT_PATH/,
  );
  assert.throws(
    () =>
      validateContractPaths(["catalog\\http\\public\\v1\\api.yaml"], registry),
    /LAYOUT_PATH/,
  );
});
test("reference discovery includes registered domain transports and legacy roots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-contract-layout-"));
  try {
    mkdirSync(path.join(root, "registry"));
    writeFileSync(
      path.join(root, "registry/contracts.json"),
      JSON.stringify({
        formatVersion: 1,
        contracts: [{ domain: "identity" }],
        planned: [{ domain: "catalog" }],
        preservedFiles: [],
      }),
    );
    for (const dir of [
      "openapi",
      "events",
      "identity/http/private/v1",
      "catalog/http/shared/v1",
    ])
      mkdirSync(path.join(root, dir), { recursive: true });
    assert.deepEqual(
      contractDirectories(root)
        .map((p) => path.relative(root, p).replaceAll(path.sep, "/"))
        .sort(),
      ["catalog/http", "events", "identity/http", "openapi"],
    );
  } finally {
    assert(
      path
        .resolve(root)
        .startsWith(path.resolve(tmpdir()) + path.sep + "oc-contract-layout-"),
    );
    rmSync(root, { recursive: true, force: true });
  }
});
test("current checkout has complete domain layout without admitting candidates", () => {
  const summary = checkContractLayout(
    path.resolve(import.meta.dirname, "../.."),
  );
  assert(summary.files > 0);
  assert.equal(summary.legacy, 236);
});

test("filesystem gate rejects an unregistered domain and a root schema", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-contract-layout-"));
  try {
    mkdirSync(path.join(root, "registry"));
    writeFileSync(
      path.join(root, "registry/contracts.json"),
      JSON.stringify({
        formatVersion: 1,
        contracts: [{ domain: "identity" }],
        planned: [],
        preservedFiles: [],
      }),
    );
    mkdirSync(path.join(root, "identity"));
    const wrong = path.join(root, "unknown", "http", "public", "v1");
    mkdirSync(wrong, { recursive: true });
    const wrongFile = path.join(wrong, "api.yaml");
    writeFileSync(wrongFile, "openapi: 3.1.0");
    assert.throws(
      () => checkContractLayout(root),
      /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/,
    );
    assert(path.resolve(wrongFile).startsWith(path.resolve(root) + path.sep));
    rmSync(wrongFile);
    writeFileSync(path.join(root, "misplaced.schema.json"), "{}");
    assert.throws(
      () => checkContractLayout(root),
      /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/,
    );
  } finally {
    assert(
      path
        .resolve(root)
        .startsWith(path.resolve(tmpdir()) + path.sep + "oc-contract-layout-"),
    );
    rmSync(root, { recursive: true, force: true });
  }
});
