import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';
import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';
import { stockConsumerCandidate, stockConsumerHistoricalFile, stockConsumerHistoricalSnapshot } from './stock-consumer-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const launcher = path.resolve(root, '../..');
export const captureConsumerBase = 'bcb2d3cfb7296441c13a1cf4e2e32fed9aa59b75';
const base = gitReader(root, captureConsumerBase);
const registryPath = 'registry/contracts.json', indexPath = 'registry/consumers/index.json';
const bridgePath = 'scripts/inventory/capture-authority-v2-admission.mjs';
const snapshotBridgePath = 'scripts/identity/catalog-workload-consumers-v2-registry.mjs';
const indexBridgePath = 'scripts/catalog/catalog-foundation-v1-registry.mjs';
const salesBridgePath = 'scripts/sales/inventory-step-consumer-v1.mjs';
const salesTestPath = 'test/sales/inventory-step-consumer-v1.test.mjs';
const workflowPath = '.github/workflows/ci.yml', workflowTestPath = 'test/ci/github-v1.test.mjs';
const scopePath = 'scripts/ci/validation-scope-v1.mjs', scopeTestPath = 'test/ci/validation-scope-v1.test.mjs';
const modulePath = 'scripts/inventory/capture-consumers-v1.mjs', testPath = 'test/inventory/capture-consumers-v1.test.mjs';
export const captureConsumerSources = Object.freeze({
  'identity-tenancy': '0de5544f34498e510179354c9f9cd80b099d0fe0',
  'catalog-pricing': '61d35953cefed2e22ea903cf330c15c4958405d4',
  inventory: '0d14f9509ade1619bf2112026a28a10a3765da07',
});
export const captureConsumerFiles = Object.freeze([
  registryPath, indexPath, bridgePath, snapshotBridgePath, indexBridgePath, salesBridgePath, salesTestPath, workflowPath, workflowTestPath, scopePath, scopeTestPath, 'registry/consumers/identity-tenancy.json',
  'registry/consumers/catalog-pricing.json', 'registry/consumers/inventory.json',
  'inventory/README.md', 'registry/README.md', modulePath, testPath,
  'scripts/inventory/stock-consumer-v1.mjs', 'test/inventory/stock-consumer-v1.test.mjs',
]);
const text = value => new TextDecoder('utf-8', { fatal: true }).decode(value).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(base(file));
const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:e2e'];
function selection(id, role, version, operations = [], pointers = []) {
  return { id, role, version, operations, pointers,
    purpose: 'F1-11B physical capture only: exact preparation binding, current human authority and no stock effect.', gates: [...gates] };
}
function manifestFor(owner) {
  if (owner === 'identity-tenancy') {
    const manifest = json('registry/consumers/identity-tenancy.json').manifest;
    const policy = manifest.contracts.find(row => row.id === 'identity.inventory-authority.policy.v1' && row.role === 'semantic-owner');
    policy.pointers.push('/profiles/1', '/profiles/2', '/profiles/3');
    return manifest;
  }
  const capture = [
    selection('catalog.inventory-capture.http.v1', owner === 'inventory' ? 'consumer' : 'producer', '1.0.0', ['captureInventoryCatalog']),
    selection('catalog.inventory-capture.schema.v1', 'validation', 'v1', [], ['/$defs/CaptureRequest', '/$defs/Capture']),
    selection('inventory.catalog-capture-authority.http.v2', owner === 'inventory' ? 'producer' : 'consumer', '2.0.0', ['authorizeInventoryCatalogCapture']),
    selection('inventory.catalog-capture-authority.schema.v2', 'validation', 'v2', [], ['']),
    selection('identity.inventory-authority.policy.v1', 'consumer', 'v1', [], owner === 'inventory'
      ? ['/profiles/0', '/profiles/2', '/profiles/3', '/issuance', '/permissions/3'] : ['/profiles/2', '/profiles/3', '/issuance']),
  ];
  if (owner === 'catalog-pricing') {
    const manifest = json('registry/consumers/catalog-pricing.json').manifest;
    manifest.contracts.push(...capture);
    return manifest;
  }
  assert.equal(owner, 'inventory', 'ICC_OWNER');
  return { formatVersion: 1, service: owner, contracts: [
    ...capture,
    selection('identity.internal-auth.v1', 'consumer', '1.0.0', ['issueInternalServiceToken', 'getInternalIdentityJwks']),
    selection('identity.inventory-authority.http.v1-1', 'consumer', '1.1.0', ['checkInventoryAuthorization']),
    selection('identity.inventory-authority.schema.v1', 'validation', 'v1', [], ['/$defs/Authorization', '/$defs/CanonicalRequest/oneOf/3']),
    selection('inventory.types.v1', 'validation', 'v1', [], ['/$defs/AdjustmentRequest']),
  ], assets: [], bindings: [] };
}

