import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { projectPreparationWindowConsumerFile } from './preparation-window-consumer-exports.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const base = 'b0c742ca4cebdf70afffd2bf8b6dbb485c059186';
const read = file => readFileSync(path.join(root, file));
const json = (reader, file) => JSON.parse(reader(file));
const policyPath = 'sales/http/shared/v3/sales-protocol-policy-v3.json';
const fixturesPath = 'sales/fixtures/preparation-window/v1/scenarios.json';
const registryPath = 'registry/contracts.json';

export const contracts = [
  ['sales', 'sales-pos', 'sales-catalog-capture-authority', 2, 'authorizeSaleCatalogCapture', 'sales.catalog-capture-authority.http.v3'],
  ['sales', 'sales-pos', 'sales-context-check-authority', 1, 'authorizeSaleContextCheck', 'sales.context-check-authority.http.v2'],
  ['catalog', 'catalog-pricing', 'catalog-sale-capture', 1, 'captureSaleCatalog', 'catalog.sale-capture.http.v2'],
  ['inventory', 'inventory', 'inventory-sale-context', 1, 'checkInventorySaleContext', 'inventory.sale-context.http.v2'],
  ['finance', 'finance', 'finance-sale-context', 1, 'checkFinanceSaleContext', 'finance.sale-context.http.v2'],
].map(([domain, owner, name, previousMajor, operationId, id]) => {
  const file = major => `${domain}/http/private/v${major}/${name}-v${major}.yaml`;
  return {
    id, domain, owner, path: file(previousMajor + 1), previous: file(previousMajor),
    version: `${previousMajor + 1}.0.0`, operations: [operationId],
  };
});

const roots = [
  ...contracts.map(({ previous, ...entry }) => entry),
  { id: 'sales.protocol-policy.v3', domain: 'sales', owner: 'sales-pos', path: policyPath, version: 'v3', operations: [] },
  { id: 'sales.preparation-window.fixtures.v1', domain: 'sales', owner: 'sales-pos', path: fixturesPath, version: 'v1', operations: [] },
];

function operation(api) {
  assert.equal(Object.keys(api.paths).length, 1);
  const [endpoint] = Object.values(api.paths);
  assert.deepEqual(Object.keys(endpoint), ['post']);
  return endpoint.post;
}

function transport(api) {
  const wire = structuredClone(api);
  delete wire.info.version;
  delete wire.info.title;
  delete wire.info.description;
  delete wire['x-policy'];
  delete operation(wire).description;
  return wire;
}

export function verifyDocuments(current = read) {
  const policy = json(current, policyPath);
  const previousPolicy = json(current, 'sales/http/shared/v2/sales-protocol-policy-v2.json');
  assert.equal(policy.policy_version, 3);
  assert.deepEqual({ ...policy, policy_version: 2, identity: previousPolicy.identity }, previousPolicy, 'ID04_POLICY_DELTA');
  for (const phrase of [
    'finalizeOnlineSale only', 'before looking up or returning an accepted replay',
    'at most 2000 ms', 'before the Identity call', 'private Sales request RAM',
    'A revocation during this window can allow a bound read to complete.',
    'second fresh Identity decision', 'final decision must bind the original human request',
    'before commit', 'outside SQL locks',
    'Resume preserves intention/steps/commands',
  ]) assert(policy.identity.includes(phrase), `ID04_POLICY_GUARANTEE:${phrase}`);

  for (const entry of contracts) {
    const next = json(current, entry.path);
    const previous = json(current, entry.previous);
    assert.equal(next.info.version, entry.version, entry.path);
    assert.equal(operation(next).operationId, entry.operations[0], entry.path);
    assert.equal(path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), next['x-policy'])), policyPath);
    assert.deepEqual(transport(next), transport(previous), `ID04_WIRE:${entry.path}`);
    const description = operation(next).description;
    assert(description.includes('cohort'), `ID04_COHORT:${entry.path}`);
    assert(!/revalidate the original human delegate with Identity|rechecked with Identity on each callback/.test(description));
    const phrases = entry.domain === 'sales'
      ? ['before preparation lookup', 'at most 2000 ms', 'Network and waits consume the same budget',
        'second fresh Identity decision', 'final decision must bind the original human request']
      : ['before the owner read', 'remaining entry budget returned by Sales', 'before returning the result'];
    for (const phrase of phrases) assert(description.includes(phrase), `ID04_AUTHORITY:${entry.path}:${phrase}`);
  }
}

