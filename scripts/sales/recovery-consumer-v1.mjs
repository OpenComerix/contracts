import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { makeLock } from '../../tools/architecture/graph.mjs';

export const recoveryBase = '2facbdb45bb7fb72a79fd8874a97afd30a500171';
export const recoverySalesBase = '8a73f072439988dc729715054d683cb12ea854f4';
export const recoverySnapshotPath = 'registry/consumers/sales-pos.json';
export const recoveryFiles = Object.freeze([
  'scripts/sales/recovery-consumer-v1.mjs',
  'test/architecture/sales-recovery-consumer.test.mjs',
]);
const root = path.resolve(import.meta.dirname, '../..');
const source = createGitReader()(root, recoveryBase);
export const encodeRecovery = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
// Only exact supplied values are projected. No live traversal or cached approval.
const hashes = Object.freeze({
  'registry/consumers/sales-pos.json': '9a263adaf1dea9c58e18322b649a55bfb977d99c14ee7a9f5c729c0601e74f62',
  'sales/README.md': 'a184b966a8f4cce2e470ec4a634b7aadefdd40ba1fd2cd8554de2e77f8ab4048',
});
export const recoveryReadmeSection = '\n## F1-13D — Selección de recuperación e historia (candidata)\n\n' +
  'El [snapshot Sales](../registry/consumers/sales-pos.json) conserva las 45 selecciones C y todos sus pins/assets. ' +
  'Amplía cuatro selecciones existentes: consulta de venta, reanudación y sesiones/páginas de historia, ' +
  'canonicalización/autoridad específicas e historia de la política publicada. ' +
  'Sin contratos nuevos, admisiones, otros consumidores ni cambios de bytes publicados. ' +
  'El export local-candidate referencia Sales C, sin atribuirle esta ampliación. ' +
  'El [gate D](../scripts/sales/recovery-consumer-v1.mjs) resuelve solo las cuatro selecciones modificadas; ' +
  'las proyecciones históricas verifican cada entrada por hash, sin validación integral por archivo. ' +
  'Pruebas: `node --test test/architecture/sales-recovery-consumer.test.mjs`; ' +
  'procedencia local explícita: `node scripts/sales/recovery-consumer-v1.mjs --verify-local-sales ../../services/sales-pos`. ' +
  'Metadata candidata; no acredita runtime, HMAC, SQL, autoridad actual, publicación ni aceptación E.\n';

