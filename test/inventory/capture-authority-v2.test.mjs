import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeLock, parseSource } from '../../tools/architecture/graph.mjs';
import { withoutToolingCI } from '../../scripts/ci/pipeline-v1.mjs';
import { root, source, actual, text, encode, httpPath, schemaPath, fixturePath, sourceFiles,
  successorSchema, successorHttp, successorRegistry, expectedContents, captureFingerprint,
  validateCaptureBinding, validateCaptureSource, validateSourceScope,
  captureHistoricalFile, captureHistoricalRegistry } from '../../scripts/inventory/capture-authority-v2.mjs';

const fixture = () => JSON.parse(actual(fixturePath));
test('v2 preserves all v1 fields and adds only the exact capture fingerprint in both shapes', () => {
  const old = JSON.parse(source('inventory/http/shared/v1/inventory-capture-authority-v1.schema.json'));
  const next = JSON.parse(actual(schemaPath));
  assert.deepEqual(next, successorSchema());
  for (const name of ['Request', 'Decision']) {
    assert.equal(next.$defs[name].additionalProperties, false);
    assert.deepEqual(next.$defs[name].required, [...old.$defs[name].required, 'capture_fingerprint']);
    delete next.$defs[name].properties.capture_fingerprint;
    next.$defs[name].required.pop();
  }
  next.$id = old.$id;
  next.title = old.title;
  assert.deepEqual(next, old);
});
test('the successor has just the existing callback, workload, caller and audience', () => {
  const old = JSON.parse(source('inventory/http/private/v1/inventory-internal-v1.yaml'));
  const next = JSON.parse(actual(httpPath));
  assert.deepEqual(next, successorHttp());
  assert.equal(next.info.version, '2.0.0');
  assert.deepEqual(Object.keys(next.paths), ['/internal/inventory/catalog-capture-authorizations']);
  const op = Object.values(next.paths)[0].post;
  assert.equal(op.operationId, 'authorizeInventoryCatalogCapture');
  assert.equal(op['x-caller'], 'catalog-pricing');
  assert.equal(op['x-audience'], 'inventory.catalog-capture-authority');
  assert.deepEqual(next.servers, old.servers);
  assert.deepEqual(next.security, old.security);
  assert.deepEqual(Object.keys(next.components.securitySchemes), ['workload']);
  const restored = JSON.parse(JSON.stringify(op).replaceAll(
    '../../shared/v2/inventory-capture-authority-v2.schema.json', '../../shared/v1/inventory-capture-authority-v1.schema.json'));
  restored.description = Object.values(old.paths).find(item => item.post?.operationId === op.operationId).post.description;
  assert.deepEqual(restored, old.paths['/internal/inventory/catalog-capture-authorizations'].post);
});
test('the full binding succeeds without replacing the original human request hash', () => {
  const { capture, query, decision } = fixture();
  validateCaptureBinding(capture, query, decision);
  assert.equal(captureFingerprint(capture), query.capture_fingerprint);
  assert.notEqual(query.capture_fingerprint, query.request_hash);
  assert.equal(query.request_hash, capture.request_hash);
});
for (const [name, mutate] of [
  ['quantity', value => { value.lines[0].quantity = '4'; }],
  ['quantity representation', value => { value.lines[0].quantity = '2.0'; }],
  ['presentation', value => { value.lines[0].presentation_id = value.lines[0].line_id; }],
  ['product version', value => { value.lines[0].product_version++; }],
  ['presentation version', value => { value.lines[0].presentation_version++; }],
  ['line', value => { value.lines[0].line_id = value.lines[1].line_id; }],
  ['order', value => { value.lines.reverse(); }],
  ['line count', value => { value.lines.pop(); }],
  ['tenant', value => { value.organization_id = 'another-tenant'; }],
  ['operation', value => { value.operation_id = value.preparation_id; }],
  ['preparation', value => { value.preparation_id = value.operation_id; }],
  ['human hash', value => { value.request_hash = 'f'.repeat(64); }],
]) test('a changed ' + name + ' cannot reuse the prior preparation decision', () => {
  const { capture, query, decision } = fixture();
  mutate(capture);
  assert.notEqual(captureFingerprint(capture), query.capture_fingerprint);
  assert.throws(() => validateCaptureBinding(capture, query, decision), /IC2_CAPTURE_FINGERPRINT/);
});
test('v1 callback collision is distinguished by the full capture fingerprint', () => {
  const { capture, query, decision } = fixture();
  const changed = structuredClone(capture);
  changed.lines[0].quantity = '4';
  const projectV1 = body => ({ organization_id: body.organization_id, operation_id: body.operation_id,
    preparation_id: body.preparation_id, request_hash: body.request_hash, target: query.target });
  assert.deepEqual(projectV1(capture), projectV1(changed));
  assert.notEqual(captureFingerprint(capture), captureFingerprint(changed));
  assert.throws(() => validateCaptureBinding(changed, query, decision));
});
test('JCS ignores object key order, preserves array order and rejects invalid numbers/unicode', () => {
  const { capture } = fixture();
  const reordered = Object.fromEntries(Object.entries(capture).reverse());
  reordered.lines = capture.lines.map(line => Object.fromEntries(Object.entries(line).reverse()));
  assert.equal(captureFingerprint(reordered), captureFingerprint(capture));
  assert.throws(() => captureFingerprint({ invalid: 1.5 }));
  assert.throws(() => captureFingerprint({ invalid: '\ud800' }));
});
for (const field of ['capture_fingerprint', 'request_hash', 'organization_id', 'operation_id', 'preparation_id', 'caller', 'audience', 'authorized'])
  test('decision mismatch or omission is rejected: ' + field, () => {
    const { capture, query, decision } = fixture();
    const wrong = { ...decision, [field]: field === 'authorized' ? false : 'different' };
    assert.throws(() => validateCaptureBinding(capture, query, wrong));
    delete decision[field];
    assert.throws(() => validateCaptureBinding(capture, query, decision));
  });
