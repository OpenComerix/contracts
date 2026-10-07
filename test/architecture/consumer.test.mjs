import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateConsumer,
  readJSON,
  sha256,
  canonical,
} from '../../tools/architecture/consumer-gate.mjs';
import { makeLock, gitReader } from '../../tools/architecture/graph.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = readJSON(root, 'registry/contracts.json');
const consumers = readJSON(root, 'registry/consumers/index.json').consumers;
const put = (dir, name, value) =>
  writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');

test('published snapshot admits identical contents without relabeling the local candidate', () => {
  const local = {
    ...readJSON(root, 'registry/consumers/notifications.json'),
    publication: 'local-candidate',
  };
  const published = { ...structuredClone(local), publication: 'published' };
  let reads = 0;
  const readPublished = (revision) => {
    reads++;
    assert.equal(revision, published.sourceCommit);
    return structuredClone(published);
  };
  verifyLocalSnapshot(local, published, readPublished);
  // A later HEAD does not rewrite the immutable source revision or its admission.
  verifyLocalSnapshot({ ...local, sourceCommit: 'f'.repeat(40) }, published, readPublished);
  assert.equal(reads, 2);
  assert.equal(local.publication, 'local-candidate');
  assert.equal(published.publication, 'published');
});

test('published comparison rejects content drift and unverifiable Git provenance', () => {
  const local = {
    ...readJSON(root, 'registry/consumers/notifications.json'),
    publication: 'local-candidate',
  };
  const published = { ...structuredClone(local), publication: 'published' };
  for (const field of [
    'manifestSha256',
    'lockSha256',
    'manifest',
    'lock',
    'sourceRepository',
  ]) {
    const changed = structuredClone(local);
    if (field === 'manifest') changed.manifest.contracts[0].purpose += ' changed';
    else if (field === 'lock') changed.lock.entries[0].commit = 'f'.repeat(40);
    else changed[field] = 'changed';
    assert.throws(
      () => verifyLocalSnapshot(changed, published, () => published),
      /export drift/,
    );
  }
  assert.throws(
    () =>
      verifyLocalSnapshot(local, published, () => ({
        ...published,
        sourceCommit: 'f'.repeat(40),
      })),
    /provenance drift/,
  );
  assert.throws(
    () =>
      verifyLocalSnapshot(local, published, () => {
        throw new Error('Git source unavailable');
      }),
    /Git source unavailable/,
  );
});

