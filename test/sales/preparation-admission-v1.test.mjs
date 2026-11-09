import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeLock} from '../../tools/architecture/graph.mjs';
import {admissionSourceCommit, admissionSource, root, admissionIds, admissionRows, admittedRegistry,
  admissionMetadata, admissionToolFiles, admissionClosures, validatePreparationAdmission,
  projectPreparationAdmissionFile, projectPreparationAdmissionDocument, withPreparationAdmissionScope,
} from '../../scripts/sales/preparation-admission-v1.mjs';
import {projectPreparationFile, projectPreparationDocument, withPreparationScope} from '../../scripts/sales/preparation-history-v1.mjs';

const read = file => fs.readFileSync(path.join(root, file));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const before = () => JSON.parse(admissionSource('registry/contracts.json'));
const changedRegistry = change => {
  const value = admittedRegistry(); change(value);
  return file => file === 'registry/contracts.json' ? encode(value) : read(file);
};
test('eight exact source admissions preserve every descriptor, unrelated intention and consumer', () => {
  assert.equal(admissionSourceCommit, '748cb69b9301243a32c169b01e2c340b7102f020');
  assert.deepEqual(validatePreparationAdmission(), {admitted:8, roots:214, preserved:236, planned:2, consumers:8, closureFiles:9, runtime_demonstrated:false});
  const current = admittedRegistry(), previous = before();
  assert.deepEqual(current.contracts.slice(0, 206), previous.contracts);
  assert.deepEqual(current.preservedFiles, previous.preservedFiles);
  assert.deepEqual(current.requiredConsumers, previous.requiredConsumers);
  assert.deepEqual(current.planned, previous.planned.filter(row => !admissionIds.includes(row.id)));
  assert.deepEqual(current.contracts.slice(206).map(row => row.id), admissionIds);
  assert.equal(admissionMetadata().size, 10);
  for (const owner of current.requiredConsumers) {
    const file = 'registry/consumers/' + owner + '.json';
    assert(read(file).equals(admissionSource(file)), owner + ' snapshot must remain byte-identical');
  }
});
test('selected operations, owners, versions and minimal source closures are fixed', () => {
  const rows = admissionRows(), closures = admissionClosures();
  assert.deepEqual(rows.map(row => [row.owner, row.surface, row.version, row.operations]), [
    ['inventory','http-private','1.0.0',['checkInventorySaleContext']], ['inventory','schema','v1',[]],
    ['finance','http-private','1.0.0',['checkFinanceSaleContext']], ['finance','schema','v1',[]],
    ['sales-pos','http-private','1.0.0',['authorizeSaleContextCheck']], ['sales-pos','schema','v1',[]],
    ['identity-tenancy','policy','v1',[]], ['sales-pos','validation','v1',[]],
  ]);
  assert.deepEqual(closures.map(row => row.files.length), [3,1,3,1,3,1,1,1]);
  const paths = new Set(closures.flatMap(row => row.files.map(file => file.path)));
  assert.equal(paths.size, 9);
  for (const row of rows) {
    assert.equal(row.status, 'active'); assert.equal(row.commit, admissionSourceCommit);
    assert.equal(row.tag, null); assert.equal(row.tagObject, null);
    const files = closures.find(closure => closure.id === row.id).files;
    assert.equal(files.find(file => file.path === row.path).sha256, row.sha256);
    assert.deepEqual(row.uriMappings.map(row => row.path).sort(), files.filter(file => row.surface === 'http-private' ? file.path !== row.path : row.surface === 'schema').map(file => file.path).sort());
  }
});
for (const role of ['producer','consumer','semantic-owner','validation'])
  test('isolated ' + role + ' selections resolve only admitted sources and keep planned roots unavailable', () => {
    const manifest = {service:'isolated-preparation-admission', contracts:admissionRows().map(row => ({
      id:row.id, role, version:row.version, operations:row.operations, pointers:row.operations.length ? [] : [''],
    })), assets:[]};
    const lock = makeLock(root, manifest, encode(manifest), admittedRegistry());
    assert.equal(lock.entries.length, 8);
    assert(lock.entries.every(row => row.commit === admissionSourceCommit));
    assert.deepEqual(lock.entries.map(row => row.files.length), [3,1,3,1,3,1,1,1]);
    for (const intention of admittedRegistry().planned) {
      const wrong = {...manifest, contracts:[{...manifest.contracts[0], id:intention.id}]};
      assert.throws(() => makeLock(root, wrong, encode(wrong), admittedRegistry()), /Unknown\/unmaterialized/);
    }
  });
