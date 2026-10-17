import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { gitReader, operationPointers, parseSource, resolveSelection } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const schemaPath = 'catalog/http/shared/v1/catalog-history-protection-v1.schema.json';
export const policyPath = 'catalog/http/shared/v1/catalog-history-protection-v1-policy.json';
export const apiPath = 'catalog/http/private/v1/catalog-history-protection-v1.yaml';
export const vectorsPath = 'catalog/fixtures/history-protection/v1/history-protection-v1-vectors.json';
export const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const same = (a, b, reason) => assert.deepEqual(a, b, reason);
const canonical = value => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  return value;
}
const key = ref => canonical(ref);
const countOpen = values => [...values.values()].filter(value => !value.released).length;
const result = (status = 200, code = null) => ({ status, code });

export const historyAdmissionSource = '28be1edf02a3771629febf554f8b5f4856452877';
// Closed H package; R1 v1 and its schema remain candidates. Shared with R4 so
// both gates check the same transition without weakening their wire invariants.
const historyAdmission = [
  ['catalog.history-protection.http.v1', 'catalog/http/private/v1/catalog-history-protection-v1.yaml', 'http-private', '1.0.0'],
  ['catalog.history-protection.schema.v1', 'catalog/http/shared/v1/catalog-history-protection-v1.schema.json', 'schema', 'v1'],
  ['catalog.history-protection.policy.v1', 'catalog/http/shared/v1/catalog-history-protection-v1-policy.json', 'policy', '1'],
  ['catalog.history-protection.fixtures.v1', 'catalog/fixtures/history-protection/v1/history-protection-v1-vectors.json', 'validation', 'v1'],
  ['common.error-catalog.v7', 'common/errors/v7/error-catalog-v7.json', 'errors', '7'],
  ['common.error-catalog.v7.schema', 'common/errors/v7/error-catalog-v7.schema.json', 'schema', 'v7'],
  ['identity.catalog-recovery-authority.v1', 'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml', 'http-private', '1.0.0'],
  ['identity.catalog-recovery-authority.v1.schema', 'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json', 'schema', 'v1'],
  ['identity.catalog-recovery-authority-v1-fixtures', 'identity/fixtures/catalog-recovery/v1/catalog-recovery-authority-v1-fixtures.json', 'validation', 'v1'],
  ['catalog.history-recovery.schema.v1', 'catalog/http/shared/v1/catalog-history-recovery-v1.schema.json', 'schema', 'v1'],
  ['catalog.history-recovery.fixtures.v1', 'catalog/fixtures/recovery/v1/catalog-history-recovery-v1-fixtures.json', 'validation', 'v1'],
  ['catalog.history-recovery.http.v1', 'catalog/http/private/v1/catalog-history-recovery-v1.yaml', 'http-private', '1.0.0'],
  ['catalog.history-recovery.protocol.v1', 'catalog/http/shared/v1/catalog-history-recovery-protocol-v1.schema.json', 'schema', 'v1'],
  ['catalog.history-recovery.policy.v1', 'catalog/http/shared/v1/catalog-history-recovery-v1-policy.json', 'policy', '1'],
  ['catalog.history-recovery.protocol-fixtures.v1', 'catalog/fixtures/recovery/v1/catalog-history-recovery-protocol-v1-vectors.json', 'validation', 'v1'],
  ['common.error-catalog.v8', 'common/errors/v8/error-catalog-v8.json', 'errors', '8'],
  ['common.error-catalog.v8.schema', 'common/errors/v8/error-catalog-v8.schema.json', 'schema', 'v8'],
  ['identity.catalog-recovery-verification.http.v2', 'identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml', 'http-private', '2.0.0'],
  ['identity.catalog-recovery-verification.schema.v2', 'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json', 'schema', 'v2'],
  ['identity.catalog-recovery-verification.policy.v2', 'identity/http/shared/v2/identity-catalog-recovery-verification-v2-policy.json', 'policy', '2'],
  ['identity.catalog-recovery-verification.fixtures.v2', 'identity/fixtures/catalog-recovery/v2/catalog-recovery-verification-v2-vectors.json', 'validation', 'v2'],
  ['common.data-lifecycle-policy.v2', 'common/http/shared/v2/data-lifecycle-policy-v2.schema.json', 'schema', 'v2'],
  ['catalog.history-policy.v2', 'catalog/http/shared/v2/catalog-history-policy-v2.json', 'policy', '2'],
  ['catalog.history-policy.fixtures.v2', 'catalog/fixtures/history-policy/v2/history-policy-v2-vectors.json', 'validation', 'v2'],
];

