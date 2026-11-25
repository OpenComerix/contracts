import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { validateContractPaths } from '../../tools/architecture/layout.mjs';
import { checkDeclaration, checkTypesWorkflow, readCompletedSelection, resolveCompletedSources } from '../../scripts/sales/completed-v3-types.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const declaration = 'sales/events/v3/generated/sales.sale.completed.v3.d.ts';
const workflow = '.github/workflows/ci.yml';
const read = file => readFileSync(path.join(root, file));

test('the pinned source rejects unresolved and out-of-pin references', () => {
  const selection = readCompletedSelection();
  const pinned = gitReader(root, selection.pin.commit);
  const withRef = replace => file => {
    const bytes = pinned(file);
    if (file !== selection.pin.root) return bytes;
    const schema = JSON.parse(bytes);
    const payload = schema.allOf[1].properties.payload;
    payload.$ref = replace(payload.$ref);
    return Buffer.from(JSON.stringify(schema));
  };
  assert.throws(() => resolveCompletedSources(selection, withRef(ref => ref + 'BrokenPointer')),
    /Unresolved pointer/);
  assert.throws(() => resolveCompletedSources(selection, withRef(() => 'https://example.invalid/schema.json')),
    /Unmapped external reference/);
  const extra = { uri: 'https://example.invalid/schema.json', path: 'sales/events/v3/extra.schema.json' };
  const descriptor = { ...selection.descriptor, uriMappings: [...selection.descriptor.uriMappings, extra] };
  assert.throws(() => resolveCompletedSources({ ...selection, descriptor }, withRef(() => extra.uri)),
    /COMPLETED_TYPES_UNPINNED_REFERENCE/);
});

test('a byte change in the declaration is rejected and the declaration cannot be a registry root', () => {
  const bytes = read(declaration);
  assert.throws(() => checkDeclaration(Buffer.concat([bytes, Buffer.from('\n')]), bytes),
    /COMPLETED_TYPES_DECLARATION_DRIFT/);
  assert.throws(() => validateContractPaths([declaration], { domains: ['sales'], preserved: [] }),
    /LAYOUT_SURFACE_VERSION_OR_FIXTURE/);
});

test('the Sales workflow rejects a missing, optional or misplaced types step', () => {
  const current = read(workflow);
  checkTypesWorkflow(current);
  const document = parse(current.toString('utf8'));
  const steps = document.jobs.validate_sales_contracts.steps;
  const index = steps.findIndex(step => step.run === 'pnpm contracts:types:check');
  const [step] = steps.splice(index, 1);
  const check = () => checkTypesWorkflow(Buffer.from(stringify(document)));
  assert.throws(check, /COMPLETED_TYPES_CI_STEP/);
  steps.splice(index, 0, { ...step, 'continue-on-error': true });
  assert.throws(check, /COMPLETED_TYPES_CI_STEP/);
  steps.splice(index, 1);
  document.jobs.validate_sales_schema.steps.push(step);
  assert.throws(check, /COMPLETED_TYPES_CI_ORDER/);
});
