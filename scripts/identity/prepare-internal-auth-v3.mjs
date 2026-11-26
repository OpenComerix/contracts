import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const api = 'identity/http/private/v3/identity-internal-auth-v3.yaml';
export const policy = 'identity/http/shared/v3/identity-workload-token-reuse-policy-v3.json';
export const schema = policy.replace('.json', '.schema.json');
export const fixtures = 'identity/fixtures/internal-auth/v3/policy-cases-v3.json';
const json = file => JSON.parse(readFileSync(file, 'utf8'));

// Expand the compact policy mutations once for Sourcemeta's native test runner.
export function nativeCases(bundle) {
  const positive = json(policy);
  assert.equal(bundle.info.version, '3.0.0');
  assert.deepEqual(bundle['x-workload-token-reuse-policy'], positive);
  const cases = json(fixtures);
  assert.equal(cases.positive, policy);
  assert.equal(cases.format_version, 1);
  assert.equal(cases.runtime_demonstrated, false);
  const tests = [{ description: 'approved reuse policy', valid: true, data: positive }];
  for (const { id, pointer, value } of cases.negative_mutations) {
    const data = structuredClone(positive);
    assert.match(pointer, /^(?:\/[a-zA-Z0-9_-]+)+$/);
    const keys = pointer.slice(1).split('/');
    const final = keys.pop();
    let parent = data;
    for (const key of keys) {
      assert(Object.hasOwn(parent, key), pointer);
      parent = parent[key];
    }
    assert.notDeepEqual(parent[final], value, id);
    parent[final] = value;
    tests.push({ description: id, valid: false, data });
  }
  assert.equal(new Set(tests.map(row => row.description)).size, tests.length);
  return { target: json(schema).$id, tests };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [bundle, output] = process.argv.slice(2);
  assert.equal(process.argv.length, 4, 'Expected dereferenced bundle and destination fixture file');
  const cases = nativeCases(json(bundle));
  writeFileSync(output, JSON.stringify(cases) + '\n');
  console.log(`Prepared ${cases.tests.length} H1A v3 policy cases.`);
}
