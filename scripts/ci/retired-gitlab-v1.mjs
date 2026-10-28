import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGitReader } from '../../tools/architecture/git-source.mjs';

const root = path.resolve(import.meta.dirname, '../..');
// Last reviewed GitLab configuration, preserved in GitHub's immutable history.
export const retiredCIRevision = '4ebc146e7be83713f39a72384bd0dfb7a1575616';
const historical = createGitReader()(root, retiredCIRevision);
export function readRepositoryFile(file) {
  if (file !== '.gitlab-ci.yml') return fs.readFileSync(path.join(root, file));
  assert(!fs.existsSync(path.join(root, file)), 'RETIRED_GITLAB_CI_REINTRODUCED');
  return historical(file);
}