export function verifyMetadata(current = read) {
  const original = createGitReader()(root, base);
  const baseline = json(original, registryPath);
  const currentRegistry = json(current, registryPath);
  const ids = new Set(roots.map(entry => entry.id));
  const planned = currentRegistry.planned.filter(entry => ids.has(entry.id));
  const admitted = currentRegistry.contracts.filter(entry => ids.has(entry.id));
  assert(planned.length === roots.length || admitted.length === roots.length, 'ID04_ROOT_INVENTORY');
  assert.equal(planned.length + admitted.length, roots.length, 'ID04_PARTIAL_ADMISSION');
  for (const expected of roots) {
    const actual = [...planned, ...admitted].find(entry => entry.id === expected.id);
    assert(actual);
    for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `ID04_ROOT:${expected.id}:${key}`);
    assert.equal(actual.status, planned.length ? 'planned' : 'active');
    if (planned.length) assert.equal(actual.materializeIn, 'ID-04');
  }
  assert.deepEqual({
    ...currentRegistry,
    contracts: currentRegistry.contracts.filter(entry => !ids.has(entry.id)),
    planned: currentRegistry.planned.filter(entry => !ids.has(entry.id)),
  }, baseline, 'ID04_REGISTRY_PRESERVATION');
  for (const domain of new Set(roots.map(entry => entry.domain))) {
    assert.deepEqual(json(current, `${domain}/index.json`), domainIndex(currentRegistry, domain), `ID04_INDEX:${domain}`);
  }
  for (const file of ['index', ...baseline.requiredConsumers].map(name => `registry/consumers/${name}.json`)) {
    assert(projectPreparationWindowConsumerFile(file, current(file)).equals(original(file)), `ID04_CONSUMER_PRESERVATION:${file}`);
  }
}

const validTimes = (...times) => times.every(time => Number.isFinite(time) && time >= 0);

// Evaluate synthetic contract cases. These offsets are relative to the entry send,
// and the result only describes eligibility under the contract.
export function evaluateScenario(input) {
  if (!validTimes(input.entry_received_ms, input.entry_valid_for_ms, input.credential_expires_ms) ||
      (input.revoked_ms != null && !validTimes(input.revoked_ms))) {
    return { read: false, outcome: 'rejected' };
  }
  const limit = Math.min(2000, input.entry_valid_for_ms, input.credential_expires_ms);
  const revocation = input.revoked_ms ?? Infinity;
  if (input.entry_received_ms >= limit || input.entry_received_ms >= revocation) {
    return { read: false, outcome: 'rejected' };
  }
  if (input.replay) {
    const replayed = validTimes(input.replay_response_ms) &&
      input.entry_received_ms <= input.replay_response_ms && input.replay_response_ms < limit;
    return { read: false, outcome: replayed ? 'replayed' : 'rejected' };
  }

  if (!validTimes(input.callback_ms, input.read_response_ms, input.preparation_expires_ms) ||
      (input.canceled_ms != null && !validTimes(input.canceled_ms))) {
    return { read: false, outcome: 'rejected' };
  }
  const readLimit = Math.min(limit, input.preparation_expires_ms, input.canceled_ms ?? Infinity);
  const read = input.same_instance !== false && !input.mismatch &&
    input.entry_received_ms <= input.callback_ms && input.callback_ms <= input.read_response_ms &&
    input.read_response_ms < readLimit;
  const accepted = read && input.same_final_operator !== false &&
    validTimes(input.final_sent_ms, input.final_received_ms, input.final_valid_for_ms, input.commit_ms) &&
    input.read_response_ms <= input.final_sent_ms && input.final_sent_ms <= input.final_received_ms &&
    input.final_received_ms <= input.commit_ms &&
    revocation > input.final_received_ms && input.commit_ms < readLimit &&
    input.commit_ms < input.final_sent_ms + Math.min(2000, input.final_valid_for_ms);
  return { read, outcome: accepted ? 'accepted' : 'rejected' };
}

