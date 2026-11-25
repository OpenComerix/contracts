import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { withIanaAdmissionScope } from '../../scripts/sales/iana-admission-v1.mjs';
import {
  pwaTelemetryDescriptors,
  pwaTelemetryInitialRegistryHash,
  pwaTelemetrySource,
  verifyPwaTelemetryAdmission,
} from '../../scripts/observability/pwa-telemetry-admission-v1.mjs';
import {
  projectPwaTelemetryDocument,
  projectPwaTelemetryFile,
  pwaTelemetryHistoricalPaths,
} from '../../scripts/observability/pwa-telemetry-history-v1.mjs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const workflow = parse(read('.github/workflows/ci.yml'));
const runner = read('scripts/observability/validate-pwa-telemetry-v1.sh');
const sourcemetaJob = 'validate_json_schema';
const nativeCommand = 'sh scripts/observability/validate-pwa-telemetry-v1.sh';
const commands = [
  ['validate_openapi', 'node scripts/validate-redocly-no-warnings.mjs observability/http/public/v1/pwa-telemetry-v1.yaml'],
  [sourcemetaJob, nativeCommand],
  ['validate_contract_architecture', 'node --test --test-reporter=tap test/ci/*.test.mjs'],
  ['validate_contract_architecture', 'node --test test/observability/pwa-telemetry-v1.test.mjs'],
  ['validate_contract_architecture', 'node scripts/observability/pwa-telemetry-admission-v1.mjs --revision "$GITHUB_SHA"'],
];
const runnerLines = [
  'set -eu',
  'batch=observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json',
  'invalid=observability/http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json',
  'problem=common/http/shared/v3/problem-details-v3.schema.json',
  'csrf=openapi/csrf-v3-problem.schema.json',
  'fixtures=observability/fixtures/pwa-telemetry/v1',
  'jsonschema metaschema "$batch" "$invalid" --verbose',
  'jsonschema test "$fixtures/batch-tests.json" --resolve "$batch"',
  'jsonschema test "$fixtures/invalid-batch-problem-tests.json" "$fixtures/csrf-problem-tests.json" --format-assertion --resolve "$invalid" --resolve "$problem" --resolve "$csrf"',
];
const lines = script => script.split(/\r?\n/).map(line => line.trim());
const stepFor = job => job.steps.find(step => step.name === 'Run original validation commands');
const registryPath = 'registry/contracts.json';
const unrelatedPath = 'common/http/shared/v1/unrelated-admission-test-v1.schema.json';
const unrelatedIntent = {
  id: 'common.unrelated-admission-test.schema.v1', domain: 'common', owner: 'platform-contracts',
  path: unrelatedPath, version: '1.0.0', operations: [], status: 'planned', materializeIn: 'test-fixture',
};
const previousSource = createGitReader()(fileURLToPath(root), pwaTelemetrySource);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function deliveryRegistry() {
  const registry = JSON.parse(previousSource(registryPath));
  const rows = pwaTelemetryDescriptors(JSON.parse(read(registryPath)));
  const ids = new Set(rows.map(row => row.id));
  return { ...registry, contracts: [...registry.contracts, ...rows],
    planned: registry.planned.filter(row => !ids.has(row.id)) };
}

function appendUnrelated(registry, sourceCommit = pwaTelemetrySource, sourceBytes = encode({ type: 'string' })) {
  const { status, materializeIn, ...fields } = unrelatedIntent;
  registry.contracts.push({ ...registry.contracts[0], ...fields, surface: 'schema', status: 'active',
    commit: sourceCommit, sha256: sha256(sourceBytes),
    tag: null, tagObject: null, uriMappings: [] });
  registry.planned.push({ id: 'test.unrelated-plan.v1', domain: 'common', owner: 'platform-contracts',
    materializeIn: 'test-fixture', status: 'planned' });
  return registry;
}

