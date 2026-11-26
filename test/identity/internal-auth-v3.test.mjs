import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';
import { api, policy, schema, fixtures, nativeCases } from '../../scripts/identity/prepare-internal-auth-v3.mjs';
import { beforeInternalAuthV3, includeInternalAuthV3Paths } from '../../scripts/identity/internal-auth-v3-history.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const json = file => JSON.parse(read(file));
const prior = file => file.replace('/v3/', '/v2/').replace('-v3.', '-v2.');
const ownedProfile = json('identity/http/shared/v1/identity-sales-authority-policy-v1.json')
  .profiles.find(row => row.client_id === 'sales-pos.sales-authority');

test('H1A v3 preserves the complete OAuth and JWKS surfaces and their example paths', () => {
  const expected = parse(read(prior(api)));
  expected.info.version = '3.0.0';
  expected.info.description = expected.info.description.replace('Solo los dos', 'Solo los tres');
  expected.components.headers.NoStore.description = expected.components.headers.NoStore.description.replace('H1A v2', 'H1A v3');
  expected['x-workload-token-reuse-policy'] = { $ref: '../../shared/v3/identity-workload-token-reuse-policy-v3.json' };
  assert.deepEqual(parse(read(api)), expected);
});

test('only the Identity-owned Sales profile joins the existing policy', () => {
  const before = json(prior(policy));
  const { sales_authority: sales, ...current } = json(policy);
  const { client_id, caller, audience } = ownedProfile;
  assert.deepEqual({ client_id, caller, audience }, {
    client_id: 'sales-pos.sales-authority', caller: 'sales-pos', audience: 'identity-tenancy.sales-authority',
  });
  assert.deepEqual(current, {
    ...before, profiles: [...before.profiles, { client_id, caller, audience }],
    policy_version: 3, contract: api, supersedes: prior(api),
    activation: 'Candidate only. Consumption requires admission, full CI on the final revision and owner tests.',
  });
  const operations = ['identity-sales-authority-v2', 'identity-sales-temporal-authority-v2']
    .flatMap(name => Object.values(json('identity/http/private/v2/' + name + '.yaml').paths))
    .map(path => path.post).filter(op => op['x-caller'] === caller && op['x-audience'] === audience);
  assert.deepEqual(sales.operations, operations.map(op => op.operationId));
  assert.equal(sales.check, 'fresh_human_decision_per_invocation');
  assert.equal(sales.new_sale_post_human_checks, 6);
  assert.equal(sales.decision_budget_ms, 2000);
  assert.equal(sales.budget_anchor, 'before_network_including_credential_wait');
  assert.equal(sales.unavailable, 'valid_credential_only_and_fail_closed_without_current_decision');
  assert.equal(sales.reuse_requires_sufficient_call_budget, true);
  assert.equal(sales.sensitive_telemetry, false);
});

const registryFile = 'registry/contracts.json';
const base = '910130c668c6e2f47afb9d33be79e36926cb5721';
const roots = new Map([
  ['identity.internal-auth.v3', api],
  ['identity.workload-token-reuse.policy.v3', policy],
  ['identity.workload-token-reuse.schema.v3', schema],
  ['identity.internal-auth.fixtures.v3', fixtures],
]);
const paths = new Set(roots.values());
const owned = row => row.materializeIn === 'ID-02' || roots.has(row.id) || paths.has(row.path);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {
  cwd: new URL('../../', import.meta.url), windowsHide: true, maxBuffer: 2 * 1024 * 1024,
});
// Once A exists, historical tests read its immutable inputs even on B or later revisions.
const sourceCommit = git('log', '--first-parent', '--reverse', '--diff-filter=A', '--format=%H',
  base + '..HEAD', '--', api).toString().trim().split(/\r?\n/)[0];
const readA = sourceCommit ? file => git('show', sourceCommit + ':' + file)
  : file => readFileSync(new URL('../../' + file, import.meta.url));
const sourceRegistry = JSON.parse(readA(registryFile));

function verifyRoots(registry, index, revision, sourceBytes) {
  const planned = registry.planned.filter(owned);
  const active = registry.contracts.filter(owned);
  assert(planned.length === 0 || active.length === 0, 'mixed lifecycle');
  const rows = [...planned, ...active];
  assert.equal(rows.length, roots.size, 'four roots');
  assert.deepEqual(new Set(rows.map(row => row.id)), new Set(roots.keys()), 'root IDs');
  for (const row of rows) {
    assert.equal(row.path, roots.get(row.id), 'root path');
    assert.equal(row.domain, 'identity');
    assert.equal(row.owner, 'identity-tenancy');
    assert.equal(row.version, row.path === api ? '3.0.0' : 'v3');
    assert.deepEqual(row.operations, row.path === api ? ['issueInternalServiceToken', 'getInternalIdentityJwks'] : []);
    if (planned.length) {
      assert.equal(row.status, 'planned');
      assert.equal(row.materializeIn, 'ID-02');
    } else {
      assert.match(revision, /^[a-f0-9]{40}$/, 'A must exist before admission');
      assert.equal(row.status, 'active');
      assert.equal(row.commit, revision, 'source commit');
      assert.equal(row.sha256, hash(sourceBytes(row.path)), 'source hash');
    }
  }
  assert.deepEqual(index, domainIndex(registry, 'identity'), 'current index');
}

test('four Identity roots are planned together or admitted from the source commit', () => {
  verifyRoots(json(registryFile), json('identity/index.json'), sourceCommit, readA);
});

