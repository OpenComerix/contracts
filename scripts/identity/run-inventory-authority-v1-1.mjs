import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveSchema } from '../inventory/schema-v1.mjs';
import { root, successorPath, fixturePath, validateSuccessorPackage } from './inventory-authority-v1-1.mjs';

function execute(file, args, directory, label, shell = false) {
  const result = spawnSync(file, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell,
    windowsHide: true,
    env: { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' },
  });
  fs.writeFileSync(path.join(directory, label + '.log'), JSON.stringify({
    exit: result.status, error: result.error?.message ?? null,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
  }) + '\n');
  if (result.stderr) process.stderr.write(result.stderr);
  assert(!result.error && result.status === 0, 'IA11_TOOL_FAILED:' + label + ':' + result.status);
  return result.stdout;
}
function directory(output) {
  assert(/^\.ci-artifacts\/inventory-v1-authority-1-1-[a-zA-Z0-9-]+$/.test(output), 'IA11_OUTPUT_PATH');
  const target = path.join(root, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert(!fs.lstatSync(path.dirname(target)).isSymbolicLink(), 'IA11_OUTPUT_LINK');
  assert.equal(fs.realpathSync(path.dirname(target)), path.dirname(target), 'IA11_OUTPUT_REALPATH');
  fs.mkdirSync(target); // Never overwrite an earlier receipt.
  return target;
}
export function prepare(output) {
  validateSuccessorPackage();
  const target = directory(output);
  const save = (file, value) => fs.writeFileSync(path.join(target, file),
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const fixture = JSON.parse(fs.readFileSync(path.join(root, fixturePath), 'utf8'));
  const document = JSON.parse(fs.readFileSync(path.join(root, successorPath), 'utf8'));
  const cases = [];
  const schemas = [];
  for (const [route, item] of Object.entries(document.paths)) {
    const operation = item.post.operationId;
    const pointer = '/paths/' + route.replaceAll('~', '~0').replaceAll('/', '~1') +
      '/post/responses/400/content/application~1problem+json/schema';
    const schema = operation + '.schema.json';
    save(schema, { $schema: 'https://json-schema.org/draft/2020-12/schema', ...resolveSchema(successorPath, pointer) });
    schemas.push(schema);
    const add = (id, value, expected) => {
      const file = operation + '-' + id + '.json';
      save(file, value);
      cases.push([operation + '-' + id, expected, schema, file]);
    };
    add('valid', fixture.problem, 'accept');
    for (const negative of fixture.negatives) {
      const value = structuredClone(fixture.problem);
      if (negative.remove) delete value[negative.field];
      else value[negative.field] = negative.value;
      add(negative.id, value, 'reject');
    }
  }
  save('schemas.txt', schemas.join('\n') + '\n');
  save('cases.tsv', cases.map(row => row.join('\t')).join('\n') + '\n');
  save('gate.sh', fs.readFileSync(path.join(root, 'scripts/inventory/validate-v1.sh'), 'utf8').replaceAll('\r\n', '\n'));
  const result = { output, schemas: schemas.length,
    accepted: cases.filter(row => row[1] === 'accept').length,
    invalid_rejected: cases.filter(row => row[1] === 'reject').length,
    runtime_demonstrated: false };
  save('manifest.json', result);
  return result;
}
export function openapi(offline = false) {
  validateSuccessorPackage();
  const output = '.ci-artifacts/inventory-v1-authority-1-1-' + randomUUID();
  const target = directory(output);
  const file = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const prefix = [...(offline ? ['--offline'] : []), '--yes', '@redocly/cli@2.53.3'];
  const result = execute(file, [...prefix, 'lint', successorPath, '--format', 'json'],
    target, 'redocly-lint', process.platform === 'win32');
  const start = result.indexOf('{\n  "totals"'), end = result.indexOf('\n}', start);
  assert(start >= 0 && end > start, 'IA11_REDOC_JSON');
  const report = JSON.parse(result.slice(start, end + 2));
  assert.equal(report.version, '2.53.3', 'IA11_REDOC_VERSION');
  assert.equal(report.totals.errors, 0, 'IA11_REDOC_ERRORS');
  assert.equal(report.totals.warnings, 0, 'IA11_REDOC_WARNINGS');
  execute(file, [...prefix, 'bundle', successorPath, '--dereferenced', '--ext', 'json',
    '--output', output + '/authority.bundle.json'], target, 'redocly-bundle', process.platform === 'win32');
  return { result: 'passed', validator: 'Redocly 2.53.3', errors: 0, warnings: 0, output, runtime_demonstrated: false };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...options] = process.argv.slice(2);
  if (mode === 'prepare') {
    assert.equal(options.length, 1, 'IA11_OPTIONS');
    console.log(JSON.stringify(prepare(options[0])));
  } else if (mode === 'openapi') {
    assert(options.length === 0 || (options.length === 1 && options[0] === '--offline'), 'IA11_OPTIONS');
    console.log(JSON.stringify(openapi(options[0] === '--offline')));
  } else if (mode === 'schema') {
    assert.equal(options.length, 0, 'IA11_OPTIONS');
    const expected = prepare('.ci-artifacts/inventory-v1-authority-1-1-' + randomUUID());
    const target = path.join(root, expected.output);
    const result = execute('docker', ['run', '--rm', '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--mount', 'type=bind,source=' + target + ',target=/work', '--workdir', '/work',
      '--entrypoint', 'sh', 'ghcr.io/sourcemeta/jsonschema:v16.10.0', 'gate.sh', '.'], target, 'sourcemeta');
    const counts = /schemas=(\d+) accepted=(\d+) invalid_rejected=(\d+)/.exec(result);
    assert(counts, 'IA11_SCHEMA_SUMMARY');
    assert.deepEqual(counts.slice(1).map(Number), [expected.schemas, expected.accepted, expected.invalid_rejected], 'IA11_SCHEMA_COUNTS');
    console.log(JSON.stringify({ ...expected, result: 'passed', validator: 'Sourcemeta 16.10.0' }));
  } else assert.fail('IA11_MODE');
}
