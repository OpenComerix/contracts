import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readJSON, sha256, validateShape } from '../../tools/architecture/consumer-gate.mjs';
import { gitReader, impactForConsumer, makeLock, parseSource, resolveSelection } from '../../tools/architecture/graph.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const revision = '68d923e903b6341eedb980af3586890c0eab7d5e';
const registry = readJSON(root, 'registry/contracts.json');
const baseline = JSON.parse(gitReader(root, revision)('registry/contracts.json'));
const previousIds = new Set(baseline.contracts.map(row => row.id));
const added = registry.contracts.filter(row => !previousIds.has(row.id));

test('G preserves historical descriptors, consumer exports, pins and deferred sale intention', () => {
  assert.deepEqual(registry.contracts.filter(row => previousIds.has(row.id)), baseline.contracts);
  assert.deepEqual(registry.preservedFiles, baseline.preservedFiles);
  assert.deepEqual(registry.requiredConsumers, baseline.requiredConsumers);
  assert.equal(registry.baselineCommit, baseline.baselineCommit);
  assert.deepEqual(registry.planned, baseline.planned.filter(row => row.materializeIn !== 'F1-07'));
  const files = ['registry/consumers/index.json', ...registry.requiredConsumers.map(name => 'registry/consumers/' + name + '.json')];
  for (const file of files) {
    const local = readFileSync(path.join(root, file)).toString('utf8').replaceAll('\r\n', '\n');
    assert.equal(local, gitReader(root, revision)(file).toString('utf8'), file);
  }
});

test('G inventory covers every new transport root and only removes materialized planned entries', () => {
  const files = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', revision])
    .toString().trim().split('\n')
    .filter(file => /^(catalog\/(http|events)|identity\/http|common\/(http|errors))\//.test(file));
  assert.equal(new Set(added.map(row => row.path)).size, added.length);
  assert.deepEqual(added.filter(row => row.surface !== 'validation').map(row => row.path).sort(), files.sort());
  assert.deepEqual(registry.planned.map(row => row.id), ['sales.complete-snapshot.successor']);
  assert.equal(added.filter(row => row.surface === 'events').length, 4);
  assert.equal(added.filter(row => row.id.endsWith('.consumer')).length, 4);
  assert.equal(added.find(row => row.id === 'catalog.events.v1.asyncapi').status, 'draft');
});

for (const descriptor of added)
  test('G resolves immutable source closure without changing a consumer: ' + descriptor.id, () => {
    assert.equal(descriptor.commit, revision);
    assert.equal(descriptor.tag, null);
    assert.equal(descriptor.tagObject, null);
    assert.equal(sha256(gitReader(root, revision)(descriptor.path)), descriptor.sha256);
    const source = parseSource(gitReader(root, revision)(descriptor.path), descriptor.path);
    if (source.info?.version) assert.equal(descriptor.version, source.info.version);
    if (source.policy_version !== undefined) assert.equal(descriptor.version, String(source.policy_version));
    const manifest = {
      contracts: [{ id: descriptor.id, role: 'validation', version: descriptor.version, operations: descriptor.operations, pointers: [''] }],
      assets: [],
    };
    const lock = makeLock(root, manifest, Buffer.from(JSON.stringify(manifest)), registry);
    assert(lock.entries[0].files.some(row => row.path === descriptor.path));
    assert.equal(lock.entries[0].commit, revision);
  });

const manifestSchema = readJSON(root, 'registry/manifest-v1.schema.json');
function selectedManifest(descriptor, role, operations = [], pointers = ['']) {
  const manifest = {
    formatVersion: 1,
    service: 'catalog-pricing',
    contracts: [{
      id: descriptor.id,
      role,
      version: descriptor.version,
      operations,
      pointers,
      purpose: 'Verify immutable source admission without migrating any consumer.',
      gates: ['pnpm test:architecture'],
    }],
    assets: [],
    bindings: [],
  };
  validateShape(manifest, manifestSchema);
  return manifest;
}
const manifestBytes = (manifest) => Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
const eventProfiles = added.filter(row => row.surface === 'events' || row.id.endsWith('.consumer'));
for (const descriptor of eventProfiles)
  test('M1 rejects functional use of the actual draft closure, including pins and impact: ' + descriptor.id, () => {
    assert.equal(eventProfiles.length, 8);
    const envelope = registry.contracts.find(row => row.id === 'common.event-envelope.v1');
    assert.equal(envelope.status, 'draft');
    let observation;
    for (const role of ['validation', 'documentation', 'local-result']) {
      const manifest = selectedManifest(descriptor, role);
      const lock = makeLock(root, manifest, manifestBytes(manifest), registry);
      assert(lock.entries[0].files.some(row => row.path === envelope.path));
      if (role === 'validation') observation = lock;
    }
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const manifest = selectedManifest(descriptor, role);
      const pinned = { ...observation.entries[0], role };
      const forbidden = /New use of a draft is forbidden: common\.event-envelope\.v1/;
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), registry), forbidden);
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), registry, [pinned]), forbidden);
      const report = impactForConsumer({ manifest, lock: { entries: [pinned], assets: [] } }, registry, gitReader(root, revision));
      assert.equal(report.affected, true);
      assert.equal(report.dependencies.length, 1);
      assert.equal(report.dependencies[0].classification, 'unresolved');
      assert.match(report.dependencies[0].decision, forbidden);
      assert.deepEqual(report.dependencies[0].gates, manifest.contracts[0].gates);
    }
  });

