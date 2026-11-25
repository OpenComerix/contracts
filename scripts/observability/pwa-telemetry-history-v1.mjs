import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readJSON, readLocal, safePath, sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { validateContractPaths } from '../../tools/architecture/layout.mjs';
import { beforeReconciliation, beforeReconciliationDocument } from '../sales/iana-consumer-exports.mjs';
import { projectCompletedTypesFile } from '../sales/completed-v3-types-history.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { pwaTelemetryDescriptors, pwaTelemetryInitialRegistryHash, pwaTelemetrySource } from './pwa-telemetry-admission-v1.mjs';

const base = '2788ca2d250fbd145b7b2ea0024c56450a533a2e';
const root = fileURLToPath(new URL('../../', import.meta.url));
const readGit = createGitReader();
let readBase;
let baseRegistry;
const registry = 'registry/contracts.json';
const reviewedText = new Map([
  ['README.md', '17607c565f54e327693a67a2f3f2084cbb52b8c324e6bbf95c670aec8e99567f'],
  ['.github/workflows/ci.yml', '79bd74998a78e2d60627345e1c7f46bc1b8e937c300b5fdbf4cf14acf8ffbd36'],
]);
const addedPaths = Object.freeze([
  'observability/README.md',
  'observability/errors/v1/pwa-telemetry-errors-v1.json',
  'observability/fixtures/pwa-telemetry/v1/accepted.json',
  'observability/fixtures/pwa-telemetry/v1/batch-tests.json',
  'observability/fixtures/pwa-telemetry/v1/csrf-problem-tests.json',
  'observability/fixtures/pwa-telemetry/v1/invalid-batch-problem-tests.json',
  'observability/http/public/v1/pwa-telemetry-v1.yaml',
  'observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json',
  'observability/http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json',
  'observability/index.json',
  'scripts/sales/completed-v3-types-history.mjs',
  'scripts/observability/pwa-telemetry-admission-v1.mjs',
  'scripts/observability/pwa-telemetry-history-v1.mjs',
  'scripts/observability/validate-pwa-telemetry-v1.sh',
  'test/ci/pwa-telemetry-admission-v1.test.mjs',
  'test/observability/pwa-telemetry-v1.test.mjs',
]);
const decoder = new TextDecoder('utf-8', { fatal: true });
const historicalFile = file => (readBase ??= readGit(root, base))(file);
const historicalRegistry = () => baseRegistry ??= JSON.parse(historicalFile(registry));
const distinct = values => values.every(value => typeof value === 'string' && value.length > 0) &&
  new Set(values).size === values.length;

// Only the known README and workflow deltas belong to this historical view.
// Changes to either input remain visible to the existing exact historical checks.
export function projectPwaTelemetryFile(file, bytes) {
  bytes = projectCompletedTypesFile(file, bytes);
  bytes = beforeReconciliation(file, bytes);
  const expected = reviewedText.get(file);
  if (file !== registry && !expected) return bytes;
  try {
    const text = decoder.decode(bytes).replaceAll('\r\n', '\n');
    if (expected && createHash('sha256').update(text).digest('hex') === expected)
      return historicalFile(file);
    if (file === registry && text.includes('observability.pwa-telemetry.http.v1')) {
      // Keep the initial snapshot on the fast path. Later append-only inputs
      // are examined afresh, without requiring the original whole-file hash.
      if (createHash('sha256').update(text).digest('hex') === pwaTelemetryInitialRegistryHash)
        return historicalFile(file);
      const value = JSON.parse(text);
      if (acceptsRegistryView(value) && JSON.stringify(value, null, 2) + '\n' === text)
        return historicalFile(file);
    }
  } catch {
    return bytes;
  }
  return bytes;
}

