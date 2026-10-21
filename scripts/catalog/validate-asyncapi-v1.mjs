import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Parser } from '@asyncapi/parser';

export const root = path.resolve(import.meta.dirname, '../..');
export const source = 'catalog/events/v1/catalog-events-v1.asyncapi.yaml';
const directory = 'catalog/events/v1/';
const dialect = 'https://json-schema.org/draft/2020-12/schema';
const schemaFormat = 'application/schema+json;version=draft-2020-12';
const profiles = [
  ['category', 'catalog.category.changed.v1', 'createCatalogCategory'],
  ['product', 'catalog.product.changed.v1', 'createCatalogProduct'],
  ['presentation', 'catalog.presentation.changed.v1', 'createCatalogPresentation'],
  ['price', 'pricing.presentation-price.changed.v1', 'createPresentationPrice'],
];
const schemaPaths = [
  ...profiles.map(([, type]) => directory + type + '.schema.json'),
  directory + 'catalog-event-data-v1.schema.json',
  'events/event-envelope-v1.schema.json',
];
const allowed = new Set([source, ...schemaPaths]);

function localFile(relative) {
  assert(allowed.has(relative), 'N_SOURCE_NOT_SELECTED');
  const target = path.resolve(root, relative);
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    assert(!fs.lstatSync(current).isSymbolicLink(), 'N_SOURCE_LINK');
  }
  assert(fs.realpathSync(target) === target, 'N_SOURCE_REALPATH');
  const bytes = fs.readFileSync(target);
  assert(bytes.length <= 1024 * 1024, 'N_SOURCE_SIZE');
  return bytes;
}

export function loadSources() {
  return new Map([...allowed].map(file => [file, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(localFile(file)))]));
}

function pointer(document, fragment) {
  assert(fragment === '' || fragment.startsWith('/'), 'N_REFERENCE_POINTER');
  return fragment === '' ? document : fragment.slice(1).split('/').reduce((value, key) => {
    assert(!/~(?![01])/u.test(key), 'N_REFERENCE_POINTER');
    key = key.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'N_REFERENCE_MISSING');
    return value[key];
  }, document);
}

// This bounded closure is checked before calling the parser. No network reference,
// unselected file, anchor, or missing pointer can reach its default resolvers.
export function validateReferences(sources) {
  assert.deepEqual([...sources.keys()].sort(), [...allowed].sort(), 'N_SOURCE_INVENTORY');
  let references = 0;
  function visit(value, file) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, '$ref')) {
      const ref = value.$ref;
      assert(typeof ref === 'string' && !/^[a-z][a-z0-9+.-]*:|^[/\\]|\\|%/iu.test(ref), 'N_REFERENCE_LOCAL_ONLY');
      const parts = ref.split('#');
      assert(parts.length <= 2, 'N_REFERENCE_POINTER');
      const [relative, fragment = ''] = parts;
      const target = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file), relative)) : file;
      assert(allowed.has(target) && sources.has(target), 'N_REFERENCE_NOT_SELECTED');
      pointer(sources.get(target), fragment);
      references++;
    }
    for (const child of Object.values(value)) visit(child, file);
  }
  for (const [file, document] of sources) visit(document, file);
  return references;
}

export function validateTopology(sources) {
  const document = sources.get(source);
  assert.equal(document.asyncapi, '3.0.0', 'N_ASYNCAPI_VERSION');
  assert.equal(document['x-status'], 'candidate', 'N_SOURCE_STATUS');
  assert.equal(document.info?.license?.name, 'Proprietary', 'N_LICENSE');
  assert.deepEqual(Object.keys(document.channels ?? {}), ['catalogEvents'], 'N_CHANNEL_INVENTORY');
  const channel = document.channels.catalogEvents;
  assert.equal(channel.address, 'catalog-pricing.events', 'N_TOPIC');
  assert.deepEqual(Object.keys(document.operations ?? {}), ['publishCatalogChanges'], 'N_OPERATION_INVENTORY');
  const operation = document.operations.publishCatalogChanges;
  assert.equal(operation.action, 'send', 'N_OPERATION_ACTION');
  assert.deepEqual(operation.channel, { $ref: '#/channels/catalogEvents' }, 'N_OPERATION_CHANNEL');
  const keys = profiles.map(([key]) => key);
  assert.deepEqual(Object.keys(channel.messages ?? {}).sort(), [...keys].sort(), 'N_MESSAGE_INVENTORY');
  assert.deepEqual(Object.keys(document.components?.messages ?? {}).sort(), [...keys].sort(), 'N_MESSAGE_INVENTORY');
  assert.deepEqual(operation.messages, keys.map(key => ({ $ref: '#/channels/catalogEvents/messages/' + key })), 'N_OPERATION_MESSAGES');
  assert.deepEqual(document['x-filter-pairs'], profiles.map(([, type]) => ({ event_type: type, schema_version: 1 })), 'N_FILTER_PAIRS');
  for (const [key, type] of profiles) {
    assert.deepEqual(channel.messages[key], { $ref: '#/components/messages/' + key }, 'N_CHANNEL_MESSAGE');
    const message = document.components.messages[key];
    assert.equal(message.name, type, 'N_MESSAGE_TYPE');
    assert.equal(message.contentType, 'application/json', 'N_CONTENT_TYPE');
    assert.equal(message['x-schema-version'], 1, 'N_MESSAGE_REVISION');
    assert.equal(message['x-producer'], 'catalog-pricing', 'N_PRODUCER');
    assert.equal(message['x-consumer-status'], 'future_intention', 'N_CONSUMER_STATUS');
    assert.deepEqual(message.correlationId, { location: '$message.payload#/correlation_id' }, 'N_CORRELATION');
    assert.deepEqual(message.payload, { schemaFormat, schema: { $ref: type + '.schema.json' } }, 'N_PAYLOAD_FORMAT');
    const schema = sources.get(directory + type + '.schema.json');
    assert.equal(schema.$schema, dialect, 'N_SCHEMA_DIALECT');
    assert.equal(schema.allOf?.[1]?.properties?.event_type?.const, type, 'N_SCHEMA_TYPE');
    assert.equal(schema.allOf?.[1]?.properties?.schema_version?.const, 1, 'N_SCHEMA_REVISION');
  }
  assert.deepEqual(channel['x-future-consumers'], [{
    topic: 'catalog-pricing.events', consumer: 'reporting.catalog-changes',
    queue: 'reporting.catalog-changes', dlq: 'reporting.catalog-changes.dlq',
    status: 'future_intention', runtime_demonstrated: false,
  }], 'N_FUTURE_ONLY');
}

