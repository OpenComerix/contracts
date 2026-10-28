import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const legacyTransports = ["openapi", "events", "commands", "errors"];
const domainTransports = ["http", "events", "commands", "errors"];

// Registry remains the only inventory of domains and preserved legacy paths.
export function layoutRegistry(root) {
  const registry = JSON.parse(
    readFileSync(path.join(root, "registry/contracts.json"), "utf8"),
  );
  assert.equal(registry.formatVersion, 1, "LAYOUT_REGISTRY_VERSION");
  assert(
    Array.isArray(registry.contracts) &&
      Array.isArray(registry.planned) &&
      Array.isArray(registry.preservedFiles),
    "LAYOUT_REGISTRY_INCOMPLETE",
  );
  const domains = [
    ...new Set(
      [...registry.contracts, ...registry.planned].map((row) => row.domain),
    ),
  ].sort();
  assert(
    domains.length > 0 &&
      domains.every((domain) => /^[a-z][a-z0-9-]*$/.test(domain)),
    "LAYOUT_DOMAINS",
  );
  return { domains, preserved: registry.preservedFiles.map((row) => row.path) };
}

export function contractDirectories(root) {
  const { domains } = layoutRegistry(root);
  return [
    ...legacyTransports.map((type) => path.join(root, type)),
    ...domains.flatMap((domain) =>
      domainTransports.map((type) => path.join(root, domain, type)),
    ),
  ].filter(existsSync);
}

export function validateContractPaths(files, { domains, preserved }) {
  const legacy = new Set(preserved);
  for (const file of files) {
    assert(
      typeof file === "string" &&
        !file.includes("\\") &&
        !file.split("/").some((part) => [".", "..", ""].includes(part)),
      "LAYOUT_PATH",
    );
    if (legacy.has(file)) continue;
    const [domain, ...parts] = file.split("/");
    assert(
      domains.includes(domain),
      "LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN: " + file,
    );
    const relative = parts.join("/");
    const http =
      /^http\/(?:public|private|shared)\/v[1-9][0-9]*\/[^/]+\.(?:json|yaml)$/;
    const message =
      /^(?:events|commands|errors)\/v[1-9][0-9]*\/[^/]+\.(?:json|yaml)$/;
    const fixture =
      /^fixtures\/[a-z][a-z0-9-]*\/v[1-9][0-9]*\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.json$/;
    assert(
      http.test(relative) || message.test(relative) || fixture.test(relative),
      "LAYOUT_SURFACE_VERSION_OR_FIXTURE: " + file,
    );
  }
}

export function checkContractLayout(root) {
  const registry = layoutRegistry(root);
  const files = [];
  function visit(absolute, relative) {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      assert(!entry.isSymbolicLink(), "LAYOUT_LINK_FORBIDDEN: " + name);
      if (entry.isDirectory()) visit(path.join(absolute, entry.name), name);
      else files.push(name);
    }
  }
  for (const transport of legacyTransports)
    if (existsSync(path.join(root, transport)))
      visit(path.join(root, transport), transport);
  const infrastructure = new Set([
    ".git",
    "node_modules",
    ".pnpm-store",
    ".corepack-cache",
    ".npm-cache",
    ".ci-artifacts",
    "registry",
    "scripts",
    "test",
    "tools",
  ]);
  const rootMetadata = new Set([
    "package.json",
    "pnpm-lock.yaml",
    ".gitlab-ci.yml",
  ]);
  const presentDomains = new Set();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".github") {
      assert(entry.isDirectory() && !entry.isSymbolicLink(), "LAYOUT_LINK_FORBIDDEN");
      const start = files.length;
      visit(path.join(root, entry.name), entry.name);
      const infrastructureFiles = files.splice(start);
      assert(
        infrastructureFiles.every((file) => file === ".github/workflows/ci.yml"),
        "LAYOUT_UNKNOWN_GITHUB_INFRASTRUCTURE",
      );
      continue;
    }
    if (infrastructure.has(entry.name) || legacyTransports.includes(entry.name))
      continue;
    assert(!entry.isSymbolicLink(), "LAYOUT_LINK_FORBIDDEN");
    if (!entry.isDirectory()) {
      if (
        /\.(?:json|yaml|yml)$/.test(entry.name) &&
        !rootMetadata.has(entry.name)
      )
        files.push(entry.name);
      continue;
    }
    if (!registry.domains.includes(entry.name)) {
      visit(path.join(root, entry.name), entry.name);
      continue;
    }
    presentDomains.add(entry.name);
    const directory = path.join(root, entry.name);
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      if (["index.json", "README.md"].includes(child.name) && child.isFile())
        continue;
      assert(!child.isSymbolicLink(), "LAYOUT_LINK_FORBIDDEN");
      if (child.isDirectory())
        visit(path.join(directory, child.name), entry.name + "/" + child.name);
      else files.push(entry.name + "/" + child.name);
    }
  }
  for (const domain of registry.domains)
    assert(presentDomains.has(domain), "LAYOUT_DOMAIN_UNAVAILABLE: " + domain);
  validateContractPaths(files, registry);
  return {
    files: files.length,
    domains: registry.domains.length,
    legacy: registry.preserved.length,
  };
}
