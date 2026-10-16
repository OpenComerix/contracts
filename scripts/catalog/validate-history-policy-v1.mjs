import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = path.resolve(import.meta.dirname, '../..');
export const policyPath = 'catalog/http/shared/v1/catalog-history-policy-v1.json';
export const schemaPath = 'common/http/shared/v1/data-lifecycle-policy-v1.schema.json';
export const vectorsPath = 'catalog/fixtures/history-policy/v1/history-policy-v1-vectors.json';
export const read = file => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(root, file))));
const equal = (actual, expected, reason) => assert.deepEqual(actual, expected, reason);
const sorted = values => [...values].sort();
const storageIds = ['original-history', 'history-index', 'references-holds-closures', 'recovery-metadata', 'disposed-ranges-coverage', 'temporary-files'];
const inheritedMetadata = ['event_type', 'path', 'owner', 'sensitivity', 'categories', 'purpose', 'base', 'consumers', 'access', 'log_policy', 'encryption', 'export_correction', 'third_parties_regions'];
let sourceContext;

// Verify actual immutable Git bytes and the local source; a checkout HEAD is not admission.
export function loadSourceContext() {
  const registry = read('registry/contracts.json');
  const descriptor = registry.contracts.find(row => row.id === 'catalog.event-policy.v1');
  assert(descriptor && descriptor.status === 'active', 'H_SOURCE_ADMISSION');
  const bytes = execFileSync('git', ['show', descriptor.commit + ':' + descriptor.path], { cwd: root, maxBuffer: 2 * 1024 * 1024 });
  equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256, 'H_SOURCE_PROVENANCE');
  const local = fs.readFileSync(path.join(root, descriptor.path), 'utf8').replaceAll('\r\n', '\n');
  equal(local, bytes.toString('utf8'), 'H_PUBLISHED_SOURCE_CHANGED');
  return { descriptor, policy: JSON.parse(bytes.toString('utf8')) };
}