export function captureAdmissionBridge() {
  let source = text(base(bridgePath));
  const replace = (before, after) => {
    assert.equal(source.split(before).length, 2, 'ICC_BRIDGE_ANCHOR'); source = source.replace(before, after);
  };
  replace("import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';",
    "import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';\nimport { captureConsumerFiles, withCaptureConsumers, captureConsumerReadView, captureConsumerHistoricalFile, captureConsumerHistoricalRegistry } from './capture-consumers-v1.mjs';");
  replace('  verifierPath, modulePath, testPath,', '  verifierPath, modulePath, testPath, ...captureConsumerFiles,');
  replace('export function validateAdmission(read = readRepositoryFile) {',
    'export function validateAdmission(rawRead = readRepositoryFile) {\n  return withCaptureConsumers(rawRead, read => {');
  replace('  return { ...result };\n}', '  return { ...result };\n  });\n}');
  replace('export function withAdmissionDelta(read, verifySource) {',
    'export function withAdmissionDelta(rawRead, verifySource) {\n  return withCaptureConsumers(rawRead, read => {');
  replace('    return target && text(bytes) === text(target) ? admissionSource(file) : bytes;\n  });\n}',
    '    return target && text(bytes) === text(target) ? admissionSource(file) : bytes;\n  });\n  });\n}');
  replace('export function admissionReadView(read = readRepositoryFile) {',
    'export function admissionReadView(read = readRepositoryFile) {\n  const view = captureConsumerReadView(read);');
  replace('    if (target) validateAdmission(read);\n    const bytes = read(file);',
    '    if (target) validateAdmission(read);\n    const bytes = view(file);');
  replace('export function admissionHistoricalFile(file, bytes) {',
    'export function admissionHistoricalFile(file, bytes) {\n  bytes = captureConsumerHistoricalFile(file, bytes);');
  replace('export function admissionHistoricalRegistry(registry) {',
    'export function admissionHistoricalRegistry(registry) {\n  registry = captureConsumerHistoricalRegistry(registry);');
  return Buffer.from(source);
}

