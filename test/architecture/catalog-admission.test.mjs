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
const admissionRevision = '7b3996185ba57879d63a281f067b435a115857cb';
const admissionBaseline = JSON.parse(gitReader(root, admissionRevision)('registry/contracts.json'));
const previousIds = new Set(baseline.contracts.map(row => row.id));
const added = registry.contracts.filter(row => !previousIds.has(row.id));
// Closed list of the authorized F1-08C candidate intentions; no admission is added.
const historyPlanned = [
  { id: 'common.data-lifecycle-policy.v1', domain: 'common', owner: 'platform-contracts', materializeIn: 'F1-08C', status: 'planned', constraint: 'Candidate metadata only; admission requires a separate reviewed publication cut. No runtime, purge, R2-R4 protocol or consumer migration.' },
  { id: 'catalog.history-policy.v1', domain: 'catalog', owner: 'catalog-pricing', materializeIn: 'F1-08C', status: 'planned', constraint: 'Candidate metadata only; admission requires a separate reviewed publication cut. No runtime, purge, R2-R4 protocol or consumer migration.' },
];
// Closed list of the authorized F1-08E R2 candidates; no admission or wildcard.
const protectionPlanned = [
  ['catalog.history-protection.http.v1', 'catalog'],
  ['catalog.history-protection.schema.v1', 'catalog'],
  ['catalog.history-protection.policy.v1', 'catalog'],
  ['catalog.history-protection.fixtures.v1', 'catalog'],
  ['common.error-catalog.v7', 'common'],
  ['common.error-catalog.v7.schema', 'common'],
].map(([id, domain]) => ({ id, domain, owner: domain === 'catalog' ? 'catalog-pricing' : 'platform-contracts', materializeIn: 'F1-08E', status: 'planned', constraint: 'Candidate R2 source only; admission in separate authorized cut. No enabled sources, runtime or consumer migration.' }));
const recoveryPlanned = [
  { id: 'identity.catalog-recovery-authority.v1', domain: 'identity', owner: 'identity-tenancy', materializeIn: 'F1-08F', status: 'planned', constraint: 'Candidate R3 authority only; explicit MFA/person/grant binding. No identity runtime, SQL, cryptography, producer or consumer migration.' },
  { id: 'identity.catalog-recovery-authority.v1.schema', domain: 'identity', owner: 'identity-tenancy', materializeIn: 'F1-08F', status: 'planned', constraint: 'Candidate R3 schema only; opaque grant reference is not a JWT or password. Admission requires a separate reviewed publication cut.' },
  { id: 'identity.catalog-recovery-authority-v1-fixtures', domain: 'identity', owner: 'identity-tenancy', materializeIn: 'F1-08F', status: 'planned', constraint: 'Candidate R3 validation fixtures only; fixtures do not prove authority, MFA, revocation, SQL or cryptography.' },
  { id: 'catalog.history-recovery.schema.v1', domain: 'catalog', owner: 'catalog-pricing', materializeIn: 'F1-08F', status: 'planned', constraint: 'Candidate R3/R4 selection context only; selection and destination do not grant authority and no recovery API is enabled.' },
  { id: 'catalog.history-recovery.fixtures.v1', domain: 'catalog', owner: 'catalog-pricing', materializeIn: 'F1-08F', status: 'planned', constraint: 'Candidate negative fixtures only; no runtime recovery or consumer migration.' },
];
// Closed list of the authorized F1-08G R4 candidates; no new admission.
const recoveryProtocolPlanned = [
  ['catalog.history-recovery.http.v1', 'catalog'],
  ['catalog.history-recovery.protocol.v1', 'catalog'],
  ['catalog.history-recovery.policy.v1', 'catalog'],
  ['catalog.history-recovery.protocol-fixtures.v1', 'catalog'],
  ['common.error-catalog.v8', 'common'],
  ['common.error-catalog.v8.schema', 'common'],
].map(([id, domain]) => ({ id, domain, owner: domain === 'catalog' ? 'catalog-pricing' : 'platform-contracts', materializeIn: 'F1-08G', status: 'planned', constraint: 'Candidate R4 only; no runtime, admission, new reader, locks or consumer migration. Preserve published R1/R2/R3 and F1-07 bytes.' }));

