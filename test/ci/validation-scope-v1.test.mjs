import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { eligibleFastPath, parseChanges, selectValidation, planFromCheckout, runFast } from '../../scripts/ci/validation-scope-v1.mjs';

const sha = 'a'.repeat(40), before = 'b'.repeat(40);
const advance = { eventName: 'push', ref: 'refs/heads/dev', sha, before, message: 'Work in progress\n\nCI-Intent: advance\n', files: ['docs/example.md'] };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'oc-ci-scope-'));
  t.after(() => {
    assert(root.startsWith(path.resolve(tmpdir()) + path.sep + 'oc-ci-scope-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const put = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes); };
  return { root, put };
}

test('only explicit advances on branch pushes select partial checks', () => {
  assert.deepEqual(selectValidation(advance), { mode: 'fast', reason: 'EXPLICIT_ADVANCE', files: ['docs/example.md'], tests: [] });
  for (const patch of [
    { eventName: 'workflow_dispatch' }, { eventName: 'pull_request' }, { ref: 'refs/tags/v1.0.0' },
    { sha: 'a' }, { before: '0'.repeat(40) }, { before: undefined }, { files: [] }, { files: undefined },
    { message: 'Close batch' }, { message: 'CI-Intent: advance\nCI-Intent: full' },
    { message: 'ci-intent: advance' }, { message: 'CI-Intent: advance ' }, { message: 'CI-Intent: full' },
    { files: ['docs/example.md', 'docs/example.md'] }, { files: Array(201).fill('docs/example.md') },
  ]) assert.equal(selectValidation({ ...advance, ...patch }).mode, 'full', JSON.stringify(patch));
});

test('sensitive, uncertain, dependency and published admission changes stay full', () => {
  for (const file of ['.github/workflows/ci.yml', 'package.json', 'pnpm-lock.yaml', 'registry/contracts.json',
    'identity/http/private/v1/identity.yaml', 'common/schema.json', 'tools/architecture/cli.mjs',
    'scripts/ci/validation-scope-v1.mjs', 'test/architecture/registry.test.mjs', 'scripts/catalog/consumer.mjs',
    'scripts/inventory/capture-authority-v2.mjs', 'test/sales/release-v1.test.mjs', 'docs/security.md',
    'sales/README.md', 'README.md', 'docs/../package.json', '/docs/file.md', 'docs\\file.md', 'docs/file name.md']) {
    assert.equal(eligibleFastPath(file), false, file);
    assert.equal(selectValidation({ ...advance, files: ['docs/example.md', file] }).mode, 'full', file);
  }
});

test('NUL diff parsing rejects deletions, renames, broken records and invalid UTF-8', () => {
  assert.deepEqual(parseChanges(Buffer.from('M\0docs/example.md\0A\0test/catalog/example.test.mjs\0')), ['docs/example.md', 'test/catalog/example.test.mjs']);
  for (const text of ['M\0docs/example.md', 'R100\0docs/a.md\0docs/b.md\0', 'D\0docs/a.md\0',
    'T\0docs/a.md\0', 'M\0docs/a.md\0M\0docs/a.md\0', 'M\0../docs/a.md\0', 'M\0'])
    assert.throws(() => parseChanges(Buffer.from(text)));
  assert.throws(() => parseChanges(Buffer.from([0xff])));
});

test('real checkout verifies the pushed range and source identity, falling back on missing history', t => {
  const { root, put } = fixture(t);
  const git = args => execFileSync('git', ['-c', 'safe.directory=' + root, '-C', root, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = message => { git(['add', '.']); git(['-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', message]); return git(['rev-parse', 'HEAD']).toString().trim(); };
  git(['init', '-b', 'dev']); put('docs/example.md', 'Initial\n'); const base = commit('Initial fixture');
  put('docs/example.md', 'Advance\n'); const head = commit('Advance\n\nCI-Intent: advance');
  const event = { repository: { full_name: 'opencomerix/contracts' }, ref: 'refs/heads/dev', before: base, after: head, head_commit: { id: head } };
  const env = { GITHUB_REPOSITORY: 'opencomerix/contracts', GITHUB_REF: event.ref, GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: path.join(root, 'event.json') };
  put('event.json', JSON.stringify(event));
  assert.equal(planFromCheckout(root, env).mode, 'fast');
  for (const patch of [{ before: 'c'.repeat(40) }, { after: before }, { deleted: true },
    { repository: { full_name: 'foreign/contracts' } }, { head_commit: { id: before } }, { ref: 'refs/heads/other' }]) {
    put('event.json', JSON.stringify({ ...event, ...patch }));
    assert.equal(planFromCheckout(root, env).mode, 'full');
  }
  assert.throws(() => planFromCheckout(root, { ...env, GITHUB_SHA: before }), /SCOPE_CHECKOUT_SHA/);
  assert.throws(() => planFromCheckout(root, { ...env, GITHUB_REPOSITORY: 'foreign/contracts' }), /SCOPE_REPOSITORY/);
  assert.equal(planFromCheckout(root, { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }).mode, 'full');
  put('event.json', '{'); assert.equal(planFromCheckout(root, env).mode, 'full');
  put('event.json', JSON.stringify(event));
  const executor = (_file, args, options) => args.includes('ls-tree') ? Buffer.from('120000 blob ' + sha + '\tdocs/example.md\0') : execFileSync('git', args, options);
  assert.equal(planFromCheckout(root, env, executor).reason, 'FULL_NONREGULAR_SOURCE');
});

test('partial runner checks changed documents, syntax and explicit changed test files without expanding suites', t => {
  const { root, put } = fixture(t), calls = [];
  const files = ['docs/example.md', 'catalog/fixtures/example.json', 'catalog/http/public/v1/example.yaml',
    'scripts/catalog/example.mjs', 'test/catalog/example.test.mjs'];
  for (const [file, content] of [[files[0], 'Example\n'], [files[1], '{"valid":true}'], [files[2], 'openapi: 3.1.0\n'],
    [files[3], 'export const valid = true;\n'], [files[4], 'import test from "node:test"; test("example", () => {});\n']]) put(file, content);
  const plan = selectValidation({ ...advance, files });
  const result = runFast(root, plan, (_root, _node, args) => calls.push(args));
  assert.equal(result.partial, true);
  assert.deepEqual(calls.filter(args => args[0] === '--check').map(args => args[1]), files.slice(3));
  assert(calls.some(args => args[0] === 'scripts/validate-contract-refs.mjs' && args[1] === '--self-test'));
  assert(calls.some(args => args[0] === 'tools/architecture/cli.mjs' && args[1] === 'registry'));
  assert(calls.some(args => args.includes('-e') && args.at(-1).includes('validateCaptureSource')));
  assert.deepEqual(calls.at(-1), ['--test', '--test-reporter=tap', '--test-concurrency=2', files.at(-1)]);
  assert.throws(() => runFast(root, { ...plan, tests: [] }), /FAST_TEST_SCOPE/);
  assert.throws(() => runFast(root, plan, () => { throw Error('Original command failed'); }), /Original command failed/);
});

test('partial runner rejects broken documents and executes the real syntax checker', t => {
  const { root, put } = fixture(t);
  for (const [file, bytes] of [['catalog/fixtures/example.json', '{"a":1,"a":2}'],
    ['catalog/http/public/v1/example.yaml', 'a: 1\na: 2\n'], ['catalog/http/public/v1/example.yaml', '---\na: 1\n---\na: 2'],
    ['catalog/fixtures/example.json', '{'], ['docs/example.md', Buffer.from([0xff])]]) {
    put(file, bytes);
    assert.throws(() => runFast(root, selectValidation({ ...advance, files: [file] }), () => {}));
  }
  const file = 'scripts/catalog/example.mjs'; put(file, 'const broken = ;\n');
  assert.throws(() => runFast(root, selectValidation({ ...advance, files: [file] })), /FAST_COMMAND_FAILED/);
});

test('partial runner rejects paths through a directory junction outside the fixture', t => {
  const { root, put } = fixture(t);
  put('outside/example.md', 'Outside\n'); fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'docs'), 'junction');
  // The real source boundary must reject escapes even when the final file is regular.
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  fs.symlinkSync(path.join(root, 'outside'), path.join(nested, 'docs'), 'junction');
  assert.throws(() => runFast(nested, selectValidation(advance), () => {}), /Symlink escaped root/);
});
