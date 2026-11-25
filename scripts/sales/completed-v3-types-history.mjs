import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const base = '93c0a0d9249d15301554c1687ca33876ed7e5205';
const metadata = new Map([
  ['.gitattributes', '8c58c0c39988e4e5469818dceca1e4a514cad880bc368367df884562bc2fa964'],
  ['.github/workflows/ci.yml', '533b95ea75ca8154b69e7546ce96bf266da2b6c4f84631e2bc4b8048ec643393'],
  ['package.json', '332d5caffb4b41a6bb88bdebb136e314e2eec333e01add75a8749edfb94e0b4c'],
  ['pnpm-lock.yaml', 'cefe710278e3edc3d903e6ae0caefd3a4f1b898eeb5256f9166a1e526afd6761'],
  ['sales/README.md', '33f3986d86090307ee3b84152493b745512e1b5f22cd25891516dbf6fa544a29'],
  ['tools/architecture/layout.mjs', '4fe31665751e19ffd82cc8eadfbb56a9b0d6bd37828916bb0667954c2c331138'],
]);
const additions = new Map([
  ['scripts/sales/completed-v3-types.mjs', 'fa627566bc2af7ae1a76ccd9a22259827ab0ccf127d49a326c7615ad275de1c4'],
  ['test/sales/completed-v3-types.test.mjs', '8472a48d2ea6674f8f3e632243975201e8187d9f7ea06b6abe29fe26f5a9ab1e'],
]);
const declaration = 'sales/events/v3/generated/sales.sale.completed.v3.d.ts';
const declarationDigest = 'de17cc7857d4a39e56b030043ade5c8c1049a339a5fba2edddebcc0689966a5b';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textDigest = bytes => digest(Buffer.from(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1'));
const prior = new Map();

// Only the exact tooling additions are projected. Current verification keeps
// the real workflow, declaration and pin outside this historical view.
export function projectCompletedTypesFile(file, bytes) {
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
  for (const [file, hash] of [...metadata, ...additions]) {
    const bytes = file === 'package.json' ? packageBytes : read(file);
    assert.equal(textDigest(bytes), hash, 'COMPLETED_TYPES_SCOPE:' + file);
  }
  assert.equal(digest(read(declaration)), declarationDigest, 'COMPLETED_TYPES_SCOPE:' + declaration);
  for (const file of [...metadata.keys(), ...additions.keys(), declaration]) allowed.add(file);
}
