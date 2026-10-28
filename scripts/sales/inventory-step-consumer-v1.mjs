import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';
import { sha256, validateConsumer } from '../../tools/architecture/consumer-gate.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const base = '86abfaaa3fdfd04a66bdb7dc21879417a46d3f08';
export const publishedOwnerCommits = Object.freeze({
  'sales-pos': '80cdff837716f00a592caee952e3abce47a5b8d4',
  'identity-tenancy': 'dcaf4b8a6fc2b91fa0601365c09d1b613aa10fd1',
});
const sourceReader = gitReader(root, base), immutableSources = new Map();
export const source = file => {
  if (!immutableSources.has(file)) immutableSources.set(file, sourceReader(file));
  return Buffer.from(immutableSources.get(file));
};
const launcher = path.resolve(root, '../..');
const read = file => fs.readFileSync(path.join(root, file));
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const prior = file => JSON.parse(source(file));
const registry = prior('registry/contracts.json');
const purpose = 'F1-11A minimum persisted Sales step authority; no public sale, stock/payment effects or full F1-13 coordinator.';
export const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:process-authority-runtime'];
export const salesChangedPaths = Object.freeze(['registry/contracts.json','registry/consumers/index.json',
  'registry/consumers/identity-tenancy.json','registry/consumers/sales-pos.json','sales/README.md',
  'scripts/sales/inventory-step-consumer-v1.mjs','test/sales/inventory-step-consumer-v1.test.mjs',
  'scripts/identity/inventory-authority-consumer-v1.mjs','scripts/identity/inventory-authority-v1-1-admission.mjs',
  'scripts/identity/inventory-authority-v1-1.mjs','test/architecture/catalog-lifecycle.test.mjs']);
export const guardTransitionFiles = ['scripts/identity/inventory-authority-consumer-v1.mjs',
  'scripts/identity/inventory-authority-v1-1-admission.mjs','scripts/identity/inventory-authority-v1-1.mjs',
  'scripts/catalog/catalog-foundation-v1-registry.mjs',
  'scripts/catalog/catalog-lifecycle-v1-registry.mjs','scripts/catalog/catalog-runtime-v1-registry.mjs'];
