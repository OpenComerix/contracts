import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import { completedV3, readH5TypeInputs } from '../../tools/architecture/h5-type-inputs.mjs';
import { projectH5TypeSchema } from '../../tools/architecture/h5-type-schema.mjs';
import { readJSON, readLocal, safePath, sha256 } from '../../tools/architecture/consumer-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const h5ArtifactIndex = 'tools/architecture/h5-type-artifacts.json';
const representativeFixtures = [
  'inventory/fixtures/effects/v1/normal.json',
  'inventory/fixtures/compensation/v1/after_difference.json',
  'finance/fixtures/cash/v1/normal.json',
  'finance/fixtures/cash/v1/closed_shift.json',
];
const encoding = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function save(relative, bytes, folder = root) {
  const file = safePath(folder, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

export async function buildH5Types({ write = false, directory } = {}) {
  const inputs = readH5TypeInputs(root);
  const rows = [], imports = [], assertions = [];
  const operations = inputs.reduce((count, input) => count + input.operations.length, 0);
  assert.equal(operations, 99, 'H5_TYPES_OPERATION_COUNT');
  const descriptors = new Map();
  for (const input of inputs) {
    if (input.descriptor.id === completedV3) continue;
    const { name, schema } = projectH5TypeSchema(input);
    const { output, descriptor } = input;
    const banner = `// Generated from ${descriptor.path} at ${descriptor.commit}.\n`;
    const result = await compile(schema, name, {
      format: false, bannerComment: banner, ignoreMinAndMaxItems: true,
      $refOptions: { resolve: { file: false, http: false } },
    });
    const bytes = Buffer.from(result, 'utf8');
    assert(bytes.length > banner.length, 'H5_TYPES_EMPTY:' + descriptor.id);
    rows.push({ file: output, sha256: sha256(bytes) });
    if (write) save(output, bytes);
    else assert(readLocal(root, output).equals(bytes), 'H5_TYPES_DECLARATION_DRIFT:' + output);
    if (!directory) continue;
    save(`h5/${output}`, bytes, directory);
    const alias = `Contract${rows.length}`;
    imports.push(`import type { ${name} as ${alias} } from './h5/${output.replace(/\.d\.ts$/, '.js')}';`);
    descriptors.set(descriptor.id, alias);
    assertions.push(`export type Shape${rows.length} = Assert<IsStructured<${alias}>>;`);
    if (input.operations.length) {
      const operationKeys = input.operations.map(id => JSON.stringify(id)).join(' | ');
      assertions.push(`export type Operations${rows.length} = Assert<Equal<keyof ${alias}, ${operationKeys}>>;`);
      for (const [index, id] of input.operations.entries()) {
        const operation = schema.properties[id].properties;
        const select = `${alias}[${JSON.stringify(id)}]`;
        const statuses = Object.keys(operation.responses.properties).map(status => JSON.stringify(status)).join(' | ');
        assertions.push(`export type Operation${rows.length}_${index} = Assert<${select} extends HttpOperation<${JSON.stringify(operation.method.const)}, ${JSON.stringify(operation.path.const)}> ? true : false>;`);
        assertions.push(`export type Statuses${rows.length}_${index} = Assert<Equal<keyof ${select}['responses'], ${statuses}>>;`);
      }
    }
  }
  const index = encoding(rows.sort((a, b) => a.file.localeCompare(b.file, 'en')));
  if (write) save(h5ArtifactIndex, index);
  else assert(readLocal(root, h5ArtifactIndex).equals(index), 'H5_TYPES_ARTIFACT_INDEX_DRIFT');
  if (!directory) return { files: rows.length, operations };

  const declared = [
    'type Assert<T extends true> = T;',
    'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
    'type IsStructured<T> = 0 extends (1 & T) ? false : [T] extends [never] ? false : T extends object ? true : false;',
    'type HttpOperation<M extends string, P extends string> = { method: M; path: P; parameters: object; responses: object };',
  ];
  let fixtures = 0;
  for (const file of representativeFixtures) {
    const fixture = readJSON(root, file);
    const examples = [fixture.command, fixture.result, ...fixture.events];
    for (const example of examples) {
      const id = example.command_type ?? example.result_type ?? example.event_type;
      for (const kind of [id, `${id}.consumer`]) {
        const alias = descriptors.get(kind);
        if (alias) assertions.push(`export const fixture${++fixtures}: ${alias} = ${JSON.stringify(example)};`);
      }
    }
  }
  for (const file of ['commands/examples/notifications.send-email-verification.v1.example.json',
    'commands/examples/notifications.send-email-verification.result.succeeded.v1.example.json',
    'commands/examples/notifications.send-email-verification.result.failed-retryable.v1.example.json']) {
    const example = readJSON(root, file);
    const alias = descriptors.get(example.command_type ?? example.result_type);
    assert(alias, 'H5_TYPES_FIXTURE_CONTRACT:' + file);
    assertions.push(`export const fixture${++fixtures}: ${alias} = ${JSON.stringify(example)};`);
  }
  const cashFixture = readJSON(root, representativeFixtures[2]);
  const cash = cashFixture.command;
  const numericMoney = structuredClone(cash);
  numericMoney.payload.amounts.commercial_total = 75.25;
  const missingField = structuredClone(cash);
  delete missingField.payload.amounts.commercial_total;
  const wrongLiteral = { ...cash, command_type: 'finance.record-sale-cash.v2' };
  const alias = descriptors.get('finance.record-sale-cash.v1');
  for (const value of [numericMoney, missingField, wrongLiteral]) {
    assertions.push(`// @ts-expect-error rejected command fixture\nexport const fixture${++fixtures}: ${alias} = ${JSON.stringify(value)};`);
  }
  const resultAlias = descriptors.get('finance.record-sale-cash.result.v1');
  const mismatchedResult = { ...cashFixture.result, status: 'failed', error_code: 'finance_state_conflict' };
  assertions.push(`// @ts-expect-error success payload in a failed result\nexport const fixture${++fixtures}: ${resultAlias} = ${JSON.stringify(mismatchedResult)};`);
  const finalize = `${descriptors.get('sales.f1-14e.iana.http-public.pos-sales-v3')}['finalizeOnlineSale']['requestBody']['application/json']`;
  const request = readJSON(root, 'sales/fixtures/integration/v1/normal.json').request;
  assertions.push(`export const fixture${++fixtures}: ${finalize} = ${JSON.stringify(request)};`);
  const addFixture = (type, expression, expectedError) => {
    const comment = expectedError ? `// @ts-expect-error ${expectedError}\n` : '';
    assertions.push(`${comment}export const fixture${++fixtures}: ${type} = ${expression};`);
  };
  const jwksOperation = "['getInternalIdentityJwks']['responses']['200']['content']['application/json']['keys'][number]['key_ops']";
  const session = `${descriptors.get('identity.onboarding.v2')}['createSession']['responses']['200']['content']['application/json']`;
  for (const [type, expected, wrong] of [
    [`${descriptors.get('identity.internal-auth.v1')}${jwksOperation}`, 'verify', 'sign'],
    [`${descriptors.get('identity.internal-auth.v2')}${jwksOperation}`, 'verify', 'sign'],
    [`Extract<${session}, { status: 'mfa_pending' }>['next_actions']`, 'complete_mfa', 'register_device'],
  ]) {
    addFixture(type, JSON.stringify([expected]));
    for (const invalid of [[wrong], [], [42], [expected, expected]]) {
      addFixture(type, JSON.stringify(invalid), 'fixed array literal');
    }
  }
  const notificationSuccess = readJSON(root, 'commands/examples/notifications.send-email-verification.result.succeeded.v1.example.json');
  const notificationFailure = readJSON(root, 'commands/examples/notifications.send-email-verification.result.failed-retryable.v1.example.json');
  const cashFailure = readJSON(root, representativeFixtures[3]).result;
  for (const [success, failure] of [[cashFixture.result, cashFailure], [notificationSuccess, notificationFailure]]) {
    const type = descriptors.get(success.result_type);
    addFixture(type, JSON.stringify({ ...success, error_code: failure.error_code }), 'successful result forbids an error code');
    addFixture(type, `{ ...${JSON.stringify(failure)}, error_code: undefined }`, 'failed result requires a string error code');
    const { error_code, ...missing } = failure;
    assert.equal(typeof error_code, 'string');
    addFixture(type, JSON.stringify(missing), 'failed result requires an error code');
  }
  const notificationType = descriptors.get(notificationFailure.result_type);
  addFixture(notificationType, `{ ...${JSON.stringify(notificationFailure)}, payload: { ...${JSON.stringify(notificationFailure.payload)}, failure_code: undefined } }`,
    'failed notification requires a string failure code');
  const payment = cashFixture.events.find(event => event.event_type === 'finance.sale-payment.recorded.v2');
  const paymentType = descriptors.get(payment.event_type);
  addFixture(paymentType, JSON.stringify({ ...payment, branch_id: null }));
  addFixture(paymentType, `{ ...${JSON.stringify(payment)}, branch_id: undefined }`, 'payment requires a string or null branch');
  const fixture = 'h5-types.ts';
  save(fixture, Buffer.from([...imports, ...declared, ...assertions].join('\n') + '\n'), directory);
  return { files: rows.length, operations, fixtures, fixture };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--write'], 'H5_TYPES_OPTIONS');
  console.log(JSON.stringify(await buildH5Types({ write: true })));
}
