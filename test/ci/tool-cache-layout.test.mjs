import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkContractLayout, validateContractPaths } from '../../tools/architecture/layout.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'oc-tool-cache-layout-'));
  t.after(() => {
    assert(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep + 'oc-tool-cache-layout-'));
    rmSync(root, { recursive: true, force: true });
  });
  const put = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  put('registry/contracts.json', JSON.stringify({ formatVersion: 1, contracts: [{ domain: 'identity' }], planned: [], preservedFiles: [] }));
  put('identity/http/public/v1/api.yaml', 'openapi: 3.1.0\n');
  put('.corepack-cache/lastKnownGood.json', '{"pnpm":"12.4.2"}\n');
  put('.corepack-cache/v1/pnpm/12.4.2/node_modules/tool/package.json', '{"name":"synthetic-tool"}\n');
  put('.npm-cache/_npx/tool/node_modules/library/openapi.yaml', 'third-party tool data\n');
  put('.npm-cache/_cacache/index.json', '{}\n');
  return { root, put };
}

test('populated Corepack/npm caches are infrastructure, without changing the canonical contract inventory', t => {
  const { root } = fixture(t);
  assert.deepEqual(checkContractLayout(root), { files: 1, domains: 1, legacy: 0 });
});

for (const directory of ['.corepack-cache-extra', '.npm-cache-extra', 'corepack-cache', 'unknown'])
  test('a cache prefix or ordinary unregistered directory is still rejected: ' + directory, t => {
    const { root, put } = fixture(t);
    put(directory + '/schema.json', '{}\n');
    assert.throws(() => checkContractLayout(root), /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/);
  });

test('root schemas and misplaced domain files are still rejected with warm tool caches', t => {
  const { root, put } = fixture(t);
  put('identity/.corepack-cache/schema.json', '{}\n');
  assert.throws(() => checkContractLayout(root), /LAYOUT_SURFACE_VERSION_OR_FIXTURE/);
  rmSync(path.join(root, 'identity/.corepack-cache/schema.json'));
  put('unregistered.schema.json', '{}\n');
  assert.throws(() => checkContractLayout(root), /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/);
});

for (const directory of ['.corepack-cache', '.npm-cache'])
  test('explicit contract admission never accepts a tool-cache path: ' + directory, () => {
    assert.throws(() => validateContractPaths([directory + '/schema.json'], { domains: ['identity'], preserved: [] }),
      /LAYOUT_NEW_CONTRACT_REQUIRES_DOMAIN/);
  });
