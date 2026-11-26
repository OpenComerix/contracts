import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeInternalAuthV3 } from '../identity/internal-auth-v3-history.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const base = '93c0a0d9249d15301554c1687ca33876ed7e5205';
const metadata = new Map([
  ['.gitattributes', '3fe272a4d5752a5103abe869dabb9a94c0c24b34ca9e6fb11f7d55b7c58f3576'],
  ['.github/workflows/ci.yml', '533b95ea75ca8154b69e7546ce96bf266da2b6c4f84631e2bc4b8048ec643393'],
  ['package.json', '332d5caffb4b41a6bb88bdebb136e314e2eec333e01add75a8749edfb94e0b4c'],
  ['pnpm-lock.yaml', 'cefe710278e3edc3d903e6ae0caefd3a4f1b898eeb5256f9166a1e526afd6761'],
  ['sales/README.md', '8fa721f3487638524e0008d340780d86ebab65e34b948d25e897cfefa40763c7'],
  ['tools/architecture/layout.mjs', 'af05877c3ae184741fc3c3f93e0e7f443ac352c474443d309d2f05eeefad37a3'],
]);
const additions = new Map([
  ['scripts/sales/completed-v3-types.mjs', 'af762e0d15de02fd0d5222fa16481d8df7c581a5d1a73940befddffd4d45527a'],
  ['test/sales/completed-v3-types.test.mjs', '8472a48d2ea6674f8f3e632243975201e8187d9f7ea06b6abe29fe26f5a9ab1e'],
  ['scripts/sales/h5-types.mjs', 'c32bc07116b45f9901691b6715d1ddd9401ba02f50563c62e2571f3fb4adcd14'],
  ['test/sales/h5-types.test.mjs', 'bb6eedc52f54807cf457d2965f9c545ce20ad3e66a6558aee108f6ad3b1d6b54'],
  ['tools/architecture/h5-type-artifacts.json', '4cd58b202b082e5b017c43e4ddd2878d33805d48c3cc95cc7921ebce335ce49f'],
  ['tools/architecture/h5-type-inputs.mjs', 'b20f75bcbd27ae663aff0affb31c1beb9a22324c0eb113556288ef400e336223'],
  ['tools/architecture/h5-type-schema.mjs', 'e1b9a6f855933a03a79df272ca0a030a92d8e4f69f86c21e760024aaa80ee874'],
  ['tools/architecture/h5-type-selections.json', 'f5d6d970c6c8e2039e59b82d4f56ac6c7c011ceb0d9b1d427fc2cba7c28d586d'],
]);
const declaration = 'sales/events/v3/generated/sales.sale.completed.v3.d.ts';
const h5Artifacts = 'tools/architecture/h5-type-artifacts.json';
const declarationDigest = 'de17cc7857d4a39e56b030043ade5c8c1049a339a5fba2edddebcc0689966a5b';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textDigest = bytes => digest(Buffer.from(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1'));
const prior = new Map();

// Only the exact tooling additions are projected. Current verification keeps
// the real workflow, declaration and pin outside this historical view.
export function projectCompletedTypesFile(file, bytes) {
  bytes = beforeInternalAuthV3(file, bytes);
  const expected = metadata.get(file);
  if (!expected || textDigest(bytes) !== expected) return bytes;
  if (!prior.has(file)) {
    prior.set(file, execFileSync('git', ['-C', root, 'show', base + ':' + file],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
  }
  return Buffer.from(prior.get(file));
}

export function includeCompletedTypesPaths(allowed, read) {
  const packageBytes = read('package.json');
  if (textDigest(packageBytes) !== metadata.get('package.json')) return;
  const artifactBytes = read(h5Artifacts);
  for (const [file, hash] of [...metadata, ...additions]) {
    const bytes = file === 'package.json' ? packageBytes : file === h5Artifacts ? artifactBytes : read(file);
    assert.equal(textDigest(beforeInternalAuthV3(file, bytes)), hash, 'COMPLETED_TYPES_SCOPE:' + file);
  }
  assert.equal(digest(read(declaration)), declarationDigest, 'COMPLETED_TYPES_SCOPE:' + declaration);
  const artifacts = JSON.parse(artifactBytes);
  for (const { file, sha256 } of artifacts) {
    assert.equal(digest(read(file)), sha256, 'H5_TYPES_SCOPE:' + file);
  }
  for (const file of [...metadata.keys(), ...additions.keys(), declaration, ...artifacts.map(row => row.file)]) allowed.add(file);
}
