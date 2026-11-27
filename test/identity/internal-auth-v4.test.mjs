import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { api, fixtures, nativeCases, policy, preparation, schema } from '../../scripts/identity/prepare-internal-auth-v4.mjs';
import { beforeInternalAuthV3, includeInternalAuthV3Paths } from '../../scripts/identity/internal-auth-v3-history.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const json = file => JSON.parse(read(file));
const apiV3 = 'identity/http/private/v3/identity-internal-auth-v3.yaml';
const policyV3 = 'identity/http/shared/v3/identity-workload-token-reuse-policy-v3.json';
const preparationV1 = 'identity/http/shared/v1/identity-sale-preparation-workloads-v1.json';
const root = new URL('../../', import.meta.url);
const base = createGitReader()(fileURLToPath(root), '873f62d6b7071455952aae053fcd3d29c9b616f8');

test('H1A v4 preserves OAuth and JWKS, including headers and the shared examples', () => {
  const expected = parse(read(apiV3));
  expected.info.version = '4.0.0';
  expected.info.description = expected.info.description.replace('Solo los tres', 'Solo los nueve');
  expected.info.description += '\n' + [
    'Para los seis perfiles tecnicos de preparacion de venta, cada instancia',
    'conserva como maximo una credencial y una adquisicion en curso por perfil,',
    'audiencia y generacion de configuracion. El aislamiento se aplica incluso',
    'a instancias alojadas en el mismo proceso. Al cerrar una instancia se',
    'descarta su credencial, se retira la generacion de las adquisiciones en',
    'curso y se descartan sus respuestas tardias.',
  ].join(' ');
  expected.components.headers.NoStore.description =
    expected.components.headers.NoStore.description.replace('H1A v3', 'H1A v4');
  expected['x-workload-token-reuse-policy'] = { $ref: '../../shared/v4/identity-workload-token-reuse-policy-v4.json' };
  assert.deepEqual(parse(read(api)), expected);
});

test('exactly six dedicated profiles join the three existing profiles and retain current authority', () => {
  const predecessor = json(policyV3);
  const { sale_preparation: controls, ...current } = json(policy);
  const capture = json('identity/http/shared/v1/identity-sales-authority-policy-v1.json').profiles;
  const context = json(preparationV1).profiles;
  const ids = [
    'sales-pos.catalog-capture',
    'catalog-pricing.sales-capture-authority',
    'sales-pos.inventory-context',
    'sales-pos.finance-context',
    'inventory.sales-context-authority',
    'finance.sales-context-authority',
  ];
  const profiles = ids.map(id => {
    const { client_id, caller, audience } = [...capture, ...context].find(row => row.client_id === id);
    return { client_id, caller, audience };
  });
  assert.deepEqual(current, {
    ...predecessor,
    policy_version: 4,
    contract: api,
    supersedes: apiV3,
    profiles: [...predecessor.profiles, ...profiles],
  });
  assert.deepEqual(controls, {
    context_workload_policy: preparation,
    scope: 'technical_authentication_only_for_sale_preparation',
    credential_and_acquisition_scope: 'private_per_instance_profile_audience_and_configuration_generation',
    instance_shutdown: 'discard_entry_retire_in_flight_generation_and_discard_late_results',
    gateway_issuance: 'fresh_per_request',
    human_delegation: 'fresh_per_request',
    human_decisions: 'fresh_per_invocation',
    callback_binding: 'exact_caller_purpose_organization_operation_preparation_request_hash_and_owner_fingerprint',
    preparation_maximum_seconds: 60,
    decision_budget_ms: 2000,
    decision_budget_anchor: 'before_network_including_credential_wait',
  });
});

test('the context policy changes only OAuth reuse for the four existing profile purposes', () => {
  const before = json(preparationV1);
  assert(before.profiles.every(profile => profile.reuse === false));
  assert.deepEqual(json(preparation), {
    ...before,
    policy_version: 2,
    supersedes: preparationV1,
    profiles: before.profiles.map(profile => ({ ...profile, reuse: true })),
    issuance: 'H1A HTTP Basic grant_type=client_credentials with a distinct secret per fixed client_id. Reuse is limited to the listed profiles under the referenced H1A v4 policy. No audience selector or shared-secret fallback.',
    reuse_policy: policy,
  });
});

