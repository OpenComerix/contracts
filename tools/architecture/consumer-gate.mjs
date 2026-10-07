import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonical(item))));
  if (value && typeof value === 'object')
    return JSON.stringify(
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, JSON.parse(canonical(value[key]))]),
      ),
    );
  return JSON.stringify(value);
}
export function parseJSON(text) {
  let offset = 0;
  const space = () => {
    while (/\s/.test(text[offset] ?? '')) offset++;
  };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '\\') {
        offset += 2;
        continue;
      }
      if (text[offset++] === '"') return JSON.parse(text.slice(start, offset));
    }
    throw new Error('Unterminated JSON string');
  };
  const value = () => {
    space();
    if (text[offset] === '{') {
      offset++;
      space();
      const keys = new Set();
      if (text[offset] === '}') {
        offset++;
        return;
      }
      while (offset < text.length) {
        space();
        assert.equal(text[offset], '"', 'Expected object key');
        const key = string();
        assert(!keys.has(key), 'Duplicate JSON key ' + key);
        keys.add(key);
        space();
        assert.equal(text[offset++], ':');
        value();
        space();
        if (text[offset] === '}') {
          offset++;
          return;
        }
        assert.equal(text[offset++], ',');
      }
      throw new Error('Unterminated JSON object');
    }
    if (text[offset] === '[') {
      offset++;
      space();
      if (text[offset] === ']') {
        offset++;
        return;
      }
      while (offset < text.length) {
        value();
        space();
        if (text[offset] === ']') {
          offset++;
          return;
        }
        assert.equal(text[offset++], ',');
      }
      throw new Error('Unterminated JSON array');
    }
    if (text[offset] === '"') {
      string();
      return;
    }
    const start = offset;
    while (offset < text.length && !/[\s,}\]]/.test(text[offset])) offset++;
    assert(offset > start, 'Invalid JSON value');
  };
  value();
  space();
  assert.equal(offset, text.length, 'Trailing JSON content');
  return JSON.parse(text);
}
export function safePath(root, relative) {
  assert(
    typeof relative === 'string' &&
      relative.length > 0 &&
      !relative.includes('\\') &&
      !relative.includes('\0'),
    'Invalid relative path',
  );
  assert(
    !path.posix.isAbsolute(relative) && !/^[a-z][a-z0-9+.-]*:/i.test(relative),
    'Absolute path is forbidden',
  );
  assert(
    !relative.split('/').some((segment) => segment === '..' || segment === '.' || !segment),
    'Path traversal is forbidden',
  );
  const base = path.resolve(root),
    target = path.resolve(base, relative);
  assert(target.startsWith(base + path.sep), 'Path escaped root');
  return target;
}
export function readLocal(root, relative) {
  const target = safePath(root, relative),
    base = realpathSync(root),
    actual = realpathSync(target);
  assert(actual.startsWith(base + path.sep), 'Symlink escaped root');
  return readFileSync(target);
}
export const readJSON = (root, relative) => parseJSON(readLocal(root, relative).toString('utf8'));
export function pointer(document, fragment) {
  if (fragment === '') return document;
  fragment = decodeURIComponent(fragment);
  assert(fragment.startsWith('/'), 'Unsupported pointer ' + fragment);
  let value = document;
  for (const encoded of fragment.slice(1).split('/')) {
    assert(!/~(?![01])/u.test(encoded), 'Invalid pointer escape ' + fragment);
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(
      value !== null && typeof value === 'object' && Object.hasOwn(value, key),
      'Unresolved pointer ' + fragment,
    );
    value = value[key];
  }
  return value;
}
export function validateShape(value, schema, document = schema, label = '$') {
  const supported = new Set([
    '$schema',
    '$id',
    '$defs',
    '$ref',
    'type',
    'const',
    'enum',
    'minLength',
    'pattern',
    'minItems',
    'uniqueItems',
    'items',
    'required',
    'properties',
    'additionalProperties',
  ]);
  for (const key of Object.keys(schema))
    assert(supported.has(key), 'Unsupported metadata schema keyword ' + key);
  if (schema.$ref)
    return validateShape(value, pointer(document, schema.$ref.slice(1)), document, label);
  if (Object.hasOwn(schema, 'const')) assert.deepEqual(value, schema.const, label + ': const');
  if (schema.enum)
    assert(
      schema.enum.some((item) => canonical(item) === canonical(value)),
      label + ': enum',
    );
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(
      types.some((type) =>
        type === 'null'
          ? value === null
          : type === 'array'
            ? Array.isArray(value)
            : type === 'object'
              ? value !== null && typeof value === 'object' && !Array.isArray(value)
              : type === 'integer'
                ? Number.isInteger(value)
                : typeof value === type,
      ),
      label + ': type',
    );
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined)
      assert(value.length >= schema.minLength, label + ': minLength');
    if (schema.pattern) assert(new RegExp(schema.pattern).test(value), label + ': pattern');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined)
      assert(value.length >= schema.minItems, label + ': minItems');
    if (schema.uniqueItems)
      assert.equal(new Set(value.map(canonical)).size, value.length, label + ': uniqueItems');
    if (schema.items)
      value.forEach((item, index) =>
        validateShape(item, schema.items, document, label + '[' + index + ']'),
      );
  } else if (value !== null && typeof value === 'object') {
    for (const key of schema.required ?? [])
      assert(Object.hasOwn(value, key), label + ': required ' + key);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key])
        validateShape(item, schema.properties[key], document, label + '.' + key);
      else if (schema.additionalProperties === false) assert.fail(label + ': unexpected ' + key);
    }
  }
}
export function validateConsumer(root) {
  const manifestBytes = readLocal(root, 'contracts.manifest.json');
  const manifest = parseJSON(manifestBytes.toString('utf8'));
  const lock = readJSON(root, 'contracts.lock.json');
  validateShape(manifest, readJSON(root, '.contracts/manifest-v1.schema.json'));
  validateShape(lock, readJSON(root, '.contracts/lock-v1.schema.json'));
  assert.equal(lock.service, manifest.service, 'Service identity mismatch');
  assert.equal(lock.manifestSha256, sha256(manifestBytes), 'Manifest/lock drift');
  assert.equal(lock.entries.length, manifest.contracts.length, 'Omitted/extra contract');
  const keys = new Set();
  for (const entry of manifest.contracts) {
    const key = entry.id + ':' + entry.role;
    assert(!keys.has(key), 'Duplicate dependency ' + key);
    keys.add(key);
    assert(entry.gates.length > 0, 'Missing evidence gate ' + key);
    assert(
      entry.operations.length > 0 || entry.pointers.length > 0,
      'Empty dependency selection ' + key,
    );
    const matches = lock.entries.filter((item) => item.id === entry.id && item.role === entry.role);
    assert.equal(matches.length, 1, 'Ambiguous lock ' + key);
    const locked = matches[0];
    assert.equal(locked.version, entry.version, 'Version admission ' + key);
    assert.deepEqual(locked.operations, entry.operations, 'Operation drift ' + key);
    assert.deepEqual(locked.pointers, entry.pointers, 'Pointer drift ' + key);
    for (const file of locked.files) safePath(root, file.path);
    assert.equal(
      new Set(locked.files.map((file) => file.path)).size,
      locked.files.length,
      'Duplicate source file',
    );
    assert.equal(
      new Set(locked.units.map((unit) => unit.path + '#' + unit.pointer)).size,
      locked.units.length,
      'Duplicate dependency unit',
    );
    assert(
      locked.files.some((file) => file.path === locked.root),
      'Root omitted from closure',
    );
    for (const unit of locked.units)
      assert(
        locked.files.some((file) => file.path === unit.path),
        'Unit file omitted from closure',
      );
    if (locked.tag !== null)
      assert(
        locked.tagObject !== null && /^[a-f0-9]{40}$/.test(locked.tagObject),
        'Tag object missing',
      );
  }
  assert.equal(lock.assets.length, manifest.assets.length, 'Asset inventory drift');
  const assets = new Set();
  for (let index = 0; index < manifest.assets.length; index++) {
    const asset = manifest.assets[index],
      locked = lock.assets[index];
    assert(!assets.has(asset.destination), 'Duplicate asset destination');
    assets.add(asset.destination);
    for (const key of Object.keys(asset))
      assert.equal(locked[key], asset[key], 'Asset declaration drift ' + key);
    assert(
      manifest.contracts.some((entry) => entry.id === asset.contractId),
      'Asset has undeclared contract',
    );
    safePath(root, asset.sourcePath);
    const localBytes = readLocal(root, asset.destination);
    assert.equal(sha256(localBytes), locked.localSha256, 'Local asset drift ' + asset.destination);
    if (asset.representation === 'exact')
      assert.equal(locked.sourceSha256, locked.localSha256, 'Exact copy differs');
    else
      assert.equal(
        sha256(canonical(parseJSON(localBytes.toString('utf8')))),
        locked.semanticSha256,
        'JSON formatting changed contract semantics',
      );
  }
  for (const binding of manifest.bindings) {
    const entries = manifest.contracts.filter(
      (entry) => entry.id === binding.contractId && entry.role === 'consumer',
    );
    assert.equal(entries.length, 1, 'Ambiguous operation binding');
    const text = readLocal(root, binding.path).toString('utf8');
    let ids;
    if (binding.kind === 'gateway-operation-registry')
      ids = [...text.matchAll(/operationId:\s*'([^']+)'/g)].map((match) => match[1]);
    else {
      const start = text.indexOf('export const UI_OPERATION_CONTRACTS');
      assert(start >= 0, 'Missing UI matrix');
      const rest = text.slice(start),
        end = rest.indexOf('\n});');
      assert(end >= 0, 'Unterminated UI matrix');
      ids = [...rest.slice(0, end).matchAll(/^  ([A-Za-z]\w*):\s*\{/gm)].map((match) => match[1]);
    }
    assert.equal(new Set(ids).size, ids.length, 'Duplicate observed operation');
    assert.deepEqual(
      [...ids].sort(),
      [...entries[0].operations].sort(),
      'Manifest/runtime operation drift',
    );
  }
  const tooling = readJSON(root, '.contracts/provenance.json');
  assert.equal(tooling.formatVersion, 1);
  assert.equal(tooling.sourceRepository, 'opencomerix/contracts');
  assert(
    ['local-candidate', 'published'].includes(tooling.publication),
    'Invalid tooling lifecycle',
  );
  assert(/^[a-f0-9]{40}$/.test(tooling.sourceBaseCommit), 'Missing tooling base revision');
  assert.deepEqual(
    tooling.files.map((file) => file.destination).sort(),
    ['.contracts/gate.mjs', '.contracts/lock-v1.schema.json', '.contracts/manifest-v1.schema.json'],
    'Incomplete tooling bundle',
  );
  for (const file of tooling.files)
    assert.equal(sha256(readLocal(root, file.destination)), file.sha256, 'Tooling drift');
  return {
    service: manifest.service,
    dependencies: lock.entries.length,
    assets: lock.assets.length,
    bindings: manifest.bindings.length,
    tooling: tooling.publication,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(validateConsumer(process.cwd())));
}