export function validateHistoryRegistry(registry = read('registry/contracts.json')) {
  const source = gitReader(root, historyAdmissionSource);
  const baseline = JSON.parse(source('registry/contracts.json'));
  if (registry.contracts.length === baseline.contracts.length) {
    same(registry, baseline, 'H_CANDIDATE_REGISTRY');
    return { phase: 'candidate', admitted: 0 };
  }
  const { contracts, planned, ...metadata } = registry;
  const { contracts: priorContracts, planned: priorPlanned, ...priorMetadata } = baseline;
  same(metadata, priorMetadata, 'H_REGISTRY_METADATA');
  same(contracts.slice(0, priorContracts.length), priorContracts, 'H_PRIOR_DESCRIPTORS');
  const added = contracts.slice(priorContracts.length);
  same(added.map(row => row.id), historyAdmission.map(([id]) => id), 'H_SELECTED_ROOTS');
  const ids = new Set(added.map(row => row.id));
  same(planned, priorPlanned.filter(row => !ids.has(row.id)), 'H_REMAINING_INTENTIONS');
  const mappings = new Map(priorContracts.flatMap(row => row.uriMappings).map(row => [row.uri, row]));
  for (const [index, [id, file, surface, version]] of historyAdmission.entries()) {
    const row = added[index], intent = priorPlanned.find(item => item.id === id);
    same([row.path, row.surface, row.version, row.owner, row.domain, row.status],
      [file, surface, version, intent.owner, intent.domain, 'active'], 'H_DESCRIPTOR');
    same([row.commit, row.tag, row.tagObject, row.sha256],
      [historyAdmissionSource, null, null, sha256(source(file))], 'H_PROVENANCE');
    const document = parseSource(source(file), file);
    same(row.operations, [...operationPointers(document).keys()], 'H_OPERATIONS');
    for (const key of ['capability', 'purpose', 'reasonForChange', 'retirement'])
      assert(typeof row[key] === 'string' && row[key].length > 0, 'H_EVOLUTION_METADATA');
    if (document.$id) {
      assert(!mappings.has(document.$id), 'H_AMBIGUOUS_MAPPING');
      mappings.set(document.$id, { uri: document.$id, path: file });
    }
  }
  const draftPaths = new Set(contracts.filter(row => row.status === 'draft').map(row => row.path));
  for (const row of added) {
    const closure = resolveSelection(source, { ...row, uriMappings: [...mappings.values()] },
      { version: row.version, operations: row.operations, pointers: [''] }, registry);
    const files = new Set(closure.files.map(file => file.path));
    same(row.uriMappings, [...mappings.values()].filter(item => files.has(item.path)), 'H_URI_MAPPINGS');
    for (const file of closure.files) {
      assert(!draftPaths.has(file.path), 'H_DRAFT_CLOSURE');
      same(fs.readFileSync(path.join(root, file.path), 'utf8').replaceAll('\r\n', '\n'),
        source(file.path).toString('utf8'), 'H_SOURCE_BYTES');
    }
  }
  return { phase: 'admitted', admitted: added.length };
}
const errors = {
  authority: 'catalog_history_source_not_authorized',
  conflict: 'catalog_history_message_conflict',
  reconcile: 'catalog_history_reconciliation_required',
  closed: 'catalog_history_scope_closed',
  hold: 'catalog_history_hold_authority_required',
};

