import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { verifyPackage, verifyMetadata, verifyProfiles, verifyBinding, verifyFingerprintVectors, schemaCases, fingerprint, root, files } from '../../scripts/sales/preparation-v1.mjs';
import { preparationMetadata, preparationNewFiles, projectPreparationFile, projectPreparationDocument, withPreparationScope } from '../../scripts/sales/preparation-history-v1.mjs';

const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const replace = (file, change) => name => {
  if (name !== file) return read(name);
  const value = json(file); change(value); return Buffer.from(JSON.stringify(value));
};

test('source has only three read-only owner ports and four separated fixed workload purposes', () => {
  assert.deepEqual(verifyPackage(), { apis: 3, schemas: 3, profiles: 4, fixtureGroups: 2, runtime_demonstrated: false });
  assert.deepEqual(verifyMetadata(), { planned: 8, admitted: 0, consumers: 8, runtime_demonstrated: false });
});
for (const [label, change] of [
  ['free audience', policy => policy.profiles[0].audience = '*'],
  ['gateway impersonation', policy => policy.profiles[0].caller = 'gateway-bff'],
  ['cross-purpose client', policy => policy.profiles[0].client_id = policy.profiles[1].client_id],
  ['long token', policy => policy.profiles[0].maximum_seconds = 301],
  ['token reuse', policy => policy.profiles[0].reuse = true],
  ['additional purpose', policy => policy.profiles.push({ ...policy.profiles[0] })],
  ['runtime assertion', policy => policy.runtime_demonstrated = true],
]) test('workload policy rejects ' + label, () => {
  const policy = json(files.policy); change(policy); assert.throws(() => verifyProfiles(policy));
});

for (const domain of ['inventory', 'finance']) {
  const baseline = () => json(files.fixtures).cases[domain];
  for (const field of ['organization_id', 'operation_id', 'preparation_id', 'request_hash'])
    for (const part of ['callback_request', 'callback_decision', 'result'])
      test(domain + ' rejects foreign ' + field + ' in ' + part, () => {
        const value = baseline(); value[part][field] = 'foreign'; assert.throws(() => verifyBinding(domain, value), /PREPARATION_BINDING/);
      });
  for (const [label, change] of [
    ['another owner', value => value.callback_decision.caller = domain === 'inventory' ? 'finance' : 'inventory'],
    ['another target', value => value.callback_request.target = domain === 'inventory' ? 'finance' : 'inventory'],
    ['another audience', value => value.callback_decision.audience = 'sales-pos.process-authority'],
    ['another hash', value => value.result.context_fingerprint = 'b'.repeat(64)],
    ['another branch', value => value.callback_decision.branch_id = 'foreign'],
    ['another POS', value => value.result.pos_id = 'foreign'],
    ['changed resource', value => value.request[domain === 'inventory' ? 'location_id' : 'cash_shift_id'] = 'foreign'],
    ['budget reset', value => value.result.valid_for_ms = value.callback_decision.valid_for_ms + 1],
    ['zero budget', value => value.result.valid_for_ms = 0],
    ['changed version', value => value.result[domain === 'inventory' ? 'warehouse_version' : 'shift_version']++],
  ]) test(domain + ' cross-field fixture rejects ' + label, () => {
    const value = baseline(); change(value); assert.throws(() => verifyBinding(domain, value));
  });
  test(domain + ' digest is independent of object key order and sensitive to exact request fields', () => {
    const value = baseline();
    const reordered = Object.fromEntries(Object.entries(value.request).reverse());
    assert.equal(fingerprint(reordered), value.callback_request.context_fingerprint);
    assert.notEqual(fingerprint({ ...reordered, pos_id: 'foreign' }), value.callback_request.context_fingerprint);
  });
  test(domain + ' fingerprint covers every field of the complete validated owner request', () => {
    const value = baseline();
    for (const [name, original] of Object.entries(value.request)) {
      const changed = structuredClone(value.request);
      if (typeof original === 'number') changed[name] = original + 1;
      else if (name === 'request_hash') changed[name] = 'b'.repeat(64);
      else if (name.endsWith('_id') && /^[0-9a-f-]{36}$/.test(original)) changed[name] = original.slice(0, -1) + (original.endsWith('f') ? '0' : 'f');
      else changed[name] = original + '-other';
      assert.notEqual(fingerprint(changed), value.callback_request.context_fingerprint, name + ' must not be omitted from the digest');
    }
  });
  test(domain + ' present observed versions are not defaults for omitted fields', () => {
    const vectors = json(files.fixtures).fingerprint_vectors;
    const complete = vectors.find(row => row.id === domain + '-complete');
    const omitted = vectors.find(row => row.id === domain + '-without-optionals');
    const changed = vectors.find(row => row.id === domain + '-changed-optionals');
    assert.notEqual(fingerprint(complete.request), fingerprint(omitted.request));
    assert.notEqual(fingerprint(complete.request), fingerprint(changed.request));
  });
}