export function verifyScenarios(current = read) {
  const fixtures = json(current, fixturesPath);
  assert.equal(fixtures.format_version, 1);
  assert.equal(fixtures.runtime_demonstrated, false);
  const ids = fixtures.scenarios.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const { id, changes, read, outcome } of fixtures.scenarios) {
    assert.deepEqual(evaluateScenario({ ...fixtures.defaults, ...changes }), { read, outcome }, id);
  }
  return ids;
}

function fixtureData() {
  const catalog = json(read, 'catalog/fixtures/sale-capture/v1/capture.json');
  const { inventory, finance } = json(read, 'sales/fixtures/preparation/v1/contexts.json').cases;
  const { organization_id, operation_id, preparation_id, request_hash, capture_fingerprint } = catalog.decision;
  return [
    { request: { organization_id, operation_id, preparation_id, request_hash, capture_fingerprint }, response: catalog.decision },
    { request: inventory.callback_request, response: inventory.callback_decision },
    { request: catalog.request, response: catalog.result },
    { request: inventory.request, response: inventory.result },
    { request: finance.request, response: finance.result },
  ];
}

function executeRedocly(args, offline) {
  const windows = process.platform === 'win32';
  const prefix = windows ? [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')] : [];
  const command = [...prefix, ...(offline ? ['--offline'] : []), '--yes', '@redocly/cli@2.53.3', ...args];
  const result = spawnSync(windows ? process.execPath : 'npx', command, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' },
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 && result.stdout) process.stderr.write(result.stdout);
  assert.equal(result.status, 0, `ID04_REDOC_COMMAND:${args[0]}`);
  return result.stdout;
}

function prepare(output, offline) {
  assert.match(output, /^\.ci-artifacts\/sales-v2-id04-[a-zA-Z0-9-]+$/u);
  verifyDocuments();
  verifyMetadata();
  verifyScenarios();
  mkdirSync(path.join(root, '.ci-artifacts'), { recursive: true });
  mkdirSync(path.join(root, output));
  const save = (file, data) => writeFileSync(path.join(root, output, file), data, { flag: 'wx' });
  const vectors = fixtureData();
  const schemas = [], cases = [];
  for (const [index, entry] of contracts.entries()) {
    const lint = JSON.parse(executeRedocly(['lint', entry.path, '--format', 'json'], offline));
    console.log(JSON.stringify(lint));
    assert.equal(lint.version, '2.53.3');
    assert.equal(lint.totals.errors, 0);
    assert.equal(lint.totals.warnings, 0);
    const bundleFile = `${output}/${entry.operations[0]}.bundle.json`;
    executeRedocly(['bundle', entry.path, '--dereferenced', '--ext', 'json', '--output', bundleFile], offline);
    const post = operation(json(read, bundleFile));
    const request = post.requestBody.content['application/json'].schema;
    const response = post.responses['200'].content['application/json'].schema;
    for (const [kind, schema] of Object.entries({ request, response })) {
      const stem = `${entry.operations[0]}-${kind}`;
      const filename = `${stem}.schema.json`;
      save(filename, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }));
      schemas.push(filename);
      const value = vectors[index][kind];
      const invalid = { ...value };
      delete invalid.organization_id;
      for (const [label, expected, data] of [
        ['valid', 'accept', value], ['missing-tenant', 'reject', invalid],
        ['delegate', 'reject', { ...value, delegation_jwt: 'synthetic-forbidden' }],
        ...(Object.hasOwn(value, 'valid_for_ms') ? [['excess-budget', 'reject', { ...value, valid_for_ms: 2001 }]] : []),
      ]) {
        const id = `${stem}-${label}`;
        save(`${id}.json`, JSON.stringify(data));
        cases.push([id, expected, filename, `${id}.json`].join('\t'));
      }
    }
  }
  save('schemas.txt', `${schemas.join('\n')}\n`);
  save('cases.tsv', `${cases.join('\n')}\n`);
  console.log(JSON.stringify({ output, openapis: contracts.length, schemas: schemas.length, wireFixtures: cases.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, output, option] = process.argv.slice(2);
  assert.equal(mode, 'prepare');
  assert(process.argv.length <= 5 && (option === undefined || option === '--offline'));
  prepare(output, option === '--offline');
}
