import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';
import path from 'node:path';
import { validateContractPaths } from './layout.mjs';
import {
  canonical,
  sha256,
  parseJSON,
  pointer,
  safePath,
  readLocal,
} from './consumer-gate.mjs';

const encode = (token) => token.replaceAll('~', '~0').replaceAll('/', '~1');
const HTTP = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const FUNCTIONAL_ROLES = new Set(['consumer', 'producer', 'semantic-owner']);
const DIALECTS = new Set([
  'https://json-schema.org/draft/2020-12/schema',
  'https://spec.openapis.org/oas/3.1/dialect/base',
]);
const SCHEMA_MAPS = new Set([
  '$defs',
  'definitions',
  'properties',
  'patternProperties',
  'dependentSchemas',
]);
const SCHEMA_ARRAYS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_CHILDREN = new Set([
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'items',
  'contains',
  'unevaluatedItems',
  'not',
  'if',
  'then',
  'else',
  'contentSchema',
]);
const childContext = (kind, name, location) => {
  if (kind === 'map' || kind === 'array') return 'schema';
  if (kind === 'schema') {
    if (SCHEMA_MAPS.has(name)) return 'map';
    if (SCHEMA_ARRAYS.has(name)) return 'array';
    if (SCHEMA_CHILDREN.has(name)) return 'schema';
    return 'other';
  }
  if (location === '/components' && name === 'schemas') return 'map';
  return name === 'schema' ? 'schema' : 'other';
};
const gitCache = new Map();
const verifiedCommits = new Set();
export function parseSource(bytes, file) {
  if (file.endsWith('.json')) return parseJSON(bytes.toString('utf8'));
  const parsed = parseDocument(bytes.toString('utf8'), { uniqueKeys: true });
  assert.equal(
    parsed.errors.length,
    0,
    'Invalid YAML ' + file + ': ' + parsed.errors.map((error) => error.message).join('; '),
  );
  return parsed.toJS({ maxAliasCount: 0 });
}
export function gitReader(root, revision) {
  assert(/^[a-f0-9]{40}$/.test(revision), 'Source revision must be a resolved commit');
  const identity = path.resolve(root) + ':' + revision;
  if (!verifiedCommits.has(identity)) {
    const resolved = execFileSync('git', ['-C', root, 'rev-parse', revision + '^{commit}'])
      .toString()
      .trim();
    assert.equal(resolved, revision, 'Source commit did not resolve exactly');
    verifiedCommits.add(identity);
  }
  return (file) => {
    safePath(root, file);
    const key = identity + ':' + file;
    if (!gitCache.has(key))
      gitCache.set(
        key,
        execFileSync('git', ['-C', root, 'show', revision + ':' + file], {
          maxBuffer: 8 * 1024 * 1024,
        }),
      );
    return gitCache.get(key);
  };
}
export const worktreeReader = (root) => (file) =>
  Buffer.from(readLocal(root, file).toString('utf8').replaceAll('\r\n', '\n'));
