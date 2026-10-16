import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { create as createRecovery, page as readPage, cursorHash, bindingHash, encodedBytes, limits } from '../../scripts/catalog/history-recovery-v1-semantics.mjs';
import { baseScenario, changed, vectors, validateContract, validatePolicy, prepare, root, policyPath, read, evaluateScenario } from '../../scripts/catalog/validate-history-recovery-v1.mjs';
import { verify } from '../../scripts/identity/catalog-recovery-verification-v2-semantics.mjs';

const create = scenario => evaluateScenario('create', scenario);
const page = scenario => evaluateScenario('page', scenario);

test('R4 candidate preserves published sources, canonical errors, planned admissions and complete metadata classification', () => {
  const result = validateContract();
  assert.equal(result.semantic_negatives, 41);
  assert(result.classified_fields > 50);
  assert.equal(result.runtime_demonstrated, false);
});

for (const vector of vectors.negative) test('R4 rejects ' + vector.id, () => {
  const scenario = changed(baseScenario(vector.operation), vector.changes);
  assert.equal((vector.operation === 'create' ? create : page)(scenario).rejection, vector.expected);
});

test('creation replay at the same clock is 200, preserves cut/expiry and consumes no new session slot', () => {
  const scenario = baseScenario('create');
  const first = create(scenario);
  assert.equal(first.status, 201);
  const retry = { ...scenario, session: first.session };
  retry.source.high_water = '8';
  retry.context.active_sessions = 2;
  const second = create(retry);
  assert.equal(second.status, 200);
  assert.equal(second.response.cut_position, '4');
  assert.equal(second.response.expires_at, first.response.expires_at);
  assert.deepEqual(second.session, first.session);
  assert.equal(JSON.stringify(second.session).includes(scenario.request.grant_reference), false);
});

test('idempotence compares original intent before replay and expiry never recreates a known session', () => {
  const scenario = baseScenario('create');
  scenario.session = create(scenario).session;
  assert.equal(create(changed(scenario, { 'request.after_position': '1' })).rejection, 'catalog_recovery_intent_conflict');
  const expired = changed(scenario, { 'session.expires_at': scenario.context.now });
  assert.equal(create(expired).rejection, 'catalog_recovery_expired');
});

test('a renewed grant with fresh decision/MFA and unchanged binding resumes the same recovery', () => {
  const scenario = baseScenario('create');
  scenario.session = create(scenario).session;
  scenario.context.now = '2026-10-16T12:10:01Z';
  scenario.context.identity.decision_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  scenario.grant.authority.decision_id = scenario.context.identity.decision_id;
  scenario.grant.authority.mfa_event_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  scenario.grant.authority.mfa_authenticated_at = '2026-10-16T12:10:00Z';
  scenario.grant.grant_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  scenario.grant.issued_at = scenario.context.now;
  scenario.grant.expires_at = '2026-10-16T12:25:01Z';
  scenario.grant.grant_reference = 'ocgr_' + 'D'.repeat(43);
  scenario.request.grant_reference = scenario.grant.grant_reference;
  const result = create(scenario);
  assert.equal(result.status, 200);
  assert.equal(result.response.expires_at, scenario.session.expires_at);
  assert.equal(result.response.recovery_id, scenario.session.recovery_id);
});

test('UUIDv7 timestamp is checked only for missing sessions; old IDs still fail after metadata purge', () => {
  const scenario = baseScenario('create');
  scenario.request.recovery_id = '01998d00-0000-7000-8000-000000000777';
  assert.equal(create(scenario).rejection, 'catalog_recovery_expired');
  const existing = baseScenario('create');
  existing.session = create(existing).session;
  existing.request.recovery_id = scenario.request.recovery_id;
  existing.session.recovery_id = scenario.request.recovery_id;
  assert.equal(create(existing).status, 200);
});

test('pages preserve all four original facts and separate nonterminal traversal from full available coverage', () => {
  const scenario = baseScenario();
  scenario.request.limit = 2;
  const first = page(scenario);
  assert.deepEqual(first.response.events.map(row => row.position), ['1', '2']);
  assert.equal(first.response.end_of_traversal, false);
  assert.equal(first.response.complete, false);
  assert.equal(first.response.coverage.status, 'complete');
  const next = { ...scenario, cursor: first.next_cursor_metadata,
    request: { ...scenario.request, cursor: first.response.next_cursor } };
  const last = page(next);
  assert.deepEqual(last.response.events.map(row => row.position), ['3', '4']);
  assert.equal(last.response.complete, true);
  assert.equal(last.response.end_of_traversal, true);
  assert.equal(last.response.next_cursor, null);
  assert.deepEqual([...first.response.events, ...last.response.events].map(row => row.event), scenario.source.records.map(row => row.event));
  assert.equal(last.response.events[1].event.payload.price.amount, '12.5');
  assert.equal(last.response.events[1].event.occurred_at, '2026-10-15T10:00:00.000001Z');
});