function captureSnapshotBridge() {
  const source = text(base(snapshotBridgePath));
  const anchor = 'export function consumerSnapshotView(snapshot) {';
  assert.equal(source.split(anchor).length, 2, 'ICC_SNAPSHOT_BRIDGE_ANCHOR');
  return Buffer.from("import { captureConsumerHistoricalSnapshot } from '../inventory/capture-consumers-v1.mjs';\n" +
    source.replace(anchor, anchor + '\n  snapshot = captureConsumerHistoricalSnapshot(snapshot);'));
}
function captureIndexBridge() {
  const source = text(base(indexBridgePath));
  const anchor = '  index = salesHistoricalIndex(index);';
  assert.equal(source.split(anchor).length, 2, 'ICC_INDEX_BRIDGE_ANCHOR');
  return Buffer.from("import { captureConsumerHistoricalIndex } from '../inventory/capture-consumers-v1.mjs';\n" +
    source.replace(anchor, '  index = salesHistoricalIndex(captureConsumerHistoricalIndex(index));'));
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'ICC_COMPATIBILITY_ANCHOR');
  return source.replace(before, after);
}
function captureSalesBridge() {
  let source = replaceOnce(text(base(salesBridgePath)), 'export function salesHistoricalIndex(value) {',
    'export function salesHistoricalIndex(value) {\n  value = captureConsumerHistoricalIndex(value);');
  source = replaceOnce(source,
    "    assert.deepEqual(readFile('registry/consumers/' + service + '.json'), source('registry/consumers/' + service + '.json'), 'SALES_PRIOR_CONSUMER');",
    "    assert(readFile('registry/consumers/' + service + '.json').equals(source('registry/consumers/' + service + '.json')), 'SALES_PRIOR_CONSUMER');");
  return Buffer.from("import { captureConsumerHistoricalIndex } from '../inventory/capture-consumers-v1.mjs';\n" + source);
}
function captureSalesTest() {
  const before = "  assert.throws(()=>validateSalesAdmission(name=>name===file?Buffer.concat([read(name),Buffer.from('\\nUnapproved')]):read(name)));";
  return Buffer.from(replaceOnce(text(base(salesTestPath)), before,
    before.slice(0, -2) + ",file==='registry/consumers/catalog-pricing.json'?/SALES_PRIOR_CONSUMER/:undefined);"));
}
const salesCommand = 'node --test --test-reporter=tap test/sales/*.test.mjs';
const boundedSalesCommand = 'node --test --test-reporter=tap --test-concurrency=2 test/sales/*.test.mjs';
const fullCondition = "needs.validation_scope.outputs.mode == 'full'";
const salesCondition = fullCondition + " || needs.validation_scope.outputs.mode == 'sales-only'";
const salesOnlyExpression = "${{ github.event_name == 'workflow_dispatch' && inputs.sales_only }}";
const salesOnlyInput = { description: 'Sales diagnostic only; full CI remains required for closure', type: 'boolean', default: false };
function captureWorkflow() {
  let source = replaceOnce(text(base(workflowPath)), salesCommand, boundedSalesCommand);
  // Exact hosting-policy delta: branch pushes schedule no CI; tags stay full.
  source = replaceOnce(source, '  push: null', "  push:\n    tags:\n      - '**'");
  source = replaceOnce(source, '  workflow_dispatch: null', '  workflow_dispatch:\n    inputs:\n      sales_only:\n        description: ' + salesOnlyInput.description + '\n        type: boolean\n        default: false');
  source = replaceOnce(source, '        run: node scripts/ci/validation-scope-v1.mjs\n        env:',
    '        run: node scripts/ci/validation-scope-v1.mjs\n        env:\n          CONTRACTS_SALES_ONLY: ' + salesOnlyExpression);
  source = replaceOnce(source, "    name: validate:sales-contracts\n    needs: [validation_scope]\n    if: " + fullCondition,
    '    name: validate:sales-contracts\n    needs: [validation_scope]\n    if: ' + salesCondition);
  return Buffer.from(source);
}
function captureScope() {
  let source = replaceOnce(text(base(scopePath)), "  const fallback = reason => ({ mode: 'full', reason, files: [], tests: [] });",
    "  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.CONTRACTS_SALES_ONLY === 'true')\n    return { mode: 'sales-only', reason: 'EXPLICIT_SALES_DIAGNOSTIC', files: [], tests: [] };\n  const fallback = reason => ({ mode: 'full', reason, files: [], tests: [] });");
  source = replaceOnce(source, "${plan.mode === 'fast' ? 'Parcial:", "${plan.mode !== 'full' ? 'Parcial:");
  source = replaceOnce(source, "  assert.equal(env.GITHUB_REPOSITORY, 'opencomerix/contracts', 'SCOPE_REPOSITORY');",
    "  assert.equal(typeof env.GITHUB_REPOSITORY === 'string' ? env.GITHUB_REPOSITORY.toLowerCase() : undefined,\n    'opencomerix/contracts', 'SCOPE_REPOSITORY');");
  return Buffer.from(source);
}
function captureScopeTest() {
  const anchor = "  assert.equal(planFromCheckout(root, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }).mode, 'full');";
  let source = replaceOnce(text(base(scopeTestPath)), anchor, anchor +
    "\n  for (const ref of ['refs/tags/v1.0.0', 'refs/tags/sales/v1.0.0'])\n    assert.equal(planFromCheckout(root, { ...env, GITHUB_REF: ref, CONTRACTS_SALES_ONLY: 'true' }).mode, 'full');" +
    "\n  assert.equal(planFromCheckout(root, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', CONTRACTS_SALES_ONLY: 'true' }).mode, 'sales-only');" +
    "\n  for (const flag of ['false', '', 'TRUE']) assert.equal(planFromCheckout(root, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', CONTRACTS_SALES_ONLY: flag }).mode, 'full');" +
    "\n  put('event.json', JSON.stringify(event));\n  assert.equal(planFromCheckout(root, { ...env, CONTRACTS_SALES_ONLY: 'true' }).mode, 'fast');" +
    "\n  assert.throws(() => planFromCheckout(root, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', CONTRACTS_SALES_ONLY: 'true', GITHUB_SHA: before }), /SCOPE_CHECKOUT_SHA/);");
  source = replaceOnce(source, "  assert.equal(planFromCheckout(root, env).mode, 'fast');", `  assert.equal(planFromCheckout(root, env).mode, 'fast');
  for (const repository of ['OpenComerix/contracts', 'OPENCOMERIX/CONTRACTS']) {
    const manual = { ...env, GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'workflow_dispatch' };
    assert.equal(planFromCheckout(root, manual).mode, 'full');
    assert.equal(planFromCheckout(root, { ...manual, CONTRACTS_SALES_ONLY: 'true' }).mode, 'sales-only');
    assert.throws(() => planFromCheckout(root, { ...manual, GITHUB_SHA: before }), /SCOPE_CHECKOUT_SHA/);
  }
  for (const repository of [undefined, null, '', 'foreign/contracts', 'opencomerix/other',
    'opencomerix/contracts/extra', ' opencomerix/contracts'])
    assert.throws(() => planFromCheckout(root, { ...env, GITHUB_REPOSITORY: repository }), /SCOPE_REPOSITORY/);
  put('event.json', JSON.stringify({ ...event, repository: { full_name: 'OpenComerix/contracts' } }));
  assert.equal(planFromCheckout(root, { ...env, GITHUB_REPOSITORY: 'OpenComerix/contracts' }).mode, 'fast');
  assert.equal(planFromCheckout(root, env).reason, 'FULL_UNVERIFIED_EVENT');
  put('event.json', JSON.stringify(event));`);
  return Buffer.from(source);
}
function captureWorkflowTest() {
  let source = replaceOnce(text(base(workflowTestPath)), 'const parallelCommands = new Map([',
    "const parallelCommands = new Map([\n  ['validate:sales-contracts', new Map([\n    ['" + salesCommand + "', '" + boundedSalesCommand + "'],\n  ])],");
  source = replaceOnce(source,
    "test('scope selection preserves the entire reviewed full jobs and avoids duplicate PR runs',",
    "test('miniphase CI preserves full jobs, excludes branch pushes and keeps tags and manual runs',");
  source = replaceOnce(source, '    assert.deepEqual(current, original, key);',
    "    if (key === 'validate_sales_contracts') {\n      const step = original.steps.find(step => step.name === 'Run original validation commands');\n      step.run = step.run.replace('" + salesCommand + "', '" + boundedSalesCommand + "');\n    }\n    assert.deepEqual(current, original, key);");
  source = replaceOnce(source, '/GITHUB_MIGRATION_BYTES/);', '/IC2A_EXACT_METADATA/);');
  source = replaceOnce(source, '/CI_SCOPE_BYTES/);', '/IC2A_EXACT_METADATA/);');
  source = replaceOnce(source, '    assert.equal(job.if, "' + fullCondition + '");',
    '    assert.equal(job.if, name === \'validate:sales-contracts\' ? "' + salesCondition + '" : "' + fullCondition + '");');
  source = replaceOnce(source, '    assert.equal(condition, "' + fullCondition + '");',
    '    assert.equal(condition, key === \'validate_sales_contracts\' ? "' + salesCondition + '" : "' + fullCondition + '");');
  source = replaceOnce(source, '  assert.deepEqual(workflow.on, { push: null, workflow_dispatch: null });',
    '  assert.deepEqual(workflow.on, ' + JSON.stringify({ push: { tags: ['**'] }, workflow_dispatch: { inputs: { sales_only: salesOnlyInput } } }) + ');');
  source = replaceOnce(source, "  assert.equal(scope.name, 'validate:scope');",
    "  assert.equal(scope.name, 'validate:scope');\n  assert.equal(scope.steps.find(step => step.id === 'scope').env.CONTRACTS_SALES_ONLY, " + JSON.stringify(salesOnlyExpression) + ');');
  return Buffer.from(source);
}