// Domain-specific assertions about catalogue METADATA, never an eligibility or purge engine.
// Sourcemeta validates all instance structure separately, including structural negatives.
export function validateHistoryPolicy(policy, context = sourceContext ??= loadSourceContext()) {
  equal([policy.format_version, policy.status, policy.catalogue_id, policy.version, policy.owner, policy.runtime_demonstrated], [1, 'candidate', 'catalog.history', 1, 'catalog-pricing', false], 'H_SCOPE');
  equal(policy.profiles.length, 1, 'H_PROFILE');
  const profile = policy.profiles[0];
  equal([profile.id, profile.version, profile.jurisdiction, profile.legal_period], ['CATALOG_HISTORY_AR', 1, 'AR', false], 'H_PROFILE');
  equal(profile.periods, { unit: 'calendar-years', minimum: 1, default: 2, maximum: 5 }, 'H_RANGE');
  const trigger = 'latest-of-definitive-retirement-references-closed-obligations-ended';
  equal(profile.clock.start_event, trigger, 'H_CLOCK');
  equal(profile.clock.calculation, 'calendar-arithmetic-by-applicable-jurisdiction; never-fixed-seconds', 'H_CLOCK');
  equal(profile.clock.unknown_start, 'block-and-alert; never-invent-date-or-indefinite-default', 'H_UNKNOWN_TRIGGER');
  equal(profile.clock.active_purpose_blocks, true, 'H_ACTIVE_PURPOSE');
  equal(profile.guards.holds_block, true, 'H_HOLD');
  equal(profile.guards.inherited_obligations_prevail, true, 'H_OBLIGATION');
  equal(profile.guards.unknown_obligations_block, true, 'H_OBLIGATION');
  equal(profile.guards.unknown_sources_block, true, 'H_SOURCE_CLOSURE');
  equal(profile.guards.privacy_conflict, 'explicit-resolution; no-automatic-purge', 'H_PRIVACY');
  equal(profile.configuration.reduction, 'eligibility-only; never-immediate-delete', 'H_REDUCTION');
  equal(profile.configuration, { tenant_configurable: true, authorization: 'specific-permission-purpose-and-audit; permission-contract-pending', reduction: 'eligibility-only; never-immediate-delete', plan_dependent: false, onboarding_step: false }, 'H_CONFIGURATION');
  equal(profile.disposition, 'controlled-purge-of-original-and-authorized-copies; preserve-required-evidence', 'H_DISPOSITION');

  equal(policy.field_sources.length, 1, 'H_FIELD_SOURCE');
  const source = policy.field_sources[0], descriptor = context.descriptor;
  equal(source.id, 'catalog-event-fields-v1', 'H_FIELD_SOURCE');
  for (const key of ['path', 'commit', 'sha256']) equal(source[key], descriptor[key], 'H_SOURCE_PIN');
  equal(source.contract_id, descriptor.id, 'H_SOURCE_PIN');
  equal(source.pointer, '/field_inventory', 'H_FIELD_SELECTION');
  equal(sorted(source.inherited_metadata), sorted(inheritedMetadata), 'H_FIELD_METADATA');
  equal(source.transport_profile_applies_to_history, false, 'H_TRANSPORT_TTL');
  equal(source.runtime_access_requires_separate_authority, true, 'H_AUTHORITY_PENDING');
  equal([source.history_profile_id, source.history_profile_version], [profile.id, profile.version], 'H_FIELD_PROFILE');
  const fields = context.policy.field_inventory;
  assert(fields.length > 0, 'H_FIELD_COVERAGE');
  equal(new Set(fields.map(field => field.event_type + ':' + field.path)).size, fields.length, 'H_FIELD_COVERAGE');
  for (const field of fields) {
    // All original metadata survives. Only transport/history retention annotations are replaced.
    equal(sorted(Object.keys(field).filter(key => !['retention_profile', 'history_retention'].includes(key))), sorted(source.inherited_metadata), 'H_FIELD_METADATA');
    equal(field.owner, policy.owner, 'H_FIELD_OWNER');
    equal(field.log_policy, 'no-values', 'H_FIELD_LOG');
  }

  equal(sorted(policy.storage_policies.map(storage => storage.id)), sorted(storageIds), 'H_STORAGE_COVERAGE');
  const storages = Object.fromEntries(policy.storage_policies.map(storage => [storage.id, storage]));
  for (const storage of policy.storage_policies) {
    equal([storage.owner, storage.policy_version, storage.production_enabled], [policy.owner, 1, false], 'H_STORAGE_SCOPE');
    const personal = ['references-holds-closures', 'recovery-metadata'].includes(storage.id);
    const categories = {
      'original-history': ['COMMERCIAL', 'FISCAL', 'OPERATIONAL'],
      'history-index': ['COMMERCIAL', 'FISCAL', 'OPERATIONAL'],
      'references-holds-closures': ['AUDIT', 'OPERATIONAL', 'PERSONAL'],
      'recovery-metadata': ['OPERATIONAL', 'AUTHENTICATION', 'PERSONAL'],
      'disposed-ranges-coverage': ['OPERATIONAL', 'AUDIT'],
      'temporary-files': ['COMMERCIAL', 'FISCAL', 'OPERATIONAL'],
    }[storage.id];
    equal(storage.classification.sensitivity, 'RESTRICTED', 'H_CLASSIFICATION');
    equal(sorted(storage.classification.categories), sorted(categories), 'H_CLASSIFICATION');
    equal(storage.classification.personal_data, personal ? 'possible-indirect' : 'absent', 'H_CLASSIFICATION');
    equal(storage.classification.log_policy, 'no-payloads-field-values-grants-or-cursors', 'H_PRIVACY');
    equal(storage.classification.encryption, 'TLS-and-encrypted-at-rest', 'H_PRIVACY');
    equal(storage.classification.third_parties_regions, 'none-authorized', 'H_PRIVACY');
    equal(storage.copies, 'same-source-lifecycle; no-unclassified-derived-copy', 'H_COPY_LIFECYCLE');
    equal(storage.evidence, ['policy-version-scope-cut-authority-counts-result', 'no-deleted-values-or-snapshots', 'independent-audit-policy-preserved'], 'H_MINIMAL_EVIDENCE');
    equal(storage.alerts, ['unknown-trigger-obligation-hold-or-source', 'disposal-overdue-partial-or-derived-copy-unreconciled'], 'H_ALERTS');
    equal(storage.disposition, 'controlled-purge-after-evaluation-and-required-authorization; no-anonymized-original-recovery', 'H_DISPOSITION');
    for (const dependency of storage.dependencies) assert(storages[dependency] && dependency !== storage.id, 'H_STORAGE_DEPENDENCY');
    const state = storage.id === 'original-history' ? 'inherited' : storage.id === 'temporary-files' ? 'prohibited' : 'pending-protocol';
    equal(storage.field_catalogue.state, state, 'H_FIELDS_PENDING');
    equal(storage.field_catalogue.source_id, state === 'inherited' ? source.id : null, 'H_FIELDS_PENDING');
    if (state === 'pending-protocol') assert(storage.field_catalogue.pending.length > 0, 'H_FIELDS_PENDING');
  }
  const original = storages['original-history'], index = storages['history-index'];
  equal(original.retention.mode, 'profile', 'H_HISTORY_RETENTION');
  equal(original.retention.start_event, trigger, 'H_HISTORY_RETENTION');
  equal(original.retention.while_required, 'active-purpose-or-unknown-trigger-blocks-and-alerts', 'H_HISTORY_RETENTION');
  for (const storage of [original, index, storages['disposed-ranges-coverage']]) {
    equal([storage.retention.profile_id, storage.retention.profile_version, storage.retention.periods], [profile.id, profile.version, null], 'H_HISTORY_RETENTION');
  }
  equal(index.dependencies, ['original-history'], 'H_INDEX_LIFECYCLE');
  equal(index.retention, { ...original.retention, mode: 'dependent', while_required: 'exactly-same-lifecycle-as-original-history; never-transport-TTL' }, 'H_INDEX_LIFECYCLE');
  const references = storages['references-holds-closures'];
  equal(references.retention.mode, 'dependent', 'H_REFERENCE_LIFECYCLE');
  equal(references.dependencies, ['original-history'], 'H_REFERENCE_LIFECYCLE');
  equal(references.retention.while_required, 'retain-while-protecting-source; explicit-owner-baselines-checkpoints-and-final-closures-required', 'H_REFERENCE_LIFECYCLE');
  equal(references.retention.after_disposition, 'minimal-evidence-under-PURGE_EVIDENCE_CRITICAL; no-deleted-snapshot', 'H_MINIMAL_EVIDENCE');
  const recovery = storages['recovery-metadata'].retention;
  equal([recovery.mode, recovery.start_event, recovery.periods, recovery.profile_id, recovery.profile_version], ['fixed', 'session-closed-or-expired', { unit: 'hours', minimum: 24, default: 24, maximum: 24 }, null, null], 'H_METADATA_TTL');
  equal(recovery.while_required, 'minimal-binding-metadata-only; no-payload-or-credential-copy', 'H_PRIVACY');
  equal(recovery.after_disposition, 'purge-metadata; independent-audit-preserved', 'H_METADATA_TTL');
  const coverage = storages['disposed-ranges-coverage'].retention;
  equal([coverage.mode, coverage.start_event, coverage.while_required, coverage.after_disposition], ['dependent', 'later-facts-and-supported-checkpoints-cycle-closed', 'retain-while-later-facts-or-supported-checkpoints-need-coverage', 'operational-metadata-follows-history-profile; critical-evidence-follows-ADR-016'], 'H_COVERAGE_LIFECYCLE');
  const files = storages['temporary-files'].retention;
  equal([files.mode, files.start_event, files.profile_id, files.profile_version, files.periods], ['prohibited', 'not-enabled', null, null, null], 'H_FILES_DISABLED');
  equal(files.while_required, 'no-temporary-files-in-first-recovery-contract', 'H_FILES_DISABLED');
  equal(files.after_disposition, 'require-separate-profile-encryption-recipient-expiry-before-enabling', 'H_FILES_DISABLED');
  for (const storage of [original, index, references, storages['disposed-ranges-coverage']]) {
    equal(storage.retention.evidence_profile, 'PURGE_EVIDENCE_CRITICAL', 'H_EVIDENCE_PROFILE');
    equal(storage.retention.evidence_source, 'ADR-016 section 5; existing profile, not newly admitted by F1-08C', 'H_EVIDENCE_PROFILE');
  }
  assert(policy.independent_policies.some(rule => rule.includes('audit: independent ADR-015/016')), 'H_INDEPENDENT_AUDIT');
  for (const requirement of ['R2 ', 'R3 ', 'R4 ', 'owner runtime SQL', 'reviewed-published-contract-admission']) assert(policy.production_prerequisites.some(rule => rule.startsWith(requirement)), 'H_PREREQUISITES');
  return { fields: fields.length, storages: storageIds.length, runtime_demonstrated: false };
}

