import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { resolveSelection } from '../../tools/architecture/graph.mjs';
import { verifyJointDelivery } from '../../tools/architecture/joint-delivery.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';

export const pwaTelemetrySource = 'eed8606cccc61f7c139c673b4bd256b4481dd4a3';
export const pwaTelemetryInitialRegistryHash = 'e0a56bccfe000b3a5316f4503fee9d34616e04ccb5141d8071d30754ad85b973';
const admittedIds = [
  'observability.pwa-telemetry.http.v1',
  'observability.pwa-telemetry.batch.schema.v1',
  'observability.pwa-telemetry.errors.v1',
];
const protectedPaths = new Set([
  'observability/http/public/v1/pwa-telemetry-v1.yaml',
  'observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json',
  'observability/errors/v1/pwa-telemetry-errors-v1.json',
]);
const descriptorHash = '4e7333dc974a17d29433bdd83927a191a13a13e0e8840c76f3b1b8dd45b38fc0';
const fixtures = 'observability/fixtures/pwa-telemetry/v1';
const semanticPaths = [
  'common/errors/v11/error-catalog-v11.json',
  'openapi/examples/gateway-csrf-invalid-v3.json',
  'openapi/examples/gateway-csrf-invalid-with-detail-negative-v3.json',
  `${fixtures}/accepted.json`,
  `${fixtures}/batch-tests.json`,
  `${fixtures}/invalid-batch-problem-tests.json`,
  `${fixtures}/csrf-problem-tests.json`,
];
const owned = row => admittedIds.includes(row.id) || protectedPaths.has(row.path);
const fullSha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const registryPath = 'registry/contracts.json';

export function pwaTelemetryDescriptors(registry) {
  const rows = registry.contracts.filter(owned);
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert(rows.length === admittedIds.length &&
    sha256(canonical(sorted)) === descriptorHash, 'PWA_ADMISSION_DESCRIPTORS');
  assert(!registry.planned.some(owned), 'PWA_ADMISSION_STILL_PLANNED');
  return rows;
}

export function verifyPwaTelemetryAdmission(root, revision = null) {
  const options = { root, sourceCommit: pwaTelemetrySource, admittedIds, semanticPaths,
    registrySha256: pwaTelemetryInitialRegistryHash };
  if (revision === null) return verifyJointDelivery(options);
  assert(fullSha(revision) && revision !== pwaTelemetrySource, 'PWA_ADMISSION_REVISION');
  const gitBytes = args => execFileSync('git', ['-C', root, ...args],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const git = args => gitBytes(args).toString('utf8').trim();
  const [resolved, firstParent, ...otherParents] = git(['rev-list', '--parents', '-n', '1', revision]).split(' ');
  assert.equal(resolved, revision, 'PWA_ADMISSION_REVISION');
  if (firstParent === pwaTelemetrySource) {
    assert.equal(otherParents.length, 0, 'PWA_ADMISSION_LINEAGE');
    return verifyJointDelivery({ ...options, finalRevision: revision });
  }

  // Look up the first revision of this delivery on the checked lineage.
  // Later CI checks the preserved package and a single immutable B registry.
  const range = pwaTelemetrySource + '..' + revision;
  const [initial] = git(['rev-list', '--first-parent', '--ancestry-path', '--reverse', range]).split(/\r?\n/);
  assert(fullSha(initial), 'PWA_ADMISSION_LINEAGE');
  assert.deepEqual(git(['rev-list', '--parents', '-n', '1', initial]).split(' '),
    [initial, pwaTelemetrySource], 'PWA_ADMISSION_LINEAGE');
  assert.equal(sha256(gitBytes(['show', initial + ':' + registryPath])),
    pwaTelemetryInitialRegistryHash, 'PWA_ADMISSION_INITIAL_REGISTRY');
  const readGit = createGitReader();
  const read = readGit(root, revision);
  const source = readGit(root, pwaTelemetrySource);
  const registry = JSON.parse(read(registryPath));
  const rows = pwaTelemetryDescriptors(registry);
  const sourceRegistry = JSON.parse(source(registryPath));
  sourceRegistry.contracts.push(...rows);
  const closure = new Set(semanticPaths);
  for (const row of rows) {
    const selection = { version: row.version, operations: [], pointers: [''] };
    for (const file of resolveSelection(source, row, selection, sourceRegistry).files)
      closure.add(file.path);
  }
  for (const file of closure) assert(read(file).equals(source(file)), 'PWA_ADMISSION_CLOSURE:' + file);
  assert.deepEqual(JSON.parse(read('observability/index.json')), domainIndex(registry, 'observability'),
    'PWA_ADMISSION_INDEX');
  return { sourceCommit: pwaTelemetrySource, checkedCommit: revision, publication: 'unverified',
    evidence: 'preserved-admission', admittedIds, closureFiles: closure.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [option, revision, ...extra] = process.argv.slice(2);
  assert(option === undefined || (option === '--revision' && fullSha(revision) && extra.length === 0),
    'Uso: node scripts/observability/pwa-telemetry-admission-v1.mjs [--revision SHA_COMPLETO]');
  console.log(JSON.stringify(verifyPwaTelemetryAdmission(fileURLToPath(new URL('../../', import.meta.url)), revision)));
}
