import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { makeLock } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';

const root = resolve(import.meta.dirname, '../..');
const registryPath = 'registry/contracts.json';
const apiPath = 'observability/http/public/v1/pwa-telemetry-v1.yaml';
const schemaPath = 'observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json';
const problemPath = 'common/http/shared/v3/problem-details-v3.schema.json';
const invalidBatchProblemPath = 'observability/http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json';
const csrfProblemPath = 'openapi/csrf-v3-problem.schema.json';
const errorsPath = 'observability/errors/v1/pwa-telemetry-errors-v1.json';
const fixturesRoot = 'observability/fixtures/pwa-telemetry/v1';
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const api = read(apiPath);
const operation = api.paths['/telemetry/pwa'].post;

test('binds telemetry admission to the same origin, the current session and its CSRF token', () => {
  assert.deepEqual(api.servers.map(server => server.url), ['/api/v1']);
  assert.deepEqual(Object.keys(api.paths), ['/telemetry/pwa']);
  assert.deepEqual(Object.keys(api.paths['/telemetry/pwa']), ['post']);
  assert.equal(operation.operationId, 'submitPwaTelemetry');
  assert.deepEqual(operation.security, [{ sessionCookie: [], csrfToken: [] }]);
  assert.equal(api.components.securitySchemes.sessionCookie.in, 'cookie');
  assert.equal(api.components.securitySchemes.sessionCookie.name, '__Host-oc_session');
  assert.equal(api.components.securitySchemes.csrfToken.in, 'header');
  assert.equal(api.components.securitySchemes.csrfToken.name, 'X-CSRF-Token');
  assert.deepEqual(operation.parameters.map(({ name, in: location, required }) =>
    [name, location, required]), [['Origin', 'header', true]]);
  assert.deepEqual(operation['x-observability-admission'], {
    maxBodyBytes: 8192,
    maxSamples: 16,
    sessionBatchesPerMinute: 6,
    instanceBatchesPerMinute: 120,
  });
  assert.deepEqual(Object.keys(operation.requestBody.content), ['application/json']);
  assert.equal(operation.requestBody.required, true);
  assert.equal(operation.responses['204'].content, undefined);
});

test('the public API and the native suite use the same closed schema and positive fixture', () => {
  const representation = operation.requestBody.content['application/json'];
  assert.equal(resolve(root, 'observability/http/public/v1', representation.schema.$ref),
    join(root, schemaPath));
  assert.equal(resolve(root, 'observability/http/public/v1', representation.examples.syntheticBatch.externalValue),
    join(root, fixturesRoot, 'accepted.json'));

  const schema = read(schemaPath);
  const cases = read(fixturesRoot + '/batch-tests.json');
  assert.equal(cases.target, schema.$id);
  assert(cases.tests.some(fixture => fixture.valid === true && fixture.dataPath === 'accepted.json'));
  assert.equal(schema.additionalProperties, false);
  const samples = schema.properties.samples;
  assert.equal(samples.maxItems, operation['x-observability-admission'].maxSamples);
  assert.equal(samples.items.additionalProperties, false);
  const metrics = samples.items.oneOf.flatMap(({ properties }) =>
    properties.metric.enum ?? [properties.metric.const]);
  const examples = read(fixturesRoot + '/accepted.json').samples.map(sample => sample.metric);
  assert.equal(new Set(metrics).size, metrics.length);
  assert.deepEqual(new Set(examples), new Set(metrics));
});

