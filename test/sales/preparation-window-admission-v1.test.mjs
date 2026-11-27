import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { admissionDomains, admissionRegistry, admittedIds, registryPath,
  sourceCommit, verifyPreparationWindowAdmission } from '../../scripts/sales/preparation-window-admission-v1.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { worktreeReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const current = worktreeReader(root);
const source = createGitReader()(root, sourceCommit);
const workflowPath = '.github/workflows/ci.yml';
const producer = 'validate_sales_contracts';
const consumer = 'validate_sales_schema';
const full = "needs.validation_scope.outputs.mode == 'full'";
const fixturePath = '.ci-artifacts/sales-v2-id04-ci';
const fixtureGlob = '.ci-artifacts/sales-v2-*/';
const validations = [
  'node --test --test-reporter=tap --test-concurrency=2 test/sales/*.test.mjs',
  `node scripts/sales/preparation-window-v1.mjs prepare ${fixturePath}`,
  'node scripts/sales/preparation-window-admission-v1.mjs --revision "$GITHUB_SHA"',
];
const nativeCommand = `sh scripts/sales/validate-preparation-window-v1.sh ${fixturePath}`;
const nativeStep = 'Validate ID-04 preparation window schemas and vectors';
const step = (job, name) => job.steps.find(entry => entry.name === name);

function unguarded(value) {
  assert(value);
  assert.equal(value.if, undefined);
  assert.equal(value['continue-on-error'], undefined);
}

function verifyCoverage(workflow) {
  const prepare = workflow.jobs[producer];
  const validate = workflow.jobs[consumer];
  assert.equal(prepare.if, `${full} || needs.validation_scope.outputs.mode == 'sales-only'`);
  assert.equal(validate.if, full);
  for (const job of [prepare, validate]) assert.equal(job['continue-on-error'], undefined);
  const commands = step(prepare, 'Run original validation commands');
  unguarded(commands);
  for (const command of validations) {
    assert.equal(commands.run.split('\n').filter(line => line === command).length, 1, command);
  }
  const pack = step(prepare, 'Package original artifact paths');
  assert(pack.run.includes(`for path in ${fixtureGlob}; do`), 'ID04_ARTIFACT_INPUT');
  assert(pack.run.includes('tar -czf "$RUNNER_TEMP/artifacts.tgz" --files-from /dev/null "${paths[@]}"'), 'ID04_ARTIFACT_PACK');
  const upload = prepare.steps.find(entry => entry.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload?.with?.name, producer);
  assert.equal(upload?.with?.path, '${{ runner.temp }}/artifacts.tgz');
  assert(validate.needs.includes(producer), 'ID04_ARTIFACT_DEPENDENCY');
  const download = validate.steps.find(entry => entry.uses?.startsWith('actions/download-artifact@'));
  unguarded(download);
  assert.equal(download.with.name, producer);
  assert.equal(download.with.path, '${{ runner.temp }}/validate_sales_contracts');
  const restore = step(validate, 'Restore artifact paths from validate:sales-contracts');
  unguarded(restore);
  assert.equal(restore.run, 'tar -xzf "$RUNNER_TEMP/validate_sales_contracts/artifacts.tgz"');
  const native = step(validate, nativeStep);
  unguarded(native);
  assert(native.run.startsWith('docker run ') && native.run.includes('--network none') &&
    native.run.endsWith(`ghcr.io/sourcemeta/jsonschema:v16.10.0 -ec '${nativeCommand}'`), nativeCommand);
}

test('ID-04 connects Redocly, the exact Git admission and Sourcemeta to the existing Sales jobs', () => {
  const workflow = parse(current(workflowPath).toString('utf8'));
  verifyCoverage(workflow);
  for (const command of validations) {
    const changed = structuredClone(workflow);
    const run = step(changed.jobs[producer], 'Run original validation commands');
    run.run = run.run.replace(command, 'true');
    assert.throws(() => verifyCoverage(changed), error => error.message.includes(command));
  }
  const withoutFixtures = structuredClone(workflow);
  const pack = step(withoutFixtures.jobs[producer], 'Package original artifact paths');
  pack.run = pack.run.replace(fixtureGlob, '.ci-artifacts/unrelated/');
  assert.throws(() => verifyCoverage(withoutFixtures), /ID04_ARTIFACT_INPUT/);
  const withoutNative = structuredClone(workflow);
  step(withoutNative.jobs[consumer], nativeStep).run = 'true';
  assert.throws(() => verifyCoverage(withoutNative), error => error.message.includes(nativeCommand));
});

test('ID-04 adds its commands without changing the workflow of the audited source', () => {
  const workflow = parse(current(workflowPath).toString('utf8'));
  const previous = parse(source(workflowPath).toString('utf8'));
  const run = step(workflow.jobs[producer], 'Run original validation commands');
  const additions = validations.slice(1);
  run.run = run.run.split('\n').filter(line => !additions.includes(line)).join('\n');
  const schema = workflow.jobs[consumer];
  schema.steps = schema.steps.filter(entry => entry.name !== nativeStep);
  assert.deepEqual(workflow, previous);
});

test('ID-04 admits only the seven source intentions and derives the affected indexes', () => {
  const expected = admissionRegistry(source);
  assert.deepEqual(JSON.parse(current(registryPath)), expected);
  assert.equal(admittedIds.length, 7);
  for (const domain of admissionDomains) {
    assert.deepEqual(JSON.parse(current(`${domain}/index.json`)), domainIndex(expected, domain));
  }
});

test('ID-04 verifies the exact synthetic Git revision and rejects semantic drift in its descendant', t => {
  const parent = realpathSync(tmpdir());
  const dir = mkdtempSync(path.join(parent, 'oc-id04-admission-'));
  t.after(() => {
    const target = realpathSync(dir);
    assert.equal(target, dir);
    assert.equal(path.dirname(target), parent);
    assert(path.basename(target).startsWith('oc-id04-admission-'));
    rmSync(target, { recursive: true });
  });
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'core.autocrlf=false',
    '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
  const objects = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-path', 'objects'],
    { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q', '-b', 'fixture');
  writeFileSync(path.join(dir, '.git/objects/info/alternates'), objects + '\n');
  git('read-tree', sourceCommit);
  const put = (file, contents) => {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
    git('add', '--', file);
  };
  for (const file of [registryPath, ...admissionDomains.map(domain => `${domain}/index.json`)]) {
    put(file, current(file));
  }
  const revision = git('commit-tree', git('write-tree'), '-p', sourceCommit, '-m', 'Synthetic admission');
  const proof = verifyPreparationWindowAdmission(dir, revision);
  assert.equal(proof.checkedCommit, revision);
  assert.equal(proof.evidence, 'git-revision');
  assert.equal(proof.publication, 'unverified');
  assert.deepEqual(proof.admittedIds, admittedIds);
  assert.throws(() => verifyPreparationWindowAdmission(dir, sourceCommit), /ID04_FINAL_REVISION/);

  const semantic = 'identity/http/shared/v2/identity-sale-preparation-workloads-v2.json';
  put(semantic, Buffer.concat([source(semantic), Buffer.from(' ')]));
  const drift = git('commit-tree', git('write-tree'), '-p', revision, '-m', 'Synthetic semantic drift');
  assert.throws(() => verifyPreparationWindowAdmission(dir, drift), /JOINT_CLOSURE:identity\/http\/shared\/v2\/identity-sale-preparation-workloads-v2\.json/);
});