// This is a view of the old inputs, not admission of later entries. Their
// owners, current registry checks and repository path checks still see them.
function acceptsRegistryView(value) {
  if (!Array.isArray(value?.contracts) || !Array.isArray(value.planned) ||
      !Array.isArray(value.requiredConsumers)) return false;
  if (!value.contracts.some(row => row?.id === 'observability.pwa-telemetry.http.v1')) return false;
  try {
    const rows = new Set(pwaTelemetryDescriptors(value));
    if (!distinct([...value.contracts, ...value.planned].map(row => row.id)) ||
        !distinct([...value.contracts, ...value.planned.filter(row => row.path !== undefined)].map(row => row.path))) return false;
    const prior = historicalRegistry();
    return isDeepStrictEqual({
      ...value,
      contracts: value.contracts.filter(row => !rows.has(row)).slice(0, prior.contracts.length),
      planned: value.planned.slice(0, prior.planned.length),
    }, prior);
  } catch {
    return false;
  }
}

export function projectPwaTelemetryDocument(file, value) {
  value = beforeReconciliationDocument(file, value);
  return file === registry && acceptsRegistryView(value) ? structuredClone(historicalRegistry()) : value;
}

export function pwaTelemetryHistoricalPaths(registryBytes) {
  return projectPwaTelemetryFile(registry, registryBytes) === registryBytes ? [] : addedPaths;
}

// The historical path gate also sees the live Git diff. Derive allowances
// only for later registered roots with an attributable source and exact bytes.
export function includeLaterAdmissionPaths(allowed, registryBytes) {
  if (sha256(registryBytes) === pwaTelemetryInitialRegistryHash) return;
  const current = JSON.parse(registryBytes);
  const sources = new Map();
  const indices = new Map();
  const git = args => execFileSync('git', ['--literal-pathspecs', '-C', root, ...args],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const admittedAfterBase = current.contracts.slice(historicalRegistry().contracts.length);
  for (const row of admittedAfterBase) {
    if (allowed.has(row.path) || row.status !== 'active') continue;
    try {
      if (!/^[a-f0-9]{40}$/.test(row.commit) || row.commit === pwaTelemetrySource ||
          !/^[a-z][a-z0-9-]*$/.test(row.domain)) continue;
      validateContractPaths([row.path], { domains: [row.domain], preserved: [] });
      if (!sources.has(row.commit)) {
        git(['merge-base', '--is-ancestor', pwaTelemetrySource, row.commit]);
        git(['merge-base', '--is-ancestor', row.commit, 'HEAD']);
        const read = readGit(root, row.commit);
        sources.set(row.commit, { read, registry: JSON.parse(read(registry)) });
      }
      const source = sources.get(row.commit);
      const planned = source.registry.planned.filter(intent => intent.id === row.id);
      const fields = ['owner', 'domain', 'path', 'version', 'operations'];
      if (planned.length !== 1 || planned[0].status !== 'planned' || !planned[0].materializeIn ||
          !fields.every(field => isDeepStrictEqual(row[field], planned[0][field])) ||
          source.registry.contracts.some(previous => previous.id === row.id || previous.path === row.path)) continue;
      if (git(['ls-tree', '-z', pwaTelemetrySource, '--', row.path]) ||
          !/^100(?:644|755) blob [a-f0-9]{40}\t/.test(git(['ls-tree', '-z', row.commit, '--', row.path]))) continue;
      const bytes = source.read(row.path);
      if (sha256(bytes) !== row.sha256 || !lstatSync(safePath(root, row.path)).isFile()) continue;
      const live = readLocal(root, row.path);
      const sameBytes = live.equals(bytes) || (process.platform === 'win32' && !bytes.includes(13) &&
        Buffer.from(decoder.decode(live).replaceAll('\r\n', '\n')).equals(bytes));
      if (!sameBytes) continue;

      const index = row.domain + '/index.json';
      if (!indices.has(index))
        indices.set(index, isDeepStrictEqual(readJSON(root, index), domainIndex(current, row.domain)));
      if (!indices.get(index)) continue;
      allowed.add(row.path);
      allowed.add(index);
    } catch {
      // Unproven entries stay outside the allowed set. The existing Git path
      // gate reports any such path present in the candidate.
    }
  }
}