const verificationPlanned = [
  {
    "id": "identity.catalog-recovery-verification.http.v2",
    "domain": "identity",
    "owner": "identity-tenancy",
    "materializeIn": "F1-08G",
    "status": "planned",
    "constraint": "Candidate versioned verification only; original issuance from freshly verified R3 grant. No runtime, admission, locks or consumer migration; preserve published R3 v1 bytes."
  },
  {
    "id": "identity.catalog-recovery-verification.schema.v2",
    "domain": "identity",
    "owner": "identity-tenancy",
    "materializeIn": "F1-08G",
    "status": "planned",
    "constraint": "Candidate versioned verification only; original issuance from freshly verified R3 grant. No runtime, admission, locks or consumer migration; preserve published R3 v1 bytes."
  },
  {
    "id": "identity.catalog-recovery-verification.policy.v2",
    "domain": "identity",
    "owner": "identity-tenancy",
    "materializeIn": "F1-08G",
    "status": "planned",
    "constraint": "Candidate versioned verification only; original issuance from freshly verified R3 grant. No runtime, admission, locks or consumer migration; preserve published R3 v1 bytes."
  },
  {
    "id": "identity.catalog-recovery-verification.fixtures.v2",
    "domain": "identity",
    "owner": "identity-tenancy",
    "materializeIn": "F1-08G",
    "status": "planned",
    "constraint": "Candidate versioned verification only; original issuance from freshly verified R3 grant. No runtime, admission, locks or consumer migration; preserve published R3 v1 bytes."
  }
];

test('G preserves historical descriptors, consumer exports, pins and deferred sale intention', () => {
  assert.deepEqual(admissionBaseline.contracts.filter(row => previousIds.has(row.id)), baseline.contracts);
  assert.deepEqual(registry.preservedFiles, baseline.preservedFiles);
  assert.deepEqual(registry.requiredConsumers, baseline.requiredConsumers);
  assert.equal(registry.baselineCommit, baseline.baselineCommit);
  assert.deepEqual(registry.planned, [...baseline.planned.filter(row => row.materializeIn !== 'F1-07'), ...historyPlanned, ...protectionPlanned, ...recoveryPlanned, ...recoveryProtocolPlanned, ...verificationPlanned]);
  const files = ['registry/consumers/index.json', ...registry.requiredConsumers.map(name => 'registry/consumers/' + name + '.json')];
  for (const file of files) {
    const local = readFileSync(path.join(root, file)).toString('utf8').replaceAll('\r\n', '\n');
    assert.equal(local, gitReader(root, revision)(file).toString('utf8'), file);
  }
});

test('G inventory stays intact; F1-08C/E/F/G only append their closed lists of planned intentions', () => {
  const files = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', revision])
    .toString().trim().split('\n')
    .filter(file => /^(catalog\/(http|events)|identity\/http|common\/(http|errors))\//.test(file));
  assert.equal(new Set(added.map(row => row.path)).size, added.length);
  assert.deepEqual(added.filter(row => row.surface !== 'validation').map(row => row.path).sort(), files.sort());
  assert.deepEqual(registry.planned.map(row => row.id), ['sales.complete-snapshot.successor', ...historyPlanned.map(row => row.id), ...protectionPlanned.map(row => row.id), ...recoveryPlanned.map(row => row.id), ...recoveryProtocolPlanned.map(row => row.id), ...verificationPlanned.map(row => row.id)]);
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

test('F1-08B envelope admission plus F1-08C/E/F/G planned intentions preserve all other registry metadata and source bytes', () => {
  const expected = structuredClone(admissionBaseline);
  const envelope = expected.contracts.find(row => row.id === 'common.event-envelope.v1');
  assert.equal(envelope.status, 'draft');
  envelope.status = 'active';
  expected.planned.push(...historyPlanned, ...protectionPlanned, ...recoveryPlanned, ...recoveryProtocolPlanned, ...verificationPlanned);
  assert.deepEqual(registry, expected);
  const source = gitReader(root, envelope.commit)(envelope.path);
  assert.equal(sha256(source), envelope.sha256);
  assert.equal(readFileSync(path.join(root, envelope.path)).toString('utf8').replaceAll('\r\n', '\n'), source.toString('utf8'));
});

for (const descriptor of eventProfiles)
  test('M1 historical registry rejects its draft closure, including pins and impact: ' + descriptor.id, () => {
    assert.equal(eventProfiles.length, 8);
    const envelope = admissionBaseline.contracts.find(row => row.id === 'common.event-envelope.v1');
    assert.equal(envelope.status, 'draft');
    let observation;
    for (const role of ['validation', 'documentation', 'local-result']) {
      const manifest = selectedManifest(descriptor, role);
      const lock = makeLock(root, manifest, manifestBytes(manifest), admissionBaseline);
      assert(lock.entries[0].files.some(row => row.path === envelope.path));
      if (role === 'validation') observation = lock;
    }
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const manifest = selectedManifest(descriptor, role);
      const pinned = { ...observation.entries[0], role };
      const forbidden = /New use of a draft is forbidden: common\.event-envelope\.v1/;
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), admissionBaseline), forbidden);
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), admissionBaseline, [pinned]), forbidden);
      const report = impactForConsumer({ manifest, lock: { entries: [pinned], assets: [] } }, admissionBaseline, gitReader(root, revision));
      assert.equal(report.affected, true);
      assert.equal(report.dependencies.length, 1);
      assert.equal(report.dependencies[0].classification, 'unresolved');
      assert.match(report.dependencies[0].decision, forbidden);
      assert.deepEqual(report.dependencies[0].gates, manifest.contracts[0].gates);
    }
  });

