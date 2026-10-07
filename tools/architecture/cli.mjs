import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  sha256,
  readJSON,
  readLocal,
  validateShape,
  validateConsumer,
  safePath,
  parseJSON,
} from './consumer-gate.mjs';
import {
  gitReader,
  worktreeReader,
  makeLock,
  impactForConsumer,
  parseSource,
  operationPointers,
} from './graph.mjs';
import { domainIndex, validateCoverage, verifyLocalSnapshot } from './registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const launcher = path.resolve(root, '../..');
const args = process.argv.slice(2),
  command = args.shift();
const options = {
  registry: {},
  consumers: { '--local': false },
  sync: { '--write': false },
  impact: { '--revision': true, '--output': true },
  'import-published': { '--service': true, '--revision': true, '--write': false },
};
assert(Object.hasOwn(options, command), 'Unknown architecture command');
const seenOptions = new Set();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  assert(Object.hasOwn(options[command], key), 'Unknown option ' + key);
  assert(!seenOptions.has(key), 'Repeated option ' + key);
  seenOptions.add(key);
  if (options[command][key]) {
    assert(args[++i] && !args[i].startsWith('--'), 'Missing option value ' + key);
  }
}
const option = (name) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  assert(args[index + 1] && !args[index + 1].startsWith('--'), 'Missing option value ' + name);
  return args[index + 1];
};
const registry = readJSON(root, 'registry/contracts.json');
const index = readJSON(root, 'registry/consumers/index.json');
const manifestSchema = readJSON(root, 'registry/manifest-v1.schema.json');
const lockSchema = readJSON(root, 'registry/lock-v1.schema.json');
const json = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const git = (dir, ...rest) =>
  execFileSync('git', ['-C', dir, ...rest])
    .toString()
    .trim();
