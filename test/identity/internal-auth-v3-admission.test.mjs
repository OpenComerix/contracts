import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { admissionRegistry, verifyInternalAuthV3Admission } from '../../scripts/identity/internal-auth-v3-admission.mjs';
import { includeInternalAuthV3Paths, projectExtendedIdentityIndex } from '../../scripts/identity/internal-auth-v3-history.mjs';
import { api, schema } from '../../scripts/identity/prepare-internal-auth-v3.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { withRepositoryValidationScope } from '../../tools/architecture/validation-history.mjs';

const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const bundle = '.ci-artifacts/identity-internal-auth-v3.bundle.json';
const cases = '.ci-artifacts/identity-internal-auth-v3.tests.json';
const producer = 'validate_identity_catalog_contracts';
const consumer = 'validate_identity_catalog_schema';
const expected = [
  [producer, 'node --test --test-concurrency=2 test/identity/*.test.mjs'],
  [producer, 'node scripts/validate-redocly-no-warnings.mjs ' + api],
  [producer, `npx --yes @redocly/cli@2.53.3 bundle ${api} --dereferenced --ext json --output ${bundle}`],
  [producer, `node scripts/identity/prepare-internal-auth-v3.mjs ${bundle} ${cases}`],
  [producer, 'node scripts/identity/internal-auth-v3-admission.mjs --revision "$GITHUB_SHA"'],
  [consumer, 'jsonschema metaschema ' + schema],
  [consumer, `jsonschema test ${cases} --resolve ${schema}`],
];
const validation = job => job.steps.find(step => step.name === 'Run original validation commands');
const packaging = job => job.steps.find(step => step.name === 'Package original artifact paths');
const restore = job => job.steps.find(step => step.name === 'Restore artifact paths from validate:identity-catalog-contracts');

function verifyCoverage(document) {
  const sourceJob = document.jobs[producer];
  const schemaJob = document.jobs[consumer];
  for (const job of [sourceJob, schemaJob]) {
    assert.equal(job.if, "needs.validation_scope.outputs.mode == 'full'");
    assert.equal(job['continue-on-error'], undefined);
    assert.equal(validation(job).if, undefined);
    assert.equal(validation(job)['continue-on-error'], undefined);
  }
  const native = validation(schemaJob).run.match(/^docker run [^\n]*ghcr\.io\/sourcemeta\/jsonschema:v16\.10\.0 -ec '([^']+)'$/m);
  assert(native, 'Sourcemeta container');
  const commands = { [producer]: validation(sourceJob).run.split('\n'), [consumer]: native[1].split('\n') };
  for (const [job, command] of expected) assert.equal(commands[job].filter(line => line === command).length, 1, command);
  assert(packaging(sourceJob).run.split('; do')[0].split(/\s+/).includes(cases), 'artifact path');
  assert(schemaJob.needs.includes(producer), 'artifact dependency');
  assert.equal(restore(schemaJob).if, undefined);
  assert.equal(restore(schemaJob).run,
    'tar -xzf "$RUNNER_TEMP/validate_identity_catalog_contracts/artifacts.tgz"');
}

test('complete Identity CI verifies the exact revision and runs its contract inputs', () => {
  verifyCoverage(workflow);
  for (const [job, command] of expected) {
    const changed = structuredClone(workflow);
    const step = validation(changed.jobs[job]);
    step.run = step.run.replace(command, 'true');
    assert.throws(() => verifyCoverage(changed), error => error.message.includes(command));
  }
  const changed = structuredClone(workflow);
  const step = packaging(changed.jobs[producer]);
  step.run = step.run.replace(cases, '.ci-artifacts/unrelated.json');
  assert.throws(() => verifyCoverage(changed), /artifact path/);
});

test('the admission gate requires the CI revision argument', () => {
  const changed = structuredClone(workflow);
  const step = validation(changed.jobs[producer]);
  step.run = step.run.replace('--revision "$GITHUB_SHA"', '--revision HEAD');
  assert.throws(() => verifyCoverage(changed), /internal-auth-v3-admission/);
});

const root = fileURLToPath(new URL('../../', import.meta.url));
const registryPath = 'registry/contracts.json';
const indexPath = 'identity/index.json';
const consumerExport = 'registry/consumers/sales-pos.json';
const sourceCommit = '1b39f102ba453b2040dffccf030096fb8679d705';
const authoritySchema = 'identity/http/shared/v2/identity-sales-authority-v2.schema.json';
const encode = data => Buffer.from(JSON.stringify(data, null, 2) + '\n');
const read = file => readFileSync(join(root, file));
const readA = createGitReader()(root, sourceCommit);
const laterIntention = {
  id: 'identity.synthetic.scope', domain: 'identity', owner: 'identity-tenancy',
  status: 'planned', materializeIn: 'Fixture',
};