// Reference oracle for SYNTHETIC contract traces, not an authorization, inbox,
// eligibility or persistence implementation. JSON Schema is tested by Sourcemeta.
export function evaluateTrace(trace) {
  const { inventory } = trace;
  let context = structuredClone(trace.context);
  same(new Set(inventory.sources.map(s => s.source_id + ':' + s.scope.scope_id)).size, inventory.sources.length, 'R2_INVENTORY_DUPLICATE');
  for (const [index, source] of inventory.sources.entries()) {
    for (const other of inventory.sources.slice(index + 1).filter(other => other.source_id === source.source_id)) {
      same([source.caller,source.source_contract_id,source.source_contract_version,source.source_contract_sha256,source.authority_id], [other.caller,other.source_contract_id,other.source_contract_version,other.source_contract_sha256,other.authority_id], 'R2_INVENTORY_SOURCE_BINDING');
      assert(!source.scope.references.some(a => other.scope.references.some(b => key(a) === key(b))), 'R2_INVENTORY_OVERLAP');
    }
  }
  const admitted = inventory.enabled_contracts.map(c => canonical(c)).sort();
  const sourceContracts = [...new Set(inventory.sources.map(s => canonical({ id: s.source_contract_id, version: s.source_contract_version, sha256: s.source_contract_sha256 })))].sort();
  same(admitted, sourceContracts, 'R2_INVENTORY_COVERAGE');
  const streams = new Map(), scopes = new Map(), baselines = new Map();
  for (const source of inventory.sources) {
    const scopeKey = source.source_id + ':' + source.scope.scope_id;
    scopes.set(scopeKey, { source, obligations: new Map(), holds: new Map(), pages: new Map(), baseline: null, checkpoint: null, closed: false, blocked: false, permanentBlock: false, lastMutation: 0n });
    if (!streams.has(source.source_id)) streams.set(source.source_id, { through: 0n, seen: new Map(), positions: new Map(), gaps: new Set(), gapBlocked: false, reconciledScopes: new Set() });
  }
  const evidenceOk = (evidence, source) => context.authority_verified && evidence?.authority_id === source.authority_id;
  const withinScope = (reference, scope) => scope.source.scope.references.some(r => key(r) === key(reference));
  const block = (scope, code, permanent = false) => { scope.blocked = true; scope.permanentBlock ||= permanent; return result(409, code); };
  const reconcileScope = (scope, stream) => {
    if (!stream.gapBlocked || stream.gaps.size || scope.blocked) return;
    stream.reconciledScopes.add(scope.source.scope.scope_id);
    const sourceScopes = [...scopes.values()].filter(row => row.source.source_id === scope.source.source_id);
    if (sourceScopes.every(row => !row.blocked && stream.reconciledScopes.has(row.source.scope.scope_id))) stream.gapBlocked = false;
  };
  const outputs = [];
  for (const [index, message] of trace.messages.entries()) {
    // Receiver-side fixture context; never fields accepted from a wire message.
    context = { ...context, ...trace.context_changes?.[index] };
    const scope = scopes.get(message.source_id + ':' + message.scope_id);
    if (!context.authenticated || context.audience !== 'catalog-pricing.history-protection') { outputs.push(result(401, 'catalog_history_workload_invalid')); continue; }
    if (context.authority_available === false) { outputs.push(result(503, 'platform_dependency_unavailable')); continue; }
    if (!scope || context.organization_id !== inventory.organization_id || message.organization_id !== inventory.organization_id || message.inventory_revision !== inventory.revision || context.caller !== scope.source.caller || message.source_contract_id !== scope.source.source_contract_id || message.source_contract_version !== scope.source.source_contract_version) { outputs.push(result(403, errors.authority)); continue; }
    const { source } = scope;
    const payload = message.payload;
    const rows = message.kind === 'baseline.page' ? [...payload.obligations, ...payload.releases, ...payload.holds, ...payload.hold_releases] : [payload];
    if (!context.authority_verified || rows.some(row => row.evidence && !evidenceOk(row.evidence, source))) { outputs.push(result(403, errors.authority)); continue; }
    if ((message.kind.startsWith('hold.') || (message.kind === 'baseline.page' && (payload.holds.length || payload.hold_releases.length))) && !source.allows_holds) { outputs.push(result(403, errors.hold)); continue; }
    const hasHoldRelease = message.kind === 'hold.release' || (message.kind === 'baseline.page' && payload.hold_releases.length > 0);
    if (hasHoldRelease && !context.reinforced_authority) { outputs.push(result(403, errors.hold)); continue; }
    if (message.kind === 'baseline.complete') {
      const staged = [...scope.pages.values()];
      if (staged.some(page => page.hold_releases.length) && (!source.allows_holds || !context.reinforced_authority)) { outputs.push(result(403, errors.hold)); continue; }
      if (staged.some(page => [...page.obligations, ...page.releases, ...page.holds, ...page.hold_releases].some(row => !evidenceOk(row.evidence, source)))) { outputs.push(result(403, errors.authority)); continue; }
    }
    if (Buffer.byteLength(JSON.stringify(message), 'utf8') > 131072) { outputs.push(result(413, 'platform_payload_too_large')); continue; }
    if (rows.some(row => row.reference && (!withinScope(row.reference, scope) || !context.known_references.some(r => key(r) === key(row.reference))))) { outputs.push(block(scope, errors.conflict, true)); continue; }
    const stream = streams.get(message.source_id);
    const content = canonical(message), sequence = BigInt(message.sequence);
    if (stream.seen.has(message.message_id)) {
      outputs.push(stream.seen.get(message.message_id) === content ? result() : block(scope, errors.conflict, true));
      continue;
    }
    if (stream.positions.has(message.sequence)) { outputs.push(block(scope, errors.conflict, true)); continue; }
    if (sequence !== stream.through + 1n) {
      if (sequence > stream.through + 1n) {
        // The missing message's scope is unknown even if this later message has one.
        stream.gaps.add(message.sequence); stream.gapBlocked = true; stream.reconciledScopes.clear();
        outputs.push(result(409, errors.reconcile));
      } else outputs.push(block(scope, errors.reconcile));
      continue;
    }
    const obligations = new Map(scope.obligations), holds = new Map(scope.holds);
    const put = (record, kind, snapshot = false) => {
      const isHold = kind.startsWith('hold'), released = kind.endsWith('release');
      const target = isHold ? holds : obligations, id = record[isHold ? 'hold_id' : 'obligation_id'];
      const current = target.get(id), version = BigInt(record.version);
      if (current && current.reference && record.reference && key(current.reference) !== key(record.reference)) return false;
      if (current && version === BigInt(current.version)) return snapshot && canonical(current.record) === canonical(record) && current.released === released;
      if (current && version < BigInt(current.version)) return false;
      if (!snapshot && ((!current && (released || version !== 1n)) || (current && version !== BigInt(current.version) + 1n))) return false;
      // Baseline tombstones must explicitly supersede a known local protection.
      if (snapshot && released && !current) return false;
      if (!isHold && !released) {
        if (scope.closed && (!current || current.released)) return false;
        if (record.trigger.state === 'known' && record.required_until.state === 'known' && Date.parse(record.required_until.at) < Date.parse(record.trigger.at)) return false;
        if (current?.record.required_until?.state === 'known' && (record.required_until.state !== 'known' || Date.parse(record.required_until.at) < Date.parse(current.record.required_until.at))) return false;
        if (current && (record.profile_id !== current.record.profile_id || record.jurisdiction !== current.record.jurisdiction || record.profile_version < current.record.profile_version)) return false;
      }
      if (isHold && !released && current && (record.created_at !== current.record.created_at || (current.record.until?.state === 'known' && record.until.state === 'known' && Date.parse(record.until.at) < Date.parse(current.record.until.at)))) return false;
      if (!isHold && released) {
        if (current?.record.required_until?.state !== 'known' || Date.parse(record.ended_at) < Date.parse(current.record.required_until.at)) return false;
      }
      target.set(id, { version: record.version, released, record, reference: record.reference ?? current?.reference });
      return true;
    };
    let failure = null;
    if (message.kind === 'baseline.page') {
      const pages = [...scope.pages.values()];
      const binding = baselines.get(payload.baseline_id);
      if (binding && (binding.source_id !== message.source_id || binding.scope_id !== message.scope_id || binding.cut !== payload.cut || binding.completion || binding.pages.has(payload.page))) failure = errors.conflict;
      else if (scope.closed || rows.length > 100 || (pages.length && (pages[0].baseline_id !== payload.baseline_id || pages[0].cut !== payload.cut)) || BigInt(payload.cut) > stream.through || BigInt(payload.cut) < scope.lastMutation) failure = errors.reconcile;
      else {
        const manifest = binding ?? { source_id: message.source_id, scope_id: message.scope_id, cut: payload.cut, pages: new Map(), completion: null };
        manifest.pages.set(payload.page, canonical(payload)); baselines.set(payload.baseline_id, manifest);
        scope.pages.set(payload.page, structuredClone(payload)); scope.baseline = null;
      }
    } else if (message.kind === 'baseline.complete') {
      const binding = baselines.get(payload.baseline_id);
      const pages = [...scope.pages.entries()].sort((a, b) => a[0] - b[0]);
      const flat = name => pages.flatMap(([, page]) => page[name]);
      if (binding && (binding.source_id !== message.source_id || binding.scope_id !== message.scope_id || binding.cut !== payload.cut || binding.completion)) failure = errors.conflict;
      else if (!binding || scope.closed || pages.length !== payload.pages || pages.some(([n, page], i) => n !== i + 1 || page.baseline_id !== payload.baseline_id || page.cut !== payload.cut || binding.pages.get(n) !== canonical(page)) || BigInt(payload.cut) < scope.lastMutation) failure = errors.reconcile;
      if (!failure) {
        for (const name of ['obligations','releases','holds','hold_releases']) if (flat(name).length !== payload[name]) failure = errors.reconcile;
        for (const names of [['obligations','releases'],['holds','hold_releases']]) {
          const ids = names.flatMap(name => flat(name).map(row => row[names[0] === 'holds' ? 'hold_id' : 'obligation_id']));
          if (new Set(ids).size !== ids.length) failure = errors.conflict;
        }
      }
      if (!failure) {
        for (const [name, kind] of [['obligations','obligation.upsert'],['releases','obligation.release'],['holds','hold.upsert'],['hold_releases','hold.release']]) for (const row of flat(name)) if (!put(row, kind, true)) failure = errors.conflict;
      }
      if (!failure) {
        binding.completion = canonical(payload);
        scope.baseline = payload.baseline_id; scope.pages.clear();
        if (!scope.permanentBlock && stream.gaps.size === 0) scope.blocked = false;
      }
    } else if (['obligation.upsert','obligation.release','hold.upsert','hold.release'].includes(message.kind)) {
      if (!scope.baseline) failure = errors.reconcile;
      else if (scope.closed && message.kind === 'obligation.upsert' && (!obligations.has(payload.obligation_id) || obligations.get(payload.obligation_id).released)) failure = errors.closed;
      else if (!put(payload, message.kind)) failure = errors.conflict;
      if (!failure) scope.lastMutation = sequence;
    } else if (message.kind === 'checkpoint') {
      if (!scope.baseline || payload.baseline_id !== scope.baseline || BigInt(payload.through) !== stream.through || payload.open_obligations !== countOpen(obligations) || payload.active_holds !== countOpen(holds) || scope.blocked || stream.gaps.size > 0) failure = errors.reconcile;
      else scope.checkpoint = { id: message.message_id, sequence, ...payload };
    } else if (message.kind === 'closure') {
      const cp = scope.checkpoint;
      if (scope.blocked || stream.gapBlocked || !cp || cp.id !== payload.checkpoint_id || cp.through !== payload.through || cp.sequence !== stream.through || cp.pending_messages !== 0 || cp.pending_operations !== 0 || payload.pending_messages !== 0 || payload.pending_operations !== 0 || payload.future_references_rejected !== true) failure = errors.reconcile;
      else scope.closed = true;
    } else failure = errors.conflict;
    if (failure) { outputs.push(block(scope, failure, failure === errors.conflict || failure === errors.closed)); continue; }
    scope.obligations = obligations; scope.holds = holds;
    stream.through = sequence; stream.seen.set(message.message_id, content); stream.positions.set(message.sequence, content); stream.gaps.delete(message.sequence);
    const reconciliationProof = message.kind === 'baseline.complete' || (message.kind === 'checkpoint' && payload.pending_messages === 0 && payload.pending_operations === 0);
    if (stream.gapBlocked && !reconciliationProof) stream.reconciledScopes.delete(message.scope_id);
    if (reconciliationProof) reconcileScope(scope, stream);
    outputs.push(result());
  }
  return { outputs, scopes: [...scopes.values()].map(scope => ({ scope_id: scope.source.scope.scope_id, open_obligations: countOpen(scope.obligations), active_holds: countOpen(scope.holds), baseline_complete: scope.baseline !== null, closed: scope.closed, blocked: scope.blocked || streams.get(scope.source.source_id).gapBlocked, disposition_authorized: false })) };
}

