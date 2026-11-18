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
]);
export const consumerExportPaths = Object.freeze([...exportsByPath.keys()]);

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

export function validateIanaConsumerExports(read, { allowPrevious = false } = {}) {
  const inputs = consumerExportPaths.map(file => ({ file, bytes: read(file) }));
  if (allowPrevious && inputs.every(({ file, bytes }) => text(bytes) === text(previous(file))))
    return [];
  return inputs.map(({ file, bytes }) => {
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
    assert.deepEqual(snapshot.manifest.bindings, prior.manifest.bindings);
    return { owner: expected.owner, commit: expected.commit, selections: expected.selections, assets: expected.assets };
  });
}
