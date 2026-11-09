import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { canonical } from '../../tools/architecture/consumer-gate.mjs';
import { preparationBase, preparationRoots, preparationMetadata } from './preparation-history-v1.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import {projectPreparationAdmissionFile} from './preparation-admission-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
const source = createGitReader()(root, preparationBase);
const native = file => fs.readFileSync(path.join(root, file));
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const json = (read, file) => JSON.parse(text(read(file)));
export const contextFingerprintDefinition = 'context_fingerprint is the lowercase hexadecimal SHA-256 digest of the UTF-8 bytes of RFC 8785 JCS serialization of the complete validated Inventory or Finance sale-context-check request body received by that owner. Include all required fields and all optional fields present, including request_hash unchanged; preserve string values, omission versus null and array order. No substitutions, defaults, coercion or Unicode normalization are permitted. The input is not the callback, decision, result, raw JSON bytes, HTTP headers or credentials; context_fingerprint itself is absent from the owner request body. It is distinct from request_hash, which binds the original normalized human Sales request. Reject invalid requests, duplicate property names and invalid Unicode before hashing.';
const humanRequestHashDefinition = 'Opaque hash binding the original normalized human Sales request. Preserve unchanged as a field of the owner request when computing context_fingerprint; it is not the owner-body digest.';
// Only complete, validated owner request bodies: fixed ASCII field names,
// Unicode strings and optional safe integer versions. Not a runtime parser.
export const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
export const files = Object.freeze({
  inventory: { api: preparationRoots[0][3], schema: preparationRoots[1][3] },
  finance: { api: preparationRoots[2][3], schema: preparationRoots[3][3] },
  sales: { api: preparationRoots[4][3], schema: preparationRoots[5][3] },
  policy: preparationRoots[6][3], fixtures: preparationRoots[7][3],
});
export function verifyMetadata(read = native) {
  // The source gate retains its exact published planned-stage view. Current
  // admission is proved separately by preparation-admission-v1, never here.
  const supplied = read;
  read = file => projectPreparationAdmissionFile(file, supplied(file));
  for (const [file, expected] of preparationMetadata())
    assert.equal(text(read(file)), text(expected), 'PREPARATION_METADATA:' + file);
  const registry = json(read, 'registry/contracts.json');
  const previous = JSON.parse(source('registry/contracts.json'));
  assert.deepEqual({ ...registry, planned: previous.planned }, previous, 'PREPARATION_ADMISSION_PRESERVATION');
  for (const service of previous.requiredConsumers) {
    const file = 'registry/consumers/' + service + '.json';
    assert.equal(text(read(file)), text(source(file)), 'PREPARATION_CONSUMER_PRESERVATION:' + service);
  }
  return { planned: 8, admitted: 0, consumers: previous.requiredConsumers.length, runtime_demonstrated: false };
}
export function verifyProfiles(policy) {
  const expectedProfiles = [
    ['sales-pos.inventory-context', 'sales-pos', 'inventory.sale-context'],
    ['sales-pos.finance-context', 'sales-pos', 'finance.sale-context'],
    ['inventory.sales-context-authority', 'inventory', 'sales-pos.context-check-authority'],
    ['finance.sales-context-authority', 'finance', 'sales-pos.context-check-authority'],
  ].map(([client_id, caller, audience]) => ({ client_id, caller, audience, type: 'service', algorithm: 'ES256', maximum_seconds: 300, reuse: false }));
  assert.deepEqual(Object.keys(policy).sort(), ['policy_version', 'status', 'owner', 'runtime_demonstrated', 'production_enabled', 'extends_without_changing', 'profiles', 'issuance', 'authority'].sort());
  assert.equal(policy.policy_version, 1);
  assert.equal(policy.status, 'candidate');
  assert.equal(policy.owner, 'identity-tenancy');
  assert.equal(policy.runtime_demonstrated, false);
  assert.equal(policy.production_enabled, false);
  assert.equal(policy.extends_without_changing, 'identity/http/shared/v1/identity-sales-authority-policy-v1.json');
  assert.deepEqual(policy.profiles, expectedProfiles, 'PREPARATION_FIXED_PROFILES');
  assert.equal(policy.issuance, 'H1A HTTP Basic grant_type=client_credentials; distinct credential per fixed client_id, no audience selector, shared-secret fallback or retained-token reuse.');
  assert.equal(policy.authority, 'Service tokens authenticate caller only. Each owner requires current Sales preparation callback bound to the exact request; no delegated human material leaves Sales RAM.');
}
// These are contractual fixture relations, not runtime authority or SQL evidence.
export function verifyBinding(domain, fixture) {
  assert(['inventory', 'finance'].includes(domain));
  const { request, callback_request: query, callback_decision: decision, result } = fixture;
  for (const name of ['organization_id', 'operation_id', 'preparation_id', 'request_hash'])
    for (const row of [query, decision, result]) assert.equal(row[name], request[name], 'PREPARATION_BINDING:' + name);
  const digest = fingerprint(request);
  for (const row of [query, decision, result]) assert.equal(row.context_fingerprint, digest, 'PREPARATION_FINGERPRINT');
  assert.equal(query.target, domain);
  assert.equal(decision.target, domain);
  assert.equal(decision.caller, domain);
  assert.equal(decision.audience, 'sales-pos.context-check-authority');
  assert.equal(decision.authorized, true);
  assert.equal(result.verified, true);
  for (const name of ['branch_id', 'pos_id']) {
    assert.equal(decision[name], request[name], 'PREPARATION_SCOPE');
    assert.equal(result[name], request[name], 'PREPARATION_RESOURCE');
  }
  for (const name of domain === 'inventory' ? ['warehouse_id', 'location_id'] : ['cash_register_id', 'cash_shift_id'])
    assert.equal(result[name], request[name], 'PREPARATION_RESOURCE:' + name);
  for (const [expected, actual] of domain === 'inventory' ? [['expected_warehouse_version', 'warehouse_version']]
    : [['expected_register_version', 'register_version'], ['expected_shift_version', 'shift_version']])
    if (Object.hasOwn(request, expected)) assert.equal(result[actual], request[expected], 'PREPARATION_VERSION');
  if (domain === 'finance') {
    assert.equal(result.shift_status, 'open');
    assert.equal(result.currency, 'ARS');
    assert.equal(result.responsibility_verified, true);
  }
  assert(result.valid_for_ms > 0 && result.valid_for_ms <= decision.valid_for_ms && decision.valid_for_ms <= 2000,
    'PREPARATION_BUDGET');
}
export function verifyFingerprintVectors(fixtures) {
  const vectors = fixtures.fingerprint_vectors;
  const variants = ['complete', 'without-optionals', 'changed-optionals', 'unicode'];
  assert.deepEqual(vectors.map(row => row.id), ['inventory', 'finance'].flatMap(owner => variants.map(variant => owner + '-' + variant)), 'PREPARATION_VECTOR_INVENTORY');
  for (const row of vectors) {
    const baseline = fixtures.cases[row.owner].request;
    const variant = row.id.slice(row.owner.length + 1);
    const expected = structuredClone(baseline);
    for (const name of Object.keys(expected).filter(key => key.startsWith('expected_'))) {
      if (variant === 'without-optionals') delete expected[name];
      if (variant === 'changed-optionals') expected[name]++;
    }
    if (variant === 'unicode') expected.organization_id = row.owner === 'inventory' ? 'org-é-😀' : 'org-e\u0301-😀';
    assert.deepEqual(row.request, expected, 'PREPARATION_VECTOR_BODY:' + row.id);
    assert.equal(canonical(row.request), row.canonical_json, 'PREPARATION_VECTOR_CANONICAL:' + row.id);
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.equal(createHash('sha256').update(row.canonical_json, 'utf8').digest('hex'), row.sha256, 'PREPARATION_VECTOR_SHA256:' + row.id);
    assert.equal(fingerprint(row.request), row.sha256, 'PREPARATION_VECTOR_DIGEST:' + row.id);
    assert.notEqual(row.sha256, row.request.request_hash, 'PREPARATION_HUMAN_HASH_DISTINCT');
  }
}
export function verifyPackage(read = native) {
  verifyProfiles(json(read, files.policy));
  const errors = new Map(json(read, 'common/errors/v11/error-catalog-v11.json').errors.map(row => [row.code, row]));
  for (const domain of ['inventory', 'finance', 'sales']) {
    const api = parse(text(read(files[domain].api)));
    const endpoint = domain === 'sales' ? '/internal/sales/context-check-authorizations' : '/internal/' + domain + '/sale-context-checks';
    const operation = api.paths[endpoint]?.post;
    assert.deepEqual(Object.keys(api.paths), [endpoint]);
    assert.deepEqual(Object.keys(api.paths[endpoint]), ['post']);
    assert.equal(api.openapi, '3.1.0');
    assert.equal(api.info.version, '1.0.0');
    assert.equal(api.info.license.identifier, 'LicenseRef-Proprietary');
    assert.deepEqual(api.security, [{ workload: [] }]);
    assert.equal(api['x-status'], 'candidate');
    assert.equal(api['x-runtime-demonstrated'], false);
    assert.equal(operation.operationId, domain === 'sales' ? 'authorizeSaleContextCheck' : domain === 'inventory' ? 'checkInventorySaleContext' : 'checkFinanceSaleContext');
    assert.deepEqual(operation['x-caller'], domain === 'sales' ? ['inventory', 'finance'] : 'sales-pos');
    assert.equal(operation['x-audience'], domain === 'sales' ? 'sales-pos.context-check-authority' : domain + '.sale-context');
    assert(operation.description.includes(contextFingerprintDefinition), 'PREPARATION_FINGERPRINT_NORMATIVE:' + domain);
    assert.equal(operation.externalDocs?.url, 'https://www.rfc-editor.org/rfc/rfc8785.html#section-3', 'PREPARATION_JCS_REFERENCE');
    assert(!operation.parameters, 'PREPARATION_NO_FREE_HEADERS_OR_QUERY');
    assert(!operation.security, 'PREPARATION_NO_AUTH_OVERRIDE');
    for (const [status, response] of Object.entries(operation.responses)) {
      assert.equal(response.headers['Cache-Control'].required, true);
      assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
      if (status === '200') continue;
      const shape = response.content['application/problem+json'].schema;
      assert.equal(shape.allOf[0].$ref, '../../../../common/http/shared/v3/problem-details-v3.schema.json');
      assert.equal(shape.allOf[1].properties.status.const, Number(status));
      for (const code of shape.allOf[1].properties.code.enum)
        assert(errors.get(code)?.statuses.includes(Number(status)), 'PREPARATION_UNKNOWN_ERROR:' + code);
    }
    const schema = json(read, files[domain].schema);
    assert.equal(schema.$id, 'https://contracts.opencomerix.example/' + files[domain].schema);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.description, contextFingerprintDefinition, 'PREPARATION_FINGERPRINT_SCHEMA');
    assert.deepEqual(Object.keys(schema.$defs).sort(), ['Request', domain === 'sales' ? 'Decision' : 'Result'].sort());
    for (const shape of Object.values(schema.$defs)) {
      assert.equal(shape.description, contextFingerprintDefinition, 'PREPARATION_FINGERPRINT_CLOSURE');
      assert.equal(shape.properties.request_hash.description, humanRequestHashDefinition, 'PREPARATION_HUMAN_HASH_DEFINITION');
      if (shape.properties.context_fingerprint)
        assert.equal(shape.properties.context_fingerprint.description, contextFingerprintDefinition, 'PREPARATION_FINGERPRINT_FIELD');
      assert.equal(shape.type, 'object');
      assert.equal(shape.additionalProperties, false);
      assert.equal(shape.properties.valid_for_ms?.maximum ?? 2000, 2000);
      for (const property of Object.values(shape.properties)) {
        assert.equal(property['x-data-classification'].sensitivity, 'RESTRICTED');
        assert.equal(property['x-retention-profile'], 'ephemeral_authority');
      }
      for (const forbidden of ['delegation_jwt', 'cookie', 'session_id', 'ignore_stock', 'balance', 'permission', 'jwt'])
        assert(!Object.hasOwn(shape.properties, forbidden), 'PREPARATION_FORBIDDEN_FIELD:' + forbidden);
    }
    if (domain !== 'sales') assert(!schema.$defs.Request.properties.context_fingerprint, 'PREPARATION_NO_CIRCULAR_DIGEST');
  }
  const fixtures = json(read, files.fixtures);
  assert.equal(fixtures.format_version, 1);
  assert.equal(fixtures.runtime_demonstrated, false);
  assert.deepEqual(Object.keys(fixtures.cases), ['inventory', 'finance']);
  for (const [domain, fixture] of Object.entries(fixtures.cases)) verifyBinding(domain, fixture);
  verifyFingerprintVectors(fixtures);
  return { apis: 3, schemas: 3, profiles: 4, fixtureGroups: 2, runtime_demonstrated: false };
}
export function schemaCases(read = native) {
  const fixtures = json(read, files.fixtures).cases;
  const cases = [];
  for (const [domain, fixture] of Object.entries(fixtures)) {
    for (const [kind, data] of Object.entries(fixture)) {
      const owner = kind.startsWith('callback_') ? 'sales' : domain;
      const definition = kind === 'callback_request' || kind === 'request' ? 'Request' : kind === 'result' ? 'Result' : 'Decision';
      const add = (suffix, value, expected) => cases.push({ id: domain + '-' + kind.replaceAll('_', '-') + '-' + suffix,
        schema: files[owner].schema, fragment: '/$defs/' + definition, data: value, expected });
      add('valid', data, 'accept');
      for (const name of ['organization_id', 'request_hash']) {
        const missing = structuredClone(data); delete missing[name]; add('missing-' + name.replaceAll('_', '-'), missing, 'reject');
      }
      add('unknown-field', { ...data, delegation_jwt: 'synthetic-forbidden' }, 'reject');
      add('bad-operation', { ...data, operation_id: 'invalid' }, 'reject');
      add('bad-hash', { ...data, request_hash: 'G'.repeat(64) }, 'reject');
      if (Object.hasOwn(data, 'valid_for_ms')) {
        add('late-budget', { ...data, valid_for_ms: 2001 }, 'reject');
        add('zero-budget', { ...data, valid_for_ms: 0 }, 'reject');
      }
      if (kind === 'callback_decision') add('wrong-audience', { ...data, audience: 'sales-pos.process-authority' }, 'reject');
      if (kind === 'result' && domain === 'finance') {
        add('closed-shift', { ...data, shift_status: 'closed' }, 'reject');
        add('foreign-currency', { ...data, currency: 'USD' }, 'reject');
        add('unverified-responsibility', { ...data, responsibility_verified: false }, 'reject');
      }
      if (kind === 'request') {
        const minimal = structuredClone(data);
        for (const name of Object.keys(minimal).filter(key => key.startsWith('expected_'))) delete minimal[name];
        add('without-observed-version', minimal, 'accept');
        const name = domain === 'inventory' ? 'expected_warehouse_version' : 'expected_shift_version';
        add('invalid-version', { ...data, [name]: 0 }, 'reject');
        add('overflow-version', { ...data, [name]: 9007199254740992 }, 'reject');
        add('null-is-not-omission', { ...data, [name]: null }, 'reject');
      }
    }
  }
  for (const row of json(read, files.fixtures).fingerprint_vectors)
    cases.push({ id: 'fingerprint-' + row.id, schema: files[row.owner].schema, fragment: '/$defs/Request', data: row.request, expected: 'accept' });
  return cases;
}
export function prepare(output = '.ci-artifacts/sales-v2-preparation-' + randomUUID()) {
  assert(/^\.ci-artifacts\/sales-v2-preparation-[a-zA-Z0-9-]+$/.test(output), 'PREPARATION_OUTPUT');
  verifyPackage(); verifyMetadata();
  const directory = path.join(root, output);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory);
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const schemas = new Map(), rows = [], cases = schemaCases();
  for (const fixture of cases) {
    const key = fixture.schema + '#' + fixture.fragment;
    if (!schemas.has(key)) {
      const name = 'schema-' + schemas.size + '.json';
      const document = json(native, fixture.schema);
      assert(Object.hasOwn(document.$defs, fixture.fragment.slice('/$defs/'.length)), 'PREPARATION_SCHEMA_SELECTION');
      save(name, { ...document, $ref: '#' + fixture.fragment });
      schemas.set(key, name);
    }
    save(fixture.id + '.json', fixture.data);
    rows.push([fixture.id, fixture.expected, schemas.get(key), fixture.id + '.json'].join('\t'));
  }
  save('cases.tsv', rows.join('\n') + '\n');
  save('schemas.txt', [...schemas.values()].join('\n') + '\n');
  save('gate.sh', text(native('scripts/sales/validate-preparation-v1.sh')));
  const result = { output, schemas: schemas.size, positive: cases.filter(row => row.expected === 'accept').length,
    negative: cases.filter(row => row.expected === 'reject').length, runtime_demonstrated: false };
  save('manifest.json', result);
  return result;
}
function execute(file, args, shell = false, label) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, shell, windowsHide: true,
    env: { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' } });
  if (result.stdout) {
    if (label === 'redocly-lint') {
      // Preserve the complete structured report in one JSON line so the
      // existing evidence sanitizer can verify its boundaries.
      const report = JSON.parse(result.stdout);
      console.log(JSON.stringify(report));
      assert.equal(report.version, '2.53.3', 'PREPARATION_REDOC_VERSION');
      assert.equal(report.totals.errors, 0, 'PREPARATION_REDOC_ERRORS');
      assert.equal(report.totals.warnings, 0, 'PREPARATION_REDOC_WARNINGS');
    } else process.stdout.write(result.stdout);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'PREPARATION_NATIVE_GATE_FAILED');
  assert.equal(result.signal, null);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...args] = process.argv.slice(2);
  assert(['verify', 'prepare', 'schema', 'openapi'].includes(mode), 'PREPARATION_MODE');
  if (mode === 'verify') {
    assert.equal(args.length, 0); console.log(JSON.stringify({ ...verifyPackage(), ...verifyMetadata() }));
  } else if (mode === 'prepare') {
    assert(args.length <= 1); console.log(JSON.stringify(prepare(args[0])));
  } else if (mode === 'schema') {
    assert.equal(args.length, 0);
    const prepared = prepare();
    const directory = path.join(root, prepared.output);
    execute('docker', ['run', '--rm', ...(process.platform === 'linux' ? ['--user', process.getuid() + ':' + process.getgid()] : []),
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--mount', 'type=bind,source=' + directory + ',target=/work', '--workdir', '/work', '--entrypoint', 'sh',
      'ghcr.io/sourcemeta/jsonschema:v16.10.0', 'gate.sh', '.']);
    console.log(JSON.stringify({ ...prepared, result: 'passed', validator: 'Sourcemeta 16.10.0' }));
  } else {
    assert(args.length === 0 || (args.length === 1 && args[0] === '--offline'));
    verifyPackage(); verifyMetadata();
    const directory = '.ci-artifacts/sales-v2-preparation-openapi-' + randomUUID();
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    for (const [domain, file] of Object.entries(files).filter(([name]) => ['inventory', 'finance', 'sales'].includes(name))) {
      const baseArgs = [...(args.includes('--offline') ? ['--offline'] : []), '--yes', '@redocly/cli@2.53.3'];
      execute(npx, [...baseArgs, 'lint', file.api, '--format', 'json'], process.platform === 'win32', 'redocly-lint');
      execute(npx, [...baseArgs, 'bundle', file.api, '--dereferenced', '--ext', 'json', '--output', directory + '/' + domain + '.json'], process.platform === 'win32');
    }
    console.log(JSON.stringify({ result: 'passed', apis: 3, validator: 'Redocly 2.53.3', runtime_demonstrated: false }));
  }
}
