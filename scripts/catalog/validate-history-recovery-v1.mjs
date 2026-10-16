import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { create, page, cursorHash, bindingHash, limits } from './history-recovery-v1-semantics.mjs';
import { verify } from '../identity/catalog-recovery-verification-v2-semantics.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const schemaPath = 'catalog/http/shared/v1/catalog-history-recovery-protocol-v1.schema.json';
export const policyPath = 'catalog/http/shared/v1/catalog-history-recovery-v1-policy.json';
export const vectorsPath = 'catalog/fixtures/recovery/v1/catalog-history-recovery-protocol-v1-vectors.json';
export const apiPath = 'catalog/http/private/v1/catalog-history-recovery-v1.yaml';
export const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
export const vectors = read(vectorsPath);

// Test integration adapter: identity owns the synthetic Grant and person state.
// Only the actual v2 DTO crosses into the catalog oracle. Every call re-verifies.
export function evaluateScenario(operation, scenario) {
  const { grant, context: { identity, ...context }, ...catalog } = scenario;
  const verification = verify({ grant,
    request: { grant_reference: catalog.request.grant_reference, binding: catalog.request.binding,
      required_permission: 'catalog.history.recover', checked_at: context.now },
    context: { ...identity, now: context.now, workload_caller: 'catalog-pricing', workload_audience: 'identity-tenancy.catalog-recovery' } });
  return (operation === 'create' ? create : page)({ ...catalog, context, verification });
}

export function baseScenario(operation = 'page') {
  const fixture = read(vectors.base);
  const originals = vectors.originals.flatMap(file => read(file).events);
  const grant = structuredClone(fixture.positive.grant);
  const organization = originals[0].organization_id;
  grant.binding.organization_id = organization;
  grant.binding.selection = { aggregate_types: ['category', 'product', 'presentation', 'presentation_price'], aggregate_ids: [], versions: [] };
  const identity = structuredClone(fixture.trusted_context);
  identity.organization.organization_id = organization;
  identity.membership.organization_id = organization;
  const now = '2026-10-16T12:05:00Z';
  const timestamp = Date.parse(now).toString(16).padStart(12, '0');
  const recoveryId = timestamp.slice(0, 8) + '-' + timestamp.slice(8) + '-7000-8000-000000000777';
  const session = { recovery_id: recoveryId, organization_id: organization, workload: 'catalog-pricing', binding: structuredClone(grant.binding),
    requested_after: '0', cut_position: String(originals.length), created_at: '2026-10-16T12:00:01Z', expires_at: '2026-10-16T13:00:01Z' };
  const context = { now, identity, workload: { authenticated: true, type: 'service', caller: 'catalog-pricing', audience: 'catalog-pricing.history-recovery' },
    active_sessions: 0, in_flight: false, pages_in_last_second: 0, elapsed_ms: 0, source_available: true };
  const request = { binding: structuredClone(grant.binding), grant_reference: grant.grant_reference,
    ...(operation === 'create' ? { recovery_id: recoveryId, after_position: '0' } : { cursor: vectors.synthetic_cursor }) };
  return { request, grant, context, recovery_id: recoveryId, session: operation === 'create' ? null : session,
    cursor: { hash: cursorHash(vectors.synthetic_cursor), recovery_id: recoveryId, organization_id: organization, workload: 'catalog-pricing',
      binding_hash: bindingHash(session.binding), cut_position: session.cut_position, after_position: '0', expires_at: session.expires_at, version: 1 },
    source: { available: true, integrity_verified: true, high_water: String(originals.length), frontier_position: '1',
      records: originals.map((event, index) => ({ position: String(index + 1), event })), disposed_ranges: [] }, next_cursor: vectors.synthetic_next_cursor };
}

export function changed(base, changes) {
  const result = structuredClone(base);
  for (const [address, value] of Object.entries(changes)) {
    const keys = address.split('.');
    assert(!keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key)), 'R4_UNSAFE_MUTATION');
    let owner = result;
    for (const key of keys.slice(0, -1)) { assert(owner && Object.hasOwn(owner, key), address); owner = owner[key]; }
    owner[keys.at(-1)] = structuredClone(value);
  }
  return result;
}

function propertyPointers(value, pointer = '', result = []) {
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    const here = pointer + '/' + key;
    if (key === 'properties') for (const name of Object.keys(child)) result.push(here + '/' + name);
    propertyPointers(child, here, result);
  }
  return result;
}

