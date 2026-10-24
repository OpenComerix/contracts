import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock, parseSource, operationPointers, worktreeReader } from '../../tools/architecture/graph.mjs';
import { sha256, pointer, validateConsumer } from '../../tools/architecture/consumer-gate.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const consumptionBase = '7f634dae6cdb3360b3177c987b5975cd120cfd19';
export const ownerBases = Object.freeze({
  'gateway-bff': '195a0751755f52abf8ce3bbfa12b6c47a0e45448',
  'web-pos': '6325d38c0f659890be554080fd58a6479bdaee95',
});
export const consumptionChangedFiles = Object.freeze([
  'scripts/catalog/catalog-consumption-v1-registry.mjs', 'test/architecture/catalog-consumption.test.mjs',
  'registry/consumers/gateway-bff.json', 'registry/consumers/web-pos.json', 'catalog/README.md',
  'scripts/identity/catalog-workload-consumers-v2-registry.mjs', 'test/architecture/catalog-admission.test.mjs',
  'test/architecture/identity-producer-admission.test.mjs',
]);
const source = gitReader(root, consumptionBase);
const baseline = file => JSON.parse(source(file));
const registry = baseline('registry/contracts.json');
export const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const snapshotPath = service => 'registry/consumers/' + service + '.json';
const descriptor = id => {
  const row = registry.contracts.find(row => row.id === id);
  assert.equal(row?.status, 'active', 'A_ACTIVE_SOURCE:' + id);
  return row;
};
const publicRow = descriptor('catalog.http.public.v1');
const publicDocument = parseSource(gitReader(root, publicRow.commit)(publicRow.path), publicRow.path);
const policy = JSON.parse(gitReader(root, publicRow.commit)(descriptor('catalog.security-policy.v1').path));
export const consumptionOperations = Object.freeze(policy.operations.map(row => {
  const operation = pointer(publicDocument, operationPointers(publicDocument).get(row.operation_id));
  const writing = row.method !== 'GET';
  const pricing = row.path.startsWith('/api/v1/pricing/');
  const presentations = /Presentation|Barcode/.test(row.operation_id);
  return Object.freeze({ operationId: row.operation_id, method: row.method, path: row.path,
    permission: row.permission, successStatus: row.success_status,
    gatewayCut: writing ? 'F1-09C' : 'F1-09B',
    webCut: writing ? pricing ? 'F1-09G' : presentations ? 'F1-09F' : 'F1-09E' : 'F1-09D',
    completionCut: pricing ? 'F1-09G' : writing ? presentations ? 'F1-09F' : 'F1-09E' : 'F1-09D',
    query: row.query, requestHeaders: (operation.parameters ?? []).filter(p => p.in === 'header').map(p => p.name),
    responseStatuses: Object.keys(operation.responses),
  });
}));
const common = [
  ['common.error-catalog.v6', 'validation'], ['common.error-catalog.v6.schema', 'validation'],
];
export const selections = Object.freeze({
  'gateway-bff': [
    ['catalog.http.public.v1', 'consumer'], ['catalog.http.private.v1', 'consumer'],
    ['identity.catalog-authority.v1', 'consumer', ['createCatalogDelegation']],
    ['catalog.request.v1', 'consumer'], ['catalog.security-policy.v1', 'consumer'],
    ...common, ['catalog.request-v1-vectors', 'validation'],
    ['identity.catalog-workload-profiles.policy.v2', 'consumer', [],
      ['/policy_version', '/owner', '/profiles/1', '/request', '/credentials', '/privacy']],
  ],
  'web-pos': [
    ['catalog.http.public.v1', 'consumer'], ...common,
    ['catalog.security-policy.v1', 'validation', [], ['/operations', '/public_security']],
  ],
});
const cache = new Map();
export function consumptionSnapshot(service) {
  assert(Object.hasOwn(ownerBases, service), 'A_CONSUMER_OWNER');
  if (!cache.has(service)) {
    const previous = baseline(snapshotPath(service));
    const contracts = selections[service].map(([id, role, operations, pointers]) => {
      const row = descriptor(id);
      assert.equal(row.commit, id === 'identity.catalog-workload-profiles.policy.v2'
        ? '9223c3b6b7c5077d7230d14d16da26a8129d0c51' : '68d923e903b6341eedb980af3586890c0eab7d5e', 'A_SOURCE_REVISION');
      return { id, role, version: row.version, operations: operations ?? row.operations,
        pointers: pointers ?? (row.operations.length ? [] : ['']),
        purpose: 'F1-09A selected catalog preparation only; no runtime, H2 migration or exceptional recovery authority.',
        gates: ['pnpm contracts:metadata', 'pnpm contract:gate'] };
    });
    const bindings = service === 'gateway-bff' ? [
      {kind: 'gateway-operation-registry', path: '.contracts/catalog/operations.mjs', contractId: 'catalog.http.public.v1'},
      {kind: 'gateway-operation-registry', path: '.contracts/catalog/operations.mjs', contractId: 'catalog.http.private.v1'},
      {kind: 'gateway-operation-registry', path: '.contracts/catalog/authority.mjs', contractId: 'identity.catalog-authority.v1'},
    ] : [{kind: 'web-operation-matrix', path: '.contracts/catalog/operations.mjs', contractId: 'catalog.http.public.v1'}];
    const manifest = {...previous.manifest, contracts: [...previous.manifest.contracts, ...contracts],
      assets: [...previous.manifest.assets], bindings: [...previous.manifest.bindings, ...bindings]};
    const first = makeLock(root, manifest, bytes(manifest), registry, previous.lock.entries);
    const copies = new Map();
    for (const entry of first.entries.slice(previous.lock.entries.length)) for (const file of entry.files) {
      if (copies.has(file.path)) {
        assert.equal(copies.get(file.path).sha256, file.sha256, 'A_AMBIGUOUS_COPY');
        continue;
      }
      copies.set(file.path, file);
      manifest.assets.push({contractId: entry.id, sourcePath: file.path,
        destination: '.contracts/catalog/reference/' + file.path, representation: 'exact', purpose: 'validation'});
    }
    const lock = makeLock(root, manifest, bytes(manifest), registry, previous.lock.entries);
    lock.assets.forEach((asset, i) => {
      asset.localSha256 = i < previous.lock.assets.length ? previous.lock.assets[i].localSha256 : asset.sourceSha256;
    });
    assert.deepEqual(lock.entries.slice(0, previous.lock.entries.length), previous.lock.entries, 'A_H2_PINS');
    assert.deepEqual(lock.assets.slice(0, previous.lock.assets.length), previous.lock.assets, 'A_H2_ASSETS');
    cache.set(service, {...previous, publication: 'local-candidate', sourceCommit: ownerBases[service],
      manifestSha256: sha256(bytes(manifest)), lockSha256: sha256(bytes(lock)), manifest, lock});
  }
  return structuredClone(cache.get(service));
}
export function consumptionBindingFiles(service) {
  const comment = '// F1-09A metadata only. Not imported by the application; B–G implement runtime separately.\n';
  const rows = consumptionOperations.map(row => ({...row}));
  if (service === 'gateway-bff') return {
    '.contracts/catalog/operations.mjs': comment + 'export const CATALOG_OPERATIONS = Object.freeze([\n' +
      rows.map(({operationId, ...rest}) => "  { operationId: '" + operationId + "', ..." + JSON.stringify(rest) + ' },').join('\n') + '\n]);\n',
    '.contracts/catalog/authority.mjs': comment + "export const CATALOG_AUTHORITY = Object.freeze([{ operationId: 'createCatalogDelegation' }]);\n",
  };
  assert.equal(service, 'web-pos', 'A_CONSUMER_OWNER');
  return {'.contracts/catalog/operations.mjs': comment + 'export const UI_OPERATION_CONTRACTS = Object.freeze({\n' +
    rows.map(({operationId, ...rest}) => '  ' + operationId + ': { ...' + JSON.stringify(rest) + ' },').join('\n') + '\n});\n'};
}
export function validateConsumptionSnapshot(snapshot) {
  const service = snapshot?.manifest?.service;
  const candidate = consumptionSnapshot(service);
  assert(['local-candidate', 'published'].includes(snapshot.publication) && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit), 'A_CONSUMPTION_SNAPSHOT');
  const expected = snapshot.publication === 'published' ? {...candidate, publication:'published', sourceCommit:snapshot.sourceCommit} : candidate;
  assert(isDeepStrictEqual(snapshot, expected), 'A_CONSUMPTION_SNAPSHOT:' + service);
  return {service, dependencies: snapshot.lock.entries.length, assets: snapshot.lock.assets.length, runtime_demonstrated: false};
}
// Strictly validate the entire new package before projecting the old proof.
// Missing/partial additions and arbitrary changed exports never inherit an exemption.
export function consumptionReadView(read = worktreeReader(root)) {
  return file => {
    const content = read(file);
    const service = Object.keys(ownerBases).find(service => file === snapshotPath(service));
    if (!service || content.equals(source(file))) return content;
    let snapshot;
    try { snapshot = JSON.parse(content); } catch { return content; }
    // Historical malformed-byte negatives must still reach their original guards.
    validateConsumptionSnapshot(snapshot);
    return source(file);
  };
}
export function validateConsumptionPackage(read = worktreeReader(root)) {
  for (const file of ['registry/contracts.json', 'registry/consumers/index.json', 'catalog/index.json', 'identity/index.json', 'common/index.json',
    '.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml',
    ...['identity-tenancy', 'catalog-pricing', 'notifications'].map(snapshotPath)]) {
    assert.equal(read(file).toString('utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'), 'A_PRESERVATION:' + file);
  }
  const checked = new Set();
  for (const service of Object.keys(ownerBases)) {
    const snapshot = consumptionSnapshot(service);
    const previous = baseline(snapshotPath(service));
    for (const entry of snapshot.lock.entries.slice(previous.lock.entries.length)) for (const file of entry.files) {
      if (checked.has(file.path)) continue;
      checked.add(file.path);
      assert.equal(read(file.path).toString('utf8').replaceAll('\r\n', '\n'),
        gitReader(root, entry.commit)(file.path).toString('utf8'), 'A_SOURCE_BYTES:' + file.path);
    }
  }
  return {consumers: Object.keys(ownerBases).map(service => validateConsumptionSnapshot(JSON.parse(read(snapshotPath(service))))),
    operations: consumptionOperations.length, runtime_demonstrated: false};
}
export function validateConsumptionCheckout(service, directory) {
  const expected = consumptionSnapshot(service);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'contracts.manifest.json'))), expected.manifest, 'A_LOCAL_MANIFEST');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'contracts.lock.json'))), expected.lock, 'A_LOCAL_LOCK');
  for (const [file, contents] of Object.entries(consumptionBindingFiles(service)))
    assert.equal(fs.readFileSync(path.join(directory, file), 'utf8'), contents, 'A_BINDING_CONTENT:' + file);
  return validateConsumer(directory);
}
export function validateConsumptionPaths(service, tracked, untracked) {
  const previous = baseline(snapshotPath(service)), candidate = consumptionSnapshot(service);
  const allowed = new Set(['README.md', 'contracts.manifest.json', 'contracts.lock.json']);
  const expected = [...candidate.manifest.assets.slice(previous.manifest.assets.length).map(row => row.destination),
    ...Object.keys(consumptionBindingFiles(service))].sort();
  const additions = new Set(expected);
  for (const file of additions) allowed.add(file);
  for (const file of tracked) assert(allowed.has(file), 'A_CONSUMER_SCOPE:' + file);
  assert.deepEqual([...tracked.filter(file => additions.has(file)), ...untracked].sort(), expected, 'A_CONSUMER_NEW_FILES');
}
export function validateConsumptionLocalScope(service, directory) {
  const git = args => execFileSync('git', args, {cwd:directory, encoding:'utf8'}).trim().split('\n').filter(Boolean);
  validateConsumptionPaths(service, git(['diff', '--name-only', ownerBases[service]]), git(['ls-files', '--others', '--exclude-standard']));
  return validateConsumptionCheckout(service, directory);
}
export function writeConsumptionCandidate(service, directory) {
  // Targeted generation is deliberately separate from the generic all-consumer sync.
  const previous = baseline(snapshotPath(service));
  assert(fs.readFileSync(path.join(directory, 'contracts.manifest.json')).equals(bytes(previous.manifest)), 'A_WRITE_BASE_MANIFEST');
  assert(fs.readFileSync(path.join(directory, 'contracts.lock.json')).equals(bytes(previous.lock)), 'A_WRITE_BASE_LOCK');
  const expected = consumptionSnapshot(service);
  const write = (file, content) => {
    const target = path.join(directory, file);
    assert(!fs.existsSync(target), 'A_WRITE_EXISTING:' + file);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, content, {flag:'wx'});
  };
  for (const asset of expected.lock.assets.slice(previous.lock.assets.length)) {
    const entry = expected.lock.entries.find(row => row.id === asset.contractId);
    write(asset.destination, gitReader(root, entry.commit)(asset.sourcePath));
  }
  for (const [file, content] of Object.entries(consumptionBindingFiles(service))) write(file, content);
  fs.writeFileSync(path.join(directory, 'contracts.manifest.json'), bytes(expected.manifest));
  fs.writeFileSync(path.join(directory, 'contracts.lock.json'), bytes(expected.lock));
  fs.writeFileSync(path.join(root, snapshotPath(service)), bytes(expected));
  return validateConsumptionCheckout(service, directory);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === '--write') {
    assert.equal(process.argv.length, 3, 'A_USAGE');
    for (const [service, relative] of [['gateway-bff', '../../services/gateway-bff'], ['web-pos', '../../frontend/web-pos']])
      console.log(JSON.stringify(writeConsumptionCandidate(service, path.resolve(root, relative))));
  } else if (process.argv[2] === '--local') {
    assert.equal(process.argv.length, 3, 'A_USAGE');
    validateConsumptionPackage();
    for (const [service, relative] of [['gateway-bff', '../../services/gateway-bff'], ['web-pos', '../../frontend/web-pos']])
      console.log(JSON.stringify(validateConsumptionLocalScope(service, path.resolve(root, relative))));
  } else {
    assert.equal(process.argv.length, 2, 'A_USAGE');
    console.log(JSON.stringify(validateConsumptionPackage()));
  }
}
