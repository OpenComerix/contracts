import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseAllDocuments } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const base = '77bc15a4cc8d13867ef5a66945ed8e3de79696cc';
const files = ['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'catalog/README.md'];
const normalize = value => value.replaceAll('\r\n', '\n');
const original = Object.fromEntries(files.map(file => [file, normalize(execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }))]));
const current = Object.fromEntries(files.map(file => [file, normalize(fs.readFileSync(path.join(root, file), 'utf8'))]));
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (actual, expected, code) => assert(JSON.stringify(actual) === JSON.stringify(expected), code);
function yamlDocuments(text) {
  const documents = parseAllDocuments(text);
  assert(documents.every(document => document.errors.length === 0), 'N_PRESERVATION_YAML');
  return documents.map(document => document.toJSON());
}

function checkAppend(file, text, marker, expectedHash) {
  const index = text.indexOf(marker);
  assert(index >= 0 && text.slice(0, index) === original[file], 'N_PRESERVATION_PREFIX:' + file);
  assert(hash(text.slice(index)) === expectedHash, 'N_PRESERVATION_SUFFIX:' + file);
}

function checkPreservation(candidate) {
  checkAppend('.gitlab-ci.yml', candidate['.gitlab-ci.yml'], '\nvalidate:catalog-asyncapi:', '33e88587d4d15a40835eff9da4e886f102a22944b04095ac7eb3e59bc6c78154');
  checkAppend('catalog/README.md', candidate['catalog/README.md'], '\n## F1-08N — Certificación de AsyncAPI (candidato)', 'af4e53ccf2290918d4d23087f5ff901857d2cd17116ed4c0280a79b8b54c9b72');
  const pkg = JSON.parse(candidate['package.json']);
  assert.equal(pkg.devDependencies['@asyncapi/parser'], '3.6.4', 'N_PRESERVATION_PARSER');
  delete pkg.devDependencies['@asyncapi/parser'];
  same(pkg, JSON.parse(original['package.json']), 'N_PRESERVATION_PACKAGE');
  const before = yamlDocuments(original['pnpm-lock.yaml']);
  const after = yamlDocuments(candidate['pnpm-lock.yaml']);
  assert.equal(after.length, before.length, 'N_PRESERVATION_LOCK_DOCUMENTS');
  same(after[0], before[0], 'N_PRESERVATION_PACKAGE_MANAGER');
  const lock = structuredClone(after[1]);
  same(lock.importers['.'].devDependencies['@asyncapi/parser'], { specifier: '3.6.4', version: '3.6.4' }, 'N_PRESERVATION_LOCK_PARSER');
  delete lock.importers['.'].devDependencies['@asyncapi/parser'];
  for (const section of ['packages', 'snapshots']) {
    for (const [key, value] of Object.entries(before[1][section])) same(lock[section][key], value, 'N_PRESERVATION_PRIOR_LOCK:' + key);
  }
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const snapshot = lock.snapshots[key];
    assert(snapshot, 'N_PRESERVATION_UNRESOLVED_LOCK:' + key);
    for (const [name, version] of Object.entries({ ...snapshot.dependencies, ...snapshot.optionalDependencies })) visit(name + '@' + version);
  }
  visit('@asyncapi/parser@3.6.4');
  const reachablePackages = new Set([...visited].map(key => key.replace(/\(.*$/u, '')));
  for (const key of Object.keys(lock.snapshots)) assert(Object.hasOwn(before[1].snapshots, key) || visited.has(key), 'N_PRESERVATION_ORPHAN_SNAPSHOT:' + key);
  for (const key of Object.keys(lock.packages)) assert(Object.hasOwn(before[1].packages, key) || reachablePackages.has(key), 'N_PRESERVATION_ORPHAN_PACKAGE:' + key);
  for (const section of ['packages', 'snapshots']) lock[section] = before[1][section];
  same(lock, before[1], 'N_PRESERVATION_LOCK_CONFIGURATION');
}

test('N permits only the exact added CI/README and the isolated parser dependency closure', () => {
  checkPreservation(current);
  const ci = yamlDocuments(current['.gitlab-ci.yml'])[0];
  const prior = yamlDocuments(original['.gitlab-ci.yml'])[0];
  for (const [name, value] of Object.entries(prior)) same(ci[name], value, 'N_PRIOR_JOB:' + name);
  assert.deepEqual(Object.keys(ci).filter(key => !Object.hasOwn(prior, key)), ['validate:catalog-asyncapi', 'validate:catalog-asyncapi-schema']);
  assert.deepEqual(ci['validate:catalog-asyncapi-schema'].needs, [{ job: 'validate:catalog-asyncapi', artifacts: true }]);
});

for (const [name, file, mutate] of [
  ['previous job changed', '.gitlab-ci.yml', text => text.replace('interruptible: true', 'interruptible: false')],
  ['new schema job removed', '.gitlab-ci.yml', text => text.slice(0, text.indexOf('\nvalidate:catalog-asyncapi-schema:'))],
  ['new gate changed', '.gitlab-ci.yml', text => text.replace('validate-asyncapi-v1.sh', 'validate-security-v1.sh')],
  ['duplicated new jobs', '.gitlab-ci.yml', text => text + text.slice(text.indexOf('\nvalidate:catalog-asyncapi:'))],
  ['prior README changed', 'catalog/README.md', text => 'unapproved\n' + text],
  ['new README changed', 'catalog/README.md', text => text.replace('Sourcemeta 16.10.0 valida', 'Sourcemeta 16.10.0 no valida')],
  ['duplicated README suffix', 'catalog/README.md', text => text + text.slice(text.indexOf('\n## F1-08N'))],
  ['parser revision changed', 'package.json', text => text.replace('"3.6.4"', '"3.6.3"')],
  ['prior YAML dependency changed', 'package.json', text => text.replace('"2.9.1"', '"2.9.0"')],
  ['extra direct dependency', 'package.json', text => { const pkg = JSON.parse(text); pkg.devDependencies.unapproved = '1.0.0'; return JSON.stringify(pkg); }],
  ['lock parser revision changed', 'pnpm-lock.yaml', text => text.replace('specifier: 3.6.4', 'specifier: 3.6.3')],
  ['prior lock integrity changed', 'pnpm-lock.yaml', text => text.replace('3NxN8+78OdzbT7C', '0NxN8+78OdzbT7C')],
  ['unreachable lock package', 'pnpm-lock.yaml', text => text.replace('\n  yaml@2.9.1:', '\n  unapproved@1.0.0: {}\n\n  yaml@2.9.1:')],
]) test('N rejects preservation drift: ' + name, () => {
  const changed = mutate(current[file]); assert.notEqual(changed, current[file]);
  assert.throws(() => checkPreservation({ ...current, [file]: changed }), /N_PRESERVATION/);
});