test('M1 permits an active HTTP selection without selecting unrelated draft URI mappings', () => {
  const descriptor = registry.contracts.find(row => row.id === 'catalog.http.public.v1');
  const envelope = registry.contracts.find(row => row.id === 'common.event-envelope.v1');
  assert(descriptor.uriMappings.some(row => row.path === envelope.path));
  for (const role of ['producer', 'consumer', 'semantic-owner']) {
    const manifest = selectedManifest(descriptor, role, ['listCatalogUnits'], []);
    const lock = makeLock(root, manifest, manifestBytes(manifest), registry);
    assert(!lock.entries[0].files.some(row => row.path === envelope.path));
  }
});

const domainRegistry = { contracts: [{ domain: 'catalog' }, { domain: 'common' }], planned: [] };
const docPath = 'catalog/http/public/v1/api.json';
const selection = { version: '1.0.0', operations: [], pointers: [''] };
const descriptor = { path: docPath, version: '1.0.0', uriMappings: [] };
test('domain schema and example references require registered domain/surface/version', () => {
  const schema = 'common/http/shared/v3/types.json';
  const example = 'catalog/fixtures/http/v1/examples/ok.json';
  // URI mappings exercise absolute resource identities without network access.
  const files = { [docPath]: { $ref: 'https://example.invalid/types' }, [schema]: { type: 'string' } };
  const mapped = { ...descriptor, uriMappings: [{ uri: 'https://example.invalid/types', path: schema }] };
  const read = file => Buffer.from(JSON.stringify(files[file]));
  assert(resolveSelection(read, mapped, selection, domainRegistry).files.some(row => row.path === schema));
  assert.throws(() => resolveSelection(read, mapped, selection), /REQUIRES_DOMAIN/);
  const examples = { [docPath]: { externalValue: '../../../../' + example }, [example]: { value: 'synthetic' } };
  assert(resolveSelection(file => Buffer.from(JSON.stringify(examples[file])), descriptor, selection, domainRegistry).files.some(row => row.path === example));
  for (const target of ['other/http/public/v1/types.json', 'common/http/unknown/v1/types.json', 'common/http/shared/types.json', 'common/unclassified.json', 'catalog/fixtures/http/v1/examples/ok.json']) {
    const bad = { ...descriptor, uriMappings: [{ uri: 'https://example.invalid/types', path: target }] };
    assert.throws(() => resolveSelection(read, bad, selection, domainRegistry), /REQUIRES_DOMAIN|SURFACE_VERSION|Schema reference to a fixture/);
  }
});