test('source has two planned intentions and preserves all existing admissions/consumers', () => {
  assert.deepEqual(validateCaptureSource(), { admitted: 0, addedPlanned: 2, roots: 200, preserved: 236, consumers: 6, runtime_demonstrated: false });
  assert.deepEqual(validateSourceScope(), { paths: sourceFiles.length });
  const before = JSON.parse(source('registry/contracts.json')), after = successorRegistry();
  assert.deepEqual(after.contracts, before.contracts);
  assert.deepEqual(after.requiredConsumers, before.requiredConsumers);
  assert.deepEqual(after.planned.slice(0, -2), before.planned);
});
for (const role of ['producer', 'consumer', 'semantic-owner', 'validation'])
  test('the candidate successor remains unavailable to ' + role, () => {
    for (const row of successorRegistry().planned.slice(-2)) {
      const manifest = { contracts: [{ id: row.id, role, version: 'v2', operations: [], pointers: [''] }], assets: [] };
      assert.throws(() => makeLock(root, manifest, encode(manifest), successorRegistry()), /Unknown\/unmaterialized contract/);
    }
  });
for (const file of [...expectedContents().keys(), 'inventory/http/private/v1/inventory-internal-v1.yaml',
  'inventory/http/shared/v1/inventory-capture-authority-v1.schema.json', 'registry/consumers/catalog-pricing.json', 'package.json', 'pnpm-lock.yaml'])
  test('the complete source refuses drift and omission: ' + file, () => {
    assert.throws(() => validateCaptureSource(name => name === file ? Buffer.concat([actual(name), Buffer.from('\nUnapproved')]) : actual(name)));
    assert.throws(() => validateCaptureSource(name => { if (name === file) throw Error('Synthetic missing source'); return actual(name); }));
  });
test('prior gates receive only the exact verified delta and never repaired caller drift', () => {
  for (const file of ['registry/contracts.json', 'inventory/index.json', '.gitlab-ci.yml', 'inventory/README.md', 'registry/README.md']) {
    assert.equal(text(captureHistoricalFile(file, actual(file))), text(source(file)));
    const drift = Buffer.concat([actual(file), Buffer.from('drift')]);
    assert.equal(captureHistoricalFile(file, drift), drift);
  }
  assert.deepEqual(captureHistoricalRegistry(successorRegistry()), JSON.parse(source('registry/contracts.json')));
  const drift = successorRegistry(); drift.planned.push({ id: 'unapproved' });
  assert.equal(captureHistoricalRegistry(drift), drift);
  const before = parseSource(source('.gitlab-ci.yml'), '.gitlab-ci.yml');
  const after = parseSource(Buffer.from(withoutToolingCI(text(actual('.gitlab-ci.yml')))), '.gitlab-ci.yml');
  assert.deepEqual(Object.keys(after), Object.keys(before));
  after['validate:inventory-contracts'].script.splice(-2);
  after['validate:inventory-schema'].script.pop();
  assert.deepEqual(after, before);
});
test('new sources and unrelated files are never projected to a nonexistent historical artifact', () => {
  for (const file of [httpPath, schemaPath, fixturePath, 'unrelated.json']) {
    const bytes = Buffer.from('synthetic caller bytes');
    assert.equal(captureHistoricalFile(file, bytes), bytes);
  }
  const external = expectedContents();
  external.get('registry/contracts.json').fill(0);
  validateCaptureSource(actual);
  assert.doesNotThrow(() => validateCaptureSource(file => actual(file)));
});

for (const file of [httpPath, schemaPath, fixturePath, 'registry/contracts.json', 'inventory/index.json',
  'inventory/README.md', 'registry/README.md', 'scripts/ci/retired-gitlab-v1.mjs',
  'scripts/sales/inventory-step-consumer-v1.mjs',
  'inventory/http/private/v1/inventory-internal-v1.yaml',
  'inventory/http/shared/v1/inventory-capture-authority-v1.schema.json',
  'registry/consumers/catalog-pricing.json', 'package.json', 'pnpm-lock.yaml'])
  for (const mutation of ['changed', 'missing'])
    test('warmed validation and both projections reject ' + mutation + ': ' + file, t => {
      const registryBytes = actual('registry/contracts.json');
      const registry = JSON.parse(registryBytes);
      validateCaptureSource();
      captureHistoricalFile('registry/contracts.json', registryBytes);
      captureHistoricalRegistry(registry);
      const original = fs.readFileSync.bind(fs);
      const target = path.resolve(root, file);
      let reads = 0;
      t.mock.method(fs, 'readFileSync', (name, ...options) => {
        if (typeof name === 'string' && path.resolve(name) === target) {
          reads++;
          if (mutation === 'missing')
            throw Object.assign(new Error('Synthetic source unavailable after warmup'), { code: 'ENOENT' });
          return Buffer.concat([original(name, ...options), Buffer.from('\nUnapproved')]);
        }
        return original(name, ...options);
      });
      assert.throws(() => validateCaptureSource());
      assert.throws(() => captureHistoricalFile('registry/contracts.json', registryBytes));
      assert.throws(() => captureHistoricalRegistry(registry));
      assert.equal(reads, 3, 'Every entry must read the current source after warmup');
    });
