import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
export const consumerExportBase = '41b3ef9bf096122d22d9c1ece51843ebb8168991';
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => JSON.stringify(value, null, 2) + '\n';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// A historical reader may translate exactly one reviewed export at a time.
// The live registry and provenance gates continue to consume the original files.
const reconciliationBase = '3b4ba133274089a65a28fbea93d9d60ae0c74f6d';
const reconciledExports = new Map([
  ['registry/consumers/gateway-bff.json', {
    commit: '8941282e0c07d888cf36f7fcc52a73ec68cb73a0',
    digest: 'c2e5486db2b7cea6156aa519796d2ee5cd90b4fc52853710f471387a1690c920',
  }],
  ['registry/consumers/web-pos.json', {
    commit: '443927931ac766fd2e8aefef57e065faf193c879',
    digest: '509e0387c8064bef5038562057fa6344e39600152eca68c93b05a83d63b038c8',
  }],
  ['registry/consumers/catalog-pricing.json', {
    commit: 'e1a9d4586ba56747b403cbdc724d2ddb2cf96f0f',
    digest: '901a36b7d855c60ad7f8a26ec972f45c79965b5a53f6099f3925933ee5d57ee0',
  }],
  ['registry/consumers/inventory.json', {
    commit: '92a9cac9cc73a317fafd362f9df93ffcabf77e0a',
    digest: 'd65b8881a2bd9e89b749756bbd6238404b1c0a9609dad9cce9df39d2ffc909a4',
  }],
]);
export const reconciliationPaths = Object.freeze([...reconciledExports.keys()]);
const priorExports = new Map();
export function beforeReconciliation(file, bytes) {
  const expected = reconciledExports.get(file);
  if (!expected) return bytes;
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!buffer.subarray(0, 256).includes(expected.commit)) return bytes;
  if (sha256(buffer) !== expected.digest) {
    if (!buffer.includes('\r\n')) return bytes;
    // Normalize only line endings, preserving every other byte including a BOM.
    const normalized = Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
    if (sha256(normalized) !== expected.digest) return bytes;
  }
  if (!priorExports.has(file)) {
    priorExports.set(file, execFileSync('git', ['-C', root, 'show', reconciliationBase + ':' + file],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
  }
  return Buffer.from(priorExports.get(file));
}

export function beforeReconciliationDocument(file, value) {
  const expected = reconciledExports.get(file);
  if (!expected || value?.sourceCommit !== expected.commit) return value;
  let bytes;
  try {
    bytes = Buffer.from(encode(value));
  } catch {
    return value;
  }
  const prior = beforeReconciliation(file, bytes);
  return prior !== bytes && isDeepStrictEqual(value, JSON.parse(bytes)) ? JSON.parse(prior) : value;
}

const exportsByPath = new Map([
  ['registry/consumers/identity-tenancy.json', {
    owner: 'identity-tenancy',
    commit: '89399c3322ca3e0a6fb752341061ced91ade8ec6',
    digest: 'bbc7a165d59a2d0655bc9445057bd8fbc015948cf10c2a37cfd20c70ec068d42',
    selections: 61,
    assets: 0,
  }],
  ['registry/consumers/sales-pos.json', {
    owner: 'sales-pos',
    commit: '0e9a4d15314348beec901a4f8f5cef7f128bbc1c',
    digest: 'd24d06c0f70bad5200a60e72f53a9caf5742f3cd77937ebb12e2ac6237e6836d',
    selections: 57,
    assets: 74,
  }],
  ['registry/consumers/gateway-bff.json', {
    owner: 'gateway-bff',
    commit: '6ffc18debbd588f2a88582d41f2b3d1c5b970ea1',
    digest: '18da79ebf51916cb4ac2158699b5107adb559d3393ba3d33694ea351ad9c1791',
    selections: 44,
    assets: 207,
    bindings: 22,
  }],
  ['registry/consumers/web-pos.json', {
    owner: 'web-pos',
    commit: '90dd482652644ee548ac6d48d7f95673c3d215c4',
    digest: '83844f528c10b17e5cebd46b3b1f817087a1bf7937ae2528212057f39026e338',
    selections: 19,
    assets: 131,
    bindings: 9,
  }],
]);
export const consumerExportPaths = Object.freeze([...exportsByPath.keys()]);
const frontendPaths = new Set(consumerExportPaths.filter(file => exportsByPath.get(file).bindings !== undefined));

const acceptanceTest = 'test/architecture/sales-acceptance-consumer.test.mjs';
const acceptanceTestDigest = 'f71b8e6bd3bf558c243f89ddd00e2e98ce555ae3f23d45814b7fa37d7ac18ce6';
const historicalBytes = new Map();
function previous(file) {
  assert(exportsByPath.has(file) || file === acceptanceTest, 'IANA_CONSUMER_EXPORT_PATH');
  if (!historicalBytes.has(file)) {
    // Read only the requested Git blob. Historical callers already keep their
    // own closure readers and do not need another prefetch of the repository.
    historicalBytes.set(file, execFileSync('git', [
      '-C', root, 'show', consumerExportBase + ':' + file,
    ], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
  }
  return historicalBytes.get(file);
}

function isPublishedExport(file, bytes) {
  const expected = exportsByPath.get(file);
  return expected !== undefined && sha256(text(bytes)) === expected.digest;
}

// Historical readers receive the exact prior bytes only for these reviewed
// inputs. They never consult another live file or accept a partial match.
export function projectIanaConsumerExportFile(file, bytes) {
  bytes = beforeReconciliation(file, bytes);
  if (!exportsByPath.has(file)) return bytes;
  try {
    return isPublishedExport(file, bytes) ? Buffer.from(previous(file)) : bytes;
  } catch {
    return bytes;
  }
}

// The operational proof predates the published Sales snapshot and seals the
// old acceptance test. Project only its exact reviewed fixture adaptation.
export function projectIanaConsumerHistoricalTest(file, bytes) {
  if (file !== acceptanceTest) return bytes;
  try {
    return sha256(text(bytes)) === acceptanceTestDigest ? Buffer.from(previous(file)) : bytes;
  } catch {
    return bytes;
  }
}

export function projectIanaConsumerExportDocument(file, value) {
  value = beforeReconciliationDocument(file, value);
  const expected = exportsByPath.get(file);
  if (!expected) return value;
  try {
    if (value?.sourceCommit !== expected.commit) return value;
    const bytes = Buffer.from(encode(value));
    return isDeepStrictEqual(value, JSON.parse(bytes)) && isPublishedExport(file, bytes)
      ? JSON.parse(previous(file))
      : value;
  } catch {
    return value;
  }
}

export function validateIanaConsumerExports(read, { allowPrevious = false, allowPreviousFrontend = false } = {}) {
  const inputs = consumerExportPaths.map(file => ({ file, bytes: beforeReconciliation(file, read(file)) }));
  if (allowPrevious && inputs.every(({ file, bytes }) => text(bytes) === text(previous(file))))
    return [];
  // A historical scope can contain the entire pre-export frontend pair.
  // A mixture of the prior and current pairs must always reach the exact check.
  const priorFrontend = allowPreviousFrontend && inputs
    .filter(({ file }) => frontendPaths.has(file))
    .every(({ file, bytes }) => text(bytes) === text(previous(file)));
  return inputs.filter(({ file }) => !priorFrontend || !frontendPaths.has(file)).map(({ file, bytes }) => {
    assert(isPublishedExport(file, bytes), 'IANA_CONSUMER_EXPORT_BYTES:' + file);
    const expected = exportsByPath.get(file);
    const snapshot = JSON.parse(bytes);
    const prior = JSON.parse(previous(file));
    assert.equal(snapshot.publication, 'published');
    assert.equal(snapshot.sourceRepository, 'opencomerix/' + expected.owner);
    assert.equal(snapshot.sourceCommit, expected.commit);
    assert.equal(snapshot.manifest.service, expected.owner);
    assert.equal(snapshot.lock.service, expected.owner);
    assert.equal(snapshot.manifestSha256, sha256(encode(snapshot.manifest)));
    assert.equal(snapshot.lockSha256, sha256(encode(snapshot.lock)));
    assert.equal(snapshot.lock.manifestSha256, snapshot.manifestSha256);
    assert.equal(snapshot.manifest.contracts.length, expected.selections);
    assert.equal(snapshot.lock.entries.length, expected.selections);
    assert.equal(snapshot.manifest.assets.length, expected.assets);
    assert.equal(snapshot.lock.assets.length, expected.assets);
    for (const [key, current, before] of [
      ['selections', snapshot.manifest.contracts, prior.manifest.contracts],
      ['pins', snapshot.lock.entries, prior.lock.entries],
      ['manifest assets', snapshot.manifest.assets, prior.manifest.assets],
      ['locked assets', snapshot.lock.assets, prior.lock.assets],
    ]) {
      assert.deepEqual(current.slice(0, before.length), before, expected.owner + ': ' + key);
    }
    assert.equal(snapshot.manifest.bindings.length, expected.bindings ?? prior.manifest.bindings.length);
    assert.deepEqual(snapshot.manifest.bindings.slice(0, prior.manifest.bindings.length), prior.manifest.bindings);
    return { owner: expected.owner, commit: expected.commit, selections: expected.selections, assets: expected.assets };
  });
}