export function validateProtectionMetadata(schema = read(schemaPath), policy = read(policyPath), api = parse(fs.readFileSync(path.join(root, apiPath), 'utf8')), registry = read('registry/contracts.json')) {
  same([policy.protocol_version, policy.status, policy.owner, policy.production_enabled, policy.runtime_demonstrated], [1,'candidate','catalog-pricing',false,false], 'R2_SCOPE');
  same(policy.transport.audience, 'catalog-pricing.history-protection', 'R2_AUTHORITY');
  same(policy.limits, { message_bytes:131072, baseline_page_entries:100, scope_references:null, deadline_ms:10000, total_reference_quota:null }, 'R2_LIMITS');
  same(policy.authority.binding, ['organization_id','source_id','caller','source_contract_id','source_contract_version','scope_id','inventory_revision'], 'R2_AUTHORITY');
  assert(policy.semantics.idempotency.includes('before-replay') && policy.semantics.idempotency.includes('outlive-inbox-TTL'), 'R2_REPLAY');
  assert(policy.semantics.baseline.includes('unless-explicit-release'), 'R2_ABSENCE');
  assert(policy.semantics.ordering.includes('unknown-gap-blocks-entire-source') && policy.semantics.checkpoint.includes('every-scope-reconciles'), 'R2_SOURCE_GAP');
  assert(policy.semantics.baseline.includes('completed-bindings-retained-for-protection-lifecycle') && policy.semantics.baseline.includes('later-snapshot-requires-new-id'), 'R2_BASELINE_BINDING');
  assert(policy.semantics.holds.includes('explicit-authorized-release'), 'R2_HOLD');
  assert(policy.semantics.closure.includes('does-not-end-obligations-or-holds'), 'R2_CLOSURE');
  assert(policy.prerequisites.includes('complete-field-classification-H'), 'R2_PREREQUISITES');
  const fields = [];
  for (const [name, definition] of Object.entries(schema.$defs)) for (const [property, value] of Object.entries(definition.properties ?? {})) {
    const pointer = '/$defs/' + name + '/properties/' + property;
    fields.push(pointer);
    same(value['x-data-classification'], 'RESTRICTED', 'R2_CLASSIFICATION');
    same(value['x-log-policy'], 'no-values', 'R2_CLASSIFICATION');
    const row = policy.field_inventory.find(row => row.path === pointer);
    assert(row && row.owner === policy.owner && row.sensitivity === 'RESTRICTED' && row.log_policy === 'no-values', 'R2_CLASSIFICATION');
  }
  same(policy.field_inventory.map(row => row.path).sort(), fields.sort(), 'R2_FIELD_COVERAGE');
  const operation = api.paths[policy.transport.path].post;
  same(Object.keys(api.paths), [policy.transport.path], 'R2_PRIVATE_SURFACE');
  same(operation.operationId, policy.transport.operation_id, 'R2_PRIVATE_SURFACE');
  same(api.security, [{sourceWorkloadBearer:[]}], 'R2_AUTHORITY');
  same(operation['x-workload'].audience, policy.transport.audience, 'R2_AUTHORITY');
  const old = read('common/errors/v6/error-catalog-v6.json'), current = read('common/errors/v7/error-catalog-v7.json');
  same(current.version, 7, 'R2_ERROR_VERSION');
  same(current.errors.slice(0, old.errors.length), old.errors, 'R2_ERROR_PRESERVATION');
  same(new Set(current.errors.map(row => row.code)).size, current.errors.length, 'R2_ERROR_DUPLICATE');
  same(schema.$defs.Problem.allOf[1].properties.code.enum, policy.errors, 'R2_ERRORS');
  const documented = [];
  for (const [status, response] of Object.entries(operation.responses)) {
    assert(response.headers['Cache-Control'], 'R2_NOSTORE');
    if (status === '200') continue;
    const overlay = response.content['application/problem+json'].schema.allOf[1];
    same(overlay.properties.status.const, Number(status), 'R2_ERROR_STATUS');
    for (const code of overlay.properties.code.enum) {
      const entry = current.errors.find(row => row.code === code);
      assert(entry?.statuses.includes(Number(status)), 'R2_ERROR_STATUS');
      documented.push(code);
    }
  }
  same([...new Set(documented)].sort(), [...policy.errors].sort(), 'R2_ERROR_COVERAGE');
  validateHistoryRegistry(registry);
  return { fields: fields.length, codes: policy.errors.length, runtime_demonstrated:false };
}

