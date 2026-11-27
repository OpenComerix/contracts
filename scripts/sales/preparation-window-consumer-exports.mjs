import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { createGitReader } from '../../tools/architecture/git-source.mjs';

export const consumerExportBase = 'b216e4961b9b23e5ef893dbe3499ee3774dd22a9';
export const consumerExportHashes = Object.freeze({
  'registry/consumers/catalog-pricing.json': 'fec8941c2dd80cbd3bb11e06b167e7f4a799bd5ce53039cf45181fdc7b661d06',
  'registry/consumers/finance.json': '0c9ab5a7f9753457adfaa46ffb9daefb386e2203cc90018117d5676ed58de87b',
  'registry/consumers/inventory.json': '6a804e63365c2a6f189961d5f89e3640f028b19dfb475e4d9c80d387085e03f3',
  'registry/consumers/sales-pos.json': 'fd81097198863704777042e470bfcebca1dd30045a1d0980278bb740e6218407',
});

const root = fileURLToPath(new URL('../../', import.meta.url));
const reader = createGitReader();
const priorBytes = new Map();
const digest = bytes => createHash('sha256').update(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1').digest('hex');

// A historical reader may project only the exact bytes of its own input.
export function projectPreparationWindowConsumerFile(file, bytes) {
  if (!Object.hasOwn(consumerExportHashes, file) || digest(bytes) !== consumerExportHashes[file]) return bytes;
  if (!priorBytes.has(file)) priorBytes.set(file, reader(root, consumerExportBase)(file));
  return Buffer.from(priorBytes.get(file));
}

export function projectPreparationWindowConsumerDocument(file, value) {
  if (!Object.hasOwn(consumerExportHashes, file) || value?.publication !== 'published') return value;
  try {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const projected = projectPreparationWindowConsumerFile(file, bytes);
    return projected !== bytes && isDeepStrictEqual(value, JSON.parse(bytes)) ? JSON.parse(projected) : value;
  } catch {
    return value;
  }
}

export function verifyPreparationWindowConsumerExports(read) {
  for (const [file, expected] of Object.entries(consumerExportHashes)) {
    assert.equal(digest(read(file)), expected, 'ID04_CONSUMER_EXPORT:' + file);
  }
}
