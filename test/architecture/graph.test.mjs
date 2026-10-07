import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSelection,
  classifyImpact,
  impactForConsumer,
  parseSource,
  operationPointers,
} from '../../tools/architecture/graph.mjs';
import {
  parseJSON,
  pointer,
  safePath,
  validateShape,
  sha256,
} from '../../tools/architecture/consumer-gate.mjs';
import { validateCoverage, domainIndex } from '../../tools/architecture/registry.mjs';

const descriptor = {
  id: 'test.http.v1',
  path: 'openapi/test.json',
  version: '1.0.0',
  uriMappings: [{ uri: 'https://example.invalid/common', path: 'events/common.json' }],
};
const dependency = {
  id: descriptor.id,
  role: 'consumer',
  version: '1.0.0',
  operations: ['readA'],
  pointers: [],
  gates: ['pnpm contracts:metadata', 'pnpm test:integration'],
};
function source() {
  return {
    'openapi/test.json': {
      openapi: '3.1.0',
      info: { version: '1.0.0' },
      security: [{ token: [] }],
      servers: [{ url: 'https://example.invalid' }],
      components: {
        securitySchemes: {
          token: {
            type: 'http',
            scheme: 'bearer',
            description: 'Audience and tenant required.',
          },
        },
      },
      paths: {
        '/a': {
          parameters: [
            { in: 'header', name: 'X-Scope', required: true, schema: { type: 'string' } },
          ],
          get: {
            operationId: 'readA',
            summary: 'Read A',
            responses: {
              200: {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { $ref: 'https://example.invalid/common#/$defs/a' },
                  },
                },
              },
            },
          },
        },
        '/b': {
          get: {
            operationId: 'readB',
            responses: {
              200: {
                description: 'OK',
                content: {
                  'application/json': { schema: { $ref: '../events/common.json#/$defs/b' } },
                },
              },
            },
          },
        },
      },
    },
    'events/common.json': {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://example.invalid/common',
      $defs: {
        a: {
          type: 'object',
          additionalProperties: false,
          required: ['value'],
          properties: {
            value: { type: 'string', enum: ['yes', 'no'] },
            summary: { type: 'string' },
          },
        },
        b: { type: 'integer' },
      },
    },
    'events/unrelated.json': { type: 'string' },
  };
}
const reader = (files) => (file) => {
  assert(Object.hasOwn(files, file), 'Unknown file ' + file);
  return Buffer.from(JSON.stringify(files[file]));
};
const resolve = (files, selection = dependency) =>
  resolveSelection(reader(files), descriptor, selection);
const snapshot = (files) => ({
  manifest: { service: 'test-service', contracts: [dependency] },
  lock: {
    entries: [
      { id: descriptor.id, role: dependency.role, commit: 'a'.repeat(40), ...resolve(files) },
    ],
  },
});

test('known coverage cannot silently disappear, duplicate or expand', () => {
  const index = {
    formatVersion: 1,
    lifecycle: 'local-candidate',
    coverage: 'Known only',
    consumers: [
      {
        service: 'test-service',
        file: 'test-service.json',
        localDirectory: 'services/test-service',
      },
    ],
  };
  validateCoverage(index, ['test-service']);
  assert.throws(
    () => validateCoverage({ ...index, consumers: [] }, ['test-service']),
    /coverage/,
  );
  assert.throws(() => validateCoverage(index, ['test-service', 'other-service']), /coverage/);
  assert.throws(
    () =>
      validateCoverage({ ...index, consumers: [...index.consumers, ...index.consumers] }, [
        'test-service',
      ]),
    /Duplicate/,
  );
  assert.throws(() => validateCoverage(index, []), /coverage/);
  const registry = {
    contracts: [
      {
        domain: 'test',
        id: 'test.http.v1',
        surface: 'http',
        version: '1.0.0',
        path: 'openapi/test.json',
        status: 'active',
      },
    ],
    planned: [],
  };
  assert.deepEqual(domainIndex(registry, 'test').surfaces[0].versions[0], {
    id: 'test.http.v1',
    version: '1.0.0',
    path: 'openapi/test.json',
    status: 'active',
  });
});

