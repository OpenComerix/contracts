import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { worktreeReader } from '../../tools/architecture/graph.mjs';
import { root as contractRoot, actual, source, text, validateCaptureSource,
  captureHistoricalFile, captureHistoricalRegistry } from '../../scripts/inventory/capture-authority-v2.mjs';

function fixture(t, files) {
  const parent = realpathSync(os.tmpdir());
  const root = mkdtempSync(path.join(parent, 'opencomerix-git-source-'));
  t.after(() => {
    assert(path.dirname(root) === parent && path.basename(root).startsWith('opencomerix-git-source-'));
    rmSync(root, { recursive: true });
  });
  const git = args => execFileSync('git', ['-C', root,
    '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Contract fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=' + path.join(root, 'no-hooks'), ...args], { windowsHide: true });
  git(['init', '-q', '-b', 'fixture']);
  for (const [file, bytes] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), bytes);
  }
  const commit = () => {
    git(['add', '--all']); git(['commit', '-q', '-m', 'Synthetic contract fixture']);
    return git(['rev-parse', 'HEAD']).toString().trim();
  };
  return { root, git, commit, revision: commit() };
}
function observed() {
  const calls = [];
  const read = createGitReader((file, args, options) => {
    calls.push({ args, input: options.input });
    return execFileSync(file, args, options);
  });
  return { read, calls };
}

test('many historical files use one bounded batch and retain exact binary bytes', t => {
  const files = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['items/' + i + '.json', '{"value":' + i + '}\r\n']));
  files['empty.json'] = Buffer.alloc(0);
  files['with space.json'] = Buffer.from([0, 255, 10, 13, 0, 128]);
  files['ñ.json'] = 'contenido UTF-8';
  const { root, revision, git } = fixture(t, files), { read, calls } = observed();
  const source = read(root, revision);
  for (const [file, bytes] of Object.entries(files)) {
    assert.deepEqual(source(file), Buffer.from(bytes));
    assert.deepEqual(source(file), git(['show', revision + ':' + file]));
  }
  assert.equal(calls.length, 3, 'one commit resolution, one tree listing, one object batch');
  assert.equal(calls.filter(call => call.args.includes('cat-file')).length, 1);
});

test('returned buffers cannot mutate another file, reader or cached historical source', t => {
  const { root, revision } = fixture(t, { 'a.json': 'same', 'b.json': 'same' });
  const { read } = observed(), source = read(root, revision);
  source('a.json').fill(0);
  assert.equal(source('a.json').toString(), 'same');
  assert.equal(source('b.json').toString(), 'same');
  assert.equal(read(root, revision)('a.json').toString(), 'same');
});

test('prefetch stays bounded and omitted blobs remain available on demand', t => {
  const size = 6 * 1024 * 1024;
  const { root, revision } = fixture(t, {
    'a.bin': Buffer.alloc(size, 1), 'b.bin': Buffer.alloc(size, 2), 'c.bin': Buffer.alloc(size, 3),
  });
  const { read, calls } = observed(), source = read(root, revision);
  assert.deepEqual(source('a.bin'), Buffer.alloc(size, 1));
  assert.equal(calls.filter(call => call.args.includes('cat-file'))[0].input.trim().split('\n').length, 2);
  assert.deepEqual(source('c.bin'), Buffer.alloc(size, 3));
  const batches = calls.filter(call => call.args.includes('cat-file'));
  assert.equal(batches.length, 2);
  assert.equal(batches[1].input.trim().split('\n').length, 1);
});

test('new commits reuse immutable objects while current and injected readers stay fresh', t => {
  const { root, revision, commit } = fixture(t, { 'a.json': 'old', 'b.json': 'unchanged' });
  const { read, calls } = observed();
  const source = read(root, revision), current = worktreeReader(root);
  assert.equal(source('a.json').toString(), 'old');
  writeFileSync(path.join(root, 'a.json'), 'new');
  const next = commit();
  assert.equal(read(root, next)('a.json').toString(), 'new');
  const batch = calls.filter(call => call.args.includes('cat-file'));
  assert.equal(batch.length, 2);
  assert.equal(batch[1].input.trim().split('\n').length, 1, 'unchanged blob is reused across exact commits');
  writeFileSync(path.join(root, 'a.json'), 'later');
  assert.equal(current('a.json').toString(), 'later');
  assert.equal(source('a.json').toString(), 'old');
  assert.equal(read(root, next)('a.json').toString(), 'new');
  rmSync(path.join(root, 'a.json'));
  assert.throws(() => current('a.json'), { code: 'ENOENT' });
  assert.equal(source('a.json').toString(), 'old');
});

