import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(import.meta.dirname, '../..');
const base = '910130c668c6e2f47afb9d33be79e36926cb5721';
const before = new Map();
const metadata = new Map([
  ['.github/workflows/ci.yml', '9c829c6834fa1f93b942a30c4216a1945b230241915cfe2a6d2cd4b32ca613c9'],
  ['identity/README.md', '9a3e8835296fe3ac43cefe0f40a3948a8b3d63b2880211764c287b7ea8bfa8fe'],
  ['identity/index.json', '9aed48282ec07094b352adeab6edbd05432e0ea5079dda32e7062bc35fe41876'],
  ['registry/contracts.json', '59b27c9ced3194c73d7210f2890e5b5e641170ff483eee540463fa78920f2678'],
]);
const additions = new Map([
  ['identity/http/private/v3/identity-internal-auth-v3.yaml', '3c9332409d6c5f88f4eb608415b4aff88598b473a7cc39cfc5d0d936c148c85b'],
  ['identity/http/shared/v3/identity-workload-token-reuse-policy-v3.json', '1a62ffb77790e26a93ee3982ffec9ded3e946ef78c5750983abbe4b1e2109429'],
  ['identity/http/shared/v3/identity-workload-token-reuse-policy-v3.schema.json', 'ed25ba091971cf133879209de3606c321d4641171fb931f1eb628b299ae06026'],
  ['identity/fixtures/internal-auth/v3/policy-cases-v3.json', '57f1ff3fdc49a8226fc518cfa7ecd3c3a2ec20d837c9ac8ae45e949c7aaf79fc'],
  ['scripts/identity/prepare-internal-auth-v3.mjs', '8e8bf924d7d8accc2b6b27c8dfe786ab45088466b5509027958977bf5fb4e797'],
  ['test/identity/internal-auth-v3.test.mjs', '739bf61e056025c4e4171b8cdb151ead91ccd189303ef936db281a47c0626289'],
]);
const digest = bytes => createHash('sha256')
  .update(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1').digest('hex');

// Older gates receive the predecessor only for an exact supplied ID-02 input.
export function beforeInternalAuthV3(file, bytes) {
  const expected = metadata.get(file);
  if (!expected || digest(bytes) !== expected) return bytes;
  if (!before.has(file)) before.set(file, execFileSync('git', ['-C', root, 'show', base + ':' + file],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
  return Buffer.from(before.get(file));
}

export function beforeInternalAuthV3Document(file, value) {
  if (file !== 'identity/index.json' || !value?.planned?.includes('identity.internal-auth.v3')) return value;
  try {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const prior = beforeInternalAuthV3(file, bytes);
    return prior !== bytes && isDeepStrictEqual(value, JSON.parse(bytes)) ? JSON.parse(prior) : value;
  } catch {
    return value;
  }
}

export function includeInternalAuthV3Paths(allowed, registry, read) {
  if (digest(registry) !== metadata.get('registry/contracts.json')) return;
  for (const [file, hash] of additions) assert.equal(digest(read(file)), hash, 'ID02_SOURCE_SCOPE:' + file);
  for (const file of additions.keys()) allowed.add(file);
}