test('initial B comes from Git A and descendants can extend the registry and consumer exports', t => {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'oc-id02-admission-'));
  t.after(() => {
    assert.equal(dirname(realpathSync(directory)), parent);
    rmSync(directory, { recursive: true });
  });
  const git = (cwd, ...args) => execFileSync('git', [
    '-C', cwd, '-c', 'core.autocrlf=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args,
  ], { windowsHide: true }).toString().trim();
  const fixture = (...args) => git(directory, ...args);
  fixture('init', '-q');
  const objects = git(root, 'rev-parse', '--path-format=absolute', '--git-path', 'objects');
  writeFileSync(join(directory, '.git/objects/info/alternates'), objects + '\n');
  const put = (file, bytes) => {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    fixture('add', '--', file);
  };
  const commit = (parent, message) => fixture('commit-tree', fixture('write-tree'), '-p', parent, '-m', message);
  const putRegistry = registry => {
    put(registryPath, encode(registry));
    put(indexPath, encode(domainIndex(registry, 'identity')));
  };
  fixture('read-tree', sourceCommit);
  const initialRegistry = admissionRegistry(readA);
  putRegistry(initialRegistry);
  const initial = commit(sourceCommit, 'Synthetic admission B');
  const proof = verifyInternalAuthV3Admission(directory, initial);
  assert.equal(proof.checkedCommit, initial);
  assert.equal(proof.evidence, 'git-revision');
  assert.equal(proof.admittedIds.length, 4);

  const exported = { ...JSON.parse(readA(consumerExport)), sourceCommit: '1'.repeat(40) };
  put(consumerExport, encode(exported));
  assert.throws(() => verifyInternalAuthV3Admission(directory, commit(sourceCommit, 'B edits a consumer')), /JOINT_CONSUMER/);
  const later = commit(initial, 'Later consumer export');
  const preserved = verifyInternalAuthV3Admission(directory, later);
  assert.equal(preserved.checkedCommit, later);
  assert.equal(preserved.initialAdmission, initial);
  assert.equal(preserved.evidence, 'preserved-admission');

  putRegistry({ ...initialRegistry, planned: [...initialRegistry.planned, laterIntention] });
  const extension = commit(later, 'Later unrelated Identity intention');
  const extendedProof = verifyInternalAuthV3Admission(directory, extension);
  assert.equal(extendedProof.checkedCommit, extension);
  assert.equal(extendedProof.initialAdmission, initial);
  assert.equal(extendedProof.evidence, 'preserved-admission');

  fixture('read-tree', initial);
  const changed = JSON.parse(readA(authoritySchema));
  changed.$defs.Authorization.properties.valid_for_ms.maximum = 2001;
  put(authoritySchema, encode(changed));
  assert.throws(() => verifyInternalAuthV3Admission(directory, commit(sourceCommit, 'B edits the decision schema')),
    error => error.message === 'JOINT_CLOSURE:' + authoritySchema);
  assert.throws(() => verifyInternalAuthV3Admission(directory, commit(initial, 'Later decision schema drift')),
    error => error.message === 'ID02_CLOSURE:' + authoritySchema);

  fixture('update-index', '--force-remove', '--', authoritySchema);
  assert.throws(() => verifyInternalAuthV3Admission(directory, commit(sourceCommit, 'B omits a decision schema')),
    error => error.message === 'GIT_SOURCE_NOT_BLOB:' + authoritySchema);
});

test('the historical repository gate retains verified ID-02 tooling after an unrelated intention', () => {
  const readAdmission = createGitReader()(root, 'c6739731d8f94916014039bc98f3b736af79a594');
  const registry = admissionRegistry(readA);
  const initialIndex = encode(domainIndex(registry, 'identity'));
  registry.planned.push(laterIntention);
  const registryBytes = encode(registry);
  const indexBytes = encode(domainIndex(registry, 'identity'));
  const source = file => file === registryPath ? registryBytes
    : file === indexPath ? indexBytes : readAdmission(file);
  const allowed = withRepositoryValidationScope([], source);
  const tooling = [
    'scripts/identity/prepare-internal-auth-v3.mjs', 'scripts/identity/internal-auth-v3-admission.mjs',
    'test/identity/internal-auth-v3.test.mjs', 'test/identity/internal-auth-v3-admission.test.mjs',
  ];
  for (const file of tooling) assert(allowed.has(file), file);
  assert(!allowed.has('scripts/identity/unrelated.mjs'));
  assert.throws(() => projectExtendedIdentityIndex(initialIndex, registry), /ID02_CURRENT_INDEX/);
  assert.throws(() => withRepositoryValidationScope([], file =>
    file === indexPath ? Buffer.concat([indexBytes, Buffer.from(' ')]) : source(file)), /ID02_CURRENT_INDEX/);
  assert.deepEqual(projectExtendedIdentityIndex(Buffer.from(indexBytes.toString().replaceAll('\n', '\r\n')), registry),
    projectExtendedIdentityIndex(indexBytes, registry));
  const oldDescriptor = registry.contracts.find(row => row.domain === 'identity' && row.commit !== sourceCommit);
  const oldVersion = oldDescriptor.version;
  oldDescriptor.version = 'wrong';
  assert.throws(() => projectExtendedIdentityIndex(encode(domainIndex(registry, 'identity')), registry), /ID02_PRIOR_INDEX/);
  oldDescriptor.version = oldVersion;
  assert.throws(() => includeInternalAuthV3Paths(new Set(), registryBytes,
    file => file === tooling[0] ? Buffer.concat([read(file), Buffer.from(' ')]) : read(file)), /ID02_SOURCE_SCOPE/);
  registry.contracts.find(row => row.id === 'identity.internal-auth.v3').sha256 = '0'.repeat(64);
  assert.throws(() => includeInternalAuthV3Paths(new Set(), encode(registry), read), /ID02_DESCRIPTOR_SCOPE/);
});