test('response loss, next-handle replacement and concurrent disposal preserve cut and expose current missing coverage', () => {
  const scenario = baseScenario();
  scenario.request.limit = 1;
  const original = page(scenario);
  scenario.next_cursor = 'ocrc1_' + 'E'.repeat(42) + 'A';
  const retry = page(scenario);
  assert.deepEqual(retry.response.events, original.response.events);
  assert.notEqual(retry.response.next_cursor, original.response.next_cursor);
  assert.equal(retry.response.expires_at, original.response.expires_at);
  scenario.source.records.splice(0, 1);
  scenario.source.disposed_ranges.push({ from_position: '1', through_position: '1', policy_id: 'CATALOG_HISTORY_AR', policy_version: 1 });
  const disposed = page(scenario);
  assert.equal(disposed.response.coverage.status, 'partial');
  assert.equal(disposed.response.complete, false);
  assert.equal(disposed.response.events[0].position, '2');
  assert.equal(disposed.response.coverage.missing_ranges[0].reason, 'disposed');
  // Both earlier handles remain valid and bound to the same session/cut.
  for (const result of [original, retry]) {
    const resumed = { ...scenario, cursor: result.next_cursor_metadata, request: { ...scenario.request, cursor: result.response.next_cursor } };
    assert(page(resumed).response);
  }
});

test('selection omissions are not missing positions; a disposed unknown match remains conservatively partial', () => {
  const scenario = baseScenario();
  const selection = { aggregate_types: ['product'], aggregate_ids: [], versions: ['1'] };
  for (const binding of [scenario.request.binding, scenario.grant.binding, scenario.session.binding]) binding.selection = structuredClone(selection);
  scenario.cursor.binding_hash = bindingHash(scenario.session.binding);
  const result = page(scenario).response;
  assert.deepEqual(result.events.map(row => row.position), ['2']);
  assert.equal(result.complete, true);
  assert.deepEqual(result.coverage.missing_ranges, []);
  scenario.source.records.splice(0, 1);
  scenario.source.disposed_ranges.push({ from_position: '1', through_position: '1', policy_id: 'CATALOG_HISTORY_AR', policy_version: 1 });
  assert.equal(page(scenario).response.complete, false);
});

test('an empty selection match still advances to the cut; empty retained history is complete only with verified source', () => {
  const scenario = baseScenario();
  for (const binding of [scenario.request.binding, scenario.grant.binding, scenario.session.binding]) binding.selection.aggregate_ids = ['99999999-9999-4999-8999-999999999999'];
  scenario.cursor.binding_hash = bindingHash(scenario.session.binding);
  const result = page(scenario).response;
  assert.deepEqual(result.events, []);
  assert.equal(result.coverage.scanned_through, '4');
  assert.equal(result.complete, true);
  scenario.source.records = [];
  scenario.source.high_water = scenario.session.cut_position = scenario.cursor.cut_position = '0';
  assert.equal(page(scenario).response.complete, true);
  scenario.source.integrity_verified = false;
  assert.equal(page(scenario).rejection, 'catalog_recovery_source_unverifiable');
});

test('frontier and disposed ranges paginate without events or truncating the range inventory', () => {
  const scenario = baseScenario();
  scenario.source.records = [];
  scenario.source.high_water = scenario.session.cut_position = scenario.cursor.cut_position = '501';
  scenario.source.disposed_ranges = Array.from({ length: 501 }, (_, index) => ({ from_position: String(index + 1), through_position: String(index + 1), policy_id: 'POLICY_' + index, policy_version: 1 }));
  const first = page(scenario);
  assert.deepEqual(first.response.events, []);
  assert.equal(first.response.coverage.missing_ranges.length, 500);
  assert.equal(first.response.coverage.scanned_through, '500');
  assert.equal(first.response.end_of_traversal, false);
  const next = { ...scenario, cursor: first.next_cursor_metadata, request: { ...scenario.request, cursor: first.response.next_cursor } };
  assert.equal(page(next).response.end_of_traversal, true);
  scenario.source.disposed_ranges = [];
  scenario.source.frontier_position = '502';
  const below = page(scenario).response;
  assert.equal(below.complete, false);
  assert.equal(below.coverage.missing_ranges[0].reason, 'before_supported_frontier');
});

