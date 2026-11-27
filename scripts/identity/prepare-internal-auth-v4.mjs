import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const api = 'identity/http/private/v4/identity-internal-auth-v4.yaml';
export const policy = 'identity/http/shared/v4/identity-workload-token-reuse-policy-v4.json';
export const schema = policy.replace('.json', '.schema.json');
export const fixtures = 'identity/fixtures/internal-auth/v4/policy-cases-v4.json';
export const preparation = 'identity/http/shared/v2/identity-sale-preparation-workloads-v2.json';

const json = file => JSON.parse(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'));

export function nativeCases(bundle) {
  const current = json(policy);
  assert.equal(bundle.info.version, '4.0.0');
  assert.deepEqual(bundle['x-workload-token-reuse-policy'], current);
  const vectors = json(fixtures);
  assert.equal(vectors.positive, policy);
  assert.equal(vectors.format_version, 1);
  assert.equal(vectors.runtime_demonstrated, false);
  const tests = [{ description: 'ID-03 workload reuse policy', valid: true, data: current }];
  for (const { id, pointer, value } of vectors.negative_mutations) {
    assert.match(pointer, /^(?:\/[a-zA-Z0-9_-]+)+$/);
    const data = structuredClone(current);
    const keys = pointer.slice(1).split('/');
    const field = keys.pop();
    const parent = keys.reduce((entry, key) => {
      assert(Object.hasOwn(entry, key), pointer);
      return entry[key];
    }, data);
    assert.notDeepEqual(parent[field], value, id);
    parent[field] = value;
    tests.push({ description: id, valid: false, data });
  }
  assert.equal(new Set(tests.map(row => row.description)).size, tests.length);
  return { target: json(schema).$id, tests };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'Expected dereferenced bundle and destination fixture file');
  const [bundle, output] = process.argv.slice(2);
  const cases = nativeCases(JSON.parse(readFileSync(bundle, 'utf8')));
  writeFileSync(output, JSON.stringify(cases) + '\n');
  console.log(`Prepared ${cases.tests.length} H1A v4 policy cases.`);
}
