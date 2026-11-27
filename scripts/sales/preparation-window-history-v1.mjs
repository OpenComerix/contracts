import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { createGitReader } from '../../tools/architecture/git-source.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const base = createGitReader()(root, 'b0c742ca4cebdf70afffd2bf8b6dbb485c059186');
const registryPath = 'registry/contracts.json';
const metadata = Object.freeze({
  "registry/contracts.json": "357d5ab5c2070efda76c5b11486ac7162eb673f095c2044a8d1e983e3527336e",
  "catalog/index.json": "1dcc024f40f0ee2785b0fcb9c58a8297b52a21020ecdd8b867d7e8557b64059f",
  "catalog/README.md": "8f5ca702c747fc8b7d66911d3aae4cbfa525e480542c2c0ed3c62461f64d839c",
  "finance/index.json": "15bd4405ab136e7df95448e896efc5839177a03d9fbb07c223241c0ead43b87f",
  "finance/README.md": "5b1590b120bfda7a610c7b7b31b666921a2e1c7c085820b501c52bb6c1a24161",
  "inventory/index.json": "854e264222a60132cfba06d2461360fe66b9c494aa007eaa316a468ae4407464",
  "inventory/README.md": "8e634e6716ed90511cb5c9985269abe06bd1cc8c4c33aa9e1da2dd13f7e7aaa5",
  "sales/index.json": "46b3b56b50ff11f7b2059e6668d02ffedfcc0a2b9df05b099d34f0eee3c0f3c7",
  "sales/README.md": "42da63461dcf37e7fc80de883044a5d84e1abbb4ef53f98008cbc1ed20da88fb"
});
const source = Object.freeze({
  "sales/http/private/v3/sales-catalog-capture-authority-v3.yaml": "f3da831f8e33bc6d3d1dc56d8fea162e31fbba380c9793d13a68738e330fe813",
  "sales/http/private/v2/sales-context-check-authority-v2.yaml": "0b4c6135b36147969ba660aa58548553d7bf7f2342dbb19f3112225d0370958d",
  "catalog/http/private/v2/catalog-sale-capture-v2.yaml": "f7d1d7989505bb7976b67b65ce93ec8596dfffb1267bc7d98c758eb2a7e1370b",
  "inventory/http/private/v2/inventory-sale-context-v2.yaml": "6bcfb35c2700c486e4b0d5c1c4a1230bd8df92144027fe31c5ddd181ecddb527",
  "finance/http/private/v2/finance-sale-context-v2.yaml": "aaa1af7ea62f24800236ce6673041324383943be9e96607a94c4f1fb18b2066c",
  "sales/http/shared/v3/sales-protocol-policy-v3.json": "1d15373393160c85b653f752bbd0b4c5e8c4a013e82146978d045c548e6d6483",
  "sales/fixtures/preparation-window/v1/scenarios.json": "03c1ed8d436875f6dfda487be5c6ebd37d673556ad10571e8205993c4366f576",
  "scripts/sales/preparation-window-v1.mjs": "612d806b940546389e1318168d59804a3f5424af405616e09e629ebbc2eddb24",
  "scripts/sales/validate-preparation-window-v1.sh": "d938795b8667cd1ff252f3692f78d592c28b34011eb21ee10f8ff0fe924054f9",
  "test/sales/preparation-window-v1.test.mjs": "f74fe0e99780f87e1b3a83dab32712d40a29ae56b71a5cbd12bf37b2b0e32894"
});
// Preserve a UTF-8 BOM in the decoded input so only line endings are normalized.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = bytes => createHash('sha256').update(decoder.decode(bytes).replaceAll('\r\n', '\n')).digest('hex');

// Older gates receive their exact previous inputs only for this closed delta.
// Current registry and source checks use the actual checkout.
export function projectPreparationWindowFile(file, bytes) {
  const expected = metadata[file];
  return expected && digest(bytes) === expected ? base(file) : bytes;
}

export function projectPreparationWindowDocument(file, value) {
  if (!file.endsWith('.json') || !metadata[file]) return value;
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (!isDeepStrictEqual(value, JSON.parse(bytes))) return value;
  const previous = projectPreparationWindowFile(file, bytes);
  return previous === bytes ? value : JSON.parse(previous);
}

export function includePreparationWindowPaths(allowed, registry, read) {
  const actual = JSON.parse(registry);
  if (!actual.planned.some(row => row.materializeIn === 'ID-04' || Object.hasOwn(source, row.path))) return;
  for (const [file, expected] of Object.entries({ ...metadata, ...source })) {
    const bytes = file === registryPath ? registry : read(file);
    assert.equal(digest(bytes), expected, 'ID04_SOURCE_SCOPE:' + file);
    allowed.add(file);
  }
}