test('selects operation, shared schema, effective auth and path headers without unrelated siblings', () => {
  const closure = resolve(source());
  assert.deepEqual(
    closure.files.map((f) => f.path),
    ['events/common.json', 'openapi/test.json'],
  );
  assert(closure.units.some((u) => u.pointer === '/$defs/a'));
  assert(!closure.units.some((u) => u.pointer.includes('/b')));
  assert(closure.units.some((u) => u.pointer === '/security'));
  assert(closure.units.some((u) => u.pointer === '/components/securitySchemes/token'));
  assert(closure.units.some((u) => u.pointer === '/paths/~1a/parameters'));
});

for (const [name, change] of [
  [
    'another operation',
    (f) => {
      f['openapi/test.json'].paths['/b'].get.description = 'Different guarantee';
    },
  ],
  [
    'another common definition',
    (f) => {
      f['events/common.json'].$defs.b.type = 'boolean';
    },
  ],
  [
    'unrelated event',
    (f) => {
      f['events/unrelated.json'].type = 'number';
    },
  ],
])
  test('does not select ' + name, () => {
    const files = source(),
      locked = resolve(files);
    change(files);
    assert.equal(classifyImpact(locked, resolve(files)), 'none');
  });

for (const [name, change] of [
  [
    'required field',
    (f) => {
      f['events/common.json'].$defs.a.required.push('summary');
    },
  ],
  [
    'enum reduction',
    (f) => {
      f['events/common.json'].$defs.a.properties.value.enum.pop();
    },
  ],
  [
    'optional field under strict object',
    (f) => {
      f['events/common.json'].$defs.a.properties.newField = { type: 'string' };
    },
  ],
  [
    'payload property named summary',
    (f) => {
      f['events/common.json'].$defs.a.properties.summary.type = 'number';
    },
  ],
  [
    'semantic description',
    (f) => {
      f['openapi/test.json'].paths['/a'].get.description = 'New replay guarantee';
    },
  ],
  [
    'header requirement',
    (f) => {
      f['openapi/test.json'].paths['/a'].parameters[0].required = false;
    },
  ],
  [
    'security scheme guarantee',
    (f) => {
      f['openapi/test.json'].components.securitySchemes.token.description =
        'Different audience';
    },
  ],
  [
    'security scope',
    (f) => {
      f['openapi/test.json'].security[0].token.push('write');
    },
  ],
  [
    'server',
    (f) => {
      f['openapi/test.json'].servers[0].url = 'https://other.invalid';
    },
  ],
  [
    'method',
    (f) => {
      const p = f['openapi/test.json'].paths['/a'];
      p.post = p.get;
      delete p.get;
    },
  ],
  [
    'path',
    (f) => {
      const p = f['openapi/test.json'].paths;
      p['/new-a'] = p['/a'];
      delete p['/a'];
    },
  ],
])
  test('requires review for ' + name, () => {
    const files = source(),
      locked = resolve(files);
    change(files);
    assert.equal(classifyImpact(locked, resolve(files)), 'review-required');
  });

test('only known operation summary is safely documentary', () => {
  const files = source(),
    locked = resolve(files);
  files['openapi/test.json'].paths['/a'].get.summary = 'Editorial summary';
  assert.equal(classifyImpact(locked, resolve(files)), 'documentation');
  const report = impactForConsumer(
    snapshot(source()),
    { contracts: [descriptor] },
    reader(files),
  );
  assert.deepEqual(report.dependencies[0].gates, ['pnpm contracts:metadata']);
});

for (const [name, change, expected] of [
  [
    'OpenAPI patch interpretation',
    (f) => {
      f['openapi/test.json'].openapi = '3.1.1';
    },
    'review-required',
  ],
  [
    'explicit OpenAPI dialect',
    (f) => {
      f['openapi/test.json'].jsonSchemaDialect = 'https://json-schema.org/draft/2020-12/schema';
    },
    'review-required',
  ],
  [
    'referenced resource dialect',
    (f) => {
      f['events/common.json'].$schema = 'https://spec.openapis.org/oas/3.1/dialect/base';
    },
    'review-required',
  ],
  [
    'referenced resource id',
    (f) => {
      f['events/common.json'].$id = 'https://other.invalid/common';
    },
    'review-required',
  ],
  [
    'removed inherited dialect',
    (f) => {
      delete f['events/common.json'].$schema;
    },
    'review-required',
  ],
  [
    'removed resource id',
    (f) => {
      delete f['events/common.json'].$id;
    },
    'review-required',
  ],
  [
    'unsupported OpenAPI interpretation',
    (f) => {
      f['openapi/test.json'].openapi = '3.0.3';
    },
    'unresolved',
  ],
  [
    'unsupported OpenAPI dialect',
    (f) => {
      f['openapi/test.json'].jsonSchemaDialect = 'https://json-schema.org/draft-07/schema';
    },
    'unresolved',
  ],
  [
    'unsupported inherited schema dialect',
    (f) => {
      f['events/common.json'].$schema = 'https://json-schema.org/draft-07/schema';
    },
    'unresolved',
  ],
  [
    'embedded schema resource',
    (f) => {
      f['events/common.json'].$defs.a.$id = 'https://example.invalid/embedded';
    },
    'unresolved',
  ],
])
  test('tracks interpretation context: ' + name, () => {
    const files = source(),
      locked = snapshot(files);
    change(files);
    const report = impactForConsumer(locked, { contracts: [descriptor] }, reader(files));
    assert.equal(report.affected, true);
    assert.equal(report.dependencies[0].classification, expected);
    assert.deepEqual(report.dependencies[0].gates, dependency.gates);
  });

