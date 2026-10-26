import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { designHashes, withF110ADesignScope } from '../support/f1-10a-scope.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const source = file => execFileSync('git', ['show', 'f331f2218c6ffa6246d63b751b6cc10e6bf2e6bc:' + file], { cwd: root });
const files = ['finance/README.md', 'inventory/README.md', 'sales/README.md'];

test('F1-10A admits exactly the three reviewed maps and eight correction files, preserving the caller scope', () => {
  assert.deepEqual(Object.keys(designHashes), files);
  const historical = new Set(['historical-reviewed-path']);
  const allowed = withF110ADesignScope(historical);
  assert.deepEqual(historical, new Set(['historical-reviewed-path']));
  assert.equal(allowed.size, historical.size + 11);
  for (const file of [...files, 'test/support/f1-10a-scope.mjs', 'test/architecture/f1-10a-scope.test.mjs',
    'test/architecture/asyncapi-admission-v1.test.mjs', 'test/architecture/catalog-consumption.test.mjs',
    'test/architecture/catalog-delivery.test.mjs', 'test/architecture/catalog-operational-recovery.test.mjs',
    'test/architecture/catalog-workload-consumers-v2.test.mjs', 'test/identity/catalog-workload-profiles-admission-v2.test.mjs'])
    assert(allowed.has(file), file);
  for (const file of ['catalog/README.md', 'sales/OTHER.md', 'sales/http/public/v2/pos-sales-v2.yaml',
    'registry/contracts.json', 'sales/index.json', 'registry/consumers/web-pos.json', 'pnpm-lock.yaml',
    '.gitlab-ci.yml', 'src/main.ts', 'test/support/unapproved.mjs', 'tools/architecture/cli.mjs'])
    assert(!allowed.has(file), 'F1_10A_UNRELATED_SCOPE:' + file);
});

for (const file of files) {
  test('F1-10A documentation hash is pinned to the immutable reviewed Git bytes: ' + file, () => {
    assert.equal(createHash('sha256').update(source(file)).digest('hex'), designHashes[file]);
  });
  test('F1-10A accepts only line ending equivalence: ' + file, () => {
    const crlf = Buffer.from(source(file).toString('utf8').replaceAll('\n', '\r\n'));
    assert(withF110ADesignScope([], name => name === file ? crlf : read(name)).has(file));
  });
  for (const [name, mutate] of [
    ['changed meaning', bytes => Buffer.from(bytes.toString('utf8').replace('Propietario', 'Unapproved owner'))],
    ['extra appendix', bytes => Buffer.concat([bytes, Buffer.from('\nUnapproved appendix.\n')])],
    ['omitted content', () => Buffer.alloc(0)],
    ['invalid UTF-8', bytes => Buffer.concat([bytes, Buffer.from([0xff])])],
  ]) test('F1-10A refuses documentation drift before broadening any historical scope: ' + file + '/' + name, () => {
    const original = read(file), changed = mutate(original);
    assert(!changed.equals(original));
    assert.throws(() => withF110ADesignScope([], name => name === file ? changed : read(name)));
  });
  test('F1-10A refuses an absent reviewed map: ' + file, () => {
    assert.throws(() => withF110ADesignScope([], name => {
      if (name === file) throw Object.assign(new Error('Synthetic missing map'), { code: 'ENOENT' });
      return read(name);
    }), /Synthetic missing map/);
  });
}