export const admissionScope = [...salesChangedPaths,...guardTransitionFiles.filter(file=>!salesChangedPaths.includes(file))];
const candidates = new Map();
export function salesManifest() {
  const selections = [
    ['sales.inventory-step-authority.http.v1', 'producer', ['authorizeSaleProcessStep'], []],
    ['sales.inventory-step-authority.schema.v1', 'validation', [], ['']],
    ['inventory.post-sale-stock.v1', 'producer', [], ['']],
    ['inventory.compensate-sale-stock.v1', 'producer', [], ['']],
    ['inventory.post-sale-stock.result.v1', 'validation', [], ['']],
    ['inventory.compensate-sale-stock.result.v1', 'validation', [], ['']],
    ['sales.f1-10d.sales-protocol-policy-v2', 'semantic-owner', [], ['/limits', '/sequence', '/identity', '/retries']],
    ['identity.inventory-authority.policy.v1', 'consumer', [], ['/profiles/4', '/issuance']],
    ['common.error-catalog.v9', 'validation', [], ['']],
  ];
  const contracts = selections.map(([id, role, operations, pointers]) => {
    const descriptor = registry.contracts.find(row => row.id === id);
    assert.equal(descriptor?.status, 'active');
    assert.equal(descriptor.commit, '7cd2b548fb909c5eff47d0319c162c498ee68e92');
    return { id, role, version: descriptor.version, operations, pointers, purpose, gates };
  });
  // Assets are the exact canonical files of selected closures, not a second contract source.
  const manifest = { formatVersion: 1, service: 'sales-pos', contracts, assets: [], bindings: [] };
  const lock = makeLock(root, manifest, encode(manifest), registry);
  const files = new Map();
  for (const entry of lock.entries) for (const file of entry.files)
    if (!files.has(file.path)) files.set(file.path, entry.id);
  manifest.assets = [...files].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([sourcePath, contractId]) => ({
    contractId, sourcePath, destination: 'src/modules/sale-process/transport/contracts/' + sourcePath,
    representation: 'exact', purpose: 'runtime',
  }));
  return manifest;
}
export function identityManifest() {
  const manifest = prior('registry/consumers/identity-tenancy.json').manifest;
  const policy = manifest.contracts.find(row => row.id === 'identity.inventory-authority.policy.v1');
  assert.deepEqual(policy.pointers, ['/policy_version', '/owner', '/extends_without_changing', '/profiles/0', '/permissions', '/issuance', '/template']);
  policy.pointers.push('/profiles/4');
  return manifest;
}
export function candidate(service) {
  assert(['sales-pos','identity-tenancy'].includes(service), 'SALES_OWNER');
  if (candidates.has(service)) return structuredClone(candidates.get(service));
  const manifest = service === 'sales-pos' ? salesManifest() : identityManifest();
  const pins = service === 'identity-tenancy' ? prior('registry/consumers/identity-tenancy.json').lock.entries : [];
  const lock = makeLock(root, manifest, encode(manifest), registry, pins);
  for (const asset of lock.assets) asset.localSha256 = asset.sourceSha256;
  const result = { formatVersion: 1, publication: 'local-candidate', sourceRepository: 'opencomerix/' + service,
    sourceCommit: service === 'sales-pos' ? '56f1222ad137e661788215b92104d14656e89774' : 'ba13dcda413d6ee7fd04d30b6365d2a7e4e95f06',
    manifestSha256: sha256(encode(manifest)), lockSha256: sha256(encode(lock)), manifest, lock };
  candidates.set(service,result);
  return structuredClone(result);
}
export function publishedCandidate(service) {
  return { ...candidate(service), publication: 'published', sourceCommit: publishedOwnerCommits[service] };
}
export function validateSalesSnapshot(service, snapshot) {
  const expected = snapshot?.publication === 'published' ? publishedCandidate(service) : candidate(service);
  assert.deepEqual(snapshot, expected, 'SALES_SNAPSHOT:' + service);
}
export function verifyPublishedSalesSnapshot(service, snapshot, readPublished) {
  validateSalesSnapshot(service, snapshot);
  assert.equal(snapshot.publication, 'published', 'SALES_PUBLICATION');
  assert.equal(typeof readPublished, 'function', 'SALES_PUBLISHED_GIT_REQUIRED');
  verifyLocalSnapshot(candidate(service), snapshot, readPublished);
}
export function expectedRegistry() {
  const value = structuredClone(registry);
  value.requiredConsumers.push('sales-pos');
  return value;
}
export function expectedIndex() {
  const index = prior('registry/consumers/index.json');
  index.coverage = 'Six known consumers; Sales minimum Inventory step authority added; external consumers remain unknown.';
  index.consumers.push({ service: 'sales-pos', file: 'sales-pos.json', localDirectory: 'services/sales-pos' });
  return index;
}
export function validateSalesAdmission(readFile = read) {
  assert.deepEqual(JSON.parse(readFile('registry/contracts.json')), expectedRegistry(), 'SALES_REGISTRY');
  assert.deepEqual(JSON.parse(readFile('registry/consumers/index.json')), expectedIndex(), 'SALES_INDEX');
  for (const service of ['sales-pos', 'identity-tenancy'])
    validateSalesSnapshot(service, JSON.parse(readFile('registry/consumers/' + service + '.json')));
  for (const service of registry.requiredConsumers.filter(owner => owner !== 'identity-tenancy'))
    assert.deepEqual(readFile('registry/consumers/' + service + '.json'), source('registry/consumers/' + service + '.json'), 'SALES_PRIOR_CONSUMER');
  assert.equal(normalize(readFile('sales/README.md')), normalize(source('sales/README.md')) + salesReadmeSuffix, 'SALES_MAP');
  assert.equal(normalize(readFile(historicalTest)), normalize(historicalTestBytes()), 'SALES_HISTORICAL_TEST');
  for (const file of guardTransitionFiles)
    assert.equal(normalize(readFile(file)),normalize(transitionBytes(file)), 'SALES_GUARD_TRANSITION:'+file);
  return { consumers: 6, salesSelections: 9, identitySelections: 36, preservedIdentityPins: 35, runtimeDemonstrated: false };
}
const normalize = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
export const salesReadmeSuffix = '\n## F1-11A — Proveedor mínimo Sales para Inventory\n\n' +
  'El [snapshot Sales](../registry/consumers/sales-pos.json) fija nueve selecciones: proveedor privado de autoridad de pasos, comandos Inventory originales, resultados solo para validación, límites de protocolo, perfil Inventory→Sales y errores v9. La ampliación Identity conserva 36 selecciones y añade únicamente `/profiles/4` a su política Inventory, sin repinear las demás entradas. Se preservan 200 raíces, dos planned, transportes y los otros cuatro snapshots; el registro incorpora al sexto consumidor. [Verificador](../scripts/sales/inventory-step-consumer-v1.mjs) y [pruebas](../test/sales/inventory-step-consumer-v1.test.mjs) reconstruyen los cambios desde Git inmutable y rechazan drift antes de proyectar la metadata histórica. Los exports published admiten solo Sales `'+publishedOwnerCommits['sales-pos']+'` e Identity `'+publishedOwnerCommits['identity-tenancy']+'`, con el mismo contenido candidato y procedencia Git verificada por la importación canónica; autorización y CI exacta son controles operativos separados. No acredita el flujo completo de venta/cobro/stock ni habilita consumidores nuevos por inferencia.\n';
