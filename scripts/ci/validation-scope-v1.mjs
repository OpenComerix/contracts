import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import { readLocal } from '../../tools/architecture/consumer-gate.mjs';

const exactSHA = value => /^[a-f0-9]{40}$/.test(value ?? '') && value !== '0'.repeat(40);
const safePath = value => typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value) &&
  !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');
const sensitive = /(?:^|\/)(?:identity|common|registry|tools|\.github|ci|architecture)(?:\/|$)|(?:admission|consumer|release|reviewed-package|security|permission|delegation|authority)/i;
export function eligibleFastPath(file) {
  if (!safePath(file) || sensitive.test(file)) return false;
  return /^docs\/.+\.md$/.test(file) ||
    /^(?:catalog|inventory|sales|finance)\/(?:http|events|commands|fixtures)\/.+\.(?:json|yaml|yml)$/.test(file) ||
    /^scripts\/(?:catalog|inventory|sales|finance)\/.+\.mjs$/.test(file) ||
    /^test\/(?:catalog|inventory|sales|finance)\/.+\.test\.mjs$/.test(file);
}
export function parseChanges(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text) return [];
  assert(text.endsWith('\0'), 'SCOPE_INCOMPLETE_DIFF');
  const fields = text.slice(0, -1).split('\0'), result = [];
  assert.equal(fields.length % 2, 0, 'SCOPE_AMBIGUOUS_DIFF');
  for (let i = 0; i < fields.length; i += 2) {
    assert(['A','M'].includes(fields[i]) && safePath(fields[i + 1]), 'SCOPE_UNSUPPORTED_CHANGE');
    assert(!result.includes(fields[i + 1]), 'SCOPE_DUPLICATE_PATH');
    result.push(fields[i + 1]);
  }
  return result;
}
export function selectValidation({ eventName, ref, sha, before, message, files }) {
  const full = reason => ({ mode: 'full', reason, files: [], tests: [] });
  if (eventName !== 'push' || !ref?.startsWith('refs/heads/')) return full('FULL_EVENT');
  if (!exactSHA(sha) || !exactSHA(before)) return full('FULL_MISSING_BASE');
  const markers = String(message ?? '').split(/\r?\n/).filter(line => /^CI-Intent:/i.test(line));
  if (markers.length !== 1 || markers[0] !== 'CI-Intent: advance') return full('FULL_INTENT');
  if (!Array.isArray(files) || !files.length || files.length > 200 || !files.every(eligibleFastPath) ||
      new Set(files).size !== files.length) return full('FULL_SENSITIVE_OR_UNKNOWN');
  return { mode: 'fast', reason: 'EXPLICIT_ADVANCE', files: [...files].sort(),
    tests: files.filter(file => /^test\/.+\.test\.mjs$/.test(file)).sort() };
}
export function planFromCheckout(root, env = process.env, execute = execFileSync) {
  const git = args => execute('git', ['-c', 'safe.directory=' + root, '-C', root, ...args],
    { maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  assert.equal(env.GITHUB_REPOSITORY, 'opencomerix/contracts', 'SCOPE_REPOSITORY');
  assert(exactSHA(env.GITHUB_SHA), 'SCOPE_SOURCE_REQUIRED');
  assert.equal(git(['rev-parse','HEAD']).toString().trim(), env.GITHUB_SHA, 'SCOPE_CHECKOUT_SHA');
  const fallback = reason => ({ mode: 'full', reason, files: [], tests: [] });
  if (env.GITHUB_EVENT_NAME !== 'push' || !env.GITHUB_REF?.startsWith('refs/heads/')) return fallback('FULL_EVENT');
  let event, files, message;
  try {
    event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    if (event.repository?.full_name !== env.GITHUB_REPOSITORY || event.ref !== env.GITHUB_REF ||
        event.after !== env.GITHUB_SHA || event.head_commit?.id !== env.GITHUB_SHA || event.deleted || !exactSHA(event.before))
      return fallback('FULL_UNVERIFIED_EVENT');
    git(['merge-base','--is-ancestor',event.before,env.GITHUB_SHA]);
    message = git(['log','-1','--format=%B']).toString();
    files = parseChanges(git(['diff','--no-ext-diff','--no-textconv','--name-status','-z',event.before,env.GITHUB_SHA]));
    if (files.length) {
      const rows = git(['ls-tree','-z',env.GITHUB_SHA,'--',...files]).toString().split('\0').filter(Boolean);
      if (rows.length !== files.length || rows.some(row => !/^100(?:644|755) blob [a-f0-9]{40}\t/.test(row)))
        return fallback('FULL_NONREGULAR_SOURCE');
    }
  } catch { return fallback('FULL_UNVERIFIED_DIFF'); }
  return selectValidation({ eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, sha: env.GITHUB_SHA,
    before: event.before, message, files });
}
const run = (root, file, args) => {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
  assert(!result.error && !result.signal && result.status === 0, 'FAST_COMMAND_FAILED:' + args[0]);
};
export function runFast(root, plan, execute = run) {
  assert(plan.mode === 'fast' && plan.files.length && plan.files.every(eligibleFastPath), 'FAST_SCOPE_REQUIRED');
  assert.deepEqual(plan.tests, plan.files.filter(file => /^test\/.+\.test\.mjs$/.test(file)).sort(), 'FAST_TEST_SCOPE');
  for (const file of plan.files) {
    assert(!fs.lstatSync(path.join(root, file)).isSymbolicLink(), 'FAST_LINK_FORBIDDEN');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(readLocal(root, file));
    if (/\.json$/.test(file)) JSON.parse(source);
    if (/\.(?:json|yaml|yml)$/.test(file)) {
      const documents = parseAllDocuments(source, { uniqueKeys: true });
      assert(documents.length === 1 && documents.every(document => document.errors.length === 0), 'FAST_INVALID_DOCUMENT:' + file);
    }
    if (/\.mjs$/.test(file)) execute(root, process.execPath, ['--check', file]);
  }
  execute(root, process.execPath, ['scripts/validate-contract-refs.mjs', '--self-test']);
  execute(root, process.execPath, ['tools/architecture/cli.mjs', 'registry']);
  execute(root, process.execPath, ['--input-type=module', '-e',
    "import { validateCaptureSource } from './scripts/inventory/capture-authority-v2.mjs'; console.log(JSON.stringify(validateCaptureSource()));"]);
  if (plan.tests.length) execute(root, process.execPath, ['--test','--test-reporter=tap','--test-concurrency=2',...plan.tests]);
  return { mode: 'fast', partial: true, files: plan.files.length, selected_tests: plan.tests };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = planFromCheckout(path.resolve(import.meta.dirname, '../..'));
  if (plan.mode === 'fast') console.log(JSON.stringify(runFast(path.resolve(import.meta.dirname, '../..'), plan)));
  assert(process.env.GITHUB_OUTPUT, 'SCOPE_OUTPUT_REQUIRED');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'mode=' + plan.mode + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Contracts CI: **${plan.mode}** (${plan.reason}). ${plan.mode === 'fast' ? 'Parcial: no habilita cierre, tags, admisión ni consumo.' : 'Ejecuta los 22 jobs completos.'}\n`);
  console.log(JSON.stringify({ mode: plan.mode, reason: plan.reason, files: plan.files.length, selected_tests: plan.tests }));
}