let modelCache;
function model() {
  if (modelCache) return modelCache;
  const registry = json(registryPath);
  assert.equal(registry.contracts.length, 202, 'ICC_BASE_ROOTS');
  registry.requiredConsumers.push('inventory');
  const index = json(indexPath);
  index.coverage = 'Seven known consumers; F1-11B Inventory physical capture only; external consumers remain unknown.';
  index.consumers.push({ service: 'inventory', file: 'inventory.json', localDirectory: 'services/inventory' });
  const metadata = new Map([[registryPath, encode(registry)], [indexPath, encode(index)], [bridgePath, captureAdmissionBridge()], [snapshotBridgePath, captureSnapshotBridge()], [indexBridgePath, captureIndexBridge()]]);
  metadata.set(salesBridgePath, captureSalesBridge());
  metadata.set(salesTestPath, captureSalesTest());
  metadata.set(workflowPath, captureWorkflow());
  metadata.set(workflowTestPath, captureWorkflowTest());
  metadata.set(scopePath, captureScope());
  metadata.set(scopeTestPath, captureScopeTest());
  const snapshots = new Map(), closures = new Map();
  for (const owner of Object.keys(captureConsumerSources)) {
    const manifest = manifestFor(owner), previous = owner === 'inventory' ? undefined : json('registry/consumers/' + owner + '.json');
    const manifestBytes = encode(manifest), lock = makeLock(root, manifest, manifestBytes, registry, previous?.lock.entries ?? []);
    if (previous) for (const old of previous.lock.entries) {
      const next = lock.entries.find(row => row.id === old.id && row.role === old.role && row.version === old.version);
      assert(next, 'ICC_PRIOR_SELECTION_OMITTED');
      if (old.id === 'identity.inventory-authority.policy.v1' && owner === 'identity-tenancy') {
        for (const key of ['commit', 'tag', 'tagObject', 'root', 'files']) assert.deepEqual(next[key], old[key], 'ICC_PRIOR_PIN');
        for (const unit of old.units) assert(next.units.some(row => isDeepStrictEqual(row, unit)), 'ICC_PRIOR_UNIT');
      } else assert.deepEqual(next, old, 'ICC_PRIOR_PIN');
    }
    const snapshot = { formatVersion: 1, publication: 'published', sourceRepository: 'opencomerix/' + owner,
      sourceCommit: captureConsumerSources[owner], manifestSha256: hash(manifestBytes), lockSha256: hash(encode(lock)), manifest, lock };
    snapshots.set(owner, snapshot); metadata.set('registry/consumers/' + owner + '.json', encode(snapshot));
    for (const entry of lock.entries) for (const file of entry.files)
      if (!closures.has(file.path)) closures.set(file.path, gitReader(root, entry.commit)(file.path));
  }
  const suffix = '\n## F1-11B — Consumo coordinado de captura física\n\n' +
    'Selecciones publicadas de Identity, Catalog e Inventory para captura física y verificación v2; siete consumidores conocidos. Se conservan las 202 raíces, 236 artefactos y todos los pins previos. Las secciones anteriores describen sus snapshots históricos. Manifiestos/locks y gates propios están en cada servicio; este registro de consumo no acredita por sí solo runtime ni CI. [Gate específico](../scripts/inventory/capture-consumers-v1.mjs).\n';
  for (const file of ['inventory/README.md', 'registry/README.md']) metadata.set(file, Buffer.from(text(base(file)) + suffix));
  const unchanged = new Map();
  for (const owner of json(registryPath).requiredConsumers)
    if (!snapshots.has(owner)) unchanged.set('registry/consumers/' + owner + '.json', base('registry/consumers/' + owner + '.json'));
  modelCache = { registry, metadata, snapshots, closures, unchanged };
  return modelCache;
}
export const captureConsumerMetadata = () => new Map([...model().metadata].map(([file, bytes]) => [file, Buffer.from(bytes)]));
export const captureConsumerManifests = () => new Map([...model().snapshots].map(([owner, snapshot]) => [owner, structuredClone(snapshot.manifest)]));
export function validateCaptureConsumers(read = readRepositoryFile, diagnostic = 'ICC_LIVE_DRIFT') {
  const expected = model();
  for (const [file, bytes] of [...expected.metadata, ...expected.unchanged, ...expected.closures]) {
    const current = read(file);
    if (file === 'registry/consumers/inventory.json' && text(current) !== text(bytes)) {
      // Preserve B's complete source checks. C's additional closure has its own validator;
      // traversing it through a historical reader would recursively re-enter these projections.
      assert.equal(text(current), text(stockConsumerCandidate()), diagnostic + ':' + file);
    } else assert(text(current) === text(bytes), diagnostic + ':' + file);
  }
  for (const file of [modulePath, testPath]) assert(read(file).length > 0, 'ICC_TOOL_MISSING:' + file);
  return { consumers: 7, roots: 202, preserved: 236, previousPinsPreserved: true, runtimeDemonstrated: false };
}
export function withCaptureConsumers(read, verify) {
  validateCaptureConsumers(read, 'IC2A_EXACT_METADATA');
  return verify(file => {
    const bytes = stockConsumerHistoricalFile(file, read(file)), expected = model().metadata.get(file);
    return expected && file !== 'registry/consumers/inventory.json' && text(bytes) === text(expected) ? base(file) : bytes;
  });
}
export function captureConsumerReadView(read = readRepositoryFile) {
  return file => {
    const bytes = read(file), expected = model().metadata.get(file);
    const historical = stockConsumerHistoricalFile(file, bytes);
    if (historical !== bytes) { validateCaptureConsumers(read); return historical; }
    if (!expected || file === 'registry/consumers/inventory.json' || text(bytes) !== text(expected)) return bytes;
    validateCaptureConsumers(read); return base(file);
  };
}
export function captureConsumerHistoricalFile(file, bytes) {
  const historical = stockConsumerHistoricalFile(file, bytes);
  if (historical !== bytes) { validateCaptureConsumers(); return historical; }
  const expected = model().metadata.get(file);
  if (!expected || file === 'registry/consumers/inventory.json' || text(bytes) !== text(expected)) return bytes;
  validateCaptureConsumers(); return base(file);
}
export function captureConsumerHistoricalRegistry(value) {
  if (!isDeepStrictEqual(value, model().registry)) return value;
  validateCaptureConsumers(); return json(registryPath);
}
export function captureConsumerHistoricalSnapshot(value) {
  const historical = stockConsumerHistoricalSnapshot(value);
  if (historical !== value) { validateCaptureConsumers(); return historical; }
  const service = value?.manifest?.service;
  const expected = model().snapshots.get(service);
  if (!expected || service === 'inventory' || !isDeepStrictEqual(value, expected)) return value;
  validateCaptureConsumers();
  return json('registry/consumers/' + service + '.json');
}
export function captureConsumerHistoricalIndex(value) {
  if (!isDeepStrictEqual(value, JSON.parse(model().metadata.get(indexPath)))) return value;
  validateCaptureConsumers();
  return json(indexPath);
}

function sync() {
  const expected = model();
  for (const [owner, snapshot] of expected.snapshots) {
    const directory = path.join(launcher, 'services', owner);
    const files = new Map([['contracts.manifest.json', encode(snapshot.manifest)], ['contracts.lock.json', encode(snapshot.lock)]]);
    if (owner === 'inventory') {
      const tooling = [['tools/architecture/consumer-gate.mjs', '.contracts/gate.mjs'], ['registry/manifest-v1.schema.json', '.contracts/manifest-v1.schema.json'], ['registry/lock-v1.schema.json', '.contracts/lock-v1.schema.json']];
      for (const [source, destination] of tooling) files.set(destination, base(source));
      files.set('.contracts/provenance.json', encode({ formatVersion: 1, sourceRepository: 'opencomerix/contracts', publication: 'local-candidate',
        sourceBaseCommit: captureConsumerBase, files: tooling.map(([sourcePath, destination]) => ({ sourcePath, destination, sha256: hash(base(sourcePath)) })) }));
    }
    for (const [file, bytes] of files) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
  }
  for (const [file, bytes] of expected.metadata) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--sync')) sync();
  console.log(JSON.stringify(validateCaptureConsumers()));
}