test('positions beyond Number precision remain exact and do not use timestamp ordering', () => {
  const scenario = baseScenario();
  const offset = 9007199254740992n;
  for (const row of scenario.source.records) row.position = String(BigInt(row.position) + offset);
  scenario.source.frontier_position = String(offset + 1n);
  scenario.source.high_water = scenario.session.cut_position = scenario.cursor.cut_position = String(offset + 4n);
  scenario.session.requested_after = scenario.cursor.after_position = String(offset);
  assert.deepEqual(page(scenario).response.events.map(row => row.position), [1n, 2n, 3n, 4n].map(value => String(offset + value)));
});

test('completion releases a slot yet permits only the original terminal request before absolute expiry', () => {
  const scenario = baseScenario();
  const final = page(scenario);
  Object.assign(scenario.session, final.close);
  assert(page(scenario).response.complete);
  assert.equal(page(changed(scenario, { 'request.limit': 2 })).rejection, 'catalog_recovery_closed');
  scenario.context.now = scenario.session.expires_at;
  // Current grant renewed synthetically so session expiry, rather than stale grant, is evaluated.
  scenario.grant.issued_at = '2026-10-16T12:59:01Z';
  scenario.grant.expires_at = '2026-10-16T13:14:01Z';
  assert.equal(page(scenario).rejection, 'catalog_recovery_expired');
});

test('terminal replay rejects fragmentation after disposal without issuing an unusable cursor', () => {
  const scenario = baseScenario();
  const template = scenario.source.records[0].event;
  for (const binding of [scenario.request.binding, scenario.grant.binding, scenario.session.binding])
    binding.selection.aggregate_ids = ['99999999-9999-4999-8999-999999999999'];
  scenario.cursor.binding_hash = bindingHash(scenario.session.binding);
  scenario.source.records = Array.from({ length: 501 }, (_, index) => ({ position: String(index + 1),
    event: { ...structuredClone(template), event_id: '01998d00-0000-7000-8000-' + String(index).padStart(12, '0') } }));
  scenario.source.high_water = scenario.session.cut_position = scenario.cursor.cut_position = '501';
  const first = page(scenario);
  assert.equal(first.response.end_of_traversal, true);
  assert.equal(first.response.coverage.available_ranges.length, 1);
  assert.equal(first.response.events.length, 0);
  Object.assign(scenario.session, first.close);
  const originalClose = structuredClone(scenario.session);
  scenario.source.records = [];
  scenario.source.disposed_ranges = Array.from({ length: 501 }, (_, index) => ({
    from_position: String(index + 1), through_position: String(index + 1), policy_id: 'POLICY_' + index, policy_version: 1 }));
  assert.deepEqual(page(scenario), { rejection: 'catalog_recovery_closed' });
  assert.deepEqual(scenario.session, originalClose);
  // Exactly 500 ranges still fit a terminal replay with current partial coverage.
  scenario.source.disposed_ranges[499].through_position = '501';
  scenario.source.disposed_ranges.pop();
  const fits = page(scenario);
  assert.equal(fits.response.end_of_traversal, true);
  assert.equal(fits.response.complete, false);
  assert.equal(fits.response.next_cursor, null);
  assert.equal(fits.next_cursor_metadata, null);
  assert.equal(fits.close.closed_at, originalClose.closed_at);
});

