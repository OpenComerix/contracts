import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';
import { parse } from 'yaml';
import { gitReader, resolveSelection } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { buildH5Types } from './h5-types.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const schemaPath = 'sales/events/v3/sales.sale.completed.v3.schema.json';
const contractId = 'sales.f1-14e.iana.events.sales.sale.completed.v3';
const revision = '019a75d86fd12df53b433aebdc269e85a4064f73';
const declarationName = 'sales.sale.completed.v3.d.ts';
const declarationPath = 'sales/events/v3/generated/' + declarationName;
const readLocal = file => readFileSync(path.join(root, file));
const require = createRequire(import.meta.url);

export function readCompletedSelection() {
  const registry = JSON.parse(readLocal('registry/contracts.json'));
  const snapshot = JSON.parse(readLocal('registry/consumers/sales-pos.json'));
  const descriptor = registry.contracts.find(row => row.id === contractId);
  const pin = snapshot.lock.entries.find(row => row.id === contractId && row.role === 'producer');
  assert.equal(descriptor?.status, 'active');
  assert.equal(descriptor.path, schemaPath);
  assert.equal(descriptor.commit, revision);
  assert.equal(pin?.root, schemaPath);
  assert.equal(pin.commit, revision);
  assert.deepEqual(pin.operations, []);
  assert.deepEqual(pin.pointers, ['']);
  assert.equal(pin.files.length, 6);
  assert.equal(pin.files.find(file => file.path === schemaPath)?.sha256, descriptor.sha256);
  return { descriptor, pin, registry };
}

export function resolveCompletedSources(selection, read) {
  const { descriptor, pin, registry } = selection;
  const allowed = new Set(pin.files.map(file => file.path));
  const sources = new Map();
  const closure = resolveSelection(file => {
    assert(allowed.has(file), 'COMPLETED_TYPES_UNPINNED_REFERENCE:' + file);
    const bytes = read(file);
    sources.set(file, bytes);
    return bytes;
  }, descriptor, pin, registry);
  assert.deepEqual(closure.files, pin.files, 'COMPLETED_TYPES_PINNED_BYTES');
  assert.deepEqual(closure.units, pin.units, 'COMPLETED_TYPES_PINNED_UNITS');
  return sources;
}

async function generateDeclaration(sources, directory) {
  for (const [file, bytes] of sources) {
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  const entry = path.join(directory, schemaPath);
  // The generator resolves the same files as the pinned graph. Limit its
  // resolver to those exact absolute paths, including on Windows.
  const fileKey = file => path.resolve(file).replace(/^[A-Z]:/, drive => drive.toLowerCase());
  const files = new Map([...sources].map(([file, bytes]) => [fileKey(path.join(directory, file)), bytes]));
  const declaration = await compileFromFile(entry, {
    format: false,
    bannerComment: '',
    cwd: path.dirname(entry),
    $refOptions: {
      resolve: {
        http: false,
        file: { read: file => {
          // The parser supplies an escaped absolute path. Decode it once so
          // an actual # and a literal %23 remain distinct in the allowlist.
          const location = fileKey(decodeURIComponent(file.url));
          assert(files.has(location), 'COMPLETED_TYPES_RESOLVER:' + file.url);
          return files.get(location);
        } },
      },
    },
  });
  return Buffer.from(declaration, 'utf8');
}

export function checkDeclaration(actual, generated) {
  assert(actual.equals(generated), 'COMPLETED_TYPES_DECLARATION_DRIFT:' + declarationPath);
}

const workflowPath = '.github/workflows/ci.yml';
const typesStep = {
  name: 'Check generated Sales event types',
  run: 'pnpm contracts:types:check',
  env: {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: '${{ github.workspace }}',
  },
};

export function checkTypesWorkflow(bytes) {
  const jobs = parse(bytes.toString('utf8')).jobs;
  const steps = jobs.validate_sales_contracts.steps;
  const matches = Object.values(jobs).flatMap(job => job.steps ?? [])
    .filter(step => step.name === typesStep.name || step.run?.includes(typesStep.run));
  assert.deepEqual(matches, [typesStep], 'COMPLETED_TYPES_CI_STEP');
  const index = steps.findIndex(step => step.name === typesStep.name);
  assert(index > steps.findIndex(step => step.name === 'Run original validation commands') &&
    index < steps.findIndex(step => step.name === 'Package original artifact paths'),
  'COMPLETED_TYPES_CI_ORDER');
}

function checkTypes(declaration, directory, h5Fixture) {
  const valid = JSON.parse(readLocal('sales/fixtures/completion/v2/pending.json'));
  const zones = JSON.parse(readLocal('sales/fixtures/iana-time-zones/v1/cases.json'));
  valid.event_type = 'sales.sale.completed.v3';
  valid.payload.operating_date.time_zone = zones.positive[0];
  const numericMoney = structuredClone(valid);
  numericMoney.payload.totals.commercial_total = 120;
  const missingEnvelopeField = structuredClone(valid);
  delete missingEnvelopeField.causation_id;
  const missingPayloadField = structuredClone(valid);
  delete missingPayloadField.payload.totals.commercial_total;
  const wrongLiteral = { ...valid, event_type: 'sales.sale.completed.v2' };

  const assignment = (name, value) => `export const ${name}: SalesSaleCompletedV3 = ${JSON.stringify(value)};`;
  const negatives = { numericMoney, missingEnvelopeField, missingPayloadField, wrongLiteral };
  const fixture = [
    'import type { SalesSaleCompletedV3 } from "./sales.sale.completed.v3.js";',
    assignment('valid', valid),
    ...Object.entries(negatives).map(([name, value]) => `// @ts-expect-error ${name}\n${assignment(name, value)}`),
  ].join('\n');
  writeFileSync(path.join(directory, declarationName), declaration);
  writeFileSync(path.join(directory, 'fixture.ts'), fixture + '\n');
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), '--strict', '--noEmit',
    '--pretty', 'false', path.join(directory, 'fixture.ts'), path.join(directory, h5Fixture)],
    { cwd: directory, stdio: 'inherit', windowsHide: true });
}

async function main(args) {
  const print = args.length === 1 && args[0] === '--print';
  assert(args.length === 0 || print, 'COMPLETED_TYPES_OPTIONS');
  assert.equal(require('json-schema-to-typescript/package.json').version, '16.0.0');
  assert.equal(require('typescript/package.json').version, '6.0.3');
  // Exercise URI escaping in the gate's single regeneration on every platform.
  const directory = mkdtempSync(path.join(tmpdir(), 'oc-completed-v3-types-# é %23-'));
  try {
    const sources = resolveCompletedSources(readCompletedSelection(), gitReader(root, revision));
    const declaration = await generateDeclaration(sources, directory);
    if (print) {
      process.stdout.write(declaration);
      return;
    }
    checkDeclaration(readLocal(declarationPath), declaration);
    checkTypesWorkflow(readLocal(workflowPath));
    const h5 = await buildH5Types({ directory });
    checkTypes(declaration, directory, h5.fixture);
    console.log(JSON.stringify({ contractId, revision, sources: sources.size,
      bytes: declaration.length, sha256: sha256(declaration), fixtures: 5,
      h5: { declarations: h5.files, operations: h5.operations, fixtures: h5.fixtures } }));
  } finally {
    assert(directory.startsWith(path.resolve(tmpdir()) + path.sep + 'oc-completed-v3-types-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
