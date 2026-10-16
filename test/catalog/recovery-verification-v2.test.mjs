import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { root, read, changed } from '../../scripts/catalog/validate-history-recovery-v1.mjs';
import { scenario, validateContract, validatePolicy, prepare, policyPath, vectors } from '../../scripts/identity/validate-catalog-recovery-verification-v2.mjs';
import { verify } from '../../scripts/identity/catalog-recovery-verification-v2-semantics.mjs';

test('identity verification v2 preserves R3 sources and classifies every new response field', () => {
  assert(validateContract().semantic_negatives > 10);
  const policy = read(policyPath);
  policy.field_inventory.pop();
  assert.throws(() => validatePolicy(policy));
});

for (const row of vectors.negative) test('verification v2 rejects ' + row.id, () => {
  assert.deepEqual(verify(changed(scenario(), row.changes)), { rejection: row.expected });
});

test('verification emits the actual original issuance for a short grant without exporting secrets', () => {
  const input = scenario();
  input.grant.lifetime_seconds = 60;
  input.grant.expires_at = '2026-10-16T12:01:01Z';
  input.context.now = '2026-10-16T12:00:31Z';
  const output = verify(input);
  assert.equal(output.response.issued_at, input.grant.issued_at);
  assert.equal(output.response.valid_until, input.grant.expires_at);
  assert.notEqual(Date.parse(output.response.issued_at), Date.parse(output.response.valid_until) - 900000);
  assert.equal(JSON.stringify(output).includes(input.grant.grant_reference), false);
  const before = structuredClone(input);
  output.response.binding.selection.versions.push('99');
  assert.deepEqual(input, before);
});

test('verification v2 extracts the real request/response schemas and refuses evidence overwrite', () => {
  const directory = path.join(root, '.ci-artifacts', 'verification-v2-test-' + randomUUID());
  try {
    const result = prepare(directory);
    assert.equal(result.schema_positive, 4);
    assert(result.schema_negative >= 18);
    assert.equal(readFileSync(path.join(directory, 'VerifyResponse.schema.json'), 'utf8').includes('"$ref"'), false);
    assert.throws(() => prepare(directory), /VERIFICATION_V2_OUTPUT_EXISTS/);
  } finally {
    assert(path.resolve(directory).startsWith(path.join(root, '.ci-artifacts') + path.sep + 'verification-v2-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