export function operationPointers(document) {
  const operations = new Map();
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP.has(method) || !operation?.operationId) continue;
      assert(
        !operations.has(operation.operationId),
        'Duplicate operationId ' + operation.operationId,
      );
      operations.set(operation.operationId, '/paths/' + encode(route) + '/' + method);
    }
  }
  return operations;
}
function runtimeValue(row) {
  // Only known OpenAPI operation annotations are safely documentary here.
  // Recursive removal would hide payload properties named summary/examples.
  if (
    /^\/paths\/[^/]+\/(get|post|put|patch|delete|head|options|trace)$/.test(row.pointer) &&
    typeof row.value?.operationId === 'string'
  ) {
    return Object.fromEntries(
      Object.entries(row.value).filter(([key]) => !['summary', 'externalDocs'].includes(key)),
    );
  }
  return row.value;
}
export function resolveSelection(read, descriptor, dependency, registry = {}) {
  const domains = [...new Set(
    [...(registry.contracts ?? []), ...(registry.planned ?? [])].map((row) => row.domain),
  )];
  assert.equal(
    dependency.version,
    descriptor.version,
    'Declared version differs from registry',
  );
  const documents = new Map(),
    bytes = new Map(),
    selected = new Map(),
    seen = new Set();
  const load = (file) => {
    if (!documents.has(file)) {
      const b = read(file);
      bytes.set(file, b);
      documents.set(file, parseSource(b, file));
    }
    return documents.get(file);
  };
  const root = descriptor.path,
    doc = load(root);
  if (doc.openapi)
    assert.equal(
      doc.info?.version,
      descriptor.version,
      'Wire version differs from declaration',
    );
  const resourceContext = (value, location, kind) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    // Schema dictionaries hold names; a definition named "properties" is still a schema.
    if (kind !== 'schema') return [];
    return ['$schema', '$id']
      .filter((name) => Object.hasOwn(value, name))
      .map((name) => {
        assert(typeof value[name] === 'string', 'Invalid schema resource context ' + name);
        if (name === '$schema') assert(DIALECTS.has(value[name]), 'Unsupported schema dialect');
        else assert(location === '', 'Embedded schema resource scope is unsupported');
        return name;
      });
  };
  const context = (file, fragment) => {
    const document = load(file);
    const record = (location, value) =>
      selected.set(file + '#' + location, { path: file, pointer: location, value });
    if (Object.hasOwn(document, 'openapi')) {
      assert(/^3\.1\.\d+$/.test(document.openapi), 'Unsupported OpenAPI interpretation');
      record('/openapi', document.openapi);
      if (Object.hasOwn(document, 'jsonSchemaDialect')) {
        assert(DIALECTS.has(document.jsonSchemaDialect), 'Unsupported schema dialect');
        record('/jsonSchemaDialect', document.jsonSchemaDialect);
      }
    }
    // A selected fragment inherits the interpretation of its enclosing resource.
    // Retain only context fields, rather than selecting unrelated sibling schemas.
    const parts = fragment === '' ? [] : decodeURIComponent(fragment).slice(1).split('/');
    let value = document,
      location = '',
      kind = document.openapi ? 'other' : 'schema';
    for (let index = 0; index <= parts.length; index++) {
      for (const name of resourceContext(value, location, kind))
        record(location + '/' + name, value[name]);
      if (index < parts.length) {
        const token = parts[index].replaceAll('~1', '/').replaceAll('~0', '~');
        kind = childContext(kind, token, location);
        value = value[token];
        location += '/' + encode(token);
      }
    }
    return kind;
  };
  const visit = (file, fragment) => {
    const key = file + '#' + fragment;
    if (seen.has(key)) return;
    seen.add(key);
    const value = pointer(load(file), fragment);
    const kind = context(file, fragment);
    selected.set(key, { path: file, pointer: fragment, value });
    walk(value, file, fragment, kind);
  };
  const ref = (reference, currentFile, schemaReference = true) => {
    const split = reference.indexOf('#');
    const rawFile = split < 0 ? reference : reference.slice(0, split);
    const fragment = split < 0 ? '' : reference.slice(split + 1);
    let target;
    const resourceId = schemaReference ? load(currentFile).$id : undefined;
    const uri = rawFile && resourceId ? new URL(rawFile, resourceId).href : rawFile;
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
      const found = (descriptor.uriMappings ?? []).find((item) => item.uri === uri);
      assert(found, 'Unmapped external reference ' + reference);
      target = found.path;
    } else
      target = rawFile
        ? path.posix.normalize(path.posix.join(path.posix.dirname(currentFile), rawFile))
        : currentFile;
    safePath('.', target);
    if (!/^(openapi|commands|events|errors)\//.test(target)) {
      validateContractPaths([target], { domains, preserved: [] });
      assert(!schemaReference || !target.includes('/fixtures/'), 'Schema reference to a fixture');
    }
    visit(target, fragment);
  };
  const walk = (value, currentFile, location, kind) => {
    if (!value || typeof value !== 'object') return;
    resourceContext(value, location, kind);
    for (const [name, item] of Object.entries(value)) {
      assert(
        !['$dynamicRef', '$recursiveRef', '$anchor', '$dynamicAnchor'].includes(name),
        'Unsupported reference dialect ' + name,
      );
      if (name === '$ref' && typeof item === 'string') ref(item, currentFile);
      // externalValue is a local example dependency, never fetched over network.
      else if (name === 'externalValue' && typeof item === 'string')
        ref(item, currentFile, false);
      else
        walk(
          item,
          currentFile,
          location + '/' + encode(name),
          childContext(kind, name, location),
        );
    }
  };
  const operations = operationPointers(doc);
  assert.equal(
    new Set(dependency.operations).size,
    dependency.operations.length,
    'Duplicate selected operation',
  );
  for (const id of dependency.operations) {
    assert(operations.has(id), 'Unknown selected operation ' + id);
    const fragment = operations.get(id),
      operation = pointer(doc, fragment);
    visit(root, fragment);
    const pathFragment = fragment.slice(0, fragment.lastIndexOf('/'));
    if (pointer(doc, pathFragment).parameters) visit(root, pathFragment + '/parameters');
    const security = operation.security ?? doc.security;
    if (operation.security === undefined && doc.security) visit(root, '/security');
    for (const requirement of security ?? [])
      for (const name of Object.keys(requirement))
        visit(root, '/components/securitySchemes/' + encode(name));
    if (doc.servers) visit(root, '/servers');
    if (pointer(doc, pathFragment).servers) visit(root, pathFragment + '/servers');
  }
  for (const fragment of dependency.pointers) visit(root, fragment);
  assert(selected.size > 0, 'Empty dependency selection');
  const rows = [...selected.values()].sort((a, b) =>
    (a.path + '#' + a.pointer).localeCompare(b.path + '#' + b.pointer, 'en'),
  );
  return {
    files: [...bytes]
      .map(([file, b]) => ({ path: file, sha256: sha256(b) }))
      .sort((a, b) => a.path.localeCompare(b.path, 'en')),
    units: rows.map(({ path: file, pointer: fragment, value }) => ({
      path: file,
      pointer: fragment,
      sha256: sha256(canonical(value)),
    })),
    selectionSha256: sha256(canonical(rows)),
    runtimeSha256: sha256(canonical(rows.map((row) => ({ ...row, value: runtimeValue(row) })))),
    values: rows,
  };
}
function assertFunctionalAdmission(registry, dependency, files) {
  if (!FUNCTIONAL_ROLES.has(dependency.role)) return;
  const selected = new Set(files.map((file) => file.path));
  const draft = registry.contracts.find((row) => row.status === 'draft' && selected.has(row.path));
  assert(!draft, 'New use of a draft is forbidden: ' + draft?.id);
}
export function makeLock(root, manifest, manifestBytes, registry, pins = []) {
  const entries = manifest.contracts.map((dependency) => {
    const registered = registry.contracts.find((item) => item.id === dependency.id);
    assert(
      registered && registered.status !== 'planned',
      'Unknown/unmaterialized contract ' + dependency.id,
    );
    assertFunctionalAdmission(registry, dependency, [{ path: registered.path }]);
    const pinned = pins.find(
      (item) =>
        item.id === dependency.id &&
        item.role === dependency.role &&
        item.version === dependency.version,
    );
    if (pinned) {
      assert.equal(
        pinned.root,
        registered.path,
        'Pinned root does not identify the registered contract',
      );
      if (pinned.tag !== null) {
        assert.equal(
          execFileSync('git', ['-C', root, 'rev-parse', pinned.tag + '^{commit}'])
            .toString()
            .trim(),
          pinned.commit,
          'Pinned tag commit drift',
        );
        assert.equal(
          execFileSync('git', ['-C', root, 'rev-parse', pinned.tag]).toString().trim(),
          pinned.tagObject,
          'Pinned tag object drift',
        );
      }
    }
    const descriptor = pinned
      ? {
          ...registered,
          commit: pinned.commit,
          version: pinned.version,
          tag: pinned.tag,
          tagObject: pinned.tagObject,
        }
      : registered;
    const closure = resolveSelection(
      gitReader(root, descriptor.commit),
      descriptor,
      dependency,
      registry,
    );
    assertFunctionalAdmission(registry, dependency, closure.files);
    return {
      id: dependency.id,
      role: dependency.role,
      version: dependency.version,
      sourceRepository: 'opencomerix/contracts',
      commit: descriptor.commit,
      tag: descriptor.tag,
      tagObject: descriptor.tagObject,
      root: descriptor.path,
      operations: dependency.operations,
      pointers: dependency.pointers,
      files: closure.files,
      units: closure.units,
      selectionSha256: closure.selectionSha256,
      runtimeSha256: closure.runtimeSha256,
    };
  });
  const assets = manifest.assets.map((asset) => {
    const entry = entries.find((item) => item.id === asset.contractId);
    assert(entry, 'Undeclared asset contract');
    const bytes = gitReader(root, entry.commit)(asset.sourcePath);
    return {
      ...asset,
      sourceSha256: sha256(bytes),
      semanticSha256:
        asset.representation === 'json-format'
          ? sha256(canonical(parseJSON(bytes.toString('utf8'))))
          : null,
    };
  });
  return {
    formatVersion: 1,
    service: manifest.service,
    manifestSha256: sha256(manifestBytes),
    entries,
    assets,
  };
}
export function classifyImpact(locked, next) {
  if (locked.selectionSha256 === next.selectionSha256) return 'none';
  if (locked.runtimeSha256 === next.runtimeSha256) return 'documentation';
  // Shapes alone cannot prove semantic substitutability. Review is mandatory.
  return 'review-required';
}
export function impactForConsumer(snapshot, registry, read) {
  const results = [];
  for (let index = 0; index < snapshot.manifest.contracts.length; index++) {
    const dependency = snapshot.manifest.contracts[index];
    const matches = snapshot.lock.entries.filter(
      (item) => item.id === dependency.id && item.role === dependency.role,
    );
    assert.equal(matches.length, 1, 'Snapshot lock drift');
    const locked = matches[0],
      descriptor = registry.contracts.find((item) => item.id === dependency.id);
    assert(descriptor, 'Consumer contract omitted from registry');
    try {
      const next = resolveSelection(read, descriptor, dependency, registry);
      assertFunctionalAdmission(registry, dependency, next.files);
      const classification =
        dependency.role === 'documentation' && locked.selectionSha256 !== next.selectionSha256
          ? 'documentation'
          : classifyImpact(locked, next);
      if (classification !== 'none')
        results.push({
          contract: dependency.id,
          role: dependency.role,
          classification,
          lockedCommit: locked.commit,
          changedUnits: next.units
            .filter(
              (unit) =>
                !locked.units.some(
                  (old) =>
                    old.path === unit.path &&
                    old.pointer === unit.pointer &&
                    old.sha256 === unit.sha256,
                ),
            )
            .map((unit) => unit.path + '#' + unit.pointer),
          removedUnits: locked.units
            .filter(
              (unit) =>
                !next.units.some(
                  (item) => item.path === unit.path && item.pointer === unit.pointer,
                ),
            )
            .map((unit) => unit.path + '#' + unit.pointer),
          gates:
            classification === 'documentation' ? ['pnpm contracts:metadata'] : dependency.gates,
          decision:
            classification === 'review-required'
              ? 'Compatibility/semantic approval required; do not update consumers automatically'
              : 'Documentation/fixture validation; admission unchanged',
        });
    } catch (error) {
      results.push({
        contract: dependency.id,
        role: dependency.role,
        classification: 'unresolved',
        gates: dependency.gates,
        decision: error.message,
      });
    }
  }
  for (const asset of snapshot.lock.assets ?? []) {
    const dependency = snapshot.manifest.contracts.find((item) => item.id === asset.contractId);
    assert(dependency, 'Asset contract omitted from manifest');
    try {
      const bytes = read(asset.sourcePath);
      const changed =
        asset.representation === 'json-format'
          ? sha256(canonical(parseJSON(bytes.toString('utf8')))) !== asset.semanticSha256
          : sha256(bytes) !== asset.sourceSha256;
      if (changed)
        results.push({
          contract: asset.contractId,
          role: asset.purpose,
          asset: asset.destination,
          classification:
            asset.purpose === 'runtime'
              ? 'review-required'
              : asset.purpose === 'validation'
                ? 'validation'
                : 'documentation',
          changedUnits: [asset.sourcePath + '#'],
          removedUnits: [],
          gates:
            asset.purpose === 'documentation' ? ['pnpm contracts:metadata'] : dependency.gates,
          decision:
            'Source asset changed; retain admitted copy until reviewed metadata migration',
        });
    } catch (error) {
      results.push({
        contract: asset.contractId,
        role: asset.purpose,
        asset: asset.destination,
        classification: 'unresolved',
        gates: dependency.gates,
        decision: error.message,
      });
    }
  }
  return {
    service: snapshot.manifest.service,
    affected: results.length > 0,
    dependencies: results,
  };
}