test('cache does not cross repositories or substitute uncommitted and missing paths', t => {
  const left = fixture(t, { 'a.json': 'left' }), right = fixture(t, { 'a.json': 'right' });
  const { read } = observed();
  assert.equal(read(left.root, left.revision)('a.json').toString(), 'left');
  assert.equal(read(right.root, right.revision)('a.json').toString(), 'right');
  writeFileSync(path.join(left.root, 'uncommitted.json'), 'synthetic');
  assert.throws(() => read(left.root, left.revision)('uncommitted.json'), /GIT_SOURCE_NOT_BLOB/);
  assert.throws(() => read(left.root, left.revision)('missing.json'), /GIT_SOURCE_NOT_BLOB/);
  assert.throws(() => read(right.root, left.revision), /./);
});

test('mutable refs, traversal, directories and oversized blobs are rejected', t => {
  const { root, revision } = fixture(t, { 'nested/a.json': 'safe', 'large.bin': Buffer.alloc(8 * 1024 * 1024 + 1) });
  const { read } = observed();
  for (const ref of ['HEAD', 'fixture', revision.toUpperCase(), revision + ':nested/a.json', 'a'.repeat(39)])
    assert.throws(() => read(root, ref), /resolved commit/);
  const source = read(root, revision);
  for (const file of ['../a.json', './nested/a.json', '/absolute', 'C:/outside', 'nested\\a.json', 'nested//a.json', 'a\0b'])
    assert.throws(() => source(file));
  assert.throws(() => source('nested'), /GIT_SOURCE_NOT_BLOB/);
  assert.throws(() => source('large.bin'), /GIT_SOURCE_FILE_LIMIT/);
  assert.equal(source('nested/a.json').toString(), 'safe');
});

for (const corruption of ['truncated', 'identity', 'size', 'trailing'])
  test('malformed batch is rejected atomically without poisoning cache: ' + corruption, t => {
    const { root, revision } = fixture(t, { 'a.json': 'first', 'b.json': 'second' });
    let broken = true, batches = 0;
    const read = createGitReader((file, args, options) => {
      const result = execFileSync(file, args, options);
      if (!args.includes('cat-file')) return result;
      batches++;
      if (!broken) return result;
      if (corruption === 'truncated') return result.subarray(0, -2);
      if (corruption === 'trailing') return Buffer.concat([result, Buffer.from('unexpected')]);
      const copy = Buffer.from(result);
      if (corruption === 'identity') copy.fill(48, 0, 40);
      else copy[copy.indexOf(10) - 1] = 57;
      return copy;
    });
    const source = read(root, revision);
    assert.throws(() => source('a.json'), /GIT_SOURCE_BATCH/);
    broken = false;
    assert.equal(source('a.json').toString(), 'first');
    assert.equal(source('b.json').toString(), 'second');
    assert.equal(batches, 2, 'whole rejected batch must be loaded again');
  });

test('truncated tree output is rejected and can be read again without cached success', t => {
  const { root, revision } = fixture(t, { 'a.json': 'safe' });
  let broken = true;
  const read = createGitReader((file, args, options) => {
    const result = execFileSync(file, args, options);
    return broken && args.includes('ls-tree') ? result.subarray(0, -1) : result;
  });
  const source = read(root, revision);
  assert.throws(() => source('a.json'), /GIT_SOURCE_TREE_TERMINATOR/);
  broken = false;
  assert.equal(source('a.json').toString(), 'safe');
});

test('historical graph projection accepts only the exact optimized delta', () => {
  const file = 'tools/architecture/graph.mjs', bytes = actual(file);
  assert.equal(text(captureHistoricalFile(file, bytes)), text(source(file)));
  const changed = Buffer.concat([bytes, Buffer.from('// unapproved')]);
  assert.equal(captureHistoricalFile(file, changed), changed);
});

for (const file of ['tools/architecture/graph.mjs', 'tools/architecture/git-source.mjs',
  'test/architecture/git-source.test.mjs', 'tools/architecture/README.md'])
  for (const change of ['changed', 'missing'])
    test('warm validation and both projections reject optimized-file drift: ' + file + '/' + change, t => {
      const registryBytes = actual('registry/contracts.json'), registry = JSON.parse(registryBytes);
      validateCaptureSource();
      captureHistoricalFile('registry/contracts.json', registryBytes);
      captureHistoricalRegistry(registry);
      const original = fs.readFileSync.bind(fs), target = path.join(contractRoot, file);
      let reads = 0;
      t.mock.method(fs, 'readFileSync', (name, ...options) => {
        if (typeof name === 'string' && path.resolve(name) === target) {
          reads++;
          if (change === 'missing') throw Error('Synthetic missing optimized source');
          return Buffer.concat([original(name, ...options), Buffer.from('\nUnapproved')]);
        }
        return original(name, ...options);
      });
      assert.throws(() => validateCaptureSource());
      assert.throws(() => captureHistoricalFile('registry/contracts.json', registryBytes));
      assert.throws(() => captureHistoricalRegistry(registry));
      assert.equal(reads, 3, 'every invocation validates current bytes');
    });