function checkCoverage(candidate, nativeRunner) {
  for (const [jobId, command] of commands) {
    const job = candidate.jobs[jobId];
    const step = stepFor(job);
    assert.equal(job.if, "needs.validation_scope.outputs.mode == 'full'", jobId);
    assert.equal(step.if, undefined, jobId);
    assert.equal(step['continue-on-error'], undefined, jobId);
    const executed = jobId === sourcemetaJob
      ? [...step.run.matchAll(/^docker run [^\n]*ghcr\.io\/sourcemeta\/jsonschema:v16\.10\.0 -ec '([^']*)'\s*$/gm)]
        .flatMap(([, body]) => lines(body))
      : lines(step.run);
    assert.equal(executed.filter(line => line === command).length, 1, command);
  }
  assert.deepEqual(lines(nativeRunner).filter(line => line && !line.startsWith('#')), runnerLines);
}

test('full CI runs the PWA contract checks and passes the exact SHA to admission', () => {
  checkCoverage(workflow, runner);
});

test('coverage fails when any required workflow command disappears or its step is skipped', () => {
  for (const [jobId, command] of commands) {
    const candidate = structuredClone(workflow);
    const step = stepFor(candidate.jobs[jobId]);
    step.run = step.run.replace(command, '');
    assert.throws(() => checkCoverage(candidate, runner), error => error.message.includes(command));
  }
  const candidate = structuredClone(workflow);
  stepFor(candidate.jobs.validate_openapi).if = '${{ false }}';
  assert.throws(() => checkCoverage(candidate, runner), /validate_openapi/);
});

test('coverage accepts later Sourcemeta commands and rejects moving PWA outside its container', () => {
  const candidate = structuredClone(workflow);
  const step = stepFor(candidate.jobs[sourcemetaJob]);
  step.run = step.run.replace(nativeCommand + "'", nativeCommand + "\njsonschema version'");
  checkCoverage(candidate, runner);
  step.run = step.run.replace(nativeCommand, '') + '\n' + nativeCommand;
  assert.throws(() => checkCoverage(candidate, runner), error => error.message.includes(nativeCommand));
});

test('coverage fails when a metaschema, fixture, or reference input is removed from the native runner', () => {
  for (const input of ['"$batch"', '"$invalid"', '"$problem"', '"$csrf"', '"$fixtures/batch-tests.json"',
    '"$fixtures/invalid-batch-problem-tests.json"', '"$fixtures/csrf-problem-tests.json"']) {
    assert(runner.includes(input), input);
    assert.throws(() => checkCoverage(workflow, runner.replaceAll(input, '')), { code: 'ERR_ASSERTION' });
  }
});

test('historical readers accept append-only additions and still reject changes to protected rows', () => {
  const base = createGitReader()(fileURLToPath(root), '2788ca2d250fbd145b7b2ea0024c56450a533a2e');
  const initial = deliveryRegistry();
  const later = appendUnrelated(structuredClone(initial));
  for (const document of [initial, later]) {
    const bytes = encode(document);
    assert.deepEqual(projectPwaTelemetryFile(registryPath, bytes), base(registryPath));
    assert.deepEqual(projectPwaTelemetryDocument(registryPath, document), JSON.parse(base(registryPath)));
    const allowed = pwaTelemetryHistoricalPaths(bytes);
    assert(allowed.includes('observability/index.json'));
    assert(!allowed.includes('observability/unapproved.json'));
  }
  const historicalReader = file => file === registryPath ? encode(later) : Buffer.from(read(file));
  assert.equal(withIanaAdmissionScope([], historicalReader, () => 'preserved'), 'preserved');

  for (const mutate of [
    registry => { registry.contracts[0].purpose += ' changed'; },
    registry => { registry.planned.shift(); },
    registry => { pwaTelemetryDescriptors(registry)[0].owner = 'changed'; },
    registry => { registry.planned.push(registry.planned[0]); },
    registry => { registry.contracts.at(-1).path = registry.contracts[0].path; },
    registry => { registry.requiredConsumers.push('unapproved'); },
  ]) {
    const changed = structuredClone(later);
    mutate(changed);
    const bytes = encode(changed);
    assert.strictEqual(projectPwaTelemetryDocument(registryPath, changed), changed);
    assert.strictEqual(projectPwaTelemetryFile(registryPath, bytes), bytes);
    assert.deepEqual(pwaTelemetryHistoricalPaths(bytes), []);
    assert.throws(() => withIanaAdmissionScope([], file => file === registryPath ? bytes : historicalReader(file),
      () => assert.fail('protected drift accepted')), /IANA_ADMISSION_PARTIAL_SCOPE/);
  }
  assert.deepEqual(projectPwaTelemetryFile('README.md', previousSource('README.md')), base('README.md'));
});

