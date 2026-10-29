import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { fingerprint } from './authority-v1.mjs';
import { prepareToolingCI } from '../ci/pipeline-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const base = 'e9ab2798c9f0b581ff44c64137acfc8ff1e5e5a0';
const reader = gitReader(root, base), immutable = new Map();
export const source = file => {
  if (!immutable.has(file)) immutable.set(file, reader(file));
  return Buffer.from(immutable.get(file));
};
export const actual = readRepositoryFile;
export const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = file => JSON.parse(source(file));
export const httpPath = 'inventory/http/private/v2/inventory-catalog-capture-authority-v2.yaml';
export const schemaPath = 'inventory/http/shared/v2/inventory-capture-authority-v2.schema.json';
export const fixturePath = 'inventory/fixtures/catalog-capture-authority/v2/binding.json';
export const verifierPath = 'scripts/inventory/capture-authority-v2.mjs';
export const runnerPath = 'scripts/inventory/run-capture-authority-v2.mjs';
export const testPath = 'test/inventory/capture-authority-v2.test.mjs';
export const bridgePath = 'scripts/sales/inventory-step-consumer-v1.mjs';
const graphPath = 'tools/architecture/graph.mjs';
const layoutPath = 'tools/architecture/layout.mjs';
const historyTestPath = 'test/catalog/history-protection-v1.test.mjs';
const optimizationHashes = Object.freeze({
  "test/ci/tool-cache-layout.test.mjs": "0ebea93b720afc3889f18f5fa336547130475f198785d79e91c4181cf3085a97",
  "tools/architecture/git-source.mjs": "5fcde605163171d82dc7280fedce290c8ec517b209b303856837a40ed17020cf",
  "test/architecture/git-source.test.mjs": "907ec74b43e7f704c1835ae2699c146f2a51cc2762dcb2d636c9da5147d3c47e",
  "tools/architecture/README.md": "ba7ea573af9c9ea8f8057d0eba97cfcdee987a56a5789f4b88807349301141b5",
  "scripts/ci/pipeline-v1.mjs": "5bd45816a1f9ff7d226e335896eb48f014d9ba9ef3f87deb9f8c919a6c25e337",
  "test/ci/pipeline-v1.test.mjs": "343ea63f502ec4fd24f6d72d678a7eec785ec6cf350cd378e0c868e16e328f61",
});
// Hosting-only migration: no public contract, registry, lock or admission delta.
const githubMigrationHashes = Object.freeze({
  ".github/workflows/ci.yml": "9edb6a95d10dd2cbe0b20f845b596e4f281689916d453a534f1c2338c90dc95d",
  "test/ci/github-v1.test.mjs": "0167a9386bc00adccea86cc2f88b6a385e09dfe774e5bc377c17a9e6a2b3dffc",
});
// Reviewed CI selection infrastructure; no public contract or admission delta.
const ciScopeHashes = Object.freeze({
  "scripts/ci/validation-scope-v1.mjs": "1e1cd131af68a7e5e5467b09106c421ae4dcbb513feb4a5aa37bd6839be1a0e1",
  "test/ci/validation-scope-v1.test.mjs": "24cd494e0b82ca57a9f81196dbf5bfdb28ebf6dae1da2609a0d54b30cf2b4a10"
});
const retirementHashes = Object.freeze({
  "test/architecture/asyncapi-admission-v1.test.mjs": "cadabab066fdfaf2f457ef821826388915b5c0899c14dc9beee70ae16f88efe5",
  "scripts/catalog/catalog-delivery-v1-registry.mjs": "905f4e4cc93b87ed16e0d74dccbbdc7734c36ef0eada20ffbe9e2833a58f0690",
  "scripts/catalog/catalog-operational-recovery-v1-registry.mjs": "82c2cc7711e3c4246e48091a9ec294b09a23a1cd8d5cc3576e390a3798e7c6de",
  "scripts/catalog/catalog-consumption-v1-registry.mjs": "aab2c89e69b8da6280d2ab94e444e0432862b17b2a607631bf4b911782b73445",
  "test/architecture/catalog-delivery.test.mjs": "4f382c3dfc818d7dbc8bfe783100204d903d357a78e0edb241eedecc7f20cbb2",
  "test/architecture/catalog-operational-recovery.test.mjs": "9190b6c8eb2543e35729e428b5e84a79f6e0138bbfee0302d9501713676288b9",
  "test/architecture/catalog-consumption.test.mjs": "8726dbb1d642de5eaa7758c4d9be81cd3c42575a90bc92e1a5ad0f3c679cf709",
  "test/sales/inventory-step-consumer-v1.test.mjs": "22b184e7b12eb01265a495e6a91d92d0590001177b4cac36aafe57c620566db4",
  "test/sales/release-v1.test.mjs": "52894d7a1c5b72f7cdc54e7f4e3f0ae5b812c13d0a066348c5edcc7deb3b894b",
  "test/sales/package-v2.test.mjs": "e94b7cfdc7fbe36e519abd2d73dfd28e9677afd2d0873df76e31fd031532b4d3",
  "test/finance/package-v1.test.mjs": "03ce7e547457d94f6d72473ebcd4c2f5b64287d04f75d205aa4bfc63e975428b",
  "test/inventory/package-v1.test.mjs": "1236860854fe0806dbc88d8c153be5ef83a210c2e83601e6c560b973e0b62c5a",
  "test/catalog/asyncapi-preservation-v1.test.mjs": "7033488f8c4d3413e51168571efd2d9eb85ea840f01b647ae6dbfd5092148c92",
  "README.md": "0288fe0382f941f81397ea7cdd0850d8f5682b28f7c27279fc693331e704ee2c",
  "catalog/README.md": "19d607a9b24b4c5143996bef7bebb01c9f2c91a1de33929333960a4a64843387",
  "scripts/ci/retired-gitlab-v1.mjs": "0b0afc32e0204939fa392baad9e388ed91758e8ed30581dfd3c0af39bf52fa13",
  "scripts/finance/reviewed-package-v1.mjs": "10d7bd69dcea6e8a4830f9c08da3d23308750b3d6fa33b3a0611d9dcc0995fce",
  "scripts/sales/reviewed-package-v2.mjs": "bb365e13dea71e812371833684690558f74d79e281f0f9188e87812657c980d7",
  "scripts/sales/release-v1.mjs": "0881c80f06abf7b0ab72895bb3fb9d7b5a9157016a85e9c8e531b542b363eb0a",
  "scripts/inventory/candidate-v1.mjs": "d402546bdddbb10413a02d7923db46f15c34b64d050ea9a3fe67e6fb9a9a50ce",
  "scripts/identity/inventory-authority-consumer-v1.mjs": "c46ad11193995cd25c5f20cf11d950c5e3c9e42b8d0ef4f395e8a85d2a1030f8",
  "scripts/sales/inventory-step-consumer-v1.mjs": "4b94012954217f0aae3c276298b4b6ef4a1bbb439969c240b0bc06e651a48053",
  "scripts/validate-gateway-identity-policy.mjs": "8f15ae6a8795c2a857dbd383de75bf8d3c2d553c49a7729c4ec82a1e42aa0b8b",
  "scripts/validate-gateway-identity-policy-v2.mjs": "2041a72d76b581b4e3cfe6c3e6145ecfd006bf69f5ce0dfc160286548e872f9e",
  "test/inventory/capture-authority-v2.test.mjs": "91ea073614425c05a057b53e59b1bd90f11294022769d9a91420f6ed45ffe185"
});
export const sourceFiles = Object.freeze([httpPath, schemaPath, fixturePath, verifierPath,
  runnerPath, testPath, bridgePath, 'registry/contracts.json', 'inventory/index.json',
  'inventory/README.md', 'registry/README.md', '.gitlab-ci.yml', '.gitignore', graphPath, layoutPath, historyTestPath, ...Object.keys(optimizationHashes), ...Object.keys(githubMigrationHashes), ...Object.keys(ciScopeHashes), ...Object.keys(retirementHashes)]);
