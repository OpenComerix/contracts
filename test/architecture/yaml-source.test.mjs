import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseSource, resolveSelection } from '../../tools/architecture/graph.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const parse = text => parseSource(Buffer.from(text), 'test.yaml');

test('accepts finite value aliases without changing expanded JSON semantics', () => {
  assert.deepEqual(parse('a: &x [1, {b: true}]\nb: *x\nc: &s value\nd: *s\n'),
    { a: [1, { b: true }], b: [1, { b: true }], c: 'value', d: 'value' });
  assert.deepEqual(parse('a:\nb: [null, ]\n'), { a: null, b: [null] });
  assert.deepEqual(parse('a: &x !!map {value: !!str text}\nb: *x\nc: !!seq [!!int 1, !!bool true, !!null null, !!float 1.5]\n'),
    { a: { value: 'text' }, b: { value: 'text' }, c: [1, true, null, 1.5] });
  assert.deepEqual(parse('1: one\ntrue: boolean\nnull: empty\n'), { 1: 'one', true: 'boolean', '': 'empty' });
});

for (const [name, text, reason] of [
  ['self cycle', 'a: &a [*a]', /YAML_ALIAS_CYCLE/],
  ['indirect cycle', 'a: &a {b: &b [*a]}', /YAML_ALIAS_CYCLE/],
  ['missing anchor', 'a: *missing', /YAML_ALIAS_UNKNOWN/],
  ['forward anchor', 'a: *x\nb: &x 1', /YAML_ALIAS_UNKNOWN/],
  ['redefined anchor', 'a: &x 1\nb: &x 2\nc: *x', /YAML_ANCHOR_AMBIGUOUS/],
  ['merge', 'a: &x {b: 1}\nc: {<<: *x}', /YAML_MERGE_UNSUPPORTED/],
  ['duplicate key through alias', 'a: &x {b: 1, b: 2}\nc: *x', /Invalid YAML/],
  ['alias key', 'a: &x key\n*x : value', /YAML_SCALAR_KEYS/],
  ['set collection', 'a: !!set {x: null}', /YAML_JSON_TAG/],
  ['set collection alias', 'a: &v !!set {x: null}\nb: *v', /YAML_JSON_TAG/],
  ['ordered map', 'a: &v !!omap [x: 1]\nb: *v', /YAML_JSON_TAG/],
  ['pairs collection', 'a: &v !!pairs [x: 1]\nb: *v', /YAML_JSON_TAG/],
  ['binary scalar', 'a: &v !!binary eA==\nb: *v', /YAML_JSON_TAG/],
  ['timestamp scalar', 'a: &v !!timestamp 2026-10-16\nb: *v', /YAML_JSON_TAG/],
  ['unknown tag', 'a: &v !custom value\nb: *v', /YAML_JSON_TAG/],
  ['numeric key collision', '1: &v first\n"1": second\ncopy: *v', /YAML_KEY_COLLISION/],
  ['boolean key collision', 'true: &v first\n"true": second\ncopy: *v', /YAML_KEY_COLLISION/],
  ['null key collision', 'null: &v first\n"": second\ncopy: *v', /YAML_KEY_COLLISION/],
  ['nested key collision through alias', 'a: &v {1: first, "1": second}\nb: *v', /YAML_KEY_COLLISION/],
  ['nonfinite scalar', 'a: &x .inf\nb: *x', /YAML_JSON_NUMBER/],
  ['deep syntax', 'a: ' + '['.repeat(130) + '1' + ']'.repeat(130), /YAML_DEPTH/],
  ['deep alias chain', 'a0: &a0 [0]\n' + Array.from({ length: 66 }, (_, i) => 'a' + (i + 1) + ': &a' + (i + 1) + ' [*a' + i + ']').join('\n'), /YAML_EXPANDED_DEPTH/],
  ['excessive references', 'a: &x [1]\nb: [' + Array(101).fill('*x').join(',') + ']', /Excessive alias count/],
  ['expanded bytes', 'a: &x ' + 'a'.repeat(100000) + '\nb: [' + Array(90).fill('*x').join(',') + ']', /YAML_EXPANDED_BYTES/],
  ['expanded nodes', 'a: &x [' + Array(2000).fill('1').join(',') + ']\nb: [' + Array(60).fill('*x').join(',') + ']', /YAML_EXPANDED_NODES/],
  ['too many implicit null nodes', '-\n'.repeat(100001), /YAML_SYNTAX_NODES/],
  ['oversized source', '# ' + 'a'.repeat(8 * 1024 * 1024), /YAML_SOURCE_BYTES/],
]) test('rejects unsupported or excessive YAML: ' + name, () => assert.throws(() => parse(text), reason));

for (const [name, text, reason] of [
  ['set alias', 'a: &v !!set {x: null}\nb: *v', /YAML_JSON_TAG/],
  ['colliding keys', '1: &v first\n"1": second\ncopy: *v', /YAML_KEY_COLLISION/],
]) test('graph rejects lossy YAML before producing hashes: ' + name, () => {
  const file = 'openapi/test.yaml';
  assert.throws(() => resolveSelection(() => Buffer.from(text), { path: file, version: 'v1', uriMappings: [] },
    { version: 'v1', operations: [], pointers: [''] }, { contracts: [] }), reason);
});

test('published R4 resolves identically to explicit expanded JSON, preserving source-byte hashes', () => {
  const file = 'catalog/http/private/v1/catalog-history-recovery-v1.yaml';
  const bytes = fs.readFileSync(path.join(root, file));
  const expanded = parseSource(bytes, file);
  const read = source => source === file ? bytes : fs.readFileSync(path.join(root, source));
  const descriptor = { id: 'catalog.history-recovery.http.v1', path: file, version: '1.0.0',
    uriMappings: [] };
  // All imported schema resources need explicit mappings, as before aliases.
  for (const source of [
    'catalog/http/shared/v1/catalog-history-recovery-protocol-v1.schema.json',
    'catalog/http/shared/v1/catalog-history-recovery-v1.schema.json',
    'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json',
    'common/http/shared/v3/problem-details-v3.schema.json',
    'events/event-envelope-v1.schema.json',
    'catalog/events/v1/catalog-event-data-v1.schema.json',
    ...['catalog.category.changed.v1', 'catalog.product.changed.v1', 'catalog.presentation.changed.v1',
      'pricing.presentation-price.changed.v1'].map(name => 'catalog/events/v1/' + name + '.schema.json'),
  ]) {
    const schema = JSON.parse(read(source));
    if (schema.$id) descriptor.uriMappings.push({ uri: schema.$id, path: source });
  }
  const dependency = { version: '1.0.0', operations: ['createCatalogHistoryRecovery', 'readCatalogHistoryRecoveryPage'], pointers: [] };
  const registry = { contracts: [{ domain: 'catalog' }, { domain: 'identity' }, { domain: 'common' }] };
  const actual = resolveSelection(read, descriptor, dependency, registry);
  const explicit = resolveSelection(source => source === file ? Buffer.from(JSON.stringify(expanded)) : read(source), descriptor, dependency, registry);
  assert.deepEqual(actual.units, explicit.units);
  assert.deepEqual(actual.values, explicit.values);
  assert.equal(actual.selectionSha256, explicit.selectionSha256);
  assert.equal(actual.runtimeSha256, explicit.runtimeSha256);
  assert.notEqual(actual.files.find(row => row.path === file).sha256, explicit.files.find(row => row.path === file).sha256);
  assert(bytes.equals(fs.readFileSync(path.join(root, file))));
});