test('fragment-only selection retains resource context without unrelated definitions', () => {
  const files = source();
  const resource = { ...descriptor, path: 'events/common.json' };
  const selected = { ...dependency, operations: [], pointers: ['/$defs/a/properties/value'] };
  const closure = resolveSelection(reader(files), resource, selected);
  assert.deepEqual(
    closure.units.map((unit) => unit.pointer),
    ['/$defs/a/properties/value', '/$id', '/$schema'],
  );
  files['events/common.json'].$schema = 'https://spec.openapis.org/oas/3.1/dialect/base';
  assert.equal(
    classifyImpact(closure, resolveSelection(reader(files), resource, selected)),
    'review-required',
  );
  files['events/common.json'].$defs.a.$id = 'https://example.invalid/embedded';
  assert.throws(() => resolveSelection(reader(files), resource, selected), /resource scope/);
});

for (const name of ['$schema', '$id'])
  test('rejects malformed inherited resource context: ' + name, () => {
    const files = source(),
      locked = snapshot(files);
    files['events/common.json'][name] = null;
    assert.equal(
      impactForConsumer(locked, { contracts: [descriptor] }, reader(files)).dependencies[0]
        .classification,
      'unresolved',
    );
  });

test('schema dictionaries preserve payload names $schema and $id', () => {
  const files = source();
  files['events/common.json'].$defs.a.properties.$id = { type: 'string' };
  files['events/common.json'].$defs.a.properties.$schema = { type: 'boolean' };
  const locked = resolve(files);
  files['events/common.json'].$defs.a.properties.$id.type = 'number';
  assert.equal(classifyImpact(locked, resolve(files)), 'review-required');
});

test('definitions named like schema keywords still retain their resource scope', () => {
  for (const name of ['properties', '$defs', 'schemas']) {
    const files = source();
    files['events/common.json'].$defs[name] = {
      $id: 'https://example.invalid/embedded',
      properties: { value: { type: 'string' } },
    };
    const resource = { ...descriptor, path: 'events/common.json' };
    const selected = {
      ...dependency,
      operations: [],
      pointers: ['/$defs/' + name + '/properties/value'],
    };
    assert.throws(() => resolveSelection(reader(files), resource, selected), /resource scope/);
  }
});

test('relative schema references use mapped resource URI and reject unknown scopes', () => {
  const files = source();
  files['events/common.json'].$id = 'https://example.invalid/v1/common.json';
  files['events/common.json'].$defs.a.properties.value = { $ref: 'shared.json#/$defs/text' };
  files['events/shared.json'] = { $defs: { text: { type: 'integer' } } };
  files['events/uri-mapped.json'] = { $defs: { text: { type: 'string' } } };
  const mapped = {
    ...descriptor,
    uriMappings: [
      ...descriptor.uriMappings,
      { uri: 'https://example.invalid/v1/shared.json', path: 'events/uri-mapped.json' },
    ],
  };
  const closure = resolveSelection(reader(files), mapped, dependency);
  assert(closure.files.some((file) => file.path === 'events/uri-mapped.json'));
  assert(!closure.files.some((file) => file.path === 'events/shared.json'));
  files['events/common.json'].$id = 'https://example.invalid/v2/common.json';
  assert.throws(() => resolveSelection(reader(files), mapped, dependency), /Unmapped external/);
});

test('impact retains gate commands and does not dispatch consumer changes', () => {
  const files = source(),
    locked = snapshot(files);
  files['events/common.json'].$defs.a.required.push('summary');
  const report = impactForConsumer(locked, { contracts: [descriptor] }, reader(files));
  assert.equal(report.affected, true);
  assert.equal(report.dependencies[0].classification, 'review-required');
  assert.deepEqual(report.dependencies[0].gates, dependency.gates);
});

