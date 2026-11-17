import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { verifyJointDelivery } from '../../tools/architecture/joint-delivery.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';

function fixture(t, count = 1) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'oc-joint-'));
  t.after(() => { assert.equal(path.dirname(root), parent); assert(path.basename(root).startsWith('oc-joint-')); fs.rmSync(root, { recursive: true, force: true }); });
  const git = args => execFileSync('git', ['-C', root, '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=' + path.join(root, 'no-hooks'), ...args], { windowsHide: true }).toString().trim();
  git(['init', '-q', '-b', 'fixture']);
  const put = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); };
  const read = file => fs.readFileSync(path.join(root, file));
  const commit = () => { git(['add', '--all']); git(['commit', '-qm', 'Synthetic joint delivery']); return git(['rev-parse', 'HEAD']); };
  const shared = 'identity/http/shared/v1/shared.schema.json', semantic = 'identity/http/shared/v1/policy.json';
  put(shared, { type: 'string' }); put(semantic, { policy: 'synthetic' });
  const planned = Array.from({ length: count }, (_, i) => ({ id: 'fixture.' + i, domain: 'identity', owner: 'identity',
    path: 'identity/http/shared/v1/root' + i + '.schema.json', version: '1.0.0', operations: [], status: 'planned' }));
  for (const row of planned) put(row.path, { $ref: 'shared.schema.json' });
  const before = { formatVersion: 1, contracts: [], planned, preservedFiles: [], requiredConsumers: ['synthetic'] };
  put('registry/contracts.json', before);
  put('registry/consumers/index.json', { consumers: [{ file: 'synthetic.json' }] });
  put('registry/consumers/synthetic.json', { lock: 'unchanged' });
  const sourceCommit = commit();
  const after = { ...before, planned: [], contracts: planned.map(row => ({ ...row, surface: 'http-shared', status: 'active', commit: sourceCommit,
    sha256: sha256(read(row.path)), uriMappings: [] })) };
  const save = () => { put('registry/contracts.json', after); put('identity/index.json', domainIndex(after, 'identity')); };
  save();
  const options = { root, sourceCommit, admittedIds: planned.map(row => row.id), semanticPaths: [semantic] };
  return { root, put, read, commit, git, after, save, options, shared, semantic };
}

test('A then B proves Git bytes without claiming CI or publication; local evidence is distinct', t => {
  const f = fixture(t), local = verifyJointDelivery(f.options);
  assert.equal(local.evidence, 'local-candidate'); assert.equal(local.checkedCommit, null);
  const b = f.commit(), result = verifyJointDelivery({ ...f.options, finalRevision: b });
  assert.equal(result.checkedCommit, b); assert.equal(result.evidence, 'git-revision');
  assert.equal(result.publication, 'unverified'); assert.equal(result.closureFiles, 3);
  assert.throws(() => verifyJointDelivery({ ...f.options, sourceCommit: 'HEAD' }), /UNRESOLVED/);
  assert.throws(() => verifyJointDelivery({ ...f.options, sourceCommit: 'a'.repeat(40) }));
  assert.throws(() => verifyJointDelivery({ ...f.options, finalRevision: f.options.sourceCommit }), /ADMISSION_REQUIRED/);
  assert.throws(() => verifyJointDelivery({ ...f.options, finalRevision: b, readCurrent: f.read }), /MIXED_READERS/);
  f.git(['checkout', '--orphan', 'unrelated']); const other = f.commit();
  assert.throws(() => verifyJointDelivery({ ...f.options, finalRevision: other }));
});

for (const file of ['shared', 'semantic']) for (const missing of [false, true])
  test('rechecks changed/missing dependency after warmup: ' + file + '/' + missing, t => {
    const f = fixture(t); verifyJointDelivery(f.options);
    if (missing) fs.unlinkSync(path.join(f.root, f[file])); else f.put(f[file], { changed: true });
    assert.throws(() => verifyJointDelivery(f.options));
    const b = f.commit(); assert.throws(() => verifyJointDelivery({ ...f.options, finalRevision: b }));
  });

for (const field of ['owner', 'domain', 'path', 'version', 'operations', 'status', 'commit', 'sha256'])
  test('rejects descriptor drift: ' + field, t => {
    const f = fixture(t); verifyJointDelivery(f.options);
    f.after.contracts[0][field] = field === 'operations' ? ['extra'] : 'changed'; f.save();
    assert.throws(() => verifyJointDelivery(f.options), /JOINT_/);
  });

test('rejects partial/additional admissions, unrelated metadata, consumers and index drift', t => {
  const f = fixture(t, 2);
  assert.throws(() => verifyJointDelivery({ ...f.options, admittedIds: [f.options.admittedIds[0]] }), /PRIOR_DESCRIPTORS/);
  assert.throws(() => verifyJointDelivery({ ...f.options, admittedIds: [...f.options.admittedIds, 'extra'] }), /ADMISSION_DELTA/);
  f.after.preservedFiles.push({ path: 'foreign' }); f.save();
  assert.throws(() => verifyJointDelivery(f.options), /REGISTRY_PRESERVATION/);
  f.after.preservedFiles.pop(); f.after.planned.push({ id: 'foreign' }); f.save();
  assert.throws(() => verifyJointDelivery(f.options), /OTHER_INTENTIONS/);
  f.after.planned.pop(); f.save(); f.put('identity/index.json', {});
  assert.throws(() => verifyJointDelivery(f.options), /JOINT_INDEX/);
  f.save(); f.put('registry/consumers/synthetic.json', { lock: 'changed' });
  assert.throws(() => verifyJointDelivery(f.options), /JOINT_CONSUMER/);
});

for (const count of [1, 10, 100]) test('one context reads the current union once for ' + count + ' roots', t => {
  const f = fixture(t, count), visits = new Map();
  const result = verifyJointDelivery({ ...f.options, readCurrent: file => {
    visits.set(file, (visits.get(file) ?? 0) + 1); return f.read(file);
  } });
  assert.equal(result.closureFiles, count + 2);
  assert.equal(result.currentReads, count + 6);
  assert([...visits.values()].every(value => value === 1));
});

test('existing full architecture job discovers helper tests without a new job or partial mode', () => {
  const workflow = parse(fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const check = value => {
    assert.equal(Object.keys(value.jobs).length, 23);
    const job = value.jobs.validate_contract_architecture;
    assert.equal(job.if, "needs.validation_scope.outputs.mode == 'full'");
    const run = job.steps.find(step => step.name === 'Run original validation commands').run;
    assert(run.includes('node --test --test-concurrency=2 test/architecture/*.test.mjs'));
  };
  check(workflow);
  const changed = structuredClone(workflow);
  changed.jobs.validate_contract_architecture.steps.find(step => step.name === 'Run original validation commands').run = 'true';
  assert.throws(() => check(changed));
});