export const historicalTest = 'test/architecture/catalog-lifecycle.test.mjs';
export function historicalTestBytes() {
  const original = normalize(source(historicalTest));
  const before = "JSON.parse(fs.readFileSync(path.join(root, 'registry/consumers/index.json'), 'utf8'))";
  assert.equal(original.split(before).length,2,'SALES_HISTORICAL_TEST_BASE');
  return Buffer.from("import { salesHistoricalFile } from '../../scripts/sales/inventory-step-consumer-v1.mjs';\n" +
    original.replace(before,"JSON.parse(salesHistoricalFile('registry/consumers/index.json',fs.readFileSync(path.join(root, 'registry/consumers/index.json'))))"));
}
function historicalExpected(file, bytes) {
  if (file === 'registry/contracts.json') return encode(expectedRegistry());
  if (file === 'registry/consumers/index.json') return encode(expectedIndex());
  if (file === 'registry/consumers/identity-tenancy.json') {
    let snapshot;
    try { snapshot = JSON.parse(bytes); } catch { return undefined; }
    return encode(snapshot?.publication === 'published' ? publishedCandidate('identity-tenancy') : candidate('identity-tenancy'));
  }
  if (file === 'sales/README.md') return Buffer.from(normalize(source(file)) + salesReadmeSuffix);
  if (file === historicalTest) return historicalTestBytes();
  if (guardTransitionFiles.includes(file)) return transitionBytes(file);
}
export function transitionBytes(file) {
  let text=normalize(source(file));
  if(file.endsWith('/inventory-authority-consumer-v1.mjs')){
    text=text.replace("import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';", "import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';\nimport { salesHistoricalFile } from '../sales/inventory-step-consumer-v1.mjs';");
    text=text.replace('export const rawConsumerRead = file => fs.readFileSync(path.join(root, file));','export const rawConsumerRead = file => salesHistoricalFile(file, fs.readFileSync(path.join(root, file)));');
    text=text.replace('export function inventoryConsumerHistoricalFile(file, content) {','export function inventoryConsumerHistoricalFile(file, content) {\n  content = salesHistoricalFile(file, content);');
  } else if(file.endsWith('/inventory-authority-v1-1-admission.mjs')){
    text=text.replace("import { consumerFiles, inventoryConsumerReadView, inventoryConsumerHistoricalFile } from './inventory-authority-consumer-v1.mjs';", "import { consumerFiles, inventoryConsumerReadView, inventoryConsumerHistoricalFile } from './inventory-authority-consumer-v1.mjs';\nimport { salesHistoricalRegistry } from '../sales/inventory-step-consumer-v1.mjs';");
    text=text.replace('export function admissionHistoricalRegistry(registry) {','export function admissionHistoricalRegistry(registry) {\n  registry = salesHistoricalRegistry(registry);');
  } else if(file.endsWith('/inventory-authority-v1-1.mjs')){
    text=text.replace("import { admissionFiles, admissionReadView, admissionHistoricalFile, admissionHistoricalRegistry } from './inventory-authority-v1-1-admission.mjs';", "import { admissionFiles, admissionReadView, admissionHistoricalFile, admissionHistoricalRegistry } from './inventory-authority-v1-1-admission.mjs';\nimport { withSalesAdmissionScope } from '../sales/inventory-step-consumer-v1.mjs';");
    text=text.replace('const allowed = new Set([...changedPaths, packagePath, verifierPath, ...admissionFiles]);','const allowed = withSalesAdmissionScope([...changedPaths, packagePath, verifierPath, ...admissionFiles]);');
    text=text.replace('return new Set([...paths, ...changedPaths, packagePath, verifierPath, ...admissionFiles]);','return withSalesAdmissionScope([...paths, ...changedPaths, packagePath, verifierPath, ...admissionFiles]);');
  } else if(file.endsWith('/catalog-foundation-v1-registry.mjs')){
    text="import { salesHistoricalIndex } from '../sales/inventory-step-consumer-v1.mjs';\n"+text;
    text=text.replace("  const consumers = consumerReadView(readFiles);", "  index = salesHistoricalIndex(index);\n  const consumers = consumerReadView(readFiles);");
  } else if(['/catalog-lifecycle-v1-registry.mjs','/catalog-runtime-v1-registry.mjs'].some(name=>file.endsWith(name))){
    text="import { salesHistoricalIndex } from '../sales/inventory-step-consumer-v1.mjs';\n"+text;
    const before="assert.deepEqual(read('registry/consumers/index.json'), baseline('registry/consumers/index.json'),";
    assert.equal(text.split(before).length,2,'SALES_INDEX_GUARD_BASE');
    text=text.replace(before,"assert.deepEqual(salesHistoricalIndex(read('registry/consumers/index.json')), baseline('registry/consumers/index.json'),");
    if(file.endsWith('/catalog-lifecycle-v1-registry.mjs')) text=text.replace(
      'for (const name of registry.requiredConsumers.filter(',
      'for (const name of lifecycleRegistryView(registry).requiredConsumers.filter(');
  } else throw Error('Unknown Sales guard transition');
  return Buffer.from(text);
}
export function withSalesAdmissionScope(paths) {
  validateSalesAdmission();
  return new Set([...paths,...admissionScope]);
}
export function salesHistoricalIndex(value) {
  if (!isDeepStrictEqual(value,expectedIndex())) return value;
  validateSalesAdmission();
  return prior('registry/consumers/index.json');
}
/** Historical assertions see their immutable input only after full exact transition validation.
 * Mutated caller bytes pass through unchanged and never get repaired/projected. */
