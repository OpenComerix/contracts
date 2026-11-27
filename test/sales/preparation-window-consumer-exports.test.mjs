import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { worktreeReader } from '../../tools/architecture/graph.mjs';
import { verifyPreparationWindowAdmission } from '../../scripts/sales/preparation-window-admission-v1.mjs';
import { consumerExportBase, consumerExportHashes, projectPreparationWindowConsumerDocument,
  projectPreparationWindowConsumerFile, verifyPreparationWindowConsumerExports } from '../../scripts/sales/preparation-window-consumer-exports.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const current = worktreeReader(root);
const previous = createGitReader()(root, consumerExportBase);
const paths = Object.keys(consumerExportHashes);

test('ID-04 projects only each exact imported export to its own previously published bytes', () => {
  verifyPreparationWindowConsumerExports(current);
  for (const file of paths) {
    const latest = current(file), initial = previous(file);
    assert.deepEqual(projectPreparationWindowConsumerFile(file, latest), initial);
    assert.deepEqual(projectPreparationWindowConsumerDocument(file, JSON.parse(latest)), JSON.parse(initial));
    const windows = Buffer.from(latest.toString('utf8').replace(/\r?\n/g, '\r\n'));
    assert.deepEqual(projectPreparationWindowConsumerFile(file, windows), initial);
    for (const invalid of [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), latest]),
      Buffer.concat([latest, Buffer.from(' ')]), current(paths.find(path => path !== file))]) {
      assert.equal(projectPreparationWindowConsumerFile(file, invalid), invalid);
      assert.throws(() => verifyPreparationWindowConsumerExports(name => name === file ? invalid : current(name)),
        /ID04_CONSUMER_EXPORT/);
    }
    const wrongRevision = { ...JSON.parse(latest), sourceCommit: '0'.repeat(40) };
    assert.equal(projectPreparationWindowConsumerDocument(file, wrongRevision), wrongRevision);
    assert.throws(() => verifyPreparationWindowConsumerExports(name => name === file ? initial : current(name)),
      /ID04_CONSUMER_EXPORT/);
  }
});

test('ID-04 keeps the immutable admission and rejects export, unrelated consumer, index and semantic drift', () => {
  const published = verifyPreparationWindowAdmission(root, consumerExportBase);
  const candidate = verifyPreparationWindowAdmission(root);
  assert.equal(published.checkedCommit, consumerExportBase);
  assert.equal(candidate.admissionRevision, consumerExportBase);
  assert.deepEqual(candidate.admittedIds, published.admittedIds);
  assert.deepEqual(candidate.consumerExports, paths);
  for (const [file, expected] of [
    [paths[0], /ID04_CONSUMER_EXPORT/],
    ['registry/consumers/identity-tenancy.json', /ID04_EXPORT_UNRELATED/],
    ['registry/consumers/index.json', /ID04_EXPORT_UNRELATED/],
    ['identity/http/shared/v2/identity-sale-preparation-workloads-v2.json', /ID04_EXPORT_CLOSURE/],
    ['scripts/sales/preparation-window-v1.mjs', /ID04_EXPORT_VALIDATION_SCRIPT/],
  ]) {
    assert.throws(() => verifyPreparationWindowAdmission(root, null, name =>
      name === file ? Buffer.concat([current(name), Buffer.from(' ')]) : current(name)), expected);
  }
});

test('ID-04 checks the exact exported descendant from Git independently of its worktree', t => {
  const temp = realpathSync(tmpdir());
  const fixture = mkdtempSync(path.join(temp, 'oc-id04-exports-'));
  t.after(() => {
    assert.equal(realpathSync(fixture), fixture);
    assert.equal(path.dirname(fixture), temp);
    rmSync(fixture, { recursive: true, force: true });
  });
  const git = (args, input) => execFileSync('git', ['-C', fixture, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture',
    '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8', input, windowsHide: true }).trim();
  const objects = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-path', 'objects'],
    { encoding: 'utf8', windowsHide: true }).trim();
  git(['init', '-q', '-b', 'fixture']);
  writeFileSync(path.join(fixture, '.git', 'objects', 'info', 'alternates'), objects + '\n', { flag: 'wx' });
  git(['read-tree', consumerExportBase]);
  const validationScript = 'scripts/sales/preparation-window-v1.mjs';
  for (const file of [...paths, validationScript]) {
    const blob = git(['hash-object', '-w', '--stdin'], Buffer.from(current(file).toString('latin1').replaceAll('\r\n', '\n'), 'latin1'));
    git(['update-index', '--cacheinfo', '100644,' + blob + ',' + file]);
  }
  const tree = git(['write-tree']);
  const revision = git(['commit-tree', tree, '-p', consumerExportBase, '-m', 'Synthetic published exports']);
  const result = verifyPreparationWindowAdmission(fixture, revision);
  assert.equal(result.checkedCommit, revision);
  assert.equal(result.admissionRevision, consumerExportBase);
  assert.deepEqual(result.consumerExports, paths);
});