export function prepareProtection(output, selfTest = false) {
  const metadata = validateProtectionMetadata(), vectors = read(vectorsPath), schema = read(schemaPath);
  same([vectors.scope, vectors.runtime_demonstrated], ['F1-08E',false], 'R2_VECTOR_SCOPE');
  const ids = [...vectors.traces, ...vectors.structural].map(row => row.id);
  same(new Set(ids).size, ids.length, 'R2_CASE_DUPLICATE');
  for (const trace of vectors.traces) {
    const evaluated = evaluateTrace(trace);
    same(evaluated.outputs, trace.expected_outputs, 'R2_TRACE:' + trace.id);
    same(evaluated.scopes, trace.expected_scopes, 'R2_FINAL_STATE:' + trace.id);
  }
  const common = read('common/http/shared/v3/problem-details-v3.schema.json');
  delete common.$id; delete common.$schema;
  const defs = structuredClone(schema.$defs);
  defs.Problem.allOf[0] = common;
  const structural = [...vectors.structural];
  // Every actual message, inventory and outcome travels through a real schema engine.
  for (const trace of vectors.traces) {
    structural.push({id:trace.id+'-inventory',definition:'Inventory',expected:'accept',value:trace.inventory});
    trace.messages.forEach((value,i) => structural.push({id:trace.id+'-message-'+i,definition:'Message',expected:'accept',value}));
  }
  if (selfTest) assert(structural.some(row => row.expected === 'accept') && structural.some(row => row.expected === 'reject'), 'R2_SCHEMA_COVERAGE');
  if (output) {
    fs.mkdirSync(output, { recursive:true });
    assert(fs.readdirSync(output).length === 0, 'R2_OUTPUT_NOT_EMPTY');
    const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value,null,2)+'\n', {flag:'wx'});
    for (const definition of new Set(structural.map(row => row.definition))) write(definition+'.schema.json', {$schema:schema.$schema,$defs:defs,$ref:'#/$defs/'+definition});
    for (const row of structural) {
      assert(/^[a-z0-9-]+$/.test(row.id) && Object.hasOwn(defs,row.definition), 'R2_CASE_PATH');
      assert(['accept','reject'].includes(row.expected), 'R2_CASE_EXPECTED');
      write(row.id+'.json',row.value);
    }
    fs.writeFileSync(path.join(output,'cases.tsv'),structural.map(row=>[row.id,row.expected,row.definition+'.schema.json',row.id+'.json'].join('\t')).join('\n')+'\n',{flag:'wx'});
  }
  return {...metadata,traces:vectors.traces.length,schema_cases:structural.length};
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  assert(args.length >= 1 && args.length <= 2 && (!args[1] || args[1] === '--self-test'), 'usage: validate-history-protection-v1.mjs <empty-output> [--self-test]');
  console.log('F1-08E contract gate passed: '+JSON.stringify(prepareProtection(path.resolve(args[0]),args[1] === '--self-test')));
}