const route = '/internal/inventory/catalog-capture-authorizations';
export const intentions = Object.freeze([
  ['inventory.catalog-capture-authority.http.v2', httpPath],
  ['inventory.catalog-capture-authority.schema.v2', schemaPath],
].map(([id, file]) => ({ id, domain: 'inventory', owner: 'inventory', materializeIn: 'F1-11B', status: 'planned',
  constraint: 'Candidate source ' + file + ' only; exact capture body binding using capture_fingerprint (JCS/SHA-256). No functional admission, consumer migration or runtime; preserve published v1 and its closure.' })));

export function successorSchema() {
  const schema = previous('inventory/http/shared/v1/inventory-capture-authority-v1.schema.json');
  schema.$id = 'https://contracts.opencomerix.example/' + schemaPath;
  schema.title = 'Inventory preparation verification v2; exact physical capture body binding';
  for (const name of ['Request', 'Decision']) {
    schema.$defs[name].required.push('capture_fingerprint');
    schema.$defs[name].properties.capture_fingerprint = {
      type: 'string', pattern: '^[0-9a-f]{64}$',
      description: 'Lowercase SHA-256 of RFC 8785 JCS UTF-8 of the complete validated CaptureRequest sent to Catalog, including organization_id, operation_id, preparation_id, request_hash and ordered lines. No normalization, omitted fields or excluded hash fields. Different from the original human inventory-request-v1 request_hash. Catalog computes this value; Inventory compares it with its own preparation before rechecking the original human authority. Decision echoes it unchanged.',
      'x-data-classification': { sensitivity: 'RESTRICTED', categories: ['SECURITY', 'OPERATIONAL'] },
      'x-data-purpose': 'bound short-lived physical capture verification',
      'x-log-policy': 'no payload, field values or raw digest; bounded diagnostic codes only',
      'x-retention-profile': 'ephemeral_authority',
    };
  }
  return schema;
}
export function successorHttp() {
  const document = previous('inventory/http/private/v1/inventory-internal-v1.yaml');
  document.info = { ...document.info, title: 'Inventory physical catalogue capture preparation authority v2', version: '2.0.0',
    description: 'F1-11B candidate successor for authorizeInventoryCatalogCapture only. Adds exact capture_fingerprint binding; no functional admission or runtime. Published v1 and its closure remain unchanged.' };
  const operation = structuredClone(document.paths[route]);
  document.paths = { [route]: JSON.parse(JSON.stringify(operation).replaceAll(
    '../../shared/v1/inventory-capture-authority-v1.schema.json', '../../shared/v2/inventory-capture-authority-v2.schema.json')) };
  document.paths[route].post.description += ' Catalog must validate the complete physical CaptureRequest and compute capture_fingerprint as lowercase SHA-256 of RFC 8785 JCS UTF-8 of that entire body, without normalization or excluding any field. Inventory compares tenant, operation, preparation, original human request_hash, target and capture_fingerprint with its own preparation, then revalidates the original human authority. A changed line, quantity, reference, version or order fails closed; never trust a caller-supplied fingerprint without recomputation. Decision echoes the exact fingerprint and binding. This does not change inventory-request-v1 request_hash. All existing deadlines, RAM-only delegation and no-stock-effect rules remain.';
  document.components.securitySchemes = { workload: document.components.securitySchemes.workload };
  return document;
}
export function successorRegistry() {
  const registry = previous('registry/contracts.json');
  registry.planned.push(...structuredClone(intentions));
  return registry;
}
export const captureFingerprint = value => fingerprint(value);
export function bindingFixture() {
  const capture = structuredClone(previous('catalog/fixtures/inventory-capture/v1/capture.json').request);
  capture.lines.push({ ...capture.lines[0], line_id: '019a0000-0000-7000-8000-000000000031', quantity: '3' });
  const { organization_id, operation_id, preparation_id, request_hash } = capture;
  const query = { organization_id, operation_id, preparation_id, request_hash, target: 'catalog-pricing.inventory-capture', capture_fingerprint: captureFingerprint(capture) };
  const decision = { organization_id, operation_id, preparation_id, request_hash, authorized: true,
    caller: 'catalog-pricing', audience: 'inventory.catalog-capture-authority', checked_at: '2026-10-28T12:00:00Z',
    preparation_expires_at: '2026-10-28T12:00:59Z', valid_for_ms: 2000, capture_fingerprint: query.capture_fingerprint };
  return { capture, query, decision };
}
// Contractual oracle only: does not verify signatures, clocks, Identity or RAM lifecycle.
export function validateCaptureBinding(capture, query, decision) {
  assert.equal(query.target, 'catalog-pricing.inventory-capture', 'IC2_TARGET');
  assert.equal(query.capture_fingerprint, captureFingerprint(capture), 'IC2_CAPTURE_FINGERPRINT');
  for (const key of ['organization_id', 'operation_id', 'preparation_id', 'request_hash']) {
    assert.equal(query[key], capture[key], 'IC2_QUERY_BINDING:' + key);
    assert.equal(decision[key], query[key], 'IC2_DECISION_BINDING:' + key);
  }
  assert.equal(decision.capture_fingerprint, query.capture_fingerprint, 'IC2_DECISION_FINGERPRINT');
  assert.equal(decision.authorized, true, 'IC2_AUTHORIZED');
  assert.equal(decision.caller, 'catalog-pricing', 'IC2_CALLER');
  assert.equal(decision.audience, 'inventory.catalog-capture-authority', 'IC2_AUDIENCE');
}
function insertOnce(value, anchor, addition) {
  assert.equal(value.split(anchor).length, 2, 'IC2_BRIDGE_ANCHOR');
  return value.replace(anchor, anchor + addition);
}
export function bridgeBytes() {
  let value = text(source(bridgePath));
  const anchor = "import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';\n\nexport const root =";
  assert.equal(value.split(anchor).length, 2, 'IC2_BRIDGE_IMPORT');
  value = value.replace(anchor, "import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';\nimport { captureHistoricalFile, captureHistoricalRegistry, sourceFiles } from '../inventory/capture-authority-v2.mjs';\n\nexport const root =");
  value = value.replace('export function validateSalesAdmission(readFile = read) {',
    'export function validateSalesAdmission(rawReadFile = read) {\n  const readFile = file => captureHistoricalFile(file, rawReadFile(file));');
  value = value.replace('export const admissionScope = [...salesChangedPaths,...guardTransitionFiles.filter(file=>!salesChangedPaths.includes(file))];',
    'export const admissionScope = [...new Set([...salesChangedPaths,...guardTransitionFiles.filter(file=>!salesChangedPaths.includes(file)),...sourceFiles])];');
  value = insertOnce(value, 'export function salesHistoricalFile(file, bytes) {', '\n  bytes = captureHistoricalFile(file, bytes);');
  value = insertOnce(value, 'export function salesHistoricalRegistry(value) {', '\n  value = captureHistoricalRegistry(value);');
  value = "import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';\n" + value.replace(
    'const read = file => fs.readFileSync(path.join(root, file));', 'const read = readRepositoryFile;');
  return Buffer.from(value);
}
export const readmeSuffix = '\n## F1-11B — Verificación de captura física v2 (candidato)\n\n' +
  '[HTTP privado v2](http/private/v2/inventory-catalog-capture-authority-v2.yaml) y [schema v2](http/shared/v2/inventory-capture-authority-v2.schema.json) agregan `capture_fingerprint` a consulta y decisión de `authorizeInventoryCatalogCapture`. Conservan ruta `/api/v1/internal/inventory/catalog-capture-authorizations`, caller Catalog, audiencia Inventory y plazos previos. Catalog calcula SHA-256 del JCS RFC 8785 del cuerpo completo de captura validado; Inventory compara esa huella con la preparación propia y revalida la autoridad humana original. `request_hash` sigue identificando la solicitud humana, con semántica `inventory-request-v1`. Líneas, cantidades, referencias, versiones y orden quedan ligados sin reutilizar un hash declarado por el caller.\n\n' +
  'Se preservan bytes y admisiones publicados v1. Las dos intenciones nuevas son `planned`: fuente candidata sin admisión, consumidor ni runtime. Preparación <=60 s, delegado exclusivamente RAM durante la solicitud, autoridad fresca <=2000 ms y rechazo tras reinicio/revocación/expiración siguen siendo requisitos runtime pendientes. No acredita SQL, criptografía, stock ni ajustes.\n\n' +
  '[Fixture](fixtures/catalog-capture-authority/v2/binding.json), [verificador](../scripts/inventory/capture-authority-v2.mjs) y [tests](../test/inventory/capture-authority-v2.test.mjs). Gates: `node --test test/inventory/capture-authority-v2.test.mjs`; `node scripts/inventory/run-capture-authority-v2.mjs openapi [--offline]`; `node scripts/inventory/run-capture-authority-v2.mjs schema`. Redocly 2.53.3 y Sourcemeta 16.10.0 verifican transporte/schemas positivos y negativos; no sustituyen la integración real. Fuente auditada/publicada y CI exacta preceden a admisión y consumo.\n';
