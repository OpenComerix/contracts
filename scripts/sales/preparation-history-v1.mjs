import assert from 'node:assert/strict';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import {admissionToolFiles, projectPreparationAdmissionFile, projectPreparationAdmissionDocument,
  withPreparationAdmissionScope} from './preparation-admission-v1.mjs';
import {acceptanceConsumerFiles, projectAcceptanceConsumerFile, projectAcceptanceConsumerDocument} from './acceptance-consumer-v1.mjs';

export const preparationBase = '86259b440a95bbdf4b0d0f47547bd7632a877bfe';
const root = path.resolve(import.meta.dirname, '../..');
const source = createGitReader()(root, preparationBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
export const preparationRoots = Object.freeze([
  ['inventory.sale-context.http.v1', 'inventory', 'inventory', 'inventory/http/private/v1/inventory-sale-context-v1.yaml'],
  ['inventory.sale-context.schema.v1', 'inventory', 'inventory', 'inventory/http/shared/v1/inventory-sale-context-v1.schema.json'],
  ['finance.sale-context.http.v1', 'finance', 'finance', 'finance/http/private/v1/finance-sale-context-v1.yaml'],
  ['finance.sale-context.schema.v1', 'finance', 'finance', 'finance/http/shared/v1/finance-sale-context-v1.schema.json'],
  ['sales.context-check-authority.http.v1', 'sales', 'sales-pos', 'sales/http/private/v1/sales-context-check-authority-v1.yaml'],
  ['sales.context-check-authority.schema.v1', 'sales', 'sales-pos', 'sales/http/shared/v1/sales-context-check-authority-v1.schema.json'],
  ['identity.sale-preparation-workloads.policy.v1', 'identity', 'identity-tenancy', 'identity/http/shared/v1/identity-sale-preparation-workloads-v1.json'],
  ['sales.preparation.fixtures.v1', 'sales', 'sales-pos', 'sales/fixtures/preparation/v1/contexts.json'],
].map(row => Object.freeze(row)));
export const preparationNewFiles = Object.freeze([
  ...preparationRoots.map(row => row[3]),
  'scripts/sales/preparation-v1.mjs', 'scripts/sales/preparation-history-v1.mjs',
  'scripts/sales/validate-preparation-v1.sh', 'test/sales/preparation-v1.test.mjs',
  ...admissionToolFiles,
  ...acceptanceConsumerFiles,
]);
const ownerLinks = domain => domain === 'identity'
  ? '[Perfiles técnicos](http/shared/v1/identity-sale-preparation-workloads-v1.json). '
  : '[Puerto privado](http/private/v1/' + (domain === 'sales' ? 'sales-context-check-authority-v1' : domain + '-sale-context-v1') + '.yaml), ' +
    '[schema](http/shared/v1/' + (domain === 'sales' ? 'sales-context-check-authority-v1' : domain + '-sale-context-v1') + '.schema.json). ';
const section = (domain) => '\n## F1-13A — Preparación de contexto de venta (fuente candidata)\n\n' + ownerLinks(domain) +
  'Consultas privadas específicas de Inventory/Finance y callback Sales, con cuatro perfiles Identity separados. ' +
  'Preparación de hasta 60 s ligada a intento/huella y autoridad humana actual; delegado solo en RAM de Sales. ' +
  'Cada dueño lee consistentemente sus recursos bajo RLS, con presupuesto de hasta 2000 ms; ' +
  'no hay reservas, efectos, saldos, cambio de audiencias existentes ni garantía de disponibilidad posterior. ' +
  'La aceptación y la ejecución vuelven a validar su autoridad/recursos. ' +
  '[Fixtures sintéticas](../sales/fixtures/preparation/v1/contexts.json), ' +
  '[reglas de autoridad](../../../docs/arquitectura/decisiones/ADR-063-intencion-durable-y-finalizacion-de-venta-online.md#34-comprobación-propietaria-de-referencias-antes-de-aceptar). ' +
  'Ocho raíces planned, sin admisión ni cambios de consumidores/locks/pins. ' +
  'Publicación, CI exacta y admisión seleccionada preceden al consumo runtime. ' +
  'Gates: `node --test test/sales/preparation-v1.test.mjs`; `node scripts/sales/preparation-v1.mjs openapi --offline`; ' +
  '`node scripts/sales/preparation-v1.mjs schema`. La evidencia contractual no acredita PostgreSQL, ES256 ni runtime conectado.\n';
let immutable;
const metadataFiles = new Set(['registry/contracts.json', 'registry/README.md', '.github/workflows/ci.yml',
  'test/architecture/internal-auth-v2-history.test.mjs',
  'test/sales/inventory-step-consumer-v1.test.mjs',
  'test/finance/cash-consumer-v1.test.mjs', 'test/finance/payment-consumer-v1.test.mjs',
  ...['inventory', 'finance', 'sales', 'identity'].flatMap(domain => [domain + '/index.json', domain + '/README.md'])]);
function metadataModel() {
  if (!immutable) {
    const registry = JSON.parse(source('registry/contracts.json'));
    registry.planned.push(...preparationRoots.map(([id, domain, owner, file]) => ({ id, domain, owner, path: file,
      materializeIn: 'F1-13A', status: 'planned',
      constraint: 'Source candidate only; exact current human preparation, read-only owner context; publication/CI/admission before consumption. No effects or reservations.' })));
    const metadata = new Map([['registry/contracts.json', encode(registry)]]);
    for (const domain of ['inventory', 'finance', 'sales', 'identity']) {
      metadata.set(domain + '/index.json', encode(domainIndex(registry, domain)));
      metadata.set(domain + '/README.md', Buffer.from(text(source(domain + '/README.md')) + section(domain)));
    }
    metadata.set('registry/README.md', Buffer.from(text(source('registry/README.md')) +
      '\n## F1-13A — Fuente de preparación propietaria\n\n' +
      'Ocho intenciones planned: tres puertos privados/schema, perfiles Identity y fixtures de contexto. ' +
      'Las 206 admisiones, 236 artefactos históricos y ocho consumidores conservan revisiones/bytes/selecciones. ' +
      '[Mapa Sales](../sales/README.md#f1-13a--preparación-de-contexto-de-venta-fuente-candidata). ' +
      'Sin nuevas admisiones, runtime ni consumo. La fuente se publica y verifica antes de admitirla.\n'));
    const workflow = text(source('.github/workflows/ci.yml'));
    const addAfter = (value, anchor, suffix) => {
      assert.equal(value.split(anchor).length, 2, 'PREPARATION_CI_ANCHOR');
      return value.replace(anchor, anchor + suffix);
    };
    let next = addAfter(workflow, '          node scripts/sales/schema-v2.mjs .ci-artifacts/sales-v2-ci\n',
      '          node scripts/sales/preparation-v1.mjs openapi\n' +
      '          node scripts/sales/preparation-v1.mjs prepare .ci-artifacts/sales-v2-preparation-ci\n');
    next = addAfter(next, "        run: docker run --rm --entrypoint /bin/sh -v \"$PWD:/workspace\" -w /workspace ghcr.io/sourcemeta/jsonschema:v16.10.0 -ec 'sh scripts/sales/validate-v2.sh .ci-artifacts/sales-v2-ci'\n",
      '      - name: Validate sale preparation schemas and vectors\n' +
      "        run: docker run --rm --user \"$(id -u):$(id -g)\" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /bin/sh -v \"$PWD:/workspace\" -w /workspace ghcr.io/sourcemeta/jsonschema:v16.10.0 -ec 'sh scripts/sales/validate-preparation-v1.sh .ci-artifacts/sales-v2-preparation-ci'\n");
    metadata.set('.github/workflows/ci.yml', Buffer.from(next));
    // Keep the historical H1A fixture closed and exhaustive. Its original live
    // checks remain; only the explicit current metadata inventory is extended.
    const testPath = 'test/architecture/internal-auth-v2-history.test.mjs';
    let fixture = text(source(testPath));
    const replace = (before, after) => {
      assert.equal(fixture.split(before).length, 2, 'PREPARATION_TEST_ANCHOR');
      fixture = fixture.replace(before, after);
    };
    replace("import {cashConsumerFiles} from '../../scripts/finance/cash-consumer-v1.mjs';",
      "import {cashConsumerFiles} from '../../scripts/finance/cash-consumer-v1.mjs';\n" +
      "import {preparationMetadata,preparationNewFiles,projectPreparationFile,projectPreparationDocument} from '../../scripts/sales/preparation-history-v1.mjs';");
    replace('const exactScopeFiles=[...new Set([...reuseCandidateFiles,...cashConsumerFiles])];',
      'const priorScopeFiles=[...new Set([...reuseCandidateFiles,...cashConsumerFiles])];\n' +
      'const readableFiles=[...new Set([...priorScopeFiles,...preparationMetadata().keys()])];\n' +
      'const exactScopeFiles=[...new Set([...readableFiles,...preparationNewFiles])];');
    replace('assert.equal(visits.length,exactScopeFiles.length);assert.equal(new Set(visits).size,exactScopeFiles.length);',
      'assert.equal(visits.length,readableFiles.length);assert.equal(new Set(visits).size,readableFiles.length);\n' +
      "  assert(priorScopeFiles.every(file=>visits.includes(file)),'Every original live check remains');");
    replace('for(const file of exactScopeFiles)for(const mutation', 'for(const file of readableFiles)for(const mutation');
    replace("const registry=JSON.parse(read('registry/contracts.json'));",
      "const registry=projectPreparationDocument('registry/contracts.json',JSON.parse(read('registry/contracts.json')));");
    replace("after=parse(read(file).toString('utf8'));",
      "after=parse(projectPreparationFile(file,read(file)).toString('utf8'));");
    metadata.set(testPath, Buffer.from(fixture));
    const salesTestPath = 'test/sales/inventory-step-consumer-v1.test.mjs';
    let salesFixture = text(source(salesTestPath));
    const salesImport = "import { cashConsumerFiles } from '../../scripts/finance/cash-consumer-v1.mjs';";
    const salesScope = "...admissionScope,...reuseCandidateFiles,...cashConsumerFiles])].sort());";
    assert.equal(salesFixture.split(salesImport).length, 2, 'PREPARATION_SALES_TEST_IMPORT');
    assert.equal(salesFixture.split(salesScope).length, 2, 'PREPARATION_SALES_TEST_SCOPE');
    salesFixture = salesFixture.replace(salesImport, salesImport +
      "\nimport { preparationMetadata, preparationNewFiles } from '../../scripts/sales/preparation-history-v1.mjs';");
    salesFixture = salesFixture.replace(salesScope,
      "...admissionScope,...reuseCandidateFiles,...cashConsumerFiles,...preparationMetadata().keys(),...preparationNewFiles])].sort());");
    metadata.set(salesTestPath, Buffer.from(salesFixture));
    for (const kind of ['cash', 'payment']) {
      const file = 'test/finance/' + kind + '-consumer-v1.test.mjs';
      const anchor = kind === 'cash'
        ? "const registry=JSON.parse(read('registry/contracts.json')),before="
        : "assert.equal(read('registry/contracts.json').toString().replaceAll('\\r\\n','\\n'),";
      const replacement = kind === 'cash'
        ? "const registry=projectPreparationDocument('registry/contracts.json',JSON.parse(read('registry/contracts.json'))),before="
        : "assert.equal(projectPreparationFile('registry/contracts.json',read('registry/contracts.json')).toString().replaceAll('\\r\\n','\\n'),";
      let fixture = text(source(file));
      assert.equal(fixture.split(anchor).length, 2, 'PREPARATION_FINANCE_TEST_ANCHOR:' + kind);
      fixture = fixture.replace("import test from 'node:test';", "import test from 'node:test';\n" +
        'import {projectPreparation' + (kind === 'cash' ? 'Document' : 'File') + "} from '../../scripts/sales/preparation-history-v1.mjs';");
      metadata.set(file, Buffer.from(fixture.replace(anchor, replacement)));
    }
    immutable = metadata;
  }
  return immutable;
}
export function preparationMetadata() {
  return new Map([...metadataModel()].map(([file, bytes]) => [file, Buffer.from(bytes)]));
}
// Pure exact per-value projection: no other live file, historical validator or
// successful approval is consulted. Unknown/drifted caller input is untouched.
export function projectPreparationFile(file, bytes) {
  bytes = projectAcceptanceConsumerFile(file, bytes);
  bytes = projectPreparationAdmissionFile(file, bytes);
  if (!metadataFiles.has(file)) return bytes;
  const expected = metadataModel().get(file);
  return expected && text(bytes) === text(expected) ? Buffer.from(source(file)) : bytes;
}
export function projectPreparationDocument(file, value) {
  value = projectAcceptanceConsumerDocument(file, value);
  value = projectPreparationAdmissionDocument(file, value);
  if (!metadataFiles.has(file) || !file.endsWith('.json')) return value;
  const expected = metadataModel().get(file);
  return expected && file.endsWith('.json') && isDeepStrictEqual(value, JSON.parse(expected))
    ? JSON.parse(source(file)) : value;
}
export function withPreparationScope(paths, read) {
  const supplied = read, current = new Map();
  const rawRead = file => {
    if (!current.has(file)) current.set(file, supplied(file));
    return current.get(file);
  };
  paths = [...withPreparationAdmissionScope(paths, rawRead)];
  read = file => projectPreparationAdmissionFile(file, rawRead(file));
  const registry = read('registry/contracts.json');
  if (projectPreparationFile('registry/contracts.json', registry) === registry) {
    assert(!JSON.parse(text(registry)).planned?.some(row => row.materializeIn === 'F1-13A'), 'PREPARATION_PARTIAL_SCOPE');
    return new Set(paths);
  }
  // Only the closed metadata delta; the capability gate checks source semantics
  // once per package, not recursively for every historical path or fixture.
  for (const [file, expected] of preparationMetadata()) {
    const bytes = file === 'registry/contracts.json' ? registry : read(file);
    assert.equal(text(bytes), text(expected), 'PREPARATION_METADATA:' + file);
  }
  return new Set([...paths, ...preparationMetadata().keys(), ...preparationNewFiles]);
}