test('native fixtures preserve predecessor cases and exercise the bounded ID-03 policy', () => {
  const cases = nativeCases({ info: { version: '4.0.0' }, 'x-workload-token-reuse-policy': json(policy) });
  const before = json('identity/fixtures/internal-auth/v3/policy-cases-v3.json').negative_mutations;
  const after = json(fixtures).negative_mutations;
  assert.deepEqual(after.slice(1, before.length), before.slice(1));
  assert.equal(cases.target, json(schema).$id);
  assert.equal(cases.tests.length, 49);
  assert.equal(cases.tests.filter(row => row.valid).length, 1);
});

test('Identity index tracks the five ID-03 roots through the registry', () => {
  const registry = json('registry/contracts.json');
  const roots = new Map([
    ['identity.internal-auth.v4', api],
    ['identity.workload-token-reuse.policy.v4', policy],
    ['identity.workload-token-reuse.schema.v4', schema],
    ['identity.internal-auth.fixtures.v4', fixtures],
    ['identity.sale-preparation-workloads.policy.v2', preparation],
  ]);
  const planned = registry.planned.filter(row => row.materializeIn === 'ID-03' || roots.has(row.id));
  const active = registry.contracts.filter(row => roots.has(row.id));
  assert(planned.length === 0 || active.length === 0);
  const selected = [...planned, ...active];
  assert.equal(selected.length, roots.size);
  assert.deepEqual(new Map(selected.map(row => [row.id, row.path])), roots);
  for (const row of selected) {
    assert.equal(row.domain, 'identity');
    assert.equal(row.owner, 'identity-tenancy');
    assert.deepEqual(row.operations, row.path === api ? ['issueInternalServiceToken', 'getInternalIdentityJwks'] : []);
    assert.equal(row.version, row.path === api ? '4.0.0' : row.path === preparation ? 'v2' : 'v4');
  }
  assert.deepEqual(json('identity/index.json'), domainIndex(registry, 'identity'));
});

test('ID-03 source metadata adds only the reviewed Identity scope', () => {
  const registryFile = 'registry/contracts.json';
  const readme = 'identity/README.md';
  const index = 'identity/index.json';
  const admission = json(registryFile).contracts.find(row => row.id === 'identity.internal-auth.v4');
  const source = admission ? createGitReader()(fileURLToPath(root), admission.commit) : read;
  const registry = JSON.parse(source(registryFile));
  const previous = JSON.parse(base(registryFile));
  assert.deepEqual({
    ...registry,
    planned: registry.planned.filter(row => row.materializeIn !== 'ID-03'),
  }, previous);
  const baseReadme = base(readme).toString('utf8').replaceAll('\r\n', '\n');
  const actualReadme = source(readme).toString('utf8').replaceAll('\r\n', '\n');
  assert(actualReadme.startsWith(baseReadme));
  const addition = actualReadme.slice(baseReadme.length);
  assert.match(addition, /^\n## ID-03 — Credenciales técnicas para preparar una venta\n/);
  for (const file of [api, policy, preparation, schema, fixtures]) {
    assert(addition.includes('(' + file.slice('identity/'.length) + ')'), file);
  }

  const bytes = Buffer.from(source(registryFile));
  const scope = new Set();
  includeInternalAuthV3Paths(scope, bytes, source);
  for (const file of [api, policy, preparation, schema, fixtures, readme, index, registryFile]) {
    assert(scope.has(file), file);
  }
  assert(!scope.has('identity/http/shared/v4/unreviewed.json'));
  for (const file of [readme, index, policy]) {
    assert.throws(() => includeInternalAuthV3Paths(new Set(), bytes,
      name => name === file ? source(name).toString('utf8') + ' ' : source(name)),
    error => error.message.split('\n')[0] === 'ID03_SOURCE_SCOPE:' + file);
  }
  for (const file of [readme, index, registryFile]) {
    const modified = Buffer.from(source(file).toString('utf8') + ' ');
    assert.strictEqual(beforeInternalAuthV3(file, modified), modified);
  }
});