for (const [label, change] of [
  ['commit', row => row.commit = 'f'.repeat(40)], ['hash', row => row.sha256 = '0'.repeat(64)],
  ['version', row => row.version = '2.0.0'], ['status', row => row.status = 'draft'],
  ['owner', row => row.owner = 'unapproved'], ['operation omitted', row => row.operations = []],
  ['operation added', row => row.operations.push('adjustInventoryStock')],
  ['mapping omitted', row => row.uriMappings.pop()], ['mapping changed', row => row.uriMappings[0].path = row.path],
]) test('admission rejects foreign ' + label + ' after warmup', () => {
  validatePreparationAdmission();
  const wrong = changedRegistry(value => change(value.contracts[206]));
  assert.throws(() => validatePreparationAdmission(wrong), /PREPARATION_ADMISSION_METADATA/);
  assert.throws(() => withPreparationAdmissionScope([], wrong), /PREPARATION_ADMISSION_PARTIAL_SCOPE/);
});
for (const [label, change] of [
  ['root missing', value => value.contracts.pop()], ['all roots missing', value => value.contracts.splice(206)],
  ['intention retained', value => value.planned = before().planned], ['foreign intention removed', value => value.planned.pop()],
  ['prior descriptor changed', value => value.contracts[0].purpose += 'drift'],
  ['prior descriptor reordered', value => value.contracts.reverse()], ['consumer added', value => value.requiredConsumers.push('unapproved')],
]) test('partial or unrelated transition fails closed: ' + label, () => {
  assert.throws(() => validatePreparationAdmission(changedRegistry(change)), /PREPARATION_ADMISSION_METADATA/);
});
const protectedFiles = [...new Set([...admissionMetadata().keys(), 'registry/consumers/index.json',
  ...before().requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json'),
  ...admissionClosures().flatMap(row => row.files.map(file => file.path))])];
for (const file of protectedFiles)
  test('current admission rechecks changed and missing input after warmup: ' + file, () => {
    validatePreparationAdmission();
    assert.throws(() => validatePreparationAdmission(name => name === file ? Buffer.concat([read(name),Buffer.from('drift')]) : read(name)));
    assert.throws(() => validatePreparationAdmission(name => {if (name === file) throw Error('Synthetic missing input'); return read(name);}));
  });
test('capability validation and metadata scopes read each current input once per invocation', () => {
  const counts = new Map(), counted = file => {counts.set(file,(counts.get(file) ?? 0)+1); return read(file);};
  validatePreparationAdmission(counted);
  assert.equal(counts.size, protectedFiles.length);
  assert([...counts.values()].every(count => count === 1));
  counts.clear();
  const scope = withPreparationAdmissionScope([], counted);
  assert.deepEqual([...scope].sort(), [...admissionMetadata().keys(), ...admissionToolFiles].sort());
  assert.equal(counts.size, 10); assert([...counts.values()].every(count => count === 1));
  counts.clear(); withPreparationScope([], counted);
  assert([...counts.values()].every(count => count === 1));
  for (const file of admissionMetadata().keys()) {
    assert.throws(() => withPreparationAdmissionScope([], name => name === file ? Buffer.concat([read(name),Buffer.from('drift')]) : read(name)));
    assert.throws(() => withPreparationAdmissionScope([], name => {if (name === file) throw Error('Synthetic missing metadata'); return read(name);}));
  }
});
test('pure projections do not consult current files, repair drift or leak mutable state', t => {
  const metadata = admissionMetadata();
  for (const [file, bytes] of metadata) projectPreparationAdmissionFile(file, bytes);
  t.mock.method(fs,'readFileSync',() => {throw Error('Unrelated live read');});
  for (const [file, bytes] of metadata) {
    assert(projectPreparationAdmissionFile(file,bytes).equals(admissionSource(file)));
    const wrong = Buffer.concat([bytes,Buffer.from('drift')]);
    assert.equal(projectPreparationAdmissionFile(file,wrong), wrong);
    assert.equal(projectPreparationFile(file,wrong), wrong);
    if (file.endsWith('.json')) {
      const value = JSON.parse(bytes), invalid = {...value, extra:undefined};
      assert.equal(projectPreparationAdmissionDocument(file,invalid), invalid);
      assert.equal(projectPreparationDocument(file,invalid), invalid);
      assert.deepEqual(projectPreparationAdmissionDocument(file,value), JSON.parse(admissionSource(file)));
    }
  }
  const bytes = Buffer.from('caller bytes');
  assert.equal(projectPreparationAdmissionFile('unrelated.json',bytes), bytes);
  const value = admittedRegistry(); value.contracts.pop(); assert.equal(admittedRegistry().contracts.length,214);
  const rows = admissionRows(); rows[0].operations.pop(); assert.equal(admissionRows()[0].operations.length,1);
  metadata.get('registry/contracts.json').fill(0);
  assert(admissionMetadata().get('registry/contracts.json').equals(encode(admittedRegistry())));
});