export function salesHistoricalFile(file, bytes) {
  const expected = historicalExpected(file, bytes);
  if (!expected || normalize(bytes) !== normalize(expected)) return bytes;
  validateSalesAdmission();
  return source(file);
}
export function salesHistoricalRegistry(value) {
  if (!isDeepStrictEqual(value, expectedRegistry())) return value;
  validateSalesAdmission();
  return structuredClone(registry);
}
export function writeCandidates() {
  const json = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, encode(value)); };
  for (const service of ['sales-pos', 'identity-tenancy']) {
    const snapshot = candidate(service), directory = path.join(launcher, 'services', service);
    json(path.join(directory, 'contracts.manifest.json'), snapshot.manifest);
    json(path.join(directory, 'contracts.lock.json'), snapshot.lock);
    for (const asset of snapshot.manifest.assets) {
      const target = path.join(directory, asset.destination);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, gitReader(root, snapshot.lock.entries.find(entry => entry.id === asset.contractId).commit)(asset.sourcePath));
    }
    if (service === 'sales-pos') {
      const files = [ ['tools/architecture/consumer-gate.mjs', '.contracts/gate.mjs'],
        ['registry/manifest-v1.schema.json', '.contracts/manifest-v1.schema.json'],
        ['registry/lock-v1.schema.json', '.contracts/lock-v1.schema.json'] ].map(([sourcePath, destination]) => {
          const bytes = source(sourcePath), target = path.join(directory, destination);
          fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
          return { sourcePath, destination, sha256: sha256(bytes) };
        });
      json(path.join(directory, '.contracts/provenance.json'), { formatVersion: 1, sourceRepository: 'opencomerix/contracts', publication: 'local-candidate', sourceBaseCommit: registry.baselineCommit, files });
    }
    json(path.join(root, 'registry/consumers', service + '.json'), snapshot);
    validateConsumer(directory);
  }
  json(path.join(root, 'registry/contracts.json'), expectedRegistry());
  json(path.join(root, 'registry/consumers/index.json'), expectedIndex());
  fs.writeFileSync(path.join(root,'sales/README.md'), normalize(source('sales/README.md')) + salesReadmeSuffix);
  fs.writeFileSync(path.join(root,historicalTest),historicalTestBytes());
  for (const file of guardTransitionFiles) fs.writeFileSync(path.join(root,file),transitionBytes(file));
  return validateSalesAdmission();
}
export function verifyImpact() {
  validateSalesAdmission();
  const directory=path.join(root,'.ci-artifacts/sales-step-impact',randomUUID());fs.mkdirSync(directory,{recursive:true});
  const result=spawnSync(process.execPath,[path.join(root,'tools/architecture/cli.mjs'),'impact'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
  const reportPath=path.join(directory,'impact.json');fs.writeFileSync(reportPath,result.stdout??'');fs.writeFileSync(path.join(directory,'stderr.log'),result.stderr??'');
  assert(!result.error&&[0,2].includes(result.status),'SALES_IMPACT_TOOL');
  const report=JSON.parse(result.stdout);
  assert.equal(report.formatVersion,1,'SALES_IMPACT_FORMAT');
  assert.deepEqual(report.consumers.map(row=>row.service),expectedIndex().consumers.map(row=>row.service),'SALES_IMPACT_COVERAGE');
  const issues=report.consumers.flatMap(row=>row.dependencies.filter(dependency=>dependency.classification!=='none').map(dependency=>({service:row.service,contract:dependency.contract,classification:dependency.classification})));
  return {nativeExit:result.status,consumers:report.consumers.length,issues,report:path.relative(root,reportPath).replaceAll('\\','/'),reportSha256:sha256(result.stdout)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--impact')){
    const result=verifyImpact();console.log(JSON.stringify(result));process.exitCode=result.nativeExit;
  }else{
    assert.deepEqual(process.argv.slice(2), ['--write'], 'Explicit --write required; verification never regenerates');
    console.log(JSON.stringify(writeCandidates()));
  }
}
