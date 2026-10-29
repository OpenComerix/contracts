import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureConsumerMetadata, captureConsumerManifests, validateCaptureConsumers,
  captureConsumerHistoricalFile, captureConsumerHistoricalRegistry, captureConsumerHistoricalSnapshot, captureConsumerHistoricalIndex, withCaptureConsumers } from '../../scripts/inventory/capture-consumers-v1.mjs';
import { validateAdmission, admissionHistoricalFile, admissionHistoricalRegistry } from '../../scripts/inventory/capture-authority-v2-admission.mjs';
import { validateCaptureSource } from '../../scripts/inventory/capture-authority-v2.mjs';
import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';
import { salesHistoricalIndex } from '../../scripts/sales/inventory-step-consumer-v1.mjs';

const registryPath = 'registry/contracts.json';
test('F1-11B admits only the three coordinated consumer selections and preserves prior pins', () => {
  assert.deepEqual(validateCaptureConsumers(), { consumers: 7, roots: 202, preserved: 236, previousPinsPreserved: true, runtimeDemonstrated: false });
  const manifests = captureConsumerManifests();
  assert.deepEqual([...manifests.keys()], ['identity-tenancy', 'catalog-pricing', 'inventory']);
  const inventory = manifests.get('inventory');
  assert.equal(inventory.assets.length, 0);
  assert.deepEqual(inventory.contracts.filter(row => row.role === 'producer').flatMap(row => row.operations), ['authorizeInventoryCatalogCapture']);
  assert(!inventory.contracts.some(row => row.operations.some(operation => /Stock|Warehouse|Price|Sale/.test(operation))));
  assert.equal(validateAdmission().consumers, 6); // Earlier admission remains its own historical cut.
  assert.equal(validateCaptureSource().consumers, 6);
});
test('the public metadata/manifests cannot poison immutable expected state', () => {
  const metadata = captureConsumerMetadata(); metadata.get(registryPath).fill(0); metadata.clear();
  const manifests = captureConsumerManifests(); manifests.get('inventory').contracts.length = 0;
  assert.equal(validateCaptureConsumers().consumers, 7);
});
test('caller mutations are passed through rather than repaired by historical projections', () => {
  const changed = Buffer.from(readRepositoryFile(registryPath).toString().replace('"inventory"', '"unrelated"'));
  assert.deepEqual(captureConsumerHistoricalFile(registryPath, changed), changed);
  assert.deepEqual(admissionHistoricalFile(registryPath, changed), changed);
  const object = JSON.parse(changed); assert.deepEqual(captureConsumerHistoricalRegistry(object), object);
  assert.deepEqual(admissionHistoricalRegistry(object), object);
});

test('direct historical snapshot readers admit only the fully verified new Catalog export', () => {
  const current = JSON.parse(readRepositoryFile('registry/consumers/catalog-pricing.json'));
  const before = structuredClone(current);
  const historical = captureConsumerHistoricalSnapshot(current);
  assert.equal(historical.manifest.contracts.length, current.manifest.contracts.length - 5);
  assert.deepEqual(current, before);
  for (const change of [s => s.manifest.contracts.pop(), s => {s.lock.entries[0].commit = 'a'.repeat(40);}, s => {s.publication = 'local-candidate';}, s => {s.sourceCommit = 'a'.repeat(40);}]) {
    const altered = structuredClone(current); change(altered);
    assert.equal(captureConsumerHistoricalSnapshot(altered), altered);
  }
});
test('direct historical index readers preserve original drift rejection', () => {
  const current = JSON.parse(readRepositoryFile('registry/consumers/index.json'));
  const before = structuredClone(current);
  assert.equal(captureConsumerHistoricalIndex(current).consumers.length, 6);
  assert.equal(salesHistoricalIndex(current).consumers.length, 5);
  assert.deepEqual(current, before);
  const altered = structuredClone(current); altered.consumers.pop();
  assert.equal(captureConsumerHistoricalIndex(altered), altered);
  const wrong = structuredClone(current); wrong.coverage = 'unapproved';
  assert.equal(salesHistoricalIndex(wrong), wrong);
});

const paths = [...captureConsumerMetadata().keys(),
  'inventory/http/private/v2/inventory-catalog-capture-authority-v2.yaml',
  'catalog/http/private/v1/catalog-inventory-capture-v1.yaml',
  'identity/http/shared/v1/identity-inventory-authority-policy-v1.json',
];
for (const file of paths) for (const mutation of ['changed', 'missing']) {
  test(`warmed guards reject ${mutation}: ${file}`, t => {
    const metadata = captureConsumerMetadata(), registry = metadata.get(registryPath), object = JSON.parse(registry);
    const index = JSON.parse(metadata.get('registry/consumers/index.json'));
    const snapshot = JSON.parse(metadata.get('registry/consumers/catalog-pricing.json'));
    validateCaptureConsumers(); validateAdmission(); validateCaptureSource();
    const original = fs.readFileSync;
    const affected = new URL('../../' + file, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('/', '\\');
    const stub = t.mock.method(fs, 'readFileSync', function (target, ...args) {
      const supplied = String(target).replaceAll('/', '\\');
      if (supplied === affected) {
        if (mutation === 'missing') throw Object.assign(new Error('synthetic missing source'), { code: 'ENOENT' });
        const bytes = original.call(this, target, ...args);
        return Buffer.concat([Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), Buffer.from('\nsynthetic drift')]);
      }
      return original.call(this, target, ...args);
    });
    t.after(() => stub.mock.restore());
    assert.throws(() => validateCaptureConsumers());
    assert.throws(() => validateAdmission());
    assert.throws(() => validateCaptureSource());
    assert.throws(() => withCaptureConsumers(readRepositoryFile, () => true));
    assert.throws(() => captureConsumerHistoricalFile(registryPath, registry));
    assert.throws(() => captureConsumerHistoricalRegistry(object));
    assert.throws(() => captureConsumerHistoricalIndex(index));
    assert.throws(() => salesHistoricalIndex(index));
    assert.throws(() => captureConsumerHistoricalSnapshot(snapshot));
    assert.throws(() => admissionHistoricalFile(registryPath, registry));
    assert.throws(() => admissionHistoricalRegistry(object));
  });
}