function gitFixture(t) {
  const temporary = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(temporary, 'oc-pwa-delivery-'));
  t.after(() => {
    const actual = realpathSync(fixture);
    assert.equal(dirname(actual), temporary);
    assert(basename(actual).startsWith('oc-pwa-delivery-'));
    rmSync(actual, { recursive: true, force: true });
  });
  const invoke = (directory, args, input) => execFileSync('git', ['-C', directory,
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false',
    ...args], { input, encoding: 'utf8', windowsHide: true }).trim();
  const git = (args, input) => invoke(fixture, args, input);
  const ownerDir = fileURLToPath(root);
  git(['init', '-q']);
  git(['config', '--local', 'core.autocrlf', 'false']);
  const alternates = join(fixture, '.git', 'objects', 'info');
  mkdirSync(alternates, { recursive: true });
  const objects = resolve(ownerDir, invoke(ownerDir, ['rev-parse', '--git-path', 'objects']));
  writeFileSync(join(alternates, 'alternates'), objects.replaceAll('\\', '/') + '\n');
  git(['read-tree', pwaTelemetrySource]);
  const add = (file, bytes) => {
    const blob = git(['hash-object', '-w', '--stdin'], bytes);
    git(['update-index', '--add', '--cacheinfo', '100644', blob, file]);
  };
  const commit = parent => git(['commit-tree', git(['write-tree']), '-p', parent, '-m', 'Synthetic admission']);
  return { fixture, git, add, commit, ownerDir };
}

test('the Git gate proves the exact B transition and checks preservation in later revisions', t => {
  const { fixture, add, commit } = gitFixture(t);
  const registry = deliveryRegistry();
  assert.equal(sha256(encode(registry)), pwaTelemetryInitialRegistryHash);
  const saveRegistry = () => {
    add(registryPath, encode(registry));
    add('observability/index.json', encode(domainIndex(registry, 'observability')));
  };
  saveRegistry();
  const b = commit(pwaTelemetrySource);
  assert.equal(verifyPwaTelemetryAdmission(fixture, b).evidence, 'git-revision');
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, pwaTelemetrySource), /PWA_ADMISSION_REVISION/);
  const { formatVersion, ...remaining } = registry;
  add(registryPath, encode({ ...remaining, formatVersion }));
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, commit(pwaTelemetrySource)), /JOINT_REGISTRY_HASH/);
  saveRegistry();
  const consumerIndex = 'registry/consumers/index.json';
  add(consumerIndex, encode({ consumers: [] }));
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, commit(pwaTelemetrySource)), /JOINT_CONSUMER/);
  add(consumerIndex, previousSource(consumerIndex));

  const unrelatedBytes = encode({ type: 'string' });
  add(unrelatedPath, unrelatedBytes);
  const unrelatedSource = commit(b);
  appendUnrelated(registry, unrelatedSource, unrelatedBytes);
  registry.requiredConsumers.push('unrelated-consumer');
  saveRegistry();
  add('common/index.json', encode(domainIndex(registry, 'common')));
  const consumers = JSON.parse(previousSource('registry/consumers/index.json'));
  consumers.consumers.push({ service: 'unrelated-consumer', file: 'unrelated-consumer.json' });
  add('registry/consumers/index.json', encode(consumers));
  add('registry/consumers/unrelated-consumer.json', encode({ synthetic: true }));
  const c = commit(unrelatedSource);
  const wrongB = commit(pwaTelemetrySource);
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, wrongB), /JOINT_REGISTRY_HASH/);
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, commit(wrongB)), /PWA_ADMISSION_INITIAL_REGISTRY/);
  const preserved = verifyPwaTelemetryAdmission(fixture, c);
  assert.equal(preserved.evidence, 'preserved-admission');
  assert.equal(preserved.closureFiles, 13);

  const fixturePath = 'observability/fixtures/pwa-telemetry/v1/accepted.json';
  add(fixturePath, encode({ synthetic: true }));
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, commit(c)), /PWA_ADMISSION_CLOSURE/);
  add(fixturePath, previousSource(fixturePath));
  pwaTelemetryDescriptors(registry)[0].status = 'draft';
  saveRegistry();
  assert.throws(() => verifyPwaTelemetryAdmission(fixture, commit(c)), /PWA_ADMISSION_DESCRIPTORS/);
});

