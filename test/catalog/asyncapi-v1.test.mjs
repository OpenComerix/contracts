import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSources, source, root, validateAsyncapi, validateReferences, prepareAsyncapi } from '../../scripts/catalog/validate-asyncapi-v1.mjs';

test('official parser validates the published AsyncAPI document without promoting its status', async () => {
  const sources = loadSources();
  const before = JSON.stringify([...sources]);
  const result = await validateAsyncapi(sources);
  assert.equal(result.asyncapi, '3.0.0');
  assert(result.references > 40);
  assert.equal(result.runtime_demonstrated, false);
  assert.equal(result.payload_validation, 'requires-Sourcemeta-companion');
  assert(result.diagnostics.every(item => item.severity >= 2));
  assert.equal(JSON.stringify([...sources]), before);
  assert.equal(sources.get(source)['x-status'], 'candidate');
});

test('a malformed AsyncAPI structure fails in the official parser', async () => {
  const sources = loadSources();
  delete sources.get(source).info.version;
  await assert.rejects(validateAsyncapi(sources), /N_ASYNCAPI_INVALID.*asyncapi-document-resolved/);
});

test('missing pointers and unselected, remote, encoded or escaping references fail before external resolution', () => {
  for (const [ref, reason] of [
    ['#/components/messages/missing', 'N_REFERENCE_MISSING'],
    ['https://example.invalid/remote.json', 'N_REFERENCE_LOCAL_ONLY'],
    ['file:///elsewhere/schema.json', 'N_REFERENCE_LOCAL_ONLY'],
    ['../../../../package.json', 'N_REFERENCE_NOT_SELECTED'],
    ['%2e%2e/schema.json', 'N_REFERENCE_LOCAL_ONLY'],
    ['#/components/messages/~2', 'N_REFERENCE_POINTER'],
    ['#unselected-anchor', 'N_REFERENCE_POINTER'],
  ]) {
    const sources = loadSources();
    sources.get(source).channels.catalogEvents.messages.category.$ref = ref;
    assert.throws(() => validateReferences(sources), new RegExp(reason));
  }
});

test('channel, operation, revision and producer schema cannot diverge from each other', async () => {
  for (const [mutate, reason] of [
    [d => { d.channels.catalogEvents.address = 'other.topic'; }, 'N_TOPIC'],
    [d => { d.operations.publishCatalogChanges.action = 'receive'; }, 'N_OPERATION_ACTION'],
    [d => { d.operations.publishCatalogChanges.messages.pop(); }, 'N_OPERATION_MESSAGES'],
    [d => { d.channels.catalogEvents.messages.category.$ref = '#/components/messages/product'; }, 'N_CHANNEL_MESSAGE'],
    [d => { d.components.messages.product['x-schema-version'] = 2; }, 'N_MESSAGE_REVISION'],
    [d => { d.components.messages.product.payload.schemaFormat = 'application/schema+json;version=draft-07'; }, 'N_PAYLOAD_FORMAT'],
    [d => { d['x-filter-pairs'][0].schema_version = 2; }, 'N_FILTER_PAIRS'],
    [d => { d.channels.catalogEvents['x-future-consumers'][0].runtime_demonstrated = true; }, 'N_FUTURE_ONLY'],
  ]) {
    const sources = loadSources(); mutate(sources.get(source));
    await assert.rejects(validateAsyncapi(sources), new RegExp(reason));
  }
  const sources = loadSources();
  sources.get('catalog/events/v1/catalog.category.changed.v1.schema.json').allOf[1].properties.schema_version.const = 2;
  await assert.rejects(validateAsyncapi(sources), /N_SCHEMA_REVISION/);
});

test('prepared payload matrix preserves exact source bytes, requires native schemas and refuses reused output', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opencomerix-f108n-'));
  try {
    const output = path.join(temporary, 'new-output');
    const result = await prepareAsyncapi(output);
    assert.equal(result.schemas, 9);
    assert.equal(result.cases, 27);
    const inventory = JSON.parse(fs.readFileSync(path.join(output, 'structure.json'), 'utf8'));
    for (const { file } of inventory.sources) {
      assert.deepEqual(fs.readFileSync(path.join(output, 'source', file)), fs.readFileSync(path.join(root, file)));
    }
    assert.equal(inventory.payload_validation, 'requires-Sourcemeta-companion');
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'invalid-2020-schema.json'), 'utf8')).prefixItems, 7);
    const before = fs.readFileSync(path.join(output, 'structure.json'));
    await assert.rejects(prepareAsyncapi(output), { code: 'EEXIST' });
    assert.deepEqual(fs.readFileSync(path.join(output, 'structure.json')), before);
  } finally {
    assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep + 'opencomerix-f108n-'));
    fs.rmSync(temporary, { recursive: true });
  }
});
