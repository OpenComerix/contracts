import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { read, policyPath, schemaPath, vectorsPath, validateHistoryPolicy, applyPatches, prepareHistoryPolicy } from '../../scripts/catalog/validate-history-policy-v1.mjs';

test('R1 history policy covers original published fields with separate lifecycle and pending protocols', () => {
  const result = validateHistoryPolicy(read(policyPath));
  assert.equal(result.fields, 138);
  assert.equal(result.storages, 6);
  assert.equal(result.runtime_demonstrated, false);
});

for (const row of read(vectorsPath).cases.filter(row => row.kind === 'semantic')) {
  test('R1 rejects policy violation: ' + row.id, () => {
    assert.throws(() => validateHistoryPolicy(applyPatches(read(policyPath), row.patches)), error => error instanceof assert.AssertionError && error.message.includes(row.reason));
  });
}

test('schema extraction preserves the common schema, all cases and the source; refuses overwrite', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'oc-history-policy-'));
  try {
    const original = JSON.stringify(read(policyPath));
    const result = prepareHistoryPolicy(directory, true);
    const rows = readFileSync(path.join(directory, 'cases.tsv'), 'utf8').trim().split('\n');
    assert.equal(rows.length, result.schema_cases);
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'policy.schema.json'), 'utf8')), read(schemaPath));
    for (const row of rows) {
      const [id, expected, schema, fixture] = row.split('\t');
      assert(['accept', 'reject'].includes(expected));
      assert.equal(schema, 'policy.schema.json');
      assert.equal(fixture, id + '.json');
      assert.doesNotThrow(() => JSON.parse(readFileSync(path.join(directory, fixture), 'utf8')));
    }
    assert.equal(JSON.stringify(read(policyPath)), original);
    assert.throws(() => prepareHistoryPolicy(directory), /H_OUTPUT_NOT_EMPTY/);
  } finally {
    assert(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'oc-history-policy-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