for (const descriptor of eventProfiles)
  test('F1-08B admits the unchanged event closure, including pins and impact: ' + descriptor.id, () => {
    assert.equal(eventProfiles.length, 8);
    const observation = selectedManifest(descriptor, 'validation');
    const previous = makeLock(root, observation, manifestBytes(observation), admissionBaseline).entries[0];
    const envelope = registry.contracts.find(row => row.id === 'common.event-envelope.v1');
    assert.equal(envelope.status, 'active');
    assert(previous.files.some(row => row.path === envelope.path && row.sha256 === envelope.sha256));
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const manifest = selectedManifest(descriptor, role);
      const expected = { ...previous, role };
      const lock = makeLock(root, manifest, manifestBytes(manifest), registry);
      assert.deepEqual(lock.entries, [expected]);
      assert.deepEqual(makeLock(root, manifest, manifestBytes(manifest), registry, [expected]), lock);
      const report = impactForConsumer({ manifest, lock }, registry, gitReader(root, revision));
      assert.equal(report.affected, false);
      assert.deepEqual(report.dependencies, []);
    }
  });

for (const descriptor of registry.contracts.filter(row => row.status === 'draft'))
  test('F1-08B retains the functional prohibition for other actual drafts: ' + descriptor.id, () => {
    const observation = selectedManifest(descriptor, 'validation');
    const previous = makeLock(root, observation, manifestBytes(observation), registry).entries[0];
    const blockedDependency = registry.contracts.find(row => row.status === 'draft' && previous.files.some(file => file.path === row.path));
    assert(blockedDependency);
    const forbidden = error => error instanceof assert.AssertionError &&
      error.message === 'New use of a draft is forbidden: ' + descriptor.id;
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const manifest = selectedManifest(descriptor, role);
      const pinned = { ...previous, role };
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), registry), forbidden);
      assert.throws(() => makeLock(root, manifest, manifestBytes(manifest), registry, [pinned]), forbidden);
      const report = impactForConsumer({ manifest, lock: { entries: [pinned], assets: [] } }, registry, gitReader(root, descriptor.commit));
      assert.equal(report.affected, true);
      assert.equal(report.dependencies.length, 1);
      assert.equal(report.dependencies[0].classification, 'unresolved');
      assert.equal(report.dependencies[0].decision, 'New use of a draft is forbidden: ' + blockedDependency.id);
      assert.deepEqual(report.dependencies[0].gates, manifest.contracts[0].gates);
    }
  });

test('M1 permits an active HTTP selection without selecting unrelated draft URI mappings', () => {
  const descriptor = admissionBaseline.contracts.find(row => row.id === 'catalog.http.public.v1');
  const envelope = admissionBaseline.contracts.find(row => row.id === 'common.event-envelope.v1');
  assert.equal(envelope.status, 'draft');
  assert(descriptor.uriMappings.some(row => row.path === envelope.path));
  for (const role of ['producer', 'consumer', 'semantic-owner']) {
    const manifest = selectedManifest(descriptor, role, ['listCatalogUnits'], []);
    const lock = makeLock(root, manifest, manifestBytes(manifest), admissionBaseline);
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
