import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseAllDocuments } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const base = '77bc15a4cc8d13867ef5a66945ed8e3de79696cc';
const proofHashes = {
  'test/identity/candidate-preservation.test.mjs': 'd6852b2ab29f3394fa1b00d9f306f1009866fbdfcba9f93e13f015be63211d8e',
  'test/identity/catalog-admission-v1.test.mjs': 'e6deef4a74e5e60bce4ea9e57fadc632ab03c0f89da11d4614a24b1d9ff8d28b',
  'test/identity/catalog-recovery-renewal-v2.test.mjs': '103e301429e2d4010b4a939ace1d1eef7c83daa1c0d402c5637dcd8157c1c12a',
  'test/identity/catalog-recovery-renewal-admission-v2.test.mjs': '637c839316cad406cb720a916ef8fd57d84b34b460a26ec9a76c975074156476',
  'test/architecture/catalog-foundation.test.mjs': '2434fdd27253b13b9c6798410857e0620fddf1e7f039db6de02c29b603856059',
};
const files = ['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'catalog/README.md', ...Object.keys(proofHashes)];
const normalize = value => value.replaceAll('\r\n', '\n');
const original = Object.fromEntries(files.map(file => [file, normalize(execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' }))]));
const current = Object.fromEntries(files.map(file => [file, normalize(fs.readFileSync(path.join(root, file), 'utf8'))]));
const installJobs = ['validate:contract-architecture', 'validate:catalog-contracts', 'validate:identity-catalog-contracts'];
const priorInstall = '    - pnpm install --frozen-lockfile\n';
assert.equal(original['.gitlab-ci.yml'].split(priorInstall).length - 1, installJobs.length);
const approvedPriorCi = original['.gitlab-ci.yml'].replaceAll(priorInstall, priorInstall.trimEnd() + ' --ignore-scripts\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (actual, expected, code) => assert(JSON.stringify(actual) === JSON.stringify(expected), code);
function yamlDocuments(text) {
  const documents = parseAllDocuments(text);
  assert(documents.every(document => document.errors.length === 0), 'N_PRESERVATION_YAML');
  return documents.map(document => document.toJSON());
}

function checkAppend(file, text, marker, expectedHash, expectedPrefix = original[file]) {
  const index = text.indexOf(marker);
  assert(index >= 0 && text.slice(0, index) === expectedPrefix, 'N_PRESERVATION_PREFIX:' + file);
  assert(hash(text.slice(index)) === expectedHash, 'N_PRESERVATION_SUFFIX:' + file);
}

function checkPreservation(candidate) {
  for (const [file, expected] of Object.entries(proofHashes)) assert(hash(candidate[file]) === expected, 'N_PRESERVATION_PROOF:' + file);
  checkAppend('.gitlab-ci.yml', candidate['.gitlab-ci.yml'], '\nvalidate:catalog-asyncapi:', '33e88587d4d15a40835eff9da4e886f102a22944b04095ac7eb3e59bc6c78154', approvedPriorCi);
  // Keep the published certification proof exact; only the separately admitted
  // suffix may follow it. Duplication or unrelated documentation still fails.
  const readme = candidate['catalog/README.md'];
  const marker = '\n## F1-08N — Admisión seleccionada de AsyncAPI';
  const admission = readme.indexOf(marker);
  assert(admission >= 0 && hash(readme.slice(admission)) === '4f318b98f43c6d9f3fe8c817e7be23b1de203bcdd763242530c16f570cfa3c0c', 'N_PRESERVATION_ADMISSION_README');
  checkAppend('catalog/README.md', readme.slice(0, admission), '\n## F1-08N — Certificación de AsyncAPI (candidato)', 'af4e53ccf2290918d4d23087f5ff901857d2cd17116ed4c0280a79b8b54c9b72');
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

test('N permits only the exact added CI/README, three script-free installs and isolated parser dependency closure', () => {
  checkPreservation(current);
  const ci = yamlDocuments(current['.gitlab-ci.yml'])[0];
  const prior = yamlDocuments(approvedPriorCi)[0];
  for (const name of installJobs) assert.equal(prior[name].before_script.at(-1), 'pnpm install --frozen-lockfile --ignore-scripts');
  for (const [name, value] of Object.entries(prior)) same(ci[name], value, 'N_PRIOR_JOB:' + name);
  assert.deepEqual(Object.keys(ci).filter(key => !Object.hasOwn(prior, key)), ['validate:catalog-asyncapi', 'validate:catalog-asyncapi-schema']);
  assert.deepEqual(ci['validate:catalog-asyncapi-schema'].needs, [{ job: 'validate:catalog-asyncapi', artifacts: true }]);
});

for (const file of Object.keys(proofHashes)) {
  for (const [drift, changed] of [
    ['unapproved change', current[file] + '\n// unapproved\n'],
    ['pre-N proof restored', original[file]],
  ]) test('N rejects proof drift: ' + file + ' / ' + drift, () => {
    assert.notEqual(changed, current[file]);
    assert.throws(() => checkPreservation({ ...current, [file]: changed }), /N_PRESERVATION_PROOF/);
  });
}

for (const name of installJobs) {
  for (const [drift, replacement] of [
    ['scripts suppression removed', ''],
    ['scripts suppression disabled', ' --ignore-scripts=false'],
  ]) test('N rejects install drift: ' + name + ' / ' + drift, () => {
    const pattern = new RegExp('(' + name + ':[\\s\\S]*?    - pnpm install --frozen-lockfile) --ignore-scripts');
    const changed = current['.gitlab-ci.yml'].replace(pattern, '$1' + replacement);
    assert.notEqual(changed, current['.gitlab-ci.yml']);
    assert.throws(() => checkPreservation({ ...current, '.gitlab-ci.yml': changed }), /N_PRESERVATION_PREFIX/);
  });
}

for (const [name, file, mutate] of [
  ['previous job changed', '.gitlab-ci.yml', text => text.replace('interruptible: true', 'interruptible: false')],
  ['new schema job removed', '.gitlab-ci.yml', text => text.slice(0, text.indexOf('\nvalidate:catalog-asyncapi-schema:'))],
  ['new gate changed', '.gitlab-ci.yml', text => text.replace('validate-asyncapi-v1.sh', 'validate-security-v1.sh')],
  ['duplicated new jobs', '.gitlab-ci.yml', text => text + text.slice(text.indexOf('\nvalidate:catalog-asyncapi:'))],
  ['prior README changed', 'catalog/README.md', text => 'unapproved\n' + text],
  ['new README changed', 'catalog/README.md', text => text.replace('Sourcemeta 16.10.0 valida', 'Sourcemeta 16.10.0 no valida')],
  ['duplicated README suffix', 'catalog/README.md', text => text + text.slice(text.indexOf('\n## F1-08N'))],
  ['admission README changed', 'catalog/README.md', text => text.replace('únicamente `catalog.events.v1.asyncapi`', 'también `catalog.events.v1.asyncapi`')],
  ['admission README omitted', 'catalog/README.md', text => text.slice(0, text.indexOf('\n## F1-08N — Admisión seleccionada de AsyncAPI'))],
  ['admission README duplicated', 'catalog/README.md', text => text + text.slice(text.indexOf('\n## F1-08N — Admisión seleccionada de AsyncAPI'))],
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
