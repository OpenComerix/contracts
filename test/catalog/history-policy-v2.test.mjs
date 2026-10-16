import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { applyPatches } from '../../scripts/catalog/validate-history-policy-v1.mjs';
import { read, policyPath, schemaPath, vectorsPath, validateHistoryPolicyV2, validateProtocolClosures,
  prepareHistoryPolicyV2 } from '../../scripts/catalog/validate-history-policy-v2.mjs';

test('R1-R4 classification separates transient transport, logical storage and inherited originals', () => {
  assert.deepEqual(validateHistoryPolicyV2(), { original_fields: 138, protocol_fields: 522, stored_fields: 133, storages: 6, runtime_demonstrated: false });
  assert.equal(validateProtocolClosures().length, 6);
});

for (const vector of read(vectorsPath).cases.filter(row => row.kind === 'semantic')) {
  test('R1-R4 classification rejects: ' + vector.id, () => {
    assert.throws(() => validateHistoryPolicyV2(applyPatches(read(policyPath), vector.patches)),
      error => error instanceof assert.AssertionError && error.message.includes(vector.reason));
  });
}

test('extracts exact schema and complete instance inventory without overwriting evidence', () => {
  const parent = fs.mkdtempSync(path.join(tmpdir(), 'oc-history-policy-v2-'));
  const output = path.join(parent, 'new-output');
  try {
    const before = fs.readFileSync(new URL('../../' + policyPath, import.meta.url));
    const result = prepareHistoryPolicyV2(output, true);
    assert.equal(result.schema_positive, 1);
    assert(result.schema_negative > 0 && result.semantic_negative > 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'policy.schema.json'))), read(schemaPath));
    const rows = fs.readFileSync(path.join(output, 'cases.tsv'), 'utf8').trim().split('\n');
    assert.equal(rows.length, result.schema_positive + result.schema_negative);
    for (const row of rows) {
      const [id, expected, schema, fixture] = row.split('\t');
      assert(['accept', 'reject'].includes(expected));
      assert.equal(schema, 'policy.schema.json');
      assert.equal(fixture, id + '.json');
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(output, fixture))));
    }
    assert.throws(() => prepareHistoryPolicyV2(output), /H2_OUTPUT_EXISTS/);
    assert(before.equals(fs.readFileSync(new URL('../../' + policyPath, import.meta.url))));
  } finally {
    const resolved = path.resolve(parent);
    assert(resolved.startsWith(path.resolve(tmpdir()) + path.sep + 'oc-history-policy-v2-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