for (const [purpose, classification] of [
  ['validation', 'validation'],
  ['documentation', 'documentation'],
  ['runtime', 'review-required'],
])
  test('tracks an unreferenced copied asset separately as ' + purpose, () => {
    const files = source(),
      locked = snapshot(files);
    locked.lock.assets = [
      {
        contractId: descriptor.id,
        sourcePath: 'events/unrelated.json',
        destination: 'reference/example.json',
        representation: 'exact',
        purpose,
        sourceSha256: sha256(reader(files)('events/unrelated.json')),
      },
    ];
    files['events/unrelated.json'].type = 'number';
    const result = impactForConsumer(locked, { contracts: [descriptor] }, reader(files));
    assert.equal(result.dependencies.length, 1);
    assert.equal(result.dependencies[0].classification, classification);
    assert.equal(result.dependencies[0].asset, 'reference/example.json');
    delete files['events/unrelated.json'];
    assert.equal(
      impactForConsumer(locked, { contracts: [descriptor] }, reader(files)).dependencies[0]
        .classification,
      'unresolved',
    );
  });

for (const [name, change] of [
  [
    'missing reference',
    (f) => {
      delete f['events/common.json'];
    },
  ],
  [
    'unknown external reference',
    (f) => {
      f['events/common.json'].$defs.a.$ref = 'https://unmapped.invalid/a';
    },
  ],
  [
    'unknown pointer',
    (f) => {
      delete f['events/common.json'].$defs.a;
    },
  ],
  [
    'missing operation',
    (f) => {
      delete f['openapi/test.json'].paths['/a'].get;
    },
  ],
  [
    'unknown version',
    (f) => {
      f['openapi/test.json'].info.version = '2.0.0';
    },
  ],
  [
    'unsupported reference dialect',
    (f) => {
      f['events/common.json'].$defs.a.$dynamicRef = '#node';
    },
  ],
  [
    'path traversal',
    (f) => {
      f['events/common.json'].$defs.a.$ref = '../../../secret.json';
    },
  ],
])
  test('fails closed for ' + name, () => {
    const files = source(),
      locked = snapshot(files);
    change(files);
    assert.throws(() => resolve(files));
    const report = impactForConsumer(locked, { contracts: [descriptor] }, reader(files));
    assert.equal(report.affected, true);
    assert.equal(report.dependencies[0].classification, 'unresolved');
  });

test('resolves finite reference cycles without silently dropping their unit', () => {
  const files = source();
  files['events/common.json'].$defs.a.properties.self = { $ref: '#/$defs/a' };
  assert.equal(resolve(files).units.filter((u) => u.pointer === '/$defs/a').length, 1);
});
test('operation override selects effective security without global overreach', () => {
  const files = source();
  files['openapi/test.json'].paths['/a'].get.security = [];
  assert(!resolve(files).units.some((u) => u.pointer.includes('security')));
});
test('rejects duplicate JSON and YAML keys, duplicate operation IDs, aliases and unknown metadata keywords', () => {
  assert.throws(() => parseJSON('{"a":1,"\u0061":2}'), /Duplicate/);
  assert.throws(() => parseSource(Buffer.from('a: 1\na: 2\n'), 'a.yaml'), /Invalid YAML/);
  assert.throws(() => parseSource(Buffer.from('a: &x [1]\nb: *x\n'), 'a.yaml'));
  const doc = source()['openapi/test.json'];
  doc.paths['/b'].get.operationId = 'readA';
  assert.throws(() => operationPointers(doc), /Duplicate/);
  assert.throws(() => validateShape('x', { type: 'string', maxLength: 1 }), /Unsupported/);
});
test('JSON pointers and confined paths cannot reinterpret missing or inherited properties', () => {
  assert.equal(pointer({ 'a/b': { '~': 3 } }, '/a~1b/~0'), 3);
  assert.equal(pointer({ a: { b: 3 } }, '/a%2Fb'), 3);
  assert.throws(() => pointer({}, '/toString'));
  assert.throws(() => pointer({ '~2': 1 }, '/~2'));
  for (const p of ['../a', '/a', 'C:/a', 'a\\b', 'a//b', 'a/./b', 'https://example.invalid'])
    assert.throws(() => safePath('.', p));
});