export function validatePolicy(policy = read(policyPath)) {
  assert.equal(policy.runtime_demonstrated, false);
  assert.equal(policy.production_enabled, false);
  assert.equal(policy.status, 'candidate');
  assert.deepEqual(policy.limits, { session_absolute_ms: 3600000, grant_maximum_ms: 900000, metadata_after_original_close_or_expiry_ms: 86400000,
    events_default: 100, events_maximum: 500, coverage_ranges_per_page: 500, pages_in_flight_per_session: 1, active_sessions_per_tenant: 2,
    page_requests_per_second_per_tenant: 5, total_history_quota: null, plan_dependent: false });
  const schema = read(schemaPath);
  const fields = [...propertyPointers(schema), '/$defs/Binding', '/$defs/OriginalEvent'].sort();
  assert.deepEqual(policy.field_inventory.map(row => row.path).sort(), fields, 'R4_FIELD_COVERAGE');
  assert.equal(new Set(fields).size, fields.length);
  for (const row of policy.field_inventory) {
    const profile = policy.profiles[row.profile];
    assert(profile, 'R4_CLASSIFICATION');
    assert.equal(profile.sensitivity, 'RESTRICTED', 'R4_CLASSIFICATION');
    for (const key of ['owner', 'categories', 'purpose', 'base', 'consumers', 'access', 'log_policy', 'encryption', 'retention', 'export_correction', 'third_parties_regions']) assert(profile[key], 'R4_CLASSIFICATION:' + key);
    if (/\/(?:grant_reference|cursor|initial_cursor|next_cursor)$/.test(row.path)) assert.equal(row.profile, 'secret', 'R4_SECRET');
  }
  assert.deepEqual(policy.storage_inventory.cursor, Object.keys(schema.$defs.CursorMetadata.properties));
  for (const fields of Object.values(policy.storage_inventory)) assert(!fields.some(field => ['grant_reference', 'cursor', 'initial_cursor', 'next_cursor', 'events', 'payload'].includes(field)), 'R4_NO_SECRET_OR_PAYLOAD_STORAGE');
  assert.match(policy.cursor.keys, /no cursor signing\/encryption keys/);
  assert.match(policy.profiles.secret.log_policy, /^prohibited$/);
  assert.deepEqual(policy.candidate_dependencies, [
    'identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml',
    'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json',
    'identity/http/shared/v2/identity-catalog-recovery-verification-v2-policy.json',
    'identity/fixtures/catalog-recovery/v2/catalog-recovery-verification-v2-vectors.json']);
  for (const dependency of policy.candidate_dependencies) assert(fs.existsSync(path.join(root, dependency)), 'R4_MISSING_CANDIDATE_DEPENDENCY');
  const expectedSources = ['catalog/http/shared/v1/catalog-history-recovery-v1.schema.json',
    'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json',
    'catalog/http/shared/v1/catalog-history-policy-v1.json', 'events/event-envelope-v1.schema.json',
    'catalog/events/v1/catalog-event-data-v1.schema.json',
    ...['catalog.category.changed.v1', 'catalog.product.changed.v1', 'catalog.presentation.changed.v1', 'pricing.presentation-price.changed.v1'].map(name => 'catalog/events/v1/' + name + '.schema.json')];
  assert.deepEqual(policy.source_pins.map(pin => pin.path).sort(), expectedSources.sort(), 'R4_SOURCE_COVERAGE');
  for (const pin of policy.source_pins) {
    assert.equal(pin.commit, 'a45e700eadd36790a5480faccd3ed80015b08e13', 'R4_SOURCE_REVISION');
    const bytes = execFileSync('git', ['show', pin.commit + ':' + pin.path], { cwd: root, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, 'R4_SOURCE_PIN');
    assert.equal(fs.readFileSync(path.join(root, pin.path), 'utf8').replaceAll('\r\n', '\n'), bytes.toString('utf8'), 'R4_SOURCE_BYTES');
  }
  return fields.length;
}

// Resolve actual schema references, preserving $ref siblings as conjunctions.
// This is an extractor, not a JSON Schema implementation; Sourcemeta validates.
export function extractSchema(definition, sourceSchemaPath = schemaPath) {
  const cache = new Map();
  const resolve = (value, file, stack = []) => {
    if (Array.isArray(value)) return value.map(item => resolve(item, file, stack));
    if (!value || typeof value !== 'object') return value;
    if (value.$ref) {
      const [relative, pointer = ''] = value.$ref.split('#');
      assert(!relative.includes('://'), 'R4_EXTERNAL_SCHEMA');
      const target = relative ? path.resolve(root, path.dirname(file), relative) : path.resolve(root, file);
      assert(target.startsWith(root + path.sep), 'R4_SCHEMA_ESCAPE');
      const targetFile = path.relative(root, target);
      const key = targetFile + '#' + pointer;
      assert(!stack.includes(key), 'R4_SCHEMA_CYCLE');
      if (!cache.has(key)) {
        const document = read(targetFile);
        const node = pointer === '' ? document : pointer.slice(1).split('/').reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
        assert.notEqual(node, undefined, 'R4_SCHEMA_POINTER');
        cache.set(key, resolve(node, targetFile, [...stack, key]));
      }
      const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref' && key !== '$id'));
      return Object.keys(siblings).length ? { allOf: [structuredClone(cache.get(key)), resolve(siblings, file, stack)] } : structuredClone(cache.get(key));
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$id').map(([key, child]) => [key, resolve(child, file, stack)]));
  };
  const schema = read(sourceSchemaPath);
  assert(schema.$defs[definition], 'R4_SCHEMA_DEFINITION');
  return { $schema: schema.$schema, ...resolve(schema.$defs[definition], sourceSchemaPath) };
}

export function validateContract() {
  const api = parse(fs.readFileSync(path.join(root, apiPath), 'utf8'));
  assert.equal(api.info.version, '1.0.0');
  assert.deepEqual(Object.keys(api.paths), ['/internal/v1/catalog/history/recoveries', '/internal/v1/catalog/history/recoveries/{recovery_id}/pages']);
  for (const item of Object.values(api.paths)) {
    assert.deepEqual(Object.keys(item), ['post']);
    const operation = item.post;
    assert.equal(operation['x-workload'].caller, 'catalog-pricing');
    assert.equal(operation['x-workload'].audience, 'catalog-pricing.history-recovery');
    for (const response of Object.values(operation.responses)) assert.equal(response.headers['Cache-Control'].$ref, '#/components/headers/NoStore');
    assert.equal(operation.responses['429'].headers['Retry-After'].$ref, '#/components/headers/RetryAfter');
  }
  assert.equal(vectors.runtime_demonstrated, false);
  assert.equal(new Set(vectors.negative.map(row => row.id)).size, vectors.negative.length);
  for (const row of vectors.negative) {
    const result = evaluateScenario(row.operation, changed(baseScenario(row.operation), row.changes));
    assert.equal(result.rejection, row.expected, 'R4_NEGATIVE:' + row.id);
  }
  const original = read('common/errors/v7/error-catalog-v7.json');
  const successor = read('common/errors/v8/error-catalog-v8.json');
  assert.equal(successor.version, 8);
  assert.deepEqual(successor.errors.slice(0, original.errors.length), original.errors, 'R4_ERROR_PRESERVATION');
  assert.equal(new Set(successor.errors.map(row => row.code)).size, successor.errors.length);
  const registry = read('registry/contracts.json');
  const before = JSON.parse(execFileSync('git', ['show', 'a45e700eadd36790a5480faccd3ed80015b08e13:registry/contracts.json'], { cwd: root, maxBuffer: 4 * 1024 * 1024 }));
  assert.deepEqual({ ...registry, planned: before.planned }, before, 'R4_NO_ADMISSION');
  assert.deepEqual(registry.planned.slice(0, before.planned.length), before.planned, 'R4_PRIOR_INTENTIONS');
  assert.equal(registry.planned.length - before.planned.length, 10);
  return { semantic_negatives: vectors.negative.length, classified_fields: validatePolicy(), runtime_demonstrated: false };
}

export function prepare(output) {
  const summary = validateContract();
  assert.equal(fs.existsSync(output), false, 'R4_OUTPUT_EXISTS');
  const created = evaluateScenario('create', baseScenario('create'));
  assert(created.response);
  const scenario = baseScenario();
  const result = evaluateScenario('page', scenario);
  assert(result.response);
  const positives = { CreateRequest: baseScenario('create').request, Session: created.response,
    PageRequest: scenario.request, Page: result.response, CursorMetadata: scenario.cursor,
    Problem: { type: 'urn:opencomerix:problem:catalog_recovery_expired', title: 'Recuperación de catálogo rechazada', status: 410,
      instance: 'urn:uuid:' + scenario.recovery_id, code: 'catalog_recovery_expired', trace_id: scenario.recovery_id, retryable: false } };
  const cases = [];
  const add = (definition, id, expected, value) => cases.push({ definition, id, expected, value });
  for (const [definition, value] of Object.entries(positives)) {
    add(definition, definition.toLowerCase() + '-valid', 'accept', value);
    const missing = structuredClone(value); delete missing[Object.keys(missing)[0]];
    add(definition, definition.toLowerCase() + '-missing', 'reject', missing);
    add(definition, definition.toLowerCase() + '-extra', 'reject', { ...value, unsafe_extra: true });
  }
  const invalid = (definition, id, changes) => add(definition, id, 'reject', changed(positives[definition], changes));
  invalid('CreateRequest', 'create-v4-id', { recovery_id: scenario.grant.binding.session_id });
  invalid('CreateRequest', 'create-number-position', { after_position: 0 });
  invalid('CreateRequest', 'create-leading-zero', { after_position: '01' });
  invalid('CreateRequest', 'create-configure-purpose', { 'binding.purpose': 'restricted-history-configuration' });
  invalid('CreateRequest', 'create-destination', { 'binding.destination.workload': 'reporting' });
  invalid('PageRequest', 'page-limit', { limit: 501 });
  invalid('PageRequest', 'page-zero-limit', { limit: 0 });
  invalid('PageRequest', 'page-jwt-cursor', { cursor: 'ey.not.a.cursor' });
  invalid('PageRequest', 'page-noncanonical-base64', { cursor: 'ocrc1_' + 'B'.repeat(43) });
  invalid('Session', 'session-date', { expires_at: 'tomorrow' });
  invalid('Session', 'session-completed-cursor', { state: 'completed' });
  invalid('CursorMetadata', 'stored-raw-cursor', { hash: vectors.synthetic_cursor });
  invalid('Page', 'page-terminal-next-cursor', { next_cursor: vectors.synthetic_next_cursor });
  invalid('Page', 'page-false-complete', { 'coverage.status': 'partial' });
  invalid('Page', 'page-unknown-event', { 'events.0.event.schema_version': 2 });
  invalid('Page', 'page-event-extra', { 'events.0.event.unclassified': 'unsafe' });
  invalid('Page', 'page-missing-reason', { 'coverage.missing_ranges': [{ from_position: '1', through_position: '1', reason: 'unknown' }] });
  invalid('Problem', 'problem-wrong-status', { status: 400 });
  invalid('Problem', 'problem-wrong-retry', { retryable: true });
  invalid('Problem', 'problem-detail', { detail: 'do not leak' });
  const completed = { ...created.response, state: 'completed', initial_cursor: null };
  add('Session', 'completed-session', 'accept', completed);
  const partial = baseScenario();
  partial.source.records.splice(1, 1);
  partial.source.disposed_ranges.push({ from_position: '2', through_position: '2', policy_id: 'CATALOG_HISTORY_AR', policy_version: 1 });
  add('Page', 'disposed-partial-page', 'accept', evaluateScenario('page', partial).response);
  fs.mkdirSync(output, { recursive: true });
  for (const definition of Object.keys(positives)) fs.writeFileSync(path.join(output, definition + '.schema.json'), JSON.stringify(extractSchema(definition)) + '\n', { flag: 'wx' });
  for (const row of cases) fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(row.value) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'cases.tsv'), cases.map(row => [row.id, row.expected, row.definition + '.schema.json', row.id + '.json'].join('\t')).join('\n') + '\n', { flag: 'wx' });
  return { ...summary, schema_positive: cases.filter(row => row.expected === 'accept').length, schema_negative: cases.filter(row => row.expected === 'reject').length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--self-test', 'usage: node scripts/catalog/validate-history-recovery-v1.mjs <new-output> [--self-test]');
  const output = path.resolve(process.argv[2]);
  assert(output.startsWith(path.join(root, '.ci-artifacts') + path.sep), 'R4_OUTPUT_SCOPE');
  console.log('F1-08G R4 contract gate passed: ' + JSON.stringify(prepare(output)));
}