export function createRecoverySnapshot() {
  const prior = JSON.parse(source(recoverySnapshotPath));
  const manifest = structuredClone(prior.manifest);
  const changes = new Map([
    ['sales.f1-10d.pos-sales-internal-v2:producer', { operations: [
      'getCompletedSale', 'resumeSaleFinalization', 'createSalesHistoryReadSession', 'readSalesHistoryFacts',
    ] }],
    ['sales.f1-10d.sales-protocol-policy-v2:semantic-owner', { pointers: ['/history'] }],
    ['identity.f1-10e.sales-authority.schema.v1:validation', { pointers:
      [1, 2, 3, 4, 5].map(i => '/$defs/CanonicalRequest/oneOf/' + i) }],
    ['identity.f1-10d.identity-sales-authority-policy-v1:consumer', { pointers:
      [1, 2, 3, 4, 5].map(i => '/permissions/' + i) }],
  ]);
  const indexes = [];
  manifest.contracts.forEach((row, index) => {
    const extra = changes.get(row.id + ':' + row.role);
    if (!extra) return;
    for (const field of ['operations', 'pointers'])
      for (const value of extra[field] ?? []) if (!row[field].includes(value)) row[field].push(value);
    row.purpose += ' F1-13D authorized retained history, completed read and same-intention recovery.';
    indexes.push(index);
  });
  assert.equal(indexes.length, 4, 'RECOVERY_SELECTION_INVENTORY');
  const registry = JSON.parse(source('registry/contracts.json'));
  const deltaManifest = { ...manifest, contracts: indexes.map(i => manifest.contracts[i]), assets: [], bindings: [] };
  const delta = makeLock(root, deltaManifest, encodeRecovery(deltaManifest), registry, prior.lock.entries);
  // Every new closure file is already an exact admitted C asset. Never silently materialize another surface.
  for (const entry of delta.entries) for (const file of entry.files)
    assert(prior.lock.assets.some(asset => asset.sourcePath === file.path && asset.sourceSha256 === file.sha256),
      'RECOVERY_UNINVENTORIED_ASSET:' + file.path);
  const lock = structuredClone(prior.lock);
  indexes.forEach((index, position) => { lock.entries[index] = delta.entries[position]; });
  lock.manifestSha256 = digest(encodeRecovery(manifest));
  return { ...prior, publication: 'local-candidate', sourceCommit: recoverySalesBase,
    manifestSha256: lock.manifestSha256, lockSha256: digest(encodeRecovery(lock)), manifest, lock };
}
export function projectRecoveryFile(file, bytes) {
  return hashes[file] && digest(text(bytes)) === hashes[file] ? Buffer.from(source(file)) : bytes;
}
export function projectRecoveryDocument(file, value) {
  if (file !== recoverySnapshotPath) return value;
  try {
    const bytes = encodeRecovery(value);
    return isDeepStrictEqual(value, JSON.parse(bytes)) && digest(bytes) === hashes[file]
      ? JSON.parse(source(file)) : value;
  } catch { return value; }
}
export function withRecoveryScope(paths, read) {
  const supplied = read(recoverySnapshotPath);
  if (digest(text(supplied)) !== hashes[recoverySnapshotPath]) {
    assert.equal(text(supplied), text(source(recoverySnapshotPath)), 'RECOVERY_PARTIAL_SCOPE');
    return new Set(paths);
  }
  for (const file of Object.keys(hashes))
    assert.equal(digest(text(file === recoverySnapshotPath ? supplied : read(file))), hashes[file], 'RECOVERY_SCOPE_BYTES:' + file);
  return new Set([...paths, ...recoveryFiles]);
}
export function validateRecoverySnapshot(snapshot) {
  assert.equal(digest(encodeRecovery(snapshot)), hashes[recoverySnapshotPath], 'RECOVERY_SNAPSHOT_EXACT');
  assert.deepEqual(snapshot, createRecoverySnapshot(), 'RECOVERY_CANONICAL_DELTA');
  return { preservedSelections: 45, extendedSelections: 4, newAssets: 0, runtimeDemonstrated: false };
}
export function validateRecoverySalesSource(read) {
  const prior = JSON.parse(source(recoverySnapshotPath));
  for (const [file, value] of [['contracts.manifest.json', prior.manifest], ['contracts.lock.json', prior.lock]])
    assert.equal(digest(read(file)), digest(encodeRecovery(value)), 'RECOVERY_SALES_SOURCE:' + file);
  return { sourceCommit: recoverySalesBase, verifiedFiles: 2 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length === 4 && process.argv[2] === '--verify-local-sales') {
    const read = createGitReader()(path.resolve(process.argv[3]), recoverySalesBase);
    console.log(JSON.stringify(validateRecoverySalesSource(read)));
  } else {
    assert(process.argv.length === 3 && process.argv[2] === '--write', 'Usage: --write | --verify-local-sales <checkout>');
    const sales = path.resolve(root, '../../services/sales-pos');
    validateRecoverySalesSource(createGitReader()(sales, recoverySalesBase));
    const snapshot = createRecoverySnapshot();
    for (const [file, value] of [['contracts.manifest.json', snapshot.manifest], ['contracts.lock.json', snapshot.lock]])
      writeFileSync(path.join(sales, file), encodeRecovery(value));
    writeFileSync(path.join(root, recoverySnapshotPath), encodeRecovery(snapshot));
    writeFileSync(path.join(root, 'sales/README.md'), text(source('sales/README.md')) + recoveryReadmeSection);
    console.log(JSON.stringify({ changedSelections: 4, assets: snapshot.lock.assets.length, publication: snapshot.publication }));
  }
}
