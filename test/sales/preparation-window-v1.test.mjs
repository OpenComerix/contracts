import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { contracts, evaluateScenario, verifyDocuments, verifyMetadata, verifyScenarios } from '../../scripts/sales/preparation-window-v1.mjs';
import { includePreparationWindowPaths, projectPreparationWindowDocument, projectPreparationWindowFile } from '../../scripts/sales/preparation-window-history-v1.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url));

test('ID-04 preserves wire, ownership, authentication and unrelated Sales policy', () => {
  verifyDocuments();
});

test('ID-04 rejects a changed audience on a successor', () => {
  const file = contracts[0].path;
  const api = JSON.parse(read(file));
  Object.values(api.paths)[0].post['x-audience'] = 'sales-pos.process-authority';
  assert.throws(() => verifyDocuments(name => name === file ? Buffer.from(JSON.stringify(api)) : read(name)), /ID04_WIRE/);
});

test('ID-04 metadata preserves existing roots, indexes and consumer pins', () => {
  verifyMetadata();
});

test('ID-04 rejects removal of an unrelated intent', () => {
  const file = 'registry/contracts.json';
  const registry = JSON.parse(read(file));
  registry.planned.shift();
  assert.throws(() => verifyMetadata(name => name === file ? Buffer.from(JSON.stringify(registry)) : read(name)), /ID04_REGISTRY_PRESERVATION/);
});

test('ID-04 models the bounded reads and fresh final decision', () => {
  assert.deepEqual(verifyScenarios(), [
    'new-sale', 'accepted-replay', 'entry-unavailable-for-new-sale', 'entry-unavailable-for-replay',
    'entry-at-zero-for-new-sale', 'entry-at-zero-for-replay',
    'entry-denied-before-replay', 'replay-response-before-entry-decision',
    'entry-expires-before-replay-response', 'revoked-during-read', 'final-unavailable',
    'final-sent-before-read-response', 'final-received-before-send', 'commit-before-final-decision',
    'final-expires-during-lock-wait', 'read-expires-during-lock-wait',
    'callback-before-entry-decision', 'read-response-before-callback',
    'callback-exhausts-budget', 'read-wait-exhausts-budget', 'credential-expires-during-read',
    'preparation-expires-during-read', 'canceled-during-read', 'lost-preparation', 'wrong-caller',
    'wrong-audience', 'cross-tenant', 'wrong-attempt', 'wrong-owner-fingerprint', 'wrong-scope', 'changed-final-operator',
  ]);
});

test('ID-04 requires finite nonnegative times at each required stage', () => {
  const { defaults } = JSON.parse(read('sales/fixtures/preparation-window/v1/scenarios.json'));
  const shared = ['entry_received_ms', 'entry_valid_for_ms', 'credential_expires_ms'];
  const readTimes = ['callback_ms', 'read_response_ms', 'preparation_expires_ms'];
  const finalTimes = ['final_sent_ms', 'final_received_ms', 'final_valid_for_ms', 'commit_ms'];
  for (const [replay, fields, expectedRead] of [
    [true, [...shared, 'replay_response_ms'], false],
    [false, [...shared, ...readTimes], false],
    [false, finalTimes, true],
  ]) {
    for (const field of fields) {
      for (const value of [null, undefined, String(defaults[field]), NaN, Infinity, -1]) {
        const scenario = { ...defaults, replay, [field]: value };
        assert.deepEqual(evaluateScenario(scenario), { read: expectedRead, outcome: 'rejected' }, `${field}: ${String(value)}`);
      }
    }
  }
});

test('ID-04 optional timing bounds distinguish absence from an invalid value', () => {
  const { defaults } = JSON.parse(read('sales/fixtures/preparation-window/v1/scenarios.json'));
  assert.deepEqual(evaluateScenario({ ...defaults, revoked_ms: null, canceled_ms: null }), { read: true, outcome: 'accepted' });
  for (const field of ['revoked_ms', 'canceled_ms']) {
    assert.deepEqual(evaluateScenario({ ...defaults, [field]: '3000' }), { read: false, outcome: 'rejected' }, field);
    assert.deepEqual(evaluateScenario({ ...defaults, [field]: 0 }), { read: false, outcome: 'rejected' }, field);
  }
});

test('ID-04 historical view projects only exact supplied metadata', () => {
  const file = 'inventory/index.json';
  const value = JSON.parse(read(file));
  const previous = projectPreparationWindowDocument(file, value);
  const successor = 'inventory.sale-context.http.v2';
  assert.notEqual(value.planned.includes(successor), value.contracts.includes(successor));
  assert.deepEqual(previous.planned, value.planned.filter(id => id !== successor));
  assert.deepEqual(previous.contracts, value.contracts.filter(id => id !== successor));
  const changed = { ...value, planned: [...value.planned, 'inventory.foreign.intent'] };
  assert.equal(projectPreparationWindowDocument(file, changed), changed);
  const bytes = Buffer.concat([read(file), Buffer.from(' ')]);
  assert.equal(projectPreparationWindowFile(file, bytes), bytes);
});

test('ID-04 rejects a UTF-8 BOM while keeping line ending normalization', () => {
  const file = 'inventory/index.json';
  const bytes = read(file);
  const crlf = Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
  assert.deepEqual(projectPreparationWindowFile(file, crlf), projectPreparationWindowFile(file, bytes));
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]);
  assert.equal(projectPreparationWindowFile(file, withBom), withBom);
  assert.throws(() => includePreparationWindowPaths(new Set(), read('registry/contracts.json'), name =>
    name === file ? withBom : read(name)), /ID04_SOURCE_SCOPE:inventory\/index\.json/);
});

test('ID-04 scope reads each changed input once and rejects drift on the next invocation', () => {
  const registry = read('registry/contracts.json');
  const counts = new Map();
  const allows = new Set();
  includePreparationWindowPaths(allows, registry, file => {
    counts.set(file, (counts.get(file) ?? 0) + 1);
    return read(file);
  });
  assert.equal(allows.size, counts.size + 1);
  assert.deepEqual([...new Set(counts.values())], [1]);
  assert(allows.has(contracts[0].path));
  const wrong = contracts[0].path;
  assert.throws(() => includePreparationWindowPaths(new Set(), registry, file =>
    file === wrong ? Buffer.concat([read(file), Buffer.from(' ')]) : read(file)), /ID04_SOURCE_SCOPE/);
});