const checkRegistry = () => {
  assert.equal(registry.formatVersion, 1);
  assert.equal(registry.sourceRepository, 'opencomerix/contracts');
  assert.equal(
    new Set(registry.contracts.map((row) => row.id)).size,
    registry.contracts.length,
    'Duplicate contract id',
  );
  for (const descriptor of registry.contracts) {
    assert(
      descriptor.owner &&
        descriptor.capability &&
        descriptor.reasonForChange &&
        descriptor.purpose &&
        descriptor.retirement,
      'Missing ownership/evolution metadata',
    );
    assert(['active', 'historical', 'draft'].includes(descriptor.status), 'Unknown lifecycle');
    const bytes = gitReader(root, descriptor.commit)(descriptor.path);
    assert.equal(sha256(bytes), descriptor.sha256, 'Source provenance drift ' + descriptor.id);
    const source = parseSource(bytes, descriptor.path);
    assert.deepEqual(
      descriptor.operations,
      [...operationPointers(source).keys()],
      'Registered operation inventory drift',
    );
    if (source.openapi)
      assert.equal(source.info.version, descriptor.version, 'Registered OpenAPI version drift');
    assert.equal(
      new Set(descriptor.uriMappings.map((row) => row.uri)).size,
      descriptor.uriMappings.length,
      'Ambiguous external URI mapping',
    );
    for (const row of descriptor.uriMappings) {
      safePath(root, row.path);
      assert(
        registry.contracts.some((entry) => entry.path === row.path),
        'Unregistered URI mapping target',
      );
    }
    if (descriptor.tag) {
      assert.equal(
        git(root, 'rev-parse', descriptor.tag + '^{commit}'),
        descriptor.commit,
        'Tag commit drift',
      );
      assert.equal(
        git(root, 'rev-parse', descriptor.tag),
        descriptor.tagObject,
        'Annotated tag drift',
      );
    }
  }
  const baseline = gitReader(root, registry.baselineCommit);
  for (const file of registry.preservedFiles) {
    const source = baseline(file.path),
      checkout = readLocal(root, file.path);
    assert.equal(sha256(source), file.sha256, 'Published Git bytes drift ' + file.path);
    // Git bytes are authoritative. Windows clean checkouts can expand LF to CRLF.
    // Asset copies and lock hashes remain strict; this exception is only checkout EOL.
    assert(
      checkout.equals(source) ||
        Buffer.from(checkout.toString('utf8').replaceAll('\r\n', '\n')).equals(source),
      'Published artifact changed ' + file.path,
    );
  }
  const domains = new Set(
    [...registry.contracts, ...registry.planned].map((row) => row.domain),
  );
  for (const domain of domains) {
    const actual = readJSON(root, domain + '/index.json');
    assert.deepEqual(
      actual,
      domainIndex(registry, domain),
      'Domain/surface/version index drift',
    );
  }
  validateCoverage(index, registry.requiredConsumers);
  return {
    contracts: registry.contracts.length,
    preservedArtifacts: registry.preservedFiles.length,
    domains: domains.size,
    planned: registry.planned.length,
  };
};
const registeredSnapshot = (row) => {
  const snapshot = verifySnapshot(readJSON(root, 'registry/consumers/' + row.file));
  assert.equal(snapshot.manifest.service, row.service, 'Consumer snapshot identity drift');
  return snapshot;
};
const verifySnapshot = (snapshot) => {
  assert.equal(snapshot.formatVersion, 1);
  assert(
    ['local-candidate', 'published'].includes(snapshot.publication),
    'Unknown snapshot lifecycle',
  );
  assert(/^[a-f0-9]{40}$/.test(snapshot.sourceCommit), 'Unresolved consumer revision');
  assert.equal(snapshot.sourceRepository, 'opencomerix/' + snapshot.manifest.service);
  validateShape(snapshot.manifest, manifestSchema);
  validateShape(snapshot.lock, lockSchema);
  assert.equal(
    snapshot.manifestSha256,
    sha256(JSON.stringify(snapshot.manifest, null, 2) + '\n'),
    'Snapshot manifest bytes drift',
  );
  assert.equal(
    snapshot.lockSha256,
    sha256(JSON.stringify(snapshot.lock, null, 2) + '\n'),
    'Snapshot lock bytes drift',
  );
  assert.equal(
    snapshot.lock.manifestSha256,
    snapshot.manifestSha256,
    'Snapshot admission drift',
  );
  assert.equal(snapshot.lock.service, snapshot.manifest.service);
  const regenerated = makeLock(
    root,
    snapshot.manifest,
    Buffer.from(JSON.stringify(snapshot.manifest, null, 2) + '\n'),
    registry,
    snapshot.lock.entries,
  );
  assert.equal(
    snapshot.lock.entries.length,
    regenerated.entries.length,
    'Snapshot dependency omitted',
  );
  for (let i = 0; i < regenerated.entries.length; i++)
    assert.deepEqual(
      snapshot.lock.entries[i],
      regenerated.entries[i],
      'Transitively resolved lock drift',
    );
  assert.equal(
    snapshot.lock.assets.length,
    regenerated.assets.length,
    'Snapshot asset omitted',
  );
  for (let i = 0; i < regenerated.assets.length; i++) {
    const expected = regenerated.assets[i],
      actual = snapshot.lock.assets[i];
    for (const [key, value] of Object.entries(expected))
      assert.equal(actual[key], value, 'Snapshot asset source drift');
    assert(/^[a-f0-9]{64}$/.test(actual.localSha256), 'Local hash missing');
    if (actual.representation === 'exact')
      assert.equal(actual.localSha256, actual.sourceSha256, 'Exact snapshot copy drift');
  }
  return snapshot;
};
function localSnapshot(row, write = false) {
  const dir = safePath(launcher, row.localDirectory);
  const manifestBytes = readLocal(dir, 'contracts.manifest.json'),
    manifest = parseJSON(manifestBytes.toString('utf8'));
  validateShape(manifest, manifestSchema);
  assert.equal(manifest.service, row.service);
  // Existing admitted revisions survive regeneration; a new HEAD is not a migration.
  const existing = existsSync(path.join(dir, 'contracts.lock.json'))
    ? readJSON(dir, 'contracts.lock.json')
    : null;
  const lock = makeLock(root, manifest, manifestBytes, registry, existing?.entries ?? []);
  for (const asset of lock.assets) {
    const bytes = readLocal(dir, asset.destination);
    asset.localSha256 = sha256(bytes);
    if (asset.representation === 'exact')
      assert.equal(asset.localSha256, asset.sourceSha256, 'Copy differs from source');
    else {
      const entry = lock.entries.find((item) => item.id === asset.contractId);
      assert.equal(
        canonical(parseJSON(bytes.toString('utf8'))),
        canonical(parseJSON(gitReader(root, entry.commit)(asset.sourcePath).toString('utf8'))),
        'JSON transformation changed semantics',
      );
    }
  }
  const snapshot = {
    formatVersion: 1,
    publication: 'local-candidate',
    sourceRepository: 'opencomerix/' + row.service,
    sourceCommit: git(dir, 'rev-parse', 'HEAD'),
    manifestSha256: sha256(manifestBytes),
    lockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'),
    manifest,
    lock,
  };
  if (write) {
    json(path.join(dir, 'contracts.lock.json'), lock);
    const sources = [
      ['tools/architecture/consumer-gate.mjs', '.contracts/gate.mjs'],
      ['registry/manifest-v1.schema.json', '.contracts/manifest-v1.schema.json'],
      ['registry/lock-v1.schema.json', '.contracts/lock-v1.schema.json'],
    ];
    const tooling = sources.map(([sourcePath, destination]) => {
      const bytes = readLocal(root, sourcePath),
        target = safePath(dir, destination);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      return { sourcePath, destination, sha256: sha256(bytes) };
    });
    json(path.join(dir, '.contracts/provenance.json'), {
      formatVersion: 1,
      sourceRepository: 'opencomerix/contracts',
      publication: 'local-candidate',
      sourceBaseCommit: registry.baselineCommit,
      files: tooling,
    });
    json(path.join(root, 'registry/consumers', row.file), snapshot);
  }
  return snapshot;
}
function publishedSnapshot(row, revision) {
  assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Published import requires immutable commit');
  const dir = safePath(launcher, row.localDirectory);
  assert.equal(git(dir, 'rev-parse', revision + '^{commit}'), revision);
  const manifestBytes = execFileSync('git', [
    '-C',
    dir,
    'show',
    revision + ':contracts.manifest.json',
  ]);
  const lockBytes = execFileSync('git', ['-C', dir, 'show', revision + ':contracts.lock.json']);
  return {
    formatVersion: 1,
    publication: 'published',
    sourceRepository: 'opencomerix/' + row.service,
    sourceCommit: revision,
    manifestSha256: sha256(manifestBytes),
    lockSha256: sha256(lockBytes),
    manifest: parseJSON(manifestBytes.toString('utf8')),
    lock: parseJSON(lockBytes.toString('utf8')),
  };
}
if (command === 'registry') console.log(JSON.stringify(checkRegistry()));
else if (command === 'sync') {
  assert(
    args.includes('--write'),
    'sync requires explicit --write; never runs in verification CI',
  );
  checkRegistry();
  for (const row of index.consumers) {
    const snapshot = localSnapshot(row, true);
    verifySnapshot(snapshot);
    console.log(JSON.stringify(validateConsumer(safePath(launcher, row.localDirectory))));
  }
} else if (command === 'consumers') {
  checkRegistry();
  const results = [];
  for (const row of index.consumers) {
    const snapshot = registeredSnapshot(row);
    if (args.includes('--local')) {
      const dir = safePath(launcher, row.localDirectory);
      assert(existsSync(dir), 'Consumer checkout unavailable');
      verifyLocalSnapshot(localSnapshot(row), snapshot, (revision) =>
        publishedSnapshot(row, revision),
      );
      results.push(validateConsumer(dir));
      const tooling = readJSON(dir, '.contracts/provenance.json');
      for (const file of tooling.files)
        assert(
          readLocal(dir, file.destination).equals(readLocal(root, file.sourcePath)),
          'Vendored verifier differs from canonical tooling',
        );
    } else
      results.push({
        service: snapshot.manifest.service,
        publication: snapshot.publication,
        sourceCommit: snapshot.sourceCommit,
        dependencies: snapshot.lock.entries.length,
      });
  }
  console.log(JSON.stringify({ coverage: index.coverage, consumers: results }));
} else if (command === 'impact') {
  validateCoverage(index, registry.requiredConsumers);
  const revision = option('--revision') ?? 'WORKTREE';
  const read = revision === 'WORKTREE' ? worktreeReader(root) : gitReader(root, revision);
  const snapshots = index.consumers.map(registeredSnapshot);
  const graph = snapshots.flatMap((snapshot) =>
    snapshot.lock.entries.map((entry) => ({
      service: snapshot.manifest.service,
      contract: entry.id,
      role: entry.role,
      version: entry.version,
      lockedCommit: entry.commit,
      operations: entry.operations,
      units: entry.units.map((unit) => unit.path + '#' + unit.pointer),
    })),
  );
  const report = {
    formatVersion: 1,
    candidate: revision,
    coverage: index.coverage,
    publication: index.lifecycle,
    automaticDispatch: false,
    graph,
    consumers: snapshots.map((snapshot) => impactForConsumer(snapshot, registry, read)),
  };
  const output = option('--output');
  if (output) json(safePath(root, output), report);
  console.log(JSON.stringify(report, null, 2));
  if (
    report.consumers.some((row) =>
      row.dependencies.some((dependency) =>
        ['unresolved', 'review-required'].includes(dependency.classification),
      ),
    )
  )
    process.exitCode = 2;
} else if (command === 'import-published') {
  const service = option('--service'),
    revision = option('--revision');
  assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Published import requires immutable commit');
  const row = index.consumers.find((item) => item.service === service);
  assert(row, 'Unknown consumer');
  const snapshot = publishedSnapshot(row, revision);
  verifySnapshot(snapshot);
  assert(
    args.includes('--write'),
    'Published import requires explicit --write and prior publication/pipeline authorization',
  );
  json(path.join(root, 'registry/consumers', row.file), snapshot);
  console.log(
    JSON.stringify({
      service,
      revision,
      publication: 'published',
      pipelineVerification: 'Required by operator; not inferred from Git presence',
    }),
  );
} else
  throw new Error(
    'Usage: registry | consumers [--local] | sync --write | impact [--revision SHA] [--output relative.json] | import-published --service NAME --revision SHA --write',
  );