test('the Inventory CI path gate accepts a later Git-backed root and rejects paths without proof', t => {
  const { fixture, git, add, commit, ownerDir } = gitFixture(t);
  const registry = deliveryRegistry();
  for (const file of [
    '.github/workflows/ci.yml',
    'observability/README.md',
    'scripts/finance/authority-consumers-v1.mjs',
    'scripts/identity/inventory-authority-v1-1.mjs',
    'test/inventory/capture-consumers-v1.test.mjs',
    'scripts/sales/completed-v3-types-history.mjs',
    'scripts/sales/iana-admission-v1.mjs',
    'scripts/sales/iana-consumer-exports.mjs',
    'scripts/sales/inventory-step-consumer-v1.mjs',
    'scripts/observability/pwa-telemetry-admission-v1.mjs',
    'scripts/observability/pwa-telemetry-history-v1.mjs',
    'scripts/observability/validate-pwa-telemetry-v1.sh',
    'test/ci/pwa-telemetry-admission-v1.test.mjs',
    'test/sales/iana-admission-v1.test.mjs',
    'test/sales/iana-consumer-exports.test.mjs',
    'tools/architecture/joint-delivery.mjs',
    'tools/architecture/validation-history.mjs',
    'tools/architecture/validation-tooling.json',
  ]) add(file, readFileSync(new URL(file, root)));
  add(registryPath, encode(registry));
  add('observability/index.json', encode(domainIndex(registry, 'observability')));
  const b = commit(pwaTelemetrySource);

  const unrelatedBytes = encode({ type: 'string' });
  registry.planned.push(unrelatedIntent);
  add(registryPath, encode(registry));
  add('common/index.json', encode(domainIndex(registry, 'common')));
  add(unrelatedPath, unrelatedBytes);
  const unrelatedSource = commit(b);
  registry.planned.pop();
  appendUnrelated(registry, unrelatedSource, unrelatedBytes);
  add(registryPath, encode(registry));
  add('common/index.json', encode(domainIndex(registry, 'common')));
  const c = commit(unrelatedSource);
  git(['update-ref', 'HEAD', c]);
  const tagRefs = execFileSync('git', ['-C', ownerDir, 'for-each-ref',
    '--format=update %(refname) %(objectname)', 'refs/tags'],
    { encoding: 'utf8', windowsHide: true });
  git(['update-ref', '--stdin'], tagRefs);
  git(['checkout-index', '--all', '--force']);
  const dependencies = join(fixture, 'node_modules');
  mkdirSync(dependencies);
  symlinkSync(realpathSync(join(ownerDir, 'node_modules', 'yaml')), join(dependencies, 'yaml'),
    process.platform === 'win32' ? 'junction' : 'dir');

  const exercise = `
    import assert from 'node:assert/strict';
    import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
    import { validateSourceScope } from './scripts/inventory/capture-authority-v2.mjs';
    const [rootFile, registryPath, unplannedRevision] = process.argv.slice(1);
    const extra = rootFile.replace(/[^/]+$/, 'unapproved-sibling.schema.json');
    const bytes = readFileSync(rootFile);
    const rawRegistry = readFileSync(registryPath);
    validateSourceScope();
    writeFileSync(extra, bytes);
    assert.throws(validateSourceScope, error => error.message === 'IC2_UNDECLARED_PATH:' + extra);
    unlinkSync(extra);
    writeFileSync(rootFile, '{"type":"number"}\\n');
    assert.throws(validateSourceScope, error => error.message === 'IC2_UNDECLARED_PATH:' + rootFile);
    writeFileSync(rootFile, bytes);
    const forged = JSON.parse(rawRegistry);
    forged.contracts.at(-1).commit = unplannedRevision;
    writeFileSync(registryPath, JSON.stringify(forged, null, 2) + '\\n');
    assert.throws(validateSourceScope, error => error.message === 'IC2_UNDECLARED_PATH:' + rootFile);
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', exercise, unrelatedPath, registryPath, c],
    { cwd: fixture, windowsHide: true, encoding: 'utf8' });
});
