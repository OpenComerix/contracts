import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { root, read, changed, extractSchema } from '../catalog/validate-history-recovery-v1.mjs';
import { verify } from './catalog-recovery-verification-v2-semantics.mjs';

export const apiPath = 'identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml';
export const schemaPath = 'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json';
export const policyPath = 'identity/http/shared/v2/identity-catalog-recovery-verification-v2-policy.json';
export const vectorsPath = 'identity/fixtures/catalog-recovery/v2/catalog-recovery-verification-v2-vectors.json';
export const vectors = read(vectorsPath);

export function scenario() {
  const fixture = read(vectors.base);
  const grant = structuredClone(fixture.positive.grant);
  return { grant, context: { ...structuredClone(fixture.trusted_context), now: vectors.now, workload_caller: 'catalog-pricing' },
    request: { binding: structuredClone(grant.binding), grant_reference: grant.grant_reference,
      required_permission: grant.permissions[0], checked_at: vectors.now } };
}

export function validatePolicy(policy = read(policyPath)) {
  assert.equal(policy.owner, 'identity-tenancy');
  assert.equal(policy.runtime_demonstrated, false);
  assert.equal(policy.production_enabled, false);
  assert.equal(policy.version, 2);
  assert.deepEqual(policy.source_pins.map(pin => pin.path).sort(), [vectors.base,
    'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml',
    'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json'].sort());
  for (const pin of policy.source_pins) {
    assert.equal(pin.commit, 'a45e700eadd36790a5480faccd3ed80015b08e13');
    const bytes = execFileSync('git', ['show', pin.commit + ':' + pin.path], { cwd: root, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
    assert.equal(fs.readFileSync(path.join(root, pin.path), 'utf8').replaceAll('\r\n', '\n'), bytes.toString('utf8'));
  }
  const fields = Object.keys(read(schemaPath).$defs.VerifyResponse.properties).map(name => '/$defs/VerifyResponse/properties/' + name);
  assert.deepEqual(policy.field_inventory.map(row => row.path).sort(), [...fields, '/$defs/VerifyRequest', '/$defs/Problem'].sort());
  for (const row of policy.field_inventory) {
    const profile = policy.profiles[row.profile];
    assert(profile);
    assert.equal(profile.owner, 'identity-tenancy');
    assert.equal(profile.sensitivity, 'RESTRICTED');
    for (const field of ['categories', 'purpose', 'base', 'consumers', 'access', 'log_policy', 'encryption', 'retention', 'export_correction', 'third_parties_regions']) assert(profile[field]);
    assert.equal(profile.log_policy, 'prohibited-values');
  }
  assert.equal(policy.caller_storage, 'none; fresh decision for one request only; never cache grant, response or issued_at');
}

export function validateContract() {
  const api = parse(fs.readFileSync(path.join(root, apiPath), 'utf8'));
  assert.equal(api.info.version, '2.0.0');
  assert.deepEqual(Object.keys(api.paths), ['/internal/v2/identity/catalog/recovery-grants/verify']);
  const operation = Object.values(api.paths)[0].post;
  assert.equal(operation['x-workload'].caller, 'catalog-pricing');
  assert.equal(operation['x-workload'].audience, 'identity-tenancy.catalog-recovery');
  assert.equal(api.components.headers.NoStore.schema.const, 'no-store');
  assert.equal(vectors.runtime_demonstrated, false);
  const source = read(vectors.base);
  const cases = [...source.negative.filter(row => row.operation === 'verify').map(row => ({ ...row, expected: row.expected_code })), ...vectors.negative];
  assert.equal(new Set(cases.map(row => row.id)).size, cases.length);
  for (const row of cases) assert.equal(verify(changed(scenario(), row.changes)).rejection, row.expected, row.id);
  const input = scenario();
  const result = verify(input);
  assert.equal(result.response.issued_at, input.grant.issued_at);
  assert.equal(result.response.valid_until, input.grant.expires_at);
  assert.equal(Object.hasOwn(result.response, 'grant_reference'), false);
  validatePolicy();
  return { semantic_negatives: cases.length, runtime_demonstrated: false };
}

export function prepare(output) {
  const summary = validateContract();
  assert.equal(fs.existsSync(output), false, 'VERIFICATION_V2_OUTPUT_EXISTS');
  const input = scenario();
  const response = verify(input).response;
  const cases = [];
  const add = (definition, id, expected, value) => cases.push({ definition, id, expected, value });
  for (const [definition, value] of Object.entries({ VerifyRequest: input.request, VerifyResponse: response })) {
    add(definition, definition + '-valid', 'accept', value);
    for (const property of Object.keys(value)) {
      const missing = structuredClone(value); delete missing[property];
      add(definition, definition + '-missing-' + property, 'reject', missing);
    }
    add(definition, definition + '-extra', 'reject', { ...value, unsafe_extra: true });
  }
  add('VerifyResponse', 'response-invalid-issued-at', 'reject', { ...response, issued_at: 'tomorrow' });
  add('VerifyResponse', 'response-raw-grant', 'reject', { ...response, grant_reference: input.grant.grant_reference });
  add('VerifyResponse', 'response-purpose-permission', 'reject', { ...response, permission: 'catalog.history.configure' });
  add('VerifyRequest', 'request-caller-issued-at', 'reject', { ...input.request, issued_at: input.grant.issued_at });
  const short = scenario();
  short.grant.lifetime_seconds = 60;
  short.context.now = '2026-10-16T12:00:31Z';
  short.grant.expires_at = '2026-10-16T12:01:01Z';
  add('VerifyResponse', 'response-short-grant', 'accept', verify(short).response);
  const configure = scenario();
  configure.grant.binding.purpose = configure.request.binding.purpose = 'restricted-history-configuration';
  configure.grant.permissions = ['catalog.history.configure'];
  configure.request.required_permission = 'catalog.history.configure';
  add('VerifyResponse', 'response-configure', 'accept', verify(configure).response);
  fs.mkdirSync(output, { recursive: true });
  for (const definition of ['VerifyRequest', 'VerifyResponse']) fs.writeFileSync(path.join(output, definition + '.schema.json'), JSON.stringify(extractSchema(definition, schemaPath)) + '\n', { flag: 'wx' });
  for (const row of cases) fs.writeFileSync(path.join(output, row.id + '.json'), JSON.stringify(row.value) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'cases.tsv'), cases.map(row => [row.id, row.expected, row.definition + '.schema.json', row.id + '.json'].join('\t')).join('\n') + '\n', { flag: 'wx' });
  return { ...summary, schema_positive: cases.filter(row => row.expected === 'accept').length, schema_negative: cases.filter(row => row.expected === 'reject').length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert.equal(process.argv.length, 3, 'usage: node scripts/identity/validate-catalog-recovery-verification-v2.mjs <new-output>');
  const output = path.resolve(process.argv[2]);
  assert(output.startsWith(path.join(root, '.ci-artifacts') + path.sep), 'VERIFICATION_V2_OUTPUT_SCOPE');
  console.log('F1-08G identity verification v2 gate passed: ' + JSON.stringify(prepare(output)));
}