test('uses Problem Details v3 and only errors cataloged for the documented HTTP statuses', () => {
  const common = read('common/errors/v11/error-catalog-v11.json').errors;
  const local = read(errorsPath).errors;
  assert.equal(local.length, 1);
  assert.deepEqual(local.map(row => row.code), ['observability_invalid_batch']);
  assert(!common.some(row => row.code === local[0].code));
  assert.equal(local[0].owner, 'gateway-bff');
  assert.equal(local[0].domain, 'observability');
  assert.equal(local[0].severity, 'warning');
  assert.equal(local[0].exposure, 'public');
  assert.deepEqual(local[0].allowed_parameters, []);
  assert.equal(resolve(root, 'observability/http/public/v1', api.components.schemas.Problem.$ref),
    join(root, problemPath));
  const invalidBatch = read(invalidBatchProblemPath);
  const csrf = read(csrfProblemPath);
  const profiles = {
    '400': { path: invalidBatchProblemPath, properties: invalidBatch.allOf[1].properties },
    '403': { path: csrfProblemPath, properties: csrf.properties },
  };
  assert.deepEqual(Object.keys(operation.responses), ['204', '400', '401', '403', '413', '415', '429', '500', '503']);
  for (const [status, response] of Object.entries(operation.responses)) {
    assert.equal(response.headers['Cache-Control'].$ref, '#/components/headers/NoStore');
    if (status === '204') continue;
    const schema = response.content['application/problem+json'].schema;
    const profile = profiles[status];
    if (profile) {
      assert.deepEqual(Object.keys(schema), ['$ref']);
      assert.equal(resolve(root, 'observability/http/public/v1', schema.$ref), join(root, profile.path));
    } else {
      assert.equal(schema.allOf[0].$ref, '#/components/schemas/Problem');
    }
    const properties = profile?.properties ?? schema.allOf[1].properties;
    const entry = [...common, ...local].find(row => row.code === properties.code.const);
    assert(entry?.statuses.includes(Number(status)), properties.code.const);
    assert.equal(properties.status.const, Number(status));
    assert.equal(properties.type.const, 'urn:opencomerix:problem:' + entry.code);
    assert.equal(properties.retryable.const, entry.retryable_by_default);
  }
  assert.equal(operation.responses['429'].headers['Retry-After'].$ref, '#/components/headers/RetryAfter');
});

test('the response fixtures target the effective 400 and 403 profiles', () => {
  const invalidBatch = read(invalidBatchProblemPath);
  const csrf = read(csrfProblemPath);
  assert.equal(resolve(root, 'observability/http/shared/v1', invalidBatch.allOf[0].$ref), join(root, problemPath));
  const fields = invalidBatch.allOf[1].properties;
  for (const key of ['detail', 'errors', 'correlation_id']) assert.equal(fields[key], false);
  assert.equal(fields.title.const, 'Lote de telemetría inválido');
  assert.equal(read(fixturesRoot + '/invalid-batch-problem-tests.json').target, invalidBatch.$id);
  const csrfFixtures = read(fixturesRoot + '/csrf-problem-tests.json');
  assert.equal(csrfFixtures.target, csrf.$id);
  assert.deepEqual(csrfFixtures.tests.map(({ dataPath, valid }) => [resolve(root, fixturesRoot, dataPath), valid]), [
    [join(root, 'openapi/examples/gateway-csrf-invalid-v3.json'), true],
    [join(root, 'openapi/examples/gateway-csrf-invalid-with-detail-negative-v3.json'), false],
  ]);
});

test('discovers the three telemetry roots and prevents consumption of a planned source', () => {
  const registry = read(registryPath);
  const ids = new Set([
    'observability.pwa-telemetry.http.v1',
    'observability.pwa-telemetry.batch.schema.v1',
    'observability.pwa-telemetry.errors.v1',
  ]);
  const planned = registry.planned.filter(row => ids.has(row.id));
  const active = registry.contracts.filter(row => ids.has(row.id));
  const added = [...planned, ...active];
  assert.deepEqual(added.map(row => row.path).sort(), [apiPath, schemaPath, errorsPath].sort());
  assert(added.every(row => row.domain === 'observability' && row.owner === 'gateway-bff' &&
    row.version === '1.0.0'));
  assert.deepEqual(read('observability/index.json'), domainIndex(registry, 'observability'));
  if (planned.length) {
    assert.equal(active.length, 0);
    const manifest = { service: 'web-pos', contracts: [{
      id: 'observability.pwa-telemetry.http.v1',
      role: 'consumer',
      version: '1.0.0',
      operations: ['submitPwaTelemetry'],
      pointers: [],
    }], assets: [] };
    assert.throws(() => makeLock(root, manifest, Buffer.from(JSON.stringify(manifest)), registry),
      /Unknown\/unmaterialized/);
  }
});
