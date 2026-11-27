import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { admissionRegistry, sourceCommit, verifyInternalAuthV4Admission } from '../../scripts/identity/internal-auth-v4-admission.mjs';
import { api, schema } from '../../scripts/identity/prepare-internal-auth-v4.mjs';
import { includeInternalAuthV3Paths } from '../../scripts/identity/internal-auth-v3-history.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { worktreeReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { withRepositoryValidationScope } from '../../tools/architecture/validation-history.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = parse(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
const source = createGitReader()(root, sourceCommit);
const registryPath = 'registry/contracts.json';
const indexPath = 'identity/index.json';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const bundle = '.ci-artifacts/identity-internal-auth-v4.bundle.json';
const vectors = '.ci-artifacts/identity-internal-auth-v4.tests.json';
const producer = 'validate_identity_catalog_contracts';
const consumer = 'validate_identity_catalog_schema';
const artifact = 'validate_identity_catalog_contracts';
const workflowCommands = [
  [producer, 'node --test --test-concurrency=2 test/identity/*.test.mjs'],
  [producer, `node scripts/validate-redocly-no-warnings.mjs ${api}`],
  [producer, `npx --yes @redocly/cli@2.53.3 bundle ${api} --dereferenced --ext json --output ${bundle}`],
  [producer, `node scripts/identity/prepare-internal-auth-v4.mjs ${bundle} ${vectors}`],
  [producer, 'node scripts/identity/internal-auth-v4-admission.mjs --revision "$GITHUB_SHA"'],
  [consumer, `jsonschema metaschema ${schema}`],
  [consumer, `jsonschema test ${vectors} --resolve ${schema}`],
];

const step = (job, name) => job.steps.find(item => item.name === name);
const validation = job => step(job, 'Run original validation commands');
const packaging = job => step(job, 'Package original artifact paths');
const mode = "needs.validation_scope.outputs.mode == 'full'";

function verifyCoverage(document) {
  const sourceJob = document.jobs[producer];
  const schemaJob = document.jobs[consumer];
  for (const job of [sourceJob, schemaJob]) {
    assert.equal(job.if, mode);
    assert.equal(job['continue-on-error'], undefined);
    assert.equal(validation(job).if, undefined);
    assert.equal(validation(job)['continue-on-error'], undefined);
  }
  const native = validation(schemaJob).run.match(/^docker run [^\n]*ghcr\.io\/sourcemeta\/jsonschema:v16\.10\.0 -ec '([^']+)'$/m);
  assert(native, 'Sourcemeta runner');
  const lines = { [producer]: validation(sourceJob).run.split('\n'), [consumer]: native[1].split('\n') };
  for (const [job, command] of workflowCommands)
    assert.equal(lines[job].filter(line => line === command).length, 1, command);
  assert(packaging(sourceJob).run.split('; do')[0].split(/\s+/).includes(vectors), 'vector artifact path');
  assert(schemaJob.needs.includes(producer), 'artifact dependency');
  const upload = sourceJob.steps.find(item => item.uses?.startsWith('actions/upload-artifact@') && item.with?.name === artifact);
  const download = schemaJob.steps.find(item => item.uses?.startsWith('actions/download-artifact@') && item.with?.name === artifact);
  assert.equal(upload?.with?.path, '${{ runner.temp }}/artifacts.tgz', 'artifact upload');
  assert.equal(download?.with?.path, '${{ runner.temp }}/validate_identity_catalog_contracts', 'artifact download');
  const restore = step(schemaJob, 'Restore artifact paths from validate:identity-catalog-contracts');
  assert.equal(restore.if, undefined);
  assert.equal(restore.run, 'tar -xzf "$RUNNER_TEMP/validate_identity_catalog_contracts/artifacts.tgz"');
}

test('ID-03 coverage runs the exact revision, policy tests and transferred Sourcemeta vectors in full CI', () => {
  verifyCoverage(workflow);
  for (const [job, command] of workflowCommands) {
    const changed = structuredClone(workflow);
    const selected = validation(changed.jobs[job]);
    selected.run = selected.run.replace(command, 'true');
    assert.throws(() => verifyCoverage(changed), error => error.message.includes(command));
  }
  const changed = structuredClone(workflow);
  const artifacts = packaging(changed.jobs[producer]);
  artifacts.run = artifacts.run.replace(vectors, '.ci-artifacts/unrelated.json');
  assert.throws(() => verifyCoverage(changed), /vector artifact path/);
});

test('ID-03 local candidate uses the five admitted descriptors and exact A bytes', () => {
  const currentFiles = worktreeReader(root);
  const current = JSON.parse(currentFiles(registryPath));
  const admitted = current.contracts.filter(row => row.commit === sourceCommit);
  const expected = admissionRegistry(source).contracts.filter(row => row.commit === sourceCommit);
  assert.deepEqual(admitted, expected);
  assert.equal(admitted.length, 5);
  assert(!current.planned.some(row => row.materializeIn === 'ID-03'));
  for (const row of admitted) assert.deepEqual(currentFiles(row.path), source(row.path));
});