test('the same gate accepts A and B and rejects partial or misattributed admission', () => {
  const planned = sourceRegistry.planned.filter(owned);
  const registry = { planned, contracts: [] };
  const revision = '1'.repeat(40);
  const index = value => domainIndex(value, 'identity');
  const check = value => verifyRoots(value, index(value), revision, readA);
  check(registry);
  const active = planned.map(({ materializeIn, constraint, ...row }) => ({
    ...row, status: 'active', commit: revision, sha256: hash(readA(row.path)),
    surface: sourceRegistry.contracts.find(old => old.path === prior(row.path)).surface,
  }));
  const admitted = { planned: [], contracts: active };
  check(admitted);
  assert.throws(() => check({ planned: planned.slice(1), contracts: active.slice(0, 1) }), /mixed lifecycle/);
  assert.throws(() => check({ ...admitted, contracts: active.slice(1) }), /four roots/);
  assert.throws(() => check({ ...admitted, contracts: [active[0], ...active.slice(0, 3)] }), /root IDs/);
  for (const [field, value, message] of [
    ['path', policy, /root path/], ['commit', '2'.repeat(40), /source commit/], ['sha256', '0'.repeat(64), /source hash/],
  ]) {
    const altered = [{ ...active[0], [field]: value }, ...active.slice(1)];
    assert.throws(() => check({ ...admitted, contracts: altered }), message);
  }
  assert.throws(() => verifyRoots(admitted, index(registry), revision, readA), /current index/);
});

test('native fixtures retain v2 protections and exercise the Sales-only delta', () => {
  const cases = nativeCases({ info: { version: '3.0.0' }, 'x-workload-token-reuse-policy': json(policy) });
  const priorCases = json(prior(fixtures)).negative_mutations;
  const negatives = json(fixtures).negative_mutations;
  assert.deepEqual(negatives.slice(1, priorCases.length), priorCases.slice(1));
  assert.deepEqual(negatives[0], { ...priorCases[0], id: 'no-fourth-profile', pointer: '/profiles/3' });
  assert.deepEqual(negatives.slice(priorCases.length).map(row => row.id), [
    'fixed-sales-audience', 'fixed-sales-caller', 'six-human-checks', 'fresh-per-invocation',
    'total-decision-budget', 'one-flight', 'retired-flight', 'authentication-rejection',
    'domain-denial', 'no-token-telemetry',
  ]);
  assert.equal(cases.tests.length, 30);
  assert.equal(cases.tests.filter(row => row.valid).length, 1);
});

test('historical checks reject changed source bytes even after a successful scope check', () => {
  const registry = readA(registryFile);
  const expected = new Set([api, policy, schema, fixtures, 'scripts/identity/prepare-internal-auth-v3.mjs',
    'test/identity/internal-auth-v3.test.mjs']);
  const scope = new Set();
  includeInternalAuthV3Paths(scope, registry, readA);
  assert.deepEqual(scope, expected);
  assert.throws(() => includeInternalAuthV3Paths(new Set(), registry,
    file => file === policy ? Buffer.concat([readA(file), Buffer.from(' ')]) : readA(file)), /ID02_SOURCE_SCOPE/);
  for (const file of ['.github/workflows/ci.yml', 'identity/index.json', 'identity/README.md', 'registry/contracts.json']) {
    const bytes = readA(file);
    assert.deepEqual(beforeInternalAuthV3(file, bytes), git('show', base + ':' + file));
    const changed = Buffer.concat([bytes, Buffer.from(' ')]);
    assert.strictEqual(beforeInternalAuthV3(file, changed), changed);
  }
});

const bundle = '.ci-artifacts/identity-internal-auth-v3.bundle.json';
const cases = '.ci-artifacts/identity-internal-auth-v3.tests.json';
const commands = [
  'node --test --test-concurrency=2 test/identity/*.test.mjs',
  'node scripts/validate-redocly-no-warnings.mjs ' + api,
  `npx --yes @redocly/cli@2.53.3 bundle ${api} --dereferenced --ext json --output ${bundle}`,
  `node scripts/identity/prepare-internal-auth-v3.mjs ${bundle} ${cases}`,
];
const native = ['jsonschema metaschema ' + schema, `jsonschema test ${cases} --resolve ${schema}`];

function checkCoverage(workflow) {
  const jobs = workflow.jobs;
  const run = job => {
    assert.equal(job.if, "needs.validation_scope.outputs.mode == 'full'");
    const step = job.steps.find(item => item.name === 'Run original validation commands');
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
    return step.run;
  };
  const producer = jobs.validate_identity_catalog_contracts;
  const consumer = jobs.validate_identity_catalog_schema;
  const lines = run(producer).split('\n');
  for (const command of commands) assert.equal(lines.filter(line => line === command).length, 1, command);
  const packaging = producer.steps.find(step => step.name === 'Package original artifact paths').run;
  assert(packaging.split('; do')[0].split(/\s+/).includes(cases), 'native cases must be transferred');
  assert(consumer.needs.includes('validate_identity_catalog_contracts'));
  const shell = run(consumer).match(/^docker run [^\n]*ghcr\.io\/sourcemeta\/jsonschema:v16\.10\.0 -ec '([^']+)'$/m);
  assert(shell, 'Sourcemeta container');
  for (const command of native) assert.equal(shell[1].split('\n').filter(line => line === command).length, 1, command);
}

test('full Identity CI executes the source, bundle and native fixtures', () => {
  const workflow = read('.github/workflows/ci.yml');
  checkCoverage(parse(workflow));
  for (const command of [...commands, ...native])
    assert.throws(() => checkCoverage(parse(workflow.replace(command, '# omitted'))), command);
});