test('catalog consumes only the real v2 DTO and fails closed on missing, stale or mismatched verification', () => {
  const scenario = baseScenario('create');
  const { grant, context: { identity, ...context }, ...catalog } = scenario;
  const verification = verify({ grant, context: { ...identity, now: context.now, workload_caller: 'catalog-pricing' },
    request: { binding: catalog.request.binding, grant_reference: catalog.request.grant_reference,
      required_permission: 'catalog.history.recover', checked_at: context.now } });
  assert.equal(verification.response.issued_at, grant.issued_at);
  assert.equal(Object.hasOwn(verification.response, 'grant_reference'), false);
  assert.equal(createRecovery({ ...catalog, context, verification }).status, 201);
  const legacy = structuredClone(verification);
  delete legacy.response.issued_at;
  assert.equal(createRecovery({ ...catalog, context, verification: legacy }).rejection, 'catalog_recovery_not_authorized');
  assert.equal(createRecovery({ ...catalog, context }).rejection, 'platform_dependency_unavailable');
  for (const changes of [{ 'response.issued_at': 'invalid' }, { 'response.issued_at': '2026-10-16T12:06:00Z' },
    { 'response.valid_until': context.now }, { 'response.authorized': false },
    { 'response.binding.organization_id': '99999999-9999-4999-8999-999999999999' }]) {
    assert.equal(createRecovery({ ...catalog, context, verification: changed(verification, changes) }).rejection, 'catalog_recovery_not_authorized');
  }
  // An old timestamp is rejected against the verified actual issuance, not a
  // hypothetical now-minus-15-minutes interval. No full Grant reaches catalog.
  const earlier = Date.parse(grant.issued_at) - 1;
  const hex = earlier.toString(16).padStart(12, '0');
  catalog.request.recovery_id = hex.slice(0, 8) + '-' + hex.slice(8) + '-7000-8000-000000000777';
  assert.equal(createRecovery({ ...catalog, context, verification }).rejection, 'catalog_recovery_expired');
  const pageScenario = baseScenario();
  assert.equal(readPage({ ...pageScenario, context, verification }).response.end_of_traversal, true);
});

test('UTF-8 budget returns fewer whole original events and rejects an unrepresentable original explicitly', () => {
  const scenario = baseScenario();
  const event = structuredClone(scenario.source.records[1].event);
  event.payload.product.description = 'ñ'.repeat(1000);
  scenario.source.records = Array.from({ length: 500 }, (_, index) => ({ position: String(index + 1), event: { ...structuredClone(event), event_id: '01998d00-0000-7000-8000-' + String(index).padStart(12, '0') } }));
  scenario.source.high_water = scenario.session.cut_position = scenario.cursor.cut_position = '500';
  scenario.request.limit = 500;
  const result = page(scenario).response;
  assert(result.events.length > 0 && result.events.length < 500);
  assert(encodedBytes(result) <= limits.responseBytes);
  assert.equal(result.end_of_traversal, false);
  scenario.source.records[0].event.payload.product.description = 'ñ'.repeat(131072);
  assert.equal(page(scenario).rejection, 'catalog_recovery_event_unrepresentable');
});

test('classification and minimal-storage checks fail if a credential field is loggable or a payload is retained', () => {
  const policy = read(policyPath);
  policy.profiles.secret.log_policy = 'allowed';
  assert.throws(() => validatePolicy(policy));
  const retained = read(policyPath);
  retained.storage_inventory.session.push('events');
  assert.throws(() => validatePolicy(retained), /R4_NO_SECRET_OR_PAYLOAD_STORAGE/);
  const omitted = read(policyPath);
  omitted.field_inventory.pop();
  assert.throws(() => validatePolicy(omitted), /R4_FIELD_COVERAGE/);
  const missingSource = read(policyPath);
  missingSource.source_pins.pop();
  assert.throws(() => validatePolicy(missingSource), /R4_SOURCE_COVERAGE/);
  const movedSource = read(policyPath);
  movedSource.source_pins[0].commit = '68d923e903b6341eedb980af3586890c0eab7d5e';
  assert.throws(() => validatePolicy(movedSource), /R4_SOURCE_REVISION/);
});

test('extractor emits real resolved schemas and positive/negative inventory, and refuses evidence overwrite', () => {
  const directory = path.join(root, '.ci-artifacts', 'r4-test-' + randomUUID());
  try {
    const result = prepare(directory);
    assert(result.schema_positive > 0 && result.schema_negative > 20);
    const rows = readFileSync(path.join(directory, 'cases.tsv'), 'utf8').trim().split('\n');
    assert.equal(rows.length, result.schema_positive + result.schema_negative);
    for (const row of rows) {
      const [, expected, schema, fixture] = row.split('\t');
      assert(['accept', 'reject'].includes(expected));
      assert(existsSync(path.join(directory, fixture)));
      assert.equal(readFileSync(path.join(directory, schema), 'utf8').includes('"$ref"'), false);
    }
    assert.throws(() => prepare(directory), /R4_OUTPUT_EXISTS/);
  } finally {
    assert(path.resolve(directory).startsWith(path.join(root, '.ci-artifacts') + path.sep + 'r4-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
