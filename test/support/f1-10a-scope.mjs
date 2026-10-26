import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const decoder = new TextDecoder('utf-8', { fatal: true });
const readWorktree = file => fs.readFileSync(path.join(root, file));

// Exact reviewed documentation from f331f2218c6ffa6246d63b751b6cc10e6bf2e6bc.
// LF/CRLF equivalence matches the existing preservation gates; no other edits
// are projected away. This is test support, never a contract admission.
export const designHashes = Object.freeze({
  'finance/README.md': '533c3e400822a3e630e6b36ae5994c5ab157ec951e1738b414b1b70454fc415f',
  'inventory/README.md': '74ed889957ad7fb892ac751e67e6db47790c9f800301b20bc04d21e8eb16265d',
  'sales/README.md': 'c11c3cb7a6c3c493c9c00c305c101d01b2f01bf8869d7e3acf307d52a1b14c25',
});

const correctionFiles = Object.freeze([
  'test/support/f1-10a-scope.mjs',
  'test/architecture/f1-10a-scope.test.mjs',
  'test/architecture/asyncapi-admission-v1.test.mjs',
  'test/architecture/catalog-consumption.test.mjs',
  'test/architecture/catalog-delivery.test.mjs',
  'test/architecture/catalog-operational-recovery.test.mjs',
  'test/architecture/catalog-workload-consumers-v2.test.mjs',
  'test/identity/catalog-workload-profiles-admission-v2.test.mjs',
]);

export function withF110ADesignScope(historicalAllowed, read = readWorktree) {
  for (const [file, expected] of Object.entries(designHashes)) {
    const text = decoder.decode(read(file)).replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(text).digest('hex'), expected, 'F1_10A_DESIGN_BYTES:' + file);
  }
  return new Set([...historicalAllowed, ...Object.keys(designHashes), ...correctionFiles]);
}