function optimizedGraphBytes() {
  // Exact implementation delta from the immutable source. No contract,
  // selection, lock, tag-check or worktree-reader behavior is projected away.
  let value = text(source(graphPath));
  value = insertOnce(value, "import { parseYamlSource } from './yaml-source.mjs';",
    "\nimport { createGitReader } from './git-source.mjs';");
  const caches = 'const gitCache = new Map();\nconst verifiedCommits = new Set();\n';
  assert.equal(value.split(caches).length, 2, 'CI1_GRAPH_CACHES');
  value = value.replace(caches, '');
  const start = value.indexOf('export function gitReader(root, revision) {');
  const end = value.indexOf('export const worktreeReader =', start);
  assert(start >= 0 && end > start, 'CI1_GRAPH_READER');
  return Buffer.from(value.slice(0, start) + 'export const gitReader = createGitReader();\n' + value.slice(end));
}
export function expectedContents() {
  const registry = successorRegistry();
  let ci = text(source('.gitlab-ci.yml'));
  ci = insertOnce(ci, '    - node scripts/identity/run-inventory-authority-v1-1.mjs prepare .ci-artifacts/inventory-v1-authority-1-1-ci',
    '\n    - node scripts/inventory/run-capture-authority-v2.mjs openapi\n    - node scripts/inventory/run-capture-authority-v2.mjs prepare .ci-artifacts/inventory-v1-capture-authority-v2-ci');
  ci = insertOnce(ci, '    - sh scripts/inventory/validate-v1.sh .ci-artifacts/inventory-v1-authority-1-1-ci',
    '\n    - sh scripts/inventory/validate-v1.sh .ci-artifacts/inventory-v1-capture-authority-v2-ci');
  let historyTest = text(source(historyTestPath));
  historyTest = insertOnce(historyTest, "import { parse } from 'yaml';",
    "\nimport { withoutToolingCI } from '../../scripts/ci/pipeline-v1.mjs';");
  const oldCIRead = "const current=parse(readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8'));";
  assert.equal(historyTest.split(oldCIRead).length, 2, 'CI3_HISTORY_TEST_ANCHOR');
  historyTest = historyTest.replace(oldCIRead,
    "const current=parse(withoutToolingCI(readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8').replaceAll('\\r\\n','\\n')));");
  historyTest = "import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';\n" + historyTest.replace(
    "readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8')", "readRepositoryFile('.gitlab-ci.yml').toString('utf8')");
  return new Map([
    [historyTestPath, Buffer.from(historyTest)],
    [httpPath, encode(successorHttp())], [schemaPath, encode(successorSchema())], [fixturePath, encode(bindingFixture())],
    ['registry/contracts.json', encode(registry)], ['inventory/index.json', encode(domainIndex(registry, 'inventory'))],
    ['inventory/README.md', Buffer.from(text(source('inventory/README.md')) + readmeSuffix)],
    ['registry/README.md', Buffer.from(text(source('registry/README.md')) + '\n## F1-11B — Fuente de preparación física v2\n\nDos intenciones `planned` identifican el sucesor HTTP/schema Inventory con `capture_fingerprint` JCS/SHA-256 del cuerpo completo de captura. Se preservan las 200 raíces admitidas, 236 artefactos históricos, dos intenciones previas y seis consumidores/locks/pins. [Mapa, límites y gates](../inventory/README.md#f1-11b--verificación-de-captura-física-v2-candidato). La proyección histórica solo acepta el delta completo verificado; drift y omisiones siguen rechazados. Auditoría, publicación/CI exacta y admisión seleccionada preceden al consumo.\n')],
    ['.gitlab-ci.yml', Buffer.from(prepareToolingCI(ci))], [bridgePath, bridgeBytes()], [graphPath, optimizedGraphBytes()],
    [layoutPath, Buffer.from(insertOnce(
      insertOnce(text(source(layoutPath)), '    ".pnpm-store",', '\n    ".corepack-cache",\n    ".npm-cache",'),
      '  for (const entry of readdirSync(root, { withFileTypes: true })) {',
      '\n    if (entry.name === ".github") {\n      assert(entry.isDirectory() && !entry.isSymbolicLink(), "LAYOUT_LINK_FORBIDDEN");\n      const start = files.length;\n      visit(path.join(root, entry.name), entry.name);\n      const infrastructureFiles = files.splice(start);\n      assert(\n        infrastructureFiles.every((file) => file === ".github/workflows/ci.yml"),\n        "LAYOUT_UNKNOWN_GITHUB_INFRASTRUCTURE",\n      );\n      continue;\n    }',
    ))],
    ['.gitignore', Buffer.from(text(source('.gitignore')) + '.corepack-cache/\n.npm-cache/\n')],
  ]);
}
let expectedCache;
const expectedSnapshot = () => expectedCache ??= expectedContents();
const retiredToolPaths = new Set(["test/architecture/asyncapi-admission-v1.test.mjs","scripts/catalog/catalog-delivery-v1-registry.mjs","scripts/catalog/catalog-operational-recovery-v1-registry.mjs","scripts/catalog/catalog-consumption-v1-registry.mjs","test/architecture/catalog-delivery.test.mjs","test/architecture/catalog-operational-recovery.test.mjs","test/architecture/catalog-consumption.test.mjs","test/sales/inventory-step-consumer-v1.test.mjs","test/sales/release-v1.test.mjs","test/sales/package-v2.test.mjs","test/finance/package-v1.test.mjs","test/inventory/package-v1.test.mjs","test/catalog/asyncapi-preservation-v1.test.mjs","README.md","catalog/README.md","scripts/finance/reviewed-package-v1.mjs","scripts/sales/reviewed-package-v2.mjs","scripts/sales/release-v1.mjs","scripts/inventory/candidate-v1.mjs","scripts/identity/inventory-authority-consumer-v1.mjs","scripts/sales/inventory-step-consumer-v1.mjs","scripts/validate-gateway-identity-policy.mjs","scripts/validate-gateway-identity-policy-v2.mjs"]);
const historicalPaths = new Set(['registry/contracts.json', 'inventory/index.json',
  'inventory/README.md', 'registry/README.md', '.gitlab-ci.yml', bridgePath, graphPath, layoutPath, historyTestPath, '.gitignore']);
