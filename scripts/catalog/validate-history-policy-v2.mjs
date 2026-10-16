import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pointer } from '../../tools/architecture/consumer-gate.mjs';
import { resolveSelection } from '../../tools/architecture/graph.mjs';
import { applyPatches, validateHistoryPolicy } from './validate-history-policy-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const policyPath = 'catalog/http/shared/v2/catalog-history-policy-v2.json';
export const schemaPath = 'common/http/shared/v2/data-lifecycle-policy-v2.schema.json';
export const vectorsPath = 'catalog/fixtures/history-policy/v2/history-policy-v2-vectors.json';
export const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sourceRevision = '10c2b44ddbe9f8f1c73a212895dbf5d5ed849000';
const expectedSources = [
  ['r2', 'catalog/http/shared/v1/catalog-history-protection-v1.schema.json'],
  ['r2-policy', 'catalog/http/shared/v1/catalog-history-protection-v1-policy.json'],
  ['r3', 'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json'],
  ['selection', 'catalog/http/shared/v1/catalog-history-recovery-v1.schema.json'],
  ['r4', 'catalog/http/shared/v1/catalog-history-recovery-protocol-v1.schema.json'],
  ['r4-policy', 'catalog/http/shared/v1/catalog-history-recovery-v1-policy.json'],
  ['verification-v2', 'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json'],
  ['verification-v2-policy', 'identity/http/shared/v2/identity-catalog-recovery-verification-v2-policy.json'],
  ['problem-v3', 'common/http/shared/v3/problem-details-v3.schema.json'],
  ['envelope', 'events/event-envelope-v1.schema.json'],
  ['event-data', 'catalog/events/v1/catalog-event-data-v1.schema.json'],
  ['event-policy', 'catalog/events/v1/catalog-event-policy-v1.json'],
  ['history-v1', 'catalog/http/shared/v1/catalog-history-policy-v1.json'],
  ['common', 'catalog/http/shared/v1/catalog-common-v1.schema.json'],
  ...['catalog.category.changed.v1', 'catalog.product.changed.v1', 'catalog.presentation.changed.v1', 'pricing.presentation-price.changed.v1']
    .map((name, i) => ['original-' + i, 'catalog/events/v1/' + name + '.schema.json']),
];
const transportIds = ['r2', 'r3', 'selection', 'r4', 'verification-v2', 'problem-v3'];
const encode = value => value.replaceAll('~', '~0').replaceAll('/', '~1');
const same = (a, b, reason) => assert.deepEqual(a, b, reason);
const sorted = values => [...values].sort();
let sources;
function sourceContext() {
  if (!sources) sources = new Map(expectedSources.map(([id, file]) => {
    const bytes = execFileSync('git', ['show', sourceRevision + ':' + file], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    return [id, { file, bytes, value: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') }];
  }));
  return sources;
}

// Every declaration and reference is inventoried; stricter imported metadata is
// inherited, so classifying a container never erases a referenced field's rules.
function declarations(value, here = '', result = []) {
  if (!value || typeof value !== 'object') return result;
  if (value.properties) for (const name of Object.keys(value.properties)) result.push({ pointer: here + '/properties/' + encode(name), kind: 'property' });
  if (typeof value.$ref === 'string') result.push({ pointer: here + '/$ref', kind: 'reference' });
  for (const [name, child] of Object.entries(value)) declarations(child, here + '/' + encode(name), result);
  return result;
}
function requiredProfile(source, address) {
  const node = address.replace(/\/\$ref$/, '');
  if (/\/(cursor|initial_cursor|next_cursor)$/.test(node)) return 'cursor-secret';
  if (/\/grant_reference$/.test(node) || source === 'verification-v2' && node.startsWith('/$defs/VerifyRequest')) return 'grant-secret';
  if (source === 'r2') return 'protection';
  if (source === 'r3' || source === 'verification-v2') return 'authority';
  if (source === 'r4' && /^\/\$defs\/(Coverage|Interval|MissingRange)\//.test(node)) return 'coverage';
  if (source === 'r4' && (node.startsWith('/$defs/OriginalEvent/') || node === '/$defs/PositionedEvent/properties/event')) return 'original';
  return 'recovery';
}

function storageInventory(context) {
  const result = [];
  const add = (storage_id, field, source_id, address) => result.push({ storage_id, field, source_id, pointer: address });
  add('original-history', 'tenant-transaction-position', 'r4', '/$defs/PositionedEvent/properties/position');
  for (const name of ['event_id', 'event_type', 'schema_version', 'occurred_at', 'producer', 'organization_id', 'aggregate_type', 'aggregate_id', 'aggregate_version', 'correlation_id', 'causation_id'])
    add('history-index', name, 'envelope', '/properties/' + name);
  add('history-index', 'tenant-transaction-position', 'r4', '/$defs/PositionedEvent/properties/position');
  for (const [definition, schema] of Object.entries(context.get('r2').value.$defs)) {
    if (['Receipt', 'Problem'].includes(definition)) continue;
    for (const name of Object.keys(schema.properties ?? {})) add('references-holds-closures', definition + '.' + name, 'r2', '/$defs/' + definition + '/properties/' + encode(name));
  }
  for (const [field, address] of [
    ['source-stream-through-and-gap-latch', '/semantics/ordering'], ['per-scope-reconciliation-proof', '/semantics/checkpoint'],
    ['completed-baseline-binding-and-page-manifest', '/semantics/baseline'], ['definitive-source-scope-fence', '/semantics/closure'],
    ['versioned-release-tombstones-and-replay-binding', '/semantics/idempotency'], ['conflict-quarantine-and-block', '/semantics/conflicts'],
  ]) add('references-holds-closures', field, 'r2-policy', address);
  const inventory = context.get('r4-policy').value.storage_inventory;
  for (const group of ['session', 'cursor']) inventory[group].forEach((name, i) => add('recovery-metadata', group + '.' + name, 'r4-policy', '/storage_inventory/' + group + '/' + i));
  inventory.coverage.forEach((name, i) => add('disposed-ranges-coverage', name, 'r4-policy', '/storage_inventory/coverage/' + i));
  return result;
}

export function validateHistoryPolicyV2(policy = read(policyPath)) {
  same([policy.format_version, policy.version, policy.catalogue_id, policy.owner, policy.status, policy.runtime_demonstrated],
    [2, 2, 'catalog.history', 'catalog-pricing', 'candidate', false], 'H2_SCOPE');
  const context = sourceContext();
  const old = context.get('history-v1').value;
  const prior = validateHistoryPolicy(old);
  same(policy.protocol_sources.map(({ id, path }) => [id, path]), expectedSources, 'H2_SOURCE_COVERAGE');
  for (const pin of policy.protocol_sources) {
    const source = context.get(pin.id);
    same([pin.commit, pin.sha256], [sourceRevision, source.sha256], 'H2_SOURCE_PIN');
    same(fs.readFileSync(path.join(root, source.file), 'utf8').replaceAll('\r\n', '\n'), source.bytes.toString(), 'H2_PUBLISHED_BYTES');
    same(pin.kind, source.file.endsWith('.schema.json') ? 'schema' : 'policy', 'H2_SOURCE_KIND');
    same(pin.owner, source.file.startsWith('identity/') ? 'identity-tenancy'
      : source.file.startsWith('common/') || pin.id === 'envelope' ? 'platform-contracts' : 'catalog-pricing', 'H2_SOURCE_OWNER');
  }
  same(policy.field_sources, old.field_sources, 'H2_ORIGINAL_FIELDS');
  same(policy.independent_policies, old.independent_policies, 'H2_INDEPENDENT_POLICIES');
  const profile = structuredClone(policy.profiles);
  const authorization = profile[0].configuration.authorization;
  same(authorization, 'catalog.history.configure with current exact R3 restricted-history-configuration grant, effective organization permissions, human authorization/MFA and audit; no OWNER/read/manage inference', 'H2_CONFIGURATION_AUTHORITY');
  profile[0].configuration.authorization = old.profiles[0].configuration.authorization;
  same(profile, old.profiles, 'H2_HISTORY_LIFECYCLE');
  same(policy.inheritance, 'stricter-referenced-classification-wins; originals-inherit-published-field-metadata; transport-is-not-storage-authority', 'H2_INHERITANCE');
  same(policy.storage_policies.map(row => row.id), old.storage_policies.map(row => row.id), 'H2_STORAGE_COVERAGE');
  for (const [index, storage] of policy.storage_policies.entries()) {
    const original = old.storage_policies[index];
    same(storage.policy_version, 2, 'H2_STORAGE_VERSION');
    same(storage.retention, original.retention, 'H2_STORAGE_LIFECYCLE');
    same(storage.production_enabled, false, 'H2_RUNTIME');
    same(storage.dependencies, original.dependencies, 'H2_STORAGE_DEPENDENCY');
    same(storage.field_catalogue, { state: storage.id === 'temporary-files' ? 'prohibited' : 'complete',
      source_ids: storage.id === 'temporary-files' ? [] : storage.id === 'original-history' ? ['catalog-event-fields-v1', 'storage-fields-v2'] : ['storage-fields-v2'], pending: [] }, 'H2_FIELDS_COMPLETE');
    const classification = structuredClone(storage.classification);
    if (storage.id === 'references-holds-closures') {
      same(classification.access, 'current R2 workload and owner-managed source/contract/tenant/scope admission; hold releases require reinforced authority; evidence alone grants nothing', 'H2_R2_AUTHORITY');
      classification.access = original.classification.access;
    }
    same(classification, original.classification, 'H2_STORAGE_CLASSIFICATION');
    for (const name of ['copies', 'disposition', 'evidence', 'alerts']) same(storage[name], original[name], 'H2_DISPOSITION');
  }
  const categories = {
    protection: ['AUDIT', 'OPERATIONAL', 'PERSONAL'], authority: ['AUTHENTICATION', 'PERSONAL', 'OPERATIONAL'],
    'grant-secret': ['SECRET', 'AUTHENTICATION', 'PERSONAL'], 'cursor-secret': ['SECRET', 'AUTHENTICATION', 'PERSONAL'],
    recovery: ['OPERATIONAL', 'AUTHENTICATION', 'PERSONAL'], coverage: ['OPERATIONAL', 'AUDIT'], original: ['COMMERCIAL', 'FISCAL', 'OPERATIONAL'],
  };
  same(sorted(policy.classification_profiles.map(row => row.id)), sorted(Object.keys(categories)), 'H2_PROFILE_COVERAGE');
  for (const p of policy.classification_profiles) {
    same(p.sensitivity, 'RESTRICTED', 'H2_SENSITIVITY');
    same(sorted(p.categories), sorted(categories[p.id]), 'H2_CATEGORIES');
    same(p.owner, ['authority', 'grant-secret'].includes(p.id) ? 'identity-tenancy' : 'catalog-pricing', 'H2_OWNER');
    same(p.personal_data, ['coverage', 'original'].includes(p.id) ? 'absent' : 'possible-indirect', 'H2_PERSONAL');
    same(p.log_policy, 'prohibited-values', 'H2_NO_TELEMETRY');
    same(p.third_parties_regions, 'none-authorized', 'H2_NO_THIRD_PARTIES');
    assert(p.encryption.includes('TLS') && p.encryption.includes('no plaintext credential persistence'), 'H2_ENCRYPTION');
    same(sorted(p.consumers), sorted(['authority', 'grant-secret'].includes(p.id)
      ? ['identity-tenancy', 'catalog-pricing via admitted R3 only', 'gateway-bff via admitted issuance/renewal/revocation only'] : ['catalog-pricing']), 'H2_CONSUMERS');
    if (p.id.includes('secret')) assert(p.retention_scope.startsWith('transient only; no plaintext persistence or telemetry;'), 'H2_SECRET_LIFECYCLE');
    if (p.id === 'authority') assert(p.retention_scope.startsWith('transient caller request/response only;'), 'H2_NO_DECISION_CACHE');
  }
  const actual = policy.transport_fields.map(row => row.source_id + ':' + row.kind + ':' + row.pointer);
  const expected = transportIds.flatMap(id => declarations(context.get(id).value).map(row => id + ':' + row.kind + ':' + row.pointer));
  same(sorted(actual), sorted(expected), 'H2_TRANSPORT_COVERAGE');
  same(new Set(actual).size, actual.length, 'H2_TRANSPORT_DUPLICATE');
  for (const row of policy.transport_fields) {
    same(row.persistence, 'none-implied-by-transport', 'H2_TRANSPORT_STORAGE');
    same(row.profile, requiredProfile(row.source_id, row.pointer), 'H2_TRANSPORT_PROFILE');
    pointer(context.get(row.source_id).value, row.pointer);
  }
  const fields = storageInventory(context);
  const storedKey = row => row.storage_id + ':' + row.field;
  same(sorted(policy.storage_fields.map(storedKey)), sorted(fields.map(storedKey)), 'H2_STORED_COVERAGE');
  same(new Set(policy.storage_fields.map(storedKey)).size, policy.storage_fields.length, 'H2_STORED_DUPLICATE');
  for (const row of policy.storage_fields) {
    const expected = fields.find(field => storedKey(field) === storedKey(row));
    same(row.sources, [{ source_id: expected.source_id, pointer: expected.pointer }], 'H2_STORED_SOURCE');
    pointer(context.get(expected.source_id).value, expected.pointer);
    const required = { 'original-history': 'original', 'history-index': 'original', 'references-holds-closures': 'protection',
      'recovery-metadata': 'recovery', 'disposed-ranges-coverage': 'coverage' }[row.storage_id];
    same(row.profile, required, 'H2_STORED_PROFILE');
    const representation = row.storage_id === 'recovery-metadata' && ['cursor.hash', 'cursor.binding_hash'].includes(row.field) ? 'hash-only'
      : row.storage_id === 'references-holds-closures' ? 'normalized-protection-state'
        : row.storage_id === 'disposed-ranges-coverage' ? 'coverage-without-deleted-values' : 'minimal-metadata';
    same(row.representation, representation, 'H2_STORED_REPRESENTATION');
  }
  same(sorted(policy.compatibility.map(row => row.aspect)), sorted(['R1 lifecycle', 'R2 authority', 'R3 separation', 'R4 minimization', 'published compatibility']), 'H2_COMPATIBILITY');
  assert(policy.production_prerequisites.some(value => value.startsWith('reviewed-published-contract-admission;')), 'H2_ADMISSION_REQUIRED');
  return { original_fields: prior.fields, protocol_fields: expected.length, stored_fields: fields.length, storages: 6, runtime_demonstrated: false };
}

export function validateProtocolClosures() {
  const context = sourceContext();
  const pins = [...context.values()].map(source => ({ uri: source.value.$id, path: source.file })).filter(row => row.uri);
  const byFile = new Map([...context.values()].map(source => [source.file, source.bytes]));
  const registry = read('registry/contracts.json');
  return transportIds.map(id => {
    const source = context.get(id);
    const closure = resolveSelection(file => {
      assert(byFile.has(file), 'H2_CLOSURE_SOURCE_NOT_PINNED: ' + file);
      return byFile.get(file);
    }, { path: source.file, version: 'v1', uriMappings: pins }, { version: 'v1', operations: [], pointers: [''] }, registry);
    const draft = registry.contracts.find(row => row.status === 'draft' && closure.files.some(file => file.path === row.path));
    assert(!draft, 'H2_DRAFT_IN_VALIDATED_CLOSURE');
    return { source: id, files: closure.files.length };
  });
}

export function prepareHistoryPolicyV2(output, selfTest = false) {
  const policy = read(policyPath), schema = read(schemaPath), vectors = read(vectorsPath);
  const result = validateHistoryPolicyV2(policy);
  const closures = validateProtocolClosures();
  same([vectors.scope, vectors.base, vectors.runtime_demonstrated], ['F1-08H', policyPath, false], 'H2_FIXTURE_SCOPE');
  same(fs.readdirSync(path.join(root, path.dirname(vectorsPath))).sort(), [path.basename(vectorsPath)], 'H2_FIXTURE_INVENTORY');
  same(new Set(vectors.cases.map(row => row.id)).size, vectors.cases.length, 'H2_FIXTURE_DUPLICATE');
  const structural = [];
  for (const row of vectors.cases) {
    assert(/^[a-z0-9-]+$/.test(row.id), 'H2_FIXTURE_ID');
    const value = applyPatches(policy, row.patches);
    if (row.kind === 'semantic') {
      same(row.expected, 'reject', 'H2_SEMANTIC_EXPECTED');
      assert.throws(() => validateHistoryPolicyV2(value), error => error instanceof assert.AssertionError && error.message.includes(row.reason), 'H2_NEGATIVE_REASON:' + row.id);
    } else {
      same(row.kind, 'schema', 'H2_FIXTURE_KIND');
      assert(['accept', 'reject'].includes(row.expected), 'H2_FIXTURE_EXPECTED');
      structural.push({ ...row, value });
    }
  }
  if (selfTest) assert(structural.some(row => row.expected === 'accept') && structural.some(row => row.expected === 'reject'), 'H2_SCHEMA_COVERAGE');
  const reasons = new Set(vectors.cases.filter(row => row.kind === 'semantic').map(row => row.reason));
  for (const reason of ['H2_HISTORY_LIFECYCLE', 'H2_CONFIGURATION_AUTHORITY', 'H2_SOURCE_PIN', 'H2_SOURCE_OWNER',
    'H2_TRANSPORT_COVERAGE', 'H2_TRANSPORT_PROFILE', 'H2_FIELDS_COMPLETE', 'H2_R2_AUTHORITY', 'H2_STORED_COVERAGE',
    'H2_STORED_REPRESENTATION', 'H2_NO_TELEMETRY', 'H2_SECRET_LIFECYCLE', 'H2_NO_DECISION_CACHE', 'H2_ENCRYPTION'])
    assert(reasons.has(reason), 'H2_NEGATIVE_COVERAGE:' + reason);
  assert(!fs.existsSync(output), 'H2_OUTPUT_EXISTS');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'policy.schema.json'), JSON.stringify(schema) + '\n', { flag: 'wx' });
  for (const row of structural) fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(row.value) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'cases.tsv'), structural.map(row => [row.id, row.expected, 'policy.schema.json', row.id + '.json'].join('\t')).join('\n') + '\n', { flag: 'wx' });
  return { ...result, closures, schema_positive: structural.filter(row => row.expected === 'accept').length,
    schema_negative: structural.filter(row => row.expected === 'reject').length, semantic_negative: vectors.cases.length - structural.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  assert(args.length >= 1 && args.length <= 2 && (!args[1] || args[1] === '--self-test'), 'usage: validate-history-policy-v2.mjs <new-output> [--self-test]');
  const output = path.resolve(args[0]);
  assert(output.startsWith(path.join(root, '.ci-artifacts') + path.sep), 'H2_OUTPUT_SCOPE');
  console.log('F1-08H classification gate passed: ' + JSON.stringify(prepareHistoryPolicyV2(output, args[1] === '--self-test')));
}