export async function validateAsyncapi(sources = loadSources()) {
  const references = validateReferences(sources);
  validateTopology(sources);
  // Document references stay intact. Every external reference has already been
  // restricted to the selected local closure before the parser resolves it.
  const parser = new Parser();
  const { document, diagnostics } = await parser.parse(sources.get(source), { source: path.join(root, source) });
  const errors = diagnostics.filter(item => item.severity <= 1);
  assert(document && errors.length === 0, 'N_ASYNCAPI_INVALID:' + JSON.stringify(errors.map(({ code, path }) => ({ code, path }))));
  return { references, diagnostics: diagnostics.map(({ code, severity, path }) => ({ code, severity, path })),
    asyncapi: '3.0.0', parser: '3.6.4', payload_validation: 'requires-Sourcemeta-companion', runtime_demonstrated: false };
}

export async function prepareAsyncapi(output) {
  const sources = loadSources();
  const result = await validateAsyncapi(sources);
  const target = path.resolve(output);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  assert(fs.realpathSync(parent) === parent, 'N_OUTPUT_REALPATH');
  fs.mkdirSync(target); // new directory only; never reuse or overwrite evidence
  const write = (file, bytes) => {
    const destination = path.join(target, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  };
  const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
  const inventory = [];
  for (const file of allowed) {
    const bytes = localFile(file);
    assert.deepEqual(JSON.parse(bytes.toString('utf8')), sources.get(file), 'N_SOURCE_CHANGED');
    write('source/' + file, bytes);
    inventory.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const schemas = schemaPaths.map((file, index) => [`source-${index}`, 'accept', 'source/' + file]);
  const invalid = structuredClone(sources.get(schemaPaths[0]));
  invalid.allOf[1].properties.payload = { type: 7 };
  json('invalid-schema.json', invalid);
  schemas.push(['invalid-type', 'reject', 'invalid-schema.json']);
  json('invalid-2020-schema.json', { $schema: dialect, type: 'array', prefixItems: 7 });
  schemas.push(['invalid-2020-keyword', 'reject', 'invalid-2020-schema.json']);
  json('dialect-canary.schema.json', { $schema: dialect, type: 'array', prefixItems: [{ type: 'integer' }], items: false });
  schemas.push(['draft-2020-canary', 'accept', 'dialect-canary.schema.json']);
  const cases = [];
  for (const [key, type, operation] of profiles) {
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'catalog/fixtures/events/v1/effects/' + operation + '.json'), 'utf8'));
    const event = fixture.events.find(value => value.event_type === type);
    assert(event, 'N_FIXTURE_MISSING');
    const schema = 'source/' + directory + type + '.schema.json';
    const add = (id, expected, value) => { json(id + '.json', value); cases.push([id, expected, schema, id + '.json']); };
    add(key + '-original', 'accept', event);
    add(key + '-revision', 'reject', { ...event, schema_version: 999 });
    add(key + '-type', 'reject', { ...event, event_type: 'unsupported.event.v9' });
    add(key + '-extra', 'reject', { ...event, unexpected: true });
    add(key + '-date', 'reject', { ...event, occurred_at: '2026-99-99T99:99:99Z' });
    const missing = structuredClone(event); delete missing.causation_id;
    add(key + '-cause', 'reject', missing);
  }
  for (const [id, expected, value] of [['canary-valid', 'accept', [1]], ['canary-type', 'reject', ['x']], ['canary-extra', 'reject', [1, 2]]]) {
    json(id + '.json', value); cases.push([id, expected, 'dialect-canary.schema.json', id + '.json']);
  }
  write('schemas.tsv', schemas.map(row => row.join('\t')).join('\n') + '\n');
  write('cases.tsv', cases.map(row => row.join('\t')).join('\n') + '\n');
  json('structure.json', { ...result, sources: inventory, schemas: schemas.length, cases: cases.length });
  return { ...result, schemas: schemas.length, cases: cases.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert(process.argv.length <= 3, 'usage: node scripts/catalog/validate-asyncapi-v1.mjs [new-output-directory]');
  const result = process.argv[2] ? await prepareAsyncapi(process.argv[2]) : await validateAsyncapi();
  console.log('F1-08N AsyncAPI structure passed; payload certification requires Sourcemeta: ' + JSON.stringify(result));
}