export function validateCaptureSource(read = actual) {
  for (const [file, bytes] of expectedSnapshot())
    assert.equal(text(read(file)), text(bytes), 'IC2_EXACT_SOURCE:' + file);
  for (const [file, expected] of Object.entries(optimizationHashes))
    assert.equal(hash(Buffer.from(text(read(file)))), expected, 'CI1_OPTIMIZATION_BYTES:' + file);
  for (const [file, expected] of Object.entries(githubMigrationHashes))
    assert.equal(hash(Buffer.from(text(read(file)))), expected, 'GITHUB_MIGRATION_BYTES:' + file);
  for (const [file, expected] of Object.entries(ciScopeHashes))
    assert.equal(hash(Buffer.from(text(read(file)))), expected, 'CI_SCOPE_BYTES:' + file);
  for (const [file, expected] of Object.entries(retirementHashes))
    assert.equal(hash(Buffer.from(text(read(file)))), expected, 'RETIRED_CI_TOOL_BYTES:' + file);
  const before = previous('registry/contracts.json');
  for (const entry of [...before.contracts, ...before.preservedFiles]) {
    const bytes = read(entry.path);
    assert(hash(bytes) === entry.sha256 || hash(Buffer.from(text(bytes))) === entry.sha256, 'IC2_PUBLISHED_BYTES:' + entry.path);
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'registry/consumers/index.json',
    ...before.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(text(read(file)), text(source(file)), 'IC2_CONSUMER_OR_DEPENDENCY:' + file);
  for (const file of [verifierPath, runnerPath, testPath]) assert(read(file).length > 0, 'IC2_TOOL_MISSING:' + file);
  const result = { admitted: 0, addedPlanned: 2, roots: before.contracts.length, preserved: before.preservedFiles.length,
    consumers: before.requiredConsumers.length, runtime_demonstrated: false };
  return result;
}
export function validateSourceScope() {
  validateCaptureSource();
  const allowed = new Set(sourceFiles);
  for (const args of [['diff', '--name-only', base], ['diff', '--cached', '--name-only'], ['ls-files', '--others', '--exclude-standard']])
    for (const file of execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean))
      assert(allowed.has(file), 'IC2_UNDECLARED_PATH:' + file);
  return { paths: sourceFiles.length };
}
// Exact delta projection for prior gates, never a repair of mutated caller bytes.
export function captureHistoricalFile(file, bytes) {
  if (retiredToolPaths.has(file)) {
    if (hash(Buffer.from(text(bytes))) !== retirementHashes[file]) return bytes;
    validateCaptureSource();
    return source(file);
  }
  if (!historicalPaths.has(file)) return bytes;
  const expected = expectedSnapshot().get(file);
  if (!expected || text(bytes) !== text(expected)) return bytes;
  validateCaptureSource();
  return source(file);
}
export function captureHistoricalRegistry(value) {
  const expected = JSON.parse(expectedSnapshot().get('registry/contracts.json'));
  if (!isDeepStrictEqual(value, expected)) return value;
  validateCaptureSource();
  return previous('registry/contracts.json');
}