export function applyPatches(base, patches) {
  const value = structuredClone(base);
  for (const patch of patches) {
    assert(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(patch.path), 'H_PATCH_POINTER');
    const keys = patch.path.slice(1).split('/').map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    assert(!keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key)), 'H_PATCH_KEY');
    const final = keys.pop();
    const parent = keys.reduce((current, key) => { assert(current && Object.hasOwn(current, key), 'H_PATCH_PARENT'); return current[key]; }, value);
    assert(parent && typeof parent === 'object', 'H_PATCH_PARENT');
    if (patch.op === 'remove') {
      assert(Object.hasOwn(parent, final), 'H_PATCH_TARGET');
      if (Array.isArray(parent)) parent.splice(Number(final), 1);
      else delete parent[final];
    } else {
      equal(patch.op, 'set', 'H_PATCH_OP');
      parent[final] = structuredClone(patch.value);
    }
  }
  return value;
}

export function prepareHistoryPolicy(output, selfTest = false) {
  const policy = read(policyPath), schema = read(schemaPath), vectors = read(vectorsPath);
  const result = validateHistoryPolicy(policy);
  equal([vectors.format_version, vectors.scope, vectors.base, vectors.runtime_demonstrated], [1, 'F1-08C', policyPath, false], 'H_VECTOR_SCOPE');
  equal(fs.readdirSync(path.join(root, path.dirname(vectorsPath))).sort(), [path.basename(vectorsPath)], 'H_FIXTURE_COVERAGE');
  equal(new Set(vectors.cases.map(row => row.id)).size, vectors.cases.length, 'H_VECTOR_DUPLICATE');
  const structural = [], reasons = new Set();
  for (const row of vectors.cases) {
    assert(/^[a-z0-9-]+$/.test(row.id), 'H_CASE_ID');
    const value = applyPatches(policy, row.patches);
    if (row.kind === 'semantic') {
      equal(row.expected, 'reject', 'H_SEMANTIC_CLASSIFICATION');
      assert(/^H_[A-Z_]+$/.test(row.reason), 'H_SEMANTIC_REASON');
      assert.throws(() => validateHistoryPolicy(value), error => error instanceof assert.AssertionError && error.message.includes(row.reason), 'H_NEGATIVE_REASON:' + row.id);
      reasons.add(row.reason);
    } else {
      equal(row.kind, 'schema', 'H_CASE_KIND');
      assert(['accept', 'reject'].includes(row.expected), 'H_CASE_EXPECTED');
      structural.push({ ...row, value });
    }
  }
  for (const reason of ['H_RANGE', 'H_CLOCK', 'H_UNKNOWN_TRIGGER', 'H_ACTIVE_PURPOSE', 'H_HOLD', 'H_OBLIGATION', 'H_SOURCE_CLOSURE', 'H_PRIVACY', 'H_REDUCTION', 'H_CONFIGURATION', 'H_TRANSPORT_TTL', 'H_SOURCE_PIN', 'H_FIELD_METADATA', 'H_FIELD_SELECTION', 'H_STORAGE_COVERAGE', 'H_INDEX_LIFECYCLE', 'H_METADATA_TTL', 'H_MINIMAL_EVIDENCE', 'H_CLASSIFICATION', 'H_FILES_DISABLED']) assert(reasons.has(reason), 'H_NEGATIVE_COVERAGE:' + reason);
  assert(structural.some(row => row.expected === 'accept') && structural.some(row => row.expected === 'reject'), 'H_SCHEMA_COVERAGE');
  if (selfTest) {
    assert.throws(() => applyPatches(policy, [{ op: 'remove', path: '/missing' }]), /H_PATCH_TARGET/);
    assert.throws(() => applyPatches(policy, [{ op: 'set', path: '/__proto__/x', value: 1 }]), /H_PATCH_KEY/);
  }
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    assert(fs.readdirSync(output).length === 0, 'H_OUTPUT_NOT_EMPTY');
    fs.writeFileSync(path.join(output, 'policy.schema.json'), JSON.stringify(schema, null, 2) + '\n', { flag: 'wx' });
    for (const row of structural) fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(row.value, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(output, 'cases.tsv'), structural.map(row => [row.id, row.expected, 'policy.schema.json', row.id + '.json'].join('\t')).join('\n') + '\n', { flag: 'wx' });
  }
  return { ...result, schema_cases: structural.length, semantic_negatives: vectors.cases.length - structural.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), positional = args.filter(arg => !arg.startsWith('--'));
  assert(args.every(arg => !arg.startsWith('--') || arg === '--self-test'), 'H_UNKNOWN_OPTION');
  equal(positional.length, 1, 'usage: node scripts/catalog/validate-history-policy-v1.mjs <new-output-directory> [--self-test]');
  console.log('F1-08C policy contract gate passed: ' + JSON.stringify(prepareHistoryPolicy(path.resolve(positional[0]), args.includes('--self-test'))));
}