test('the historical validation view admits only the reviewed B metadata and tooling', () => {
  const currentFiles = worktreeReader(root);
  const initial = admissionRegistry(source);
  const registry = encode(initial);
  const read = file => file === indexPath ? encode(domainIndex(initial, 'identity')) : currentFiles(file);
  const scope = new Set();
  includeInternalAuthV3Paths(scope, registry, read);
  const checked = ['.github/workflows/ci.yml', indexPath, 'identity/README.md',
    'scripts/identity/internal-auth-v4-admission.mjs', 'test/identity/internal-auth-v4-admission.test.mjs'];
  for (const file of checked) {
    assert(scope.has(file), file);
    assert.throws(() => includeInternalAuthV3Paths(new Set(), registry, name =>
      name === file ? Buffer.concat([read(name), Buffer.from(' ')]) : read(name)),
    error => error.message.split('\n')[0] === 'ID03_ADMISSION_SCOPE:' + file);
  }
  assert(!scope.has('scripts/identity/unauthorized.mjs'));
});

test('the historical scope accepts unrelated intentions and rechecks ID-03 and the current Identity index', () => {
  const currentFiles = worktreeReader(root);
  const initial = admissionRegistry(source);
  const readRevision = registry => file => {
    if (file === registryPath) return encode(registry);
    if (file === indexPath) return encode(domainIndex(registry, 'identity'));
    return currentFiles(file);
  };
  for (const [domain, owner] of [['sales', 'sales-pos'], ['identity', 'identity-tenancy']]) {
    const intention = { id: domain + '.fixture.later-intent', domain, owner, status: 'planned', materializeIn: 'Fixture' };
    const later = { ...initial, planned: [...initial.planned, intention] };
    const read = readRevision(later);
    const scope = withRepositoryValidationScope([], read);
    assert(scope.has('scripts/identity/internal-auth-v4-admission.mjs'));
    assert(!scope.has('identity/http/shared/v4/unrelated-fixture.json'));
    assert.throws(() => withRepositoryValidationScope([], file => file === indexPath
      ? Buffer.concat([read(file), Buffer.from(' ')]) : read(file)), /ID03_CURRENT_INDEX/);
    const drift = structuredClone(later);
    drift.contracts.find(row => row.id === 'identity.internal-auth.v4').sha256 = '0'.repeat(64);
    assert.throws(() => withRepositoryValidationScope([], readRevision(drift)), /ID03_DESCRIPTOR_SCOPE/);
  }
});

test('ID-03 B is a direct child of A, with the exact registry delta and semantic closure', t => {
  const parent = realpathSync(tmpdir());
  const dir = mkdtempSync(join(parent, 'oc-id03-admission-'));
  t.after(() => {
    assert.equal(dirname(realpathSync(dir)), parent);
    rmSync(dir, { recursive: true });
  });
  const runGit = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false',
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
  const git = (...args) => runGit(dir, ...args);
  git('init', '-q');
  const objects = runGit(root, 'rev-parse', '--path-format=absolute', '--git-path', 'objects');
  writeFileSync(join(dir, '.git/objects/info/alternates'), objects + '\n');
  const put = (path, contents) => {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    git('add', '--', path);
  };
  const putRegistry = value => {
    put(registryPath, encode(value));
    put(indexPath, encode(domainIndex(value, 'identity')));
  };
  const commit = (parent, message) => git('commit-tree', git('write-tree'), '-p', parent, '-m', message);
  git('read-tree', sourceCommit);
  const registry = admissionRegistry(source);
  putRegistry(registry);
  const initial = commit(sourceCommit, 'Synthetic ID-03 B');
  assert.throws(() => verifyInternalAuthV4Admission(dir, sourceCommit), /ID03_FINAL_REVISION/);
  const proof = verifyInternalAuthV4Admission(dir, initial);
  assert.equal(proof.checkedCommit, initial);
  assert.equal(proof.evidence, 'git-revision');
  assert.equal(proof.admittedIds.length, 5);

  for (const semantic of [
    'identity/http/shared/v1/identity-sale-preparation-workloads-v1.json',
    'identity/http/shared/v2/identity-catalog-workload-profiles-v2.json',
  ]) {
    put(semantic, Buffer.concat([source(semantic), Buffer.from(' ')]));
    assert.throws(() => verifyInternalAuthV4Admission(dir, commit(sourceCommit, 'B changes a semantic dependency')),
      error => error.message.split('\n')[0] === 'JOINT_CLOSURE:' + semantic);
    git('read-tree', initial);
  }
  const consumerPath = 'registry/consumers/sales-pos.json';
  put(consumerPath, Buffer.concat([source(consumerPath), Buffer.from(' ')]));
  const invalid = commit(sourceCommit, 'B changes a consumer');
  assert.throws(() => verifyInternalAuthV4Admission(dir, invalid), /JOINT_CONSUMER/);
  const extension = commit(initial, 'Later consumer change');
  assert.equal(verifyInternalAuthV4Admission(dir, extension).initialAdmission, initial);
  put(consumerPath, source(consumerPath));
  const restored = commit(invalid, 'Later commit restores the original consumer');
  assert.throws(() => verifyInternalAuthV4Admission(dir, restored), /JOINT_CONSUMER/);

  git('read-tree', initial);
  const missing = structuredClone(registry);
  missing.contracts.pop();
  putRegistry(missing);
  assert.throws(() => verifyInternalAuthV4Admission(dir, commit(sourceCommit, 'Partial B')), /JOINT_REGISTRY_HASH/);
  assert.throws(() => verifyInternalAuthV4Admission(dir, commit(initial, 'Later descriptor missing')), /ID03_DESCRIPTORS/);
});
