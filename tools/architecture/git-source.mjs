import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { safePath } from './consumer-gate.mjs';

const MiB = 1024 * 1024;
const FILE_LIMIT = 8 * MiB;
const PREFETCH_LIMIT = 16 * MiB;
const CACHE_LIMIT = 64 * MiB;
const TREE_LIMIT = 4 * MiB;
const decoder = new TextDecoder('utf-8', { fatal: true });
const immutableReaders = new WeakMap();

// Private identity, never inferred from properties supplied by a caller.
export const gitSourceIdentity = read => immutableReaders.get(read);

// Only Git objects identified by an exact commit are cached. Never cache a
// worktree read, a tag lookup, a caller's reader or a successful validation.
export function createGitReader(execute = execFileSync) {
  const revisions = new Map();
  const blobs = new Map();
  let cacheBytes = 0;
  const git = (root, args, options = {}) => execute('git', ['-C', root, ...args], {
    windowsHide: true, maxBuffer: TREE_LIMIT, ...options,
  });
  const cacheKey = (root, oid) => root + ':' + oid;
  const remember = (root, oid, bytes) => {
    const key = cacheKey(root, oid);
    if (blobs.has(key)) return;
    while (cacheBytes + bytes.length > CACHE_LIMIT) {
      const oldest = blobs.keys().next().value;
      cacheBytes -= blobs.get(oldest).length;
      blobs.delete(oldest);
    }
    blobs.set(key, Buffer.from(bytes));
    cacheBytes += bytes.length;
  };
  const getBlob = (root, oid) => {
    const key = cacheKey(root, oid), bytes = blobs.get(key);
    if (bytes) { blobs.delete(key); blobs.set(key, bytes); }
    return bytes;
  };
  const loadBlobs = (root, entries) => {
    const unique = new Map(entries.map(entry => [entry.oid, entry]));
    const expected = [...unique.values()].filter(entry => !blobs.has(cacheKey(root, entry.oid)));
    if (!expected.length) return;
    const total = expected.reduce((sum, entry) => sum + entry.size + 100, 0);
    const output = git(root, ['cat-file', '--batch'], {
      input: expected.map(entry => entry.oid).join('\n') + '\n', maxBuffer: total,
    });
    const verified = [];
    let offset = 0;
    for (const entry of expected) {
      const newline = output.indexOf(10, offset);
      assert(newline >= offset, 'GIT_SOURCE_BATCH_HEADER');
      assert.equal(output.subarray(offset, newline).toString('ascii'),
        entry.oid + ' blob ' + entry.size, 'GIT_SOURCE_BATCH_IDENTITY');
      offset = newline + 1;
      const end = offset + entry.size;
      assert(end < output.length && output[end] === 10, 'GIT_SOURCE_BATCH_SIZE');
      verified.push([entry.oid, output.subarray(offset, end)]);
      offset = end + 1;
    }
    assert.equal(offset, output.length, 'GIT_SOURCE_BATCH_TRAILING');
    // A partial or malformed response never populates the cache.
    for (const [oid, bytes] of verified) remember(root, oid, bytes);
  };
  const loadTree = (root, revision) => {
    const output = git(root, ['ls-tree', '-r', '-l', '-z', '--full-tree', revision]);
    assert(output.length === 0 || output.at(-1) === 0, 'GIT_SOURCE_TREE_TERMINATOR');
    const files = new Map();
    let offset = 0;
    while (offset < output.length) {
      const end = output.indexOf(0, offset), row = decoder.decode(output.subarray(offset, end));
      const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\s+(\d+|-)\t([\s\S]+)$/.exec(row);
      assert(match, 'GIT_SOURCE_TREE_RECORD');
      const [, , type, oid, size, file] = match;
      assert(!files.has(file), 'GIT_SOURCE_TREE_DUPLICATE');
      const length = Number(size);
      assert(type !== 'blob' || (Number.isSafeInteger(length) && length >= 0), 'GIT_SOURCE_TREE_SIZE');
      files.set(file, { type, oid, size: length });
      offset = end + 1;
    }
    return files;
  };
  return (directory, revision) => {
    assert(typeof revision === 'string' && /^[a-f0-9]{40}$/.test(revision),
      'Source revision must be a resolved commit');
    const root = realpathSync(directory), identity = root + ':' + revision;
    if (!revisions.has(identity)) {
      const resolved = git(root, ['rev-parse', revision + '^{commit}']).toString().trim();
      assert.equal(resolved, revision, 'Source commit did not resolve exactly');
      revisions.set(identity, { files: undefined, prefetched: false });
    }
    const state = revisions.get(identity);
    const read = file => {
      safePath(root, file);
      state.files ??= loadTree(root, revision);
      const entry = state.files.get(file);
      assert(entry?.type === 'blob', 'GIT_SOURCE_NOT_BLOB:' + file);
      assert(entry.size <= FILE_LIMIT, 'GIT_SOURCE_FILE_LIMIT:' + file);
      if (!state.prefetched) {
        // Bound speculative work; larger trees are read on demand. Shared
        // object IDs across historical commits are read from Git once while cached.
        const batch = [entry], seen = new Set([entry.oid]);
        let total = entry.size;
        for (const candidate of state.files.values()) {
          if (candidate.type !== 'blob' || candidate.size > FILE_LIMIT || seen.has(candidate.oid) ||
              blobs.has(cacheKey(root, candidate.oid)) || total + candidate.size > PREFETCH_LIMIT) continue;
          batch.push(candidate); seen.add(candidate.oid); total += candidate.size;
        }
        loadBlobs(root, batch);
        state.prefetched = true;
      }
      if (!getBlob(root, entry.oid)) loadBlobs(root, [entry]);
      // Callers can mutate their Buffer without poisoning historical evidence.
      return Buffer.from(getBlob(root, entry.oid));
    };
    if (execute === execFileSync) immutableReaders.set(read, Object.freeze({ root, revision }));
    return read;
  };
}
