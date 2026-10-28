import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveSchema } from './schema-v1.mjs';
import { root, httpPath, schemaPath, fixturePath, validateCaptureSource, validateSourceScope } from './capture-authority-v2.mjs';

function directory(output) {
  assert(/^\.ci-artifacts\/inventory-v1-capture-authority-v2-[a-zA-Z0-9-]+$/.test(output), 'IC2_OUTPUT_PATH');
  const target = path.join(root, output), parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  assert(!fs.lstatSync(parent).isSymbolicLink() && fs.realpathSync(parent) === parent, 'IC2_OUTPUT_LINK');
  fs.mkdirSync(target); // Existing evidence is never replaced.
  return target;
}
function execute(file, args, target, label, shell = false) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    windowsHide: true, shell,
    env: { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' } });
  fs.writeFileSync(path.join(target, label + '.log'), JSON.stringify({ exit: result.status,
    error: result.error?.message ?? null, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }) + '\n', { flag: 'wx' });
  if (result.stderr) process.stderr.write(result.stderr);
  assert(!result.error && result.status === 0, 'IC2_TOOL_FAILED:' + label + ':' + result.status);
  return result.stdout;
}
export function prepare(output) {
  validateCaptureSource();
  validateSourceScope();
  const target = directory(output), cases = [], schemas = [];
  const save = (file, value) => fs.writeFileSync(path.join(target, file),
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const sample = JSON.parse(fs.readFileSync(path.join(root, fixturePath), 'utf8'));
  for (const [name, base] of [['Request', sample.query], ['Decision', sample.decision]]) {
    const schema = name + '.schema.json';
    save(schema, { $schema: 'https://json-schema.org/draft/2020-12/schema', ...resolveSchema(schemaPath, '/$defs/' + name) });
    schemas.push(schema);
    const add = (id, value, expected) => {
      const file = name + '-' + id + '.json'; save(file, value);
      cases.push([name + '-' + id, expected, schema, file]);
    };
    add('valid', base, 'accept');
    for (const [id, value] of [ ['missing', undefined], ['uppercase', 'A'.repeat(64)], ['short', 'a'.repeat(63)],
      ['long', 'a'.repeat(65)], ['nonhex', 'g'.repeat(64)], ['number', 1], ['null', null] ]) {
      const wrong = structuredClone(base);
      if (value === undefined) delete wrong.capture_fingerprint;
      else wrong.capture_fingerprint = value;
      add('fingerprint-' + id, wrong, 'reject');
    }
    add('extra-field', { ...base, lines: [] }, 'reject');
    for (const key of ['organization_id', 'operation_id', 'preparation_id', 'request_hash']) {
      const wrong = structuredClone(base); delete wrong[key]; add('missing-' + key, wrong, 'reject');
    }
    if (name === 'Request') add('wrong-target', { ...base, target: 'catalog-pricing.sale-capture' }, 'reject');
    else {
      add('wrong-caller', { ...base, caller: 'sales-pos' }, 'reject');
      add('wrong-audience', { ...base, audience: 'sales-pos.catalog-capture-authority' }, 'reject');
      add('denied', { ...base, authorized: false }, 'reject');
      add('budget-exceeded', { ...base, valid_for_ms: 2001 }, 'reject');
      add('budget-zero', { ...base, valid_for_ms: 0 }, 'reject');
    }
  }
  save('schemas.txt', schemas.join('\n') + '\n');
  save('cases.tsv', cases.map(row => row.join('\t')).join('\n') + '\n');
  save('gate.sh', fs.readFileSync(path.join(root, 'scripts/inventory/validate-v1.sh'), 'utf8').replaceAll('\r\n', '\n'));
  const result = { output, schemas: schemas.length, accepted: cases.filter(row => row[1] === 'accept').length,
    invalid_rejected: cases.filter(row => row[1] === 'reject').length, runtime_demonstrated: false };
  save('manifest.json', result);
  return result;
}
export function openapi(offline = false) {
  validateCaptureSource(); validateSourceScope();
  const output = '.ci-artifacts/inventory-v1-capture-authority-v2-' + randomUUID(), target = directory(output);
  const file = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const prefix = [...(offline ? ['--offline'] : []), '--yes', '@redocly/cli@2.53.3'];
  const reportText = execute(file, [...prefix, 'lint', httpPath, '--format', 'json'], target, 'redocly-lint', process.platform === 'win32');
  const start = reportText.indexOf('{\n  "totals"'), end = reportText.indexOf('\n}', start);
  assert(start >= 0 && end > start, 'IC2_REDOC_JSON');
  const report = JSON.parse(reportText.slice(start, end + 2));
  assert.equal(report.version, '2.53.3', 'IC2_REDOC_VERSION');
  assert.equal(report.totals.errors, 0, 'IC2_REDOC_ERRORS');
  assert.equal(report.totals.warnings, 0, 'IC2_REDOC_WARNINGS');
  execute(file, [...prefix, 'bundle', httpPath, '--dereferenced', '--ext', 'json', '--output', output + '/authority.bundle.json'],
    target, 'redocly-bundle', process.platform === 'win32');
  return { result: 'passed', validator: 'Redocly 2.53.3', errors: 0, warnings: 0, output, runtime_demonstrated: false };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'prepare') {
    assert.equal(args.length, 1, 'IC2_OPTIONS');
    console.log(JSON.stringify(prepare(args[0])));
  } else if (mode === 'openapi') {
    assert(args.length === 0 || (args.length === 1 && args[0] === '--offline'), 'IC2_OPTIONS');
    console.log(JSON.stringify(openapi(args[0] === '--offline')));
  } else if (mode === 'schema') {
    assert.equal(args.length, 0, 'IC2_OPTIONS');
    const expected = prepare('.ci-artifacts/inventory-v1-capture-authority-v2-' + randomUUID()), target = path.join(root, expected.output);
    const result = execute('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--mount', 'type=bind,source=' + target + ',target=/work', '--workdir', '/work',
      '--entrypoint', 'sh', 'ghcr.io/sourcemeta/jsonschema:v16.10.0', 'gate.sh', '.'], target, 'sourcemeta');
    const counts = /schemas=(\d+) accepted=(\d+) invalid_rejected=(\d+)/.exec(result);
    assert(counts, 'IC2_SCHEMA_SUMMARY');
    assert.deepEqual(counts.slice(1).map(Number), [expected.schemas, expected.accepted, expected.invalid_rejected], 'IC2_SCHEMA_COUNTS');
    console.log(JSON.stringify({ ...expected, result: 'passed', validator: 'Sourcemeta 16.10.0' }));
  } else assert.fail('IC2_MODE');
}
