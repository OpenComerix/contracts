import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { makeLock } from '../../tools/architecture/graph.mjs';
import { recoveryFiles, projectRecoveryFile, projectRecoveryDocument } from './recovery-consumer-v1.mjs';

export const coordinationBase = '4d5a7db93e65135323471708d61ea403b8ec6c75';
export const coordinationSalesBase = '55bebdc745b4ed0cbf4f77107c6c236354ab85b7';
// Exact Git bytes of Sales B, checked separately by the explicit local control.
// The canonical suite can prove their retained content without a Sales checkout.
export const coordinationSalesSourceHashes = Object.freeze({
  'contracts.manifest.json': '0269b1c50264a2fe3f570276490fd372f1b6955db64160519fe10075ab4b343b',
  'contracts.lock.json': 'ff1d6a908687d6a75ec82f67d0c6cf328cce55b2b7de18440aed0e93c8aa5f7c',
});
export const coordinationSnapshotPath = 'registry/consumers/sales-pos.json';
export const coordinationFiles = Object.freeze([
  'scripts/sales/coordination-consumer-v1.mjs',
  'test/architecture/sales-coordination-consumer.test.mjs',
  ...recoveryFiles,
]);
const root = path.resolve(import.meta.dirname, '../..');
const source = createGitReader()(root, coordinationBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const hashes = Object.freeze({
  'registry/consumers/sales-pos.json': '2d58b9f218babec9b283e75d17996b43527efaf37b4b784e6a64e91fc20e12cc',
  'sales/README.md': 'c9232cfd803c8e0767488c2a7b97705a10b19fd3cc490f5ae95b883a24c5c80b',
});
// Each adapter verifies only its supplied value. It neither validates a live
// package nor remembers approval. The capability proof below runs once.
export function projectCoordinationFile(file, bytes) {
  bytes = projectRecoveryFile(file, bytes);
  if (!hashes[file] || digest(text(bytes)) !== hashes[file]) return bytes;
  return Buffer.from(source(file));
}
export function projectCoordinationDocument(file, value) {
  value = projectRecoveryDocument(file, value);
  if (file !== coordinationSnapshotPath) return value;
  try {
    const bytes = encode(value);
    return isDeepStrictEqual(value, JSON.parse(bytes)) && digest(bytes) === hashes[file]
      ? JSON.parse(source(file)) : value;
  } catch { return value; }
}

export function validateCoordinationSalesSource(read) {
  for (const [file, expected] of Object.entries(coordinationSalesSourceHashes))
    assert.equal(digest(read(file)), expected, 'COORDINATION_SALES_SOURCE:' + file);
  return { sourceCommit: coordinationSalesBase, verifiedFiles: 2 };
}

export const coordinationSelections = Object.freeze([
  ['finance.http.private.v1', 'consumer', ['getSaleCashResult'], []],
  ['inventory.post-sale-stock.result.v1.consumer', 'consumer', [], ['']],
  ['inventory.compensate-sale-stock.result.v1.consumer', 'consumer', [], ['']],
  ['finance.record-sale-cash.result.v1.consumer', 'consumer', [], ['']],
  ['sales.f1-10d.sales.sale.completed.v2', 'producer', [], ['']],
  ['inventory.flow.asyncapi.v1', 'producer', [], ['/channels/commands']],
  ['inventory.flow.asyncapi.v1', 'consumer', [], ['/channels/results']],
  ['finance.flow.asyncapi.v1', 'producer', [], ['/channels/commands']],
  ['finance.flow.asyncapi.v1', 'consumer', [], ['/channels/results']],
  ['sales.f1-10d.sales-flow-v2.asyncapi', 'producer', [], ['/operations/sendCompleted']],
].map(([id, role, operations, pointers]) => Object.freeze({ id, role,
  operations: Object.freeze(operations), pointers: Object.freeze(pointers) })));
export const coordinationReadmeSection = '\n## F1-13C — Selección de coordinación (candidata)\n\n' +
  'El [snapshot Sales](../registry/consumers/sales-pos.json) conserva las 35 selecciones B y sus revisiones; ' +
  'amplía únicamente el perfil de lectura `sales-pos.finance-results` en la política Finance ya fijada ' +
  'y añade diez roles/selecciones para resultados propietarios, consulta Finance, comandos/resultados dirigidos y completed v2. ' +
  'Los cierres y assets exactos derivan de contratos admitidos publicados; no cambia ningún transporte, registro ni consumidor ajeno. ' +
  'El export local-candidate referencia la base Sales B, sin afirmar que ese commit contenga la ampliación. ' +
  'El [gate C](../scripts/sales/coordination-consumer-v1.mjs) reconstruye solo el delta nuevo una vez; ' +
  'las vistas históricas comparan cada valor suministrado por hash, sin recorridos recursivos ni aprobación cacheada. ' +
  'Pruebas: `node --test test/architecture/sales-coordination-consumer.test.mjs`; registro, consumidores, arquitectura e impacto conservan sus gates. ' +
  'La suite canónica comprueba los hashes B con evidencia retenida en Contracts y no requiere otro checkout. ' +
  'La procedencia Git de Sales se verifica por separado y de forma explícita con ' +
  '`node scripts/sales/coordination-consumer-v1.mjs --verify-local-sales ../../services/sales-pos`; ' +
  'ese control falla si falta el repositorio, el commit o cambia cualquiera de los dos archivos, sin omisión automática. ' +
  'Candidato previo a auditoría/publicación y CI exacta: no materializa estos assets en Sales ni habilita consumo, broker, venta/número o runtime C.\n';

export function createCoordinationSnapshot() {
  const prior = JSON.parse(source(coordinationSnapshotPath));
  const manifest = structuredClone(prior.manifest);
  const registry = JSON.parse(source('registry/contracts.json'));
  const policyIndex = manifest.contracts.findIndex(row => row.id === 'identity.finance-authority.policy.v1' && row.role === 'consumer');
  assert(policyIndex >= 0, 'COORDINATION_FINANCE_POLICY');
  manifest.contracts[policyIndex].pointers.push('/profiles/3');
  const purpose = 'F1-13C exact owner results, directed delivery and completed v2; no history/resume, public gateway or fiscal production.';
  const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:process-authority-runtime'];
  for (const selection of coordinationSelections) {
    const descriptor = registry.contracts.find(row => row.id === selection.id);
    assert.equal(descriptor?.status, 'active', 'COORDINATION_ADMITTED:' + selection.id);
    manifest.contracts.push({ id: selection.id, role: selection.role, version: descriptor.version,
      operations: [...selection.operations], pointers: [...selection.pointers], purpose, gates: [...gates] });
  }
  // Resolve only the changed policy and ten additions. All other locks/assets
  // are copied from the immutable reviewed B snapshot, never repinned.
  const deltaManifest = { ...manifest, contracts: [manifest.contracts[policyIndex], ...manifest.contracts.slice(35)], assets: [], bindings: [] };
  const delta = makeLock(root, deltaManifest, encode(deltaManifest), registry, prior.lock.entries);
  const paths = new Set(manifest.assets.map(asset => asset.sourcePath));
  for (const entry of delta.entries) for (const file of entry.files) {
    if (paths.has(file.path)) continue;
    paths.add(file.path);
    manifest.assets.push({ contractId: entry.id, sourcePath: file.path,
      destination: 'src/modules/sale-process/transport/contracts/' + file.path,
      representation: 'exact', purpose: 'runtime' });
  }
  const manifestBytes = encode(manifest);
  const lock = structuredClone(prior.lock);
  lock.manifestSha256 = digest(manifestBytes);
  lock.entries[policyIndex] = delta.entries[0];
  lock.entries.push(...delta.entries.slice(1));
  for (const asset of manifest.assets.slice(prior.manifest.assets.length)) {
    const entry = delta.entries.find(row => row.id === asset.contractId);
    const file = entry.files.find(row => row.path === asset.sourcePath);
    lock.assets.push({ ...asset, sourceSha256: file.sha256, semanticSha256: null, localSha256: file.sha256 });
  }
  return { ...prior, publication: 'local-candidate', sourceCommit: coordinationSalesBase,
    manifestSha256: digest(manifestBytes), lockSha256: digest(encode(lock)), manifest, lock };
}

export function validateCoordinationSnapshot(snapshot) {
  snapshot = projectRecoveryDocument(coordinationSnapshotPath, snapshot);
  assert.equal(digest(encode(snapshot)), hashes[coordinationSnapshotPath], 'COORDINATION_SNAPSHOT_EXACT');
  assert.deepEqual(snapshot, createCoordinationSnapshot(), 'COORDINATION_CANONICAL_DELTA');
  return { preservedSelections: 35, extendedPolicies: 1, addedSelections: 10,
    assets: snapshot.manifest.assets.length, runtimeMaterialized: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert(process.argv.length === 4 && process.argv[2] === '--verify-local-sales' && process.argv[3],
    'Usage: --verify-local-sales <Sales checkout>; explicit read-only local control');
  const sales = createGitReader()(path.resolve(process.argv[3]), coordinationSalesBase);
  console.log(JSON.stringify(validateCoordinationSalesSource(sales)));
}
