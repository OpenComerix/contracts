import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { readJSON } from '../../tools/architecture/consumer-gate.mjs';
import { readH5TypeInputs } from '../../tools/architecture/h5-type-inputs.mjs';
import { projectH5TypeSchema } from '../../tools/architecture/h5-type-schema.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('the H5 type plan rejects an operation outside the owner pin', () => {
  const plan = readJSON(root, 'tools/architecture/h5-type-selections.json');
  plan[0].selections[0].operations.push('unapprovedOperation');
  assert.throws(() => readH5TypeInputs(root, plan), /H5_TYPES_UNPINNED_SELECTOR/);
});

test('the projection rejects a reference outside the verified closure', () => {
  const file = 'sales/events/v3/sales.sale.completed.v3.schema.json';
  const input = {
    descriptor: { path: file },
    docs: new Map([[file, { $ref: 'https://example.invalid/outside.json' }]]),
    output: 'sales/events/v3/generated/sales.sale.completed.v3.d.ts',
    operations: [],
  };
  assert.throws(() => projectH5TypeSchema(input), /H5_TYPES_REFERENCE_OUTSIDE_PIN/);
});