test('independent fixed canonical UTF-8/digest vectors preserve Unicode without normalization', () => {
  const fixtures = json(files.fixtures);
  verifyFingerprintVectors(fixtures);
  assert.equal(fixtures.fingerprint_vectors.length, 8);
  const decomposed = fixtures.fingerprint_vectors.find(row => row.id === 'finance-unicode');
  const normalized = { ...decomposed.request, organization_id: decomposed.request.organization_id.normalize('NFC') };
  assert.notEqual(normalized.organization_id, decomposed.request.organization_id);
  assert.notEqual(fingerprint(normalized), decomposed.sha256);
});
test('independent canonical byte and digest expectations reject fixture drift', () => {
  for (const field of ['canonical_json', 'sha256']) {
    const fixture = json(files.fixtures);
    fixture.fingerprint_vectors[0][field] += 'x';
    assert.throws(() => verifyFingerprintVectors(fixture));
  }
});
test('schema matrix has 18 positive and 59 negative vectors with six distinct schema selections', () => {
  const cases = schemaCases();
  assert.equal(new Set(cases.map(row => row.id)).size, cases.length);
  assert.equal(cases.filter(row => row.expected === 'accept').length, 18);
  assert.equal(cases.filter(row => row.expected === 'reject').length, 59);
  assert.equal(new Set(cases.map(row => row.schema + '#' + row.fragment)).size, 6);
});
for (const domain of ['inventory', 'finance', 'sales']) {
  const api = files[domain].api;
  for (const [label, change] of [
    ['caller', operation => operation['x-caller'] = 'gateway-bff'],
    ['audience', operation => operation['x-audience'] = 'unapproved'],
    ['operation auth override', operation => operation.security = []],
    ['free tenant header', operation => operation.parameters = [{ in: 'header', name: 'X-Tenant' }]],
    ['caching', operation => operation.responses['200'].headers['Cache-Control'].schema.const = 'public'],
    ['unregistered error', operation => operation.responses['503'].content['application/problem+json'].schema.allOf[1].properties.code.enum = ['invented_error']],
    ['different fingerprint algorithm', operation => operation.description = operation.description.replace('SHA-256', 'SHA-1')],
    ['partial fingerprint input', operation => operation.description = operation.description.replace('complete validated', 'selected')],
  ]) test(domain + ' wire rejects ' + label, () => {
    assert.throws(() => verifyPackage(replace(api, document => change(Object.values(document.paths)[0].post))));
  });
  test(domain + ' schema selections retain the normative fingerprint definition', () => {
    const file = files[domain].schema;
    assert.throws(() => verifyPackage(replace(file, document => delete document.$defs.Request.description)), /PREPARATION_FINGERPRINT_CLOSURE/);
    const name = domain === 'sales' ? 'Request' : 'Result';
    assert.throws(() => verifyPackage(replace(file, document => delete document.$defs[name].properties.context_fingerprint.description)), /PREPARATION_FINGERPRINT_FIELD/);
    assert.throws(() => verifyPackage(replace(file, document => document.$defs.Request.properties.request_hash.description = 'context_fingerprint')), /PREPARATION_HUMAN_HASH_DEFINITION/);
  });
}

test('exact projections do not read another live input, repair caller drift or share mutable results', t => {
  const metadata = preparationMetadata();
  projectPreparationFile('registry/contracts.json', metadata.get('registry/contracts.json'));
  t.mock.method(fs, 'readFileSync', () => { throw Error('unrelated live read'); });
  for (const [file, bytes] of metadata) {
    const projected = projectPreparationFile(file, bytes);
    assert.notEqual(projected, bytes);
    const drift = Buffer.concat([bytes, Buffer.from('\nUnapproved')]);
    assert.equal(projectPreparationFile(file, drift), drift);
    if (file.endsWith('.json')) {
      const value = JSON.parse(bytes), wrong = { ...value, extra: undefined };
      assert.equal(projectPreparationDocument(file, wrong), wrong);
      const result = projectPreparationDocument(file, value); result.extra = 'poison';
      assert(!Object.hasOwn(projectPreparationDocument(file, value), 'extra'));
    }
  }
  const bytes = Buffer.from('caller bytes');
  assert.equal(projectPreparationFile('unapproved.json', bytes), bytes);
});
test('scope checks the small metadata delta once per invocation and rechecks changed/missing inputs after warmup', () => {
  const counts = new Map();
  const counted = file => { counts.set(file, (counts.get(file) ?? 0) + 1); return read(file); };
  const allowed = withPreparationScope([], counted);
  assert(preparationNewFiles.every(file => allowed.has(file)));
  assert(!allowed.has('src/main.ts'));
  assert([...counts.values()].every(value => value === 1));
  for (const [file] of preparationMetadata()) {
    assert.throws(() => withPreparationScope([], name => name === file ? Buffer.concat([read(name), Buffer.from('drift')]) : read(name)));
    assert.throws(() => withPreparationScope([], name => { if (name === file) throw Error('missing source'); return read(name); }));
  }
  assert.throws(() => withPreparationScope([], replace('registry/contracts.json', value => value.planned.pop())), /PREPARATION_PARTIAL_SCOPE/);
});
test('native validation joins existing jobs and checks each distinct metaschema once, outside the fixture loop', () => {
  const workflow = parse(read('.github/workflows/ci.yml').toString());
  const originalCommands = workflow.jobs.validate_sales_contracts.steps.find(step => step.name === 'Run original validation commands').run;
  assert(originalCommands.includes('node scripts/sales/preparation-v1.mjs openapi'));
  assert(originalCommands.includes('node scripts/sales/preparation-v1.mjs prepare .ci-artifacts/sales-v2-preparation-ci'));
  const step = workflow.jobs.validate_sales_schema.steps.find(step => step.name === 'Validate sale preparation schemas and vectors');
  assert(step.run.includes('jsonschema:v16.10.0'));
  assert(step.run.includes('--network none'));
  assert.equal(Object.keys(workflow.jobs).length, 23);
  const shell = read('scripts/sales/validate-preparation-v1.sh').toString();
  assert.equal(shell.match(/jsonschema metaschema/g)?.length, 1);
  assert(shell.indexOf('jsonschema metaschema') < shell.indexOf('read -r id expected schema fixture'));
});
