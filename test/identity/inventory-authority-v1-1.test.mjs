import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeLock, parseSource } from '../../tools/architecture/graph.mjs';
import {
  root, source, actual, hash, originalPath, successorPath, fixturePath, packagePath,
  validateSuccessorPackage, successorDocument, successorRegistry, successorCI,
  successorHistoricalFile, successorHistoricalRegistry, withSuccessorScope, changedPaths,
} from '../../scripts/identity/inventory-authority-v1-1.mjs';

test('HTTP 1.1.0 adds only the two 400 selectors and candidate version metadata', () => {
  const document = JSON.parse(actual(successorPath));
  assert.deepEqual(document, successorDocument());
  assert.equal(hash(actual(originalPath)), hash(source(originalPath)));
  const before = JSON.parse(source(originalPath));
  for (const [route, item] of Object.entries(document.paths)) {
    assert(!Object.hasOwn(before.paths[route].post.responses, '400'));
    const response = structuredClone(item.post.responses['400']);
    assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
    assert.equal(response.content['application/problem+json'].schema.allOf[1].properties.status.const, 400);
    assert.deepEqual(response.content['application/problem+json'].schema.allOf[1].properties.code.enum, ['identity_invalid_request']);
    delete item.post.responses['400'];
    document.info = before.info;
  }
  assert.deepEqual(document, before);
});
test('full package preserves all 199 roots, transports, consumers, dependencies and unrelated planned', () => {
  const { roots, planned, operations, functional_admission, runtime_demonstrated } = validateSuccessorPackage();
  assert.deepEqual({ roots, planned, operations, functional_admission, runtime_demonstrated },
    { roots: 199, planned: 3, operations: 2, functional_admission: false, runtime_demonstrated: false });
});
test('historical source view retains the exact intention and two Inventory CI scripts', () => {
  assert.deepEqual(JSON.parse(actual('registry/contracts.json')), successorRegistry());
  assert.deepEqual(parseSource(actual('.gitlab-ci.yml'), '.gitlab-ci.yml'), successorCI());
  assert.equal(Object.keys(successorCI()).length, Object.keys(parseSource(source('.gitlab-ci.yml'), '.gitlab-ci.yml')).length);
});
for (const role of ['producer', 'consumer', 'semantic-owner', 'validation']) {
  test('planned successor cannot be selected by ' + role, () => {
    const r = successorRegistry(), id = r.planned.at(-1).id;
    const manifest = { contracts: [{ id, role, version: '1.1.0', operations: [], pointers: [''] }], assets: [] };
    assert.throws(() => makeLock(root, manifest, Buffer.from(JSON.stringify(manifest)), r), /Unknown\/unmaterialized contract/);
  });
}
for (const file of [...changedPaths, originalPath, 'identity/http/shared/v1/identity-inventory-authority-v1.schema.json',
  'identity/http/shared/v1/identity-inventory-authority-policy-v1.json', 'registry/consumers/identity-tenancy.json', 'pnpm-lock.yaml']) {
  test('package refuses changed or missing bytes: ' + file, () => {
    assert.throws(() => validateSuccessorPackage(name => name === file ? Buffer.concat([actual(name), Buffer.from('\nUnapproved')]) : actual(name)),
      /IA11_PACKAGE_BYTES|IA11_PUBLISHED_BYTES|IA11_CONSUMER_OR_DEPENDENCY/);
    assert.throws(() => validateSuccessorPackage(name => {
      if (name === file) throw new Error('Synthetic missing successor input');
      return actual(name);
    }), /Synthetic missing successor input/);
  });
}
test('a forged package cannot expand scope or bless altered content', () => {
  const manifest = JSON.parse(actual(packagePath));
  manifest.files.push({ path: 'services/foreign.ts', kind: 'new', sha256: '0'.repeat(64) });
  assert.throws(() => validateSuccessorPackage(file => file === packagePath ? Buffer.from(JSON.stringify(manifest)) : actual(file)),
    /IA11_PACKAGE_DIGEST/);
});
test('historical projection checks the package first and never repairs mutated caller data', () => {
  const file = 'registry/contracts.json', bytes = actual(file);
  assert(successorHistoricalFile(file, bytes).equals(source(file)));
  const drift = Buffer.concat([bytes, Buffer.from('\nUnapproved')]);
  assert(successorHistoricalFile(file, drift).equals(drift));
  const registry = JSON.parse(bytes), modified = structuredClone(registry);
  modified.contracts[0].status = 'draft';
  assert.equal(successorHistoricalRegistry(modified), modified);
  assert.deepEqual(successorHistoricalRegistry(registry), JSON.parse(source(file)));
  const caller = new Set(['caller-owned-path']);
  const scope = withSuccessorScope(caller);
  assert.deepEqual(caller, new Set(['caller-owned-path']));
  assert(scope.has('caller-owned-path'));
  for (const forbidden of ['src/main.ts', 'registry/consumers/web-pos.json', 'pnpm-lock.yaml', 'test/identity/unapproved.mjs'])
    assert(!scope.has(forbidden));
});
test('400 fixtures keep required Problem fields and exercise status, code, UUID, missing/extra field and type negatives', () => {
  const fixture = JSON.parse(actual(fixturePath));
  assert.equal(fixture.problem.code, 'identity_invalid_request');
  assert.equal(fixture.problem.status, 400);
  assert.equal(fixture.problem.retryable, false);
  assert.deepEqual(fixture.negatives.map(row => row.id), [
    'wrong-status', 'wrong-code', 'missing-instance', 'invalid-trace', 'unknown-secret-field', 'retryable-type',
  ]);
  assert(!fs.existsSync(path.join(root, 'identity/http/shared/v1/identity-inventory-authority-v1-1.schema.json')));
});