test('local candidate comparison retains strict base revision and content checks', () => {
  const local = {
    ...readJSON(root, 'registry/consumers/notifications.json'),
    publication: 'local-candidate',
  };
  const noPublishedRead = () => {
    throw new Error('Unexpected publication lookup');
  };
  verifyLocalSnapshot(local, structuredClone(local), noPublishedRead);
  assert.throws(
    () =>
      verifyLocalSnapshot({ ...local, sourceCommit: 'f'.repeat(40) }, local, noPublishedRead),
    /export drift/,
  );
  assert.throws(
    () => verifyLocalSnapshot(local, { ...local, publication: 'unknown' }, noPublishedRead),
    /lifecycle/,
  );
});
function candidate(service, check) {
  const row = consumers.find((c) => c.service === service),
    exported = readJSON(root, 'registry/consumers/' + row.file);
  const manifest = exported.manifest,
    lock = structuredClone(exported.lock);
  const temporaryBase = realpathSync(os.tmpdir()),
    dir = mkdtempSync(path.join(temporaryBase, 'opencomerix-contract-test-'));
  assert(
    path.dirname(dir) === temporaryBase &&
      path.basename(dir).startsWith('opencomerix-contract-test-'),
  );
  try {
    const write = (name, bytes) => {
      const target = path.join(dir, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    };
    write('contracts.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    for (const asset of lock.assets) {
      const entry = lock.entries.find((e) => e.id === asset.contractId);
      const source = gitReader(root, entry.commit)(asset.sourcePath);
      const bytes =
        asset.representation === 'exact'
          ? source
          : Buffer.from(JSON.stringify(JSON.parse(source), null, 2) + '\n');
      asset.localSha256 = sha256(bytes);
      write(asset.destination, bytes);
    }
    write('contracts.lock.json', JSON.stringify(lock, null, 2) + '\n');
    const tooling = [];
    for (const [sourcePath, destination] of [
      ['tools/architecture/consumer-gate.mjs', '.contracts/gate.mjs'],
      ['registry/manifest-v1.schema.json', '.contracts/manifest-v1.schema.json'],
      ['registry/lock-v1.schema.json', '.contracts/lock-v1.schema.json'],
    ]) {
      const bytes = readFileSync(path.join(root, sourcePath));
      write(destination, bytes);
      tooling.push({ sourcePath, destination, sha256: sha256(bytes) });
    }
    write(
      '.contracts/provenance.json',
      JSON.stringify({
        formatVersion: 1,
        sourceRepository: 'opencomerix/contracts',
        publication: 'local-candidate',
        sourceBaseCommit: registry.baselineCommit,
        files: tooling,
      }),
    );
    for (const binding of manifest.bindings) {
      const dependency = manifest.contracts.find(
        (d) => d.id === binding.contractId && d.role === 'consumer',
      );
      write(
        binding.path,
        binding.kind === 'gateway-operation-registry'
          ? dependency.operations.map((id) => "{operationId: '" + id + "'}").join('\n')
          : 'export const UI_OPERATION_CONTRACTS = Object.freeze({\n' +
              dependency.operations.map((id) => '  ' + id + ': {},').join('\n') +
              '\n});',
      );
    }
    return check(dir);
  } finally {
    assert(
      path.dirname(dir) === temporaryBase &&
        path.basename(dir).startsWith('opencomerix-contract-test-'),
    );
    rmSync(dir, { recursive: true, force: true });
  }
}
for (const row of consumers)
  test('admits source-resolved exported metadata: ' + row.service, () =>
    candidate(row.service, (dir) => {
      assert.equal(validateConsumer(dir).service, row.service);
    }),
  );

test('regeneration uses existing per-contract pins even when registry HEAD advances', () => {
  const exported = readJSON(root, 'registry/consumers/notifications.json');
  const manifest = exported.manifest,
    lock = exported.lock,
    bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const next = structuredClone(registry);
  for (const d of next.contracts) d.commit = 'f'.repeat(40);
  const regenerated = makeLock(root, manifest, bytes, next, lock.entries);
  assert.deepEqual(regenerated.entries, lock.entries);
  assert.deepEqual(
    regenerated.assets,
    lock.assets.map(({ localSha256, ...asset }) => asset),
  );
  assert(
    lock.entries.some((entry) => entry.commit !== registry.baselineCommit),
    'Historical H1/H1A references remain independently pinned',
  );
});
test('refuses new use of draft sale contracts before resolving their source', () => {
  const draft = registry.contracts.find(
    (d) => d.path === 'events/sales.sale.completed.v1.schema.json',
  );
  assert.equal(draft.status, 'draft');
  assert.throws(
    () =>
      makeLock(
        root,
        {
          contracts: [
            {
              id: draft.id,
              role: 'consumer',
              version: draft.version,
              operations: [],
              pointers: [''],
            },
          ],
          assets: [],
        },
        Buffer.from('{}'),
        registry,
      ),
    /draft/,
  );
});
test('rejects a manifest change without a newly reviewed lock', () =>
  candidate('notifications', (dir) => {
    const m = readJSON(dir, 'contracts.manifest.json');
    m.contracts[0].version = 'v99';
    put(dir, 'contracts.manifest.json', m);
    assert.throws(() => validateConsumer(dir), /Manifest\/lock drift/);
  }));
test('rejects duplicate dependencies even when the manifest hash is recomputed', () =>
  candidate('notifications', (dir) => {
    const m = readJSON(dir, 'contracts.manifest.json'),
      l = readJSON(dir, 'contracts.lock.json');
    m.contracts.push(m.contracts[0]);
    l.entries.push(l.entries[0]);
    put(dir, 'contracts.manifest.json', m);
    l.manifestSha256 = sha256(readFileSync(path.join(dir, 'contracts.manifest.json')));
    put(dir, 'contracts.lock.json', l);
    assert.throws(() => validateConsumer(dir), /Duplicate dependency|Ambiguous lock/);
  }));
test('rejects a JSON semantic change even when its local byte hash is recomputed', () =>
  candidate('notifications', (dir) => {
    const l = readJSON(dir, 'contracts.lock.json'),
      a = l.assets[0],
      doc = readJSON(dir, a.destination);
    doc.properties.contract_test_unknown_field = { type: 'string' };
    put(dir, a.destination, doc);
    a.localSha256 = sha256(readFileSync(path.join(dir, a.destination)));
    put(dir, 'contracts.lock.json', l);
    assert.throws(() => validateConsumer(dir), /changed contract semantics/);
  }));
test('permits declared JSON formatting with semantic identity and an updated local hash', () =>
  candidate('notifications', (dir) => {
    const l = readJSON(dir, 'contracts.lock.json'),
      a = l.assets[0],
      doc = readJSON(dir, a.destination);
    writeFileSync(path.join(dir, a.destination), JSON.stringify(doc));
    a.localSha256 = sha256(readFileSync(path.join(dir, a.destination)));
    put(dir, 'contracts.lock.json', l);
    assert.equal(a.semanticSha256, sha256(canonical(doc)));
    assert.equal(validateConsumer(dir).assets, 3);
  }));
test('exact copies do not inherit the source checkout EOL exception', () =>
  candidate('web-pos', (dir) => {
    const l = readJSON(dir, 'contracts.lock.json'),
      a = l.assets[0];
    const bytes = readFileSync(path.join(dir, a.destination));
    writeFileSync(
      path.join(dir, a.destination),
      bytes.toString('utf8').replaceAll('\n', '\r\n'),
    );
    a.localSha256 = sha256(readFileSync(path.join(dir, a.destination)));
    put(dir, 'contracts.lock.json', l);
    assert.throws(() => validateConsumer(dir), /Exact copy differs/);
  }));
test('detects omitted UI operations and source-bound verifier drift', () =>
  candidate('web-pos', (dir) => {
    const m = readJSON(dir, 'contracts.manifest.json'),
      binding = m.bindings[0];
    const original = readFileSync(path.join(dir, binding.path), 'utf8');
    writeFileSync(
      path.join(dir, binding.path),
      original.replace(/(^  \w+:\s*\{)/m, '  missingOperation: {'),
    );
    assert.throws(() => validateConsumer(dir), /operation drift/);
    writeFileSync(path.join(dir, binding.path), original);
    writeFileSync(path.join(dir, '.contracts/gate.mjs'), 'changed verifier');
    assert.throws(() => validateConsumer(dir), /Tooling drift/);
  }));
