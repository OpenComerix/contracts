import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {withAuthorityConsumerContext, authorityConsumerReadView} from '../../scripts/finance/authority-consumers-v1.mjs';
import {root, validateCaptureSource, validateSourceScope} from '../../scripts/inventory/capture-authority-v2.mjs';
import {validateSalesAdmission} from '../../scripts/sales/inventory-step-consumer-v1.mjs';
import {readRepositoryFile} from '../../scripts/ci/retired-gitlab-v1.mjs';

const snapshot = 'registry/consumers/identity-tenancy.json';
const bridge = 'scripts/inventory/delivery-history-consumer-v1.mjs';
const source = 'identity/http/private/v1/identity-finance-authority-v1.yaml';

test('Capture and Sales validate the exact Finance bridge once per complete invocation', () => {
  for (const validate of [validateCaptureSource, validateSalesAdmission]) {
    for (let invocation = 0; invocation < 2; invocation++) {
      let proofs = 0;
      validate(file => { if (file === bridge) proofs++; return readRepositoryFile(file); });
      assert.equal(proofs, 1, validate.name + ': one Finance proof, including after warmup');
    }
  }
});

test('a shared context retains no live bytes and cannot escape, change readers or run asynchronously', () => {
  let saved, reads = 0;
  const read = file => { reads++; return readRepositoryFile(file); };
  withAuthorityConsumerContext(read, context => {
    saved = context;
    const first = context.read(snapshot);
    first.fill(0);
    assert.notEqual(context.read(snapshot)[0], 0);
    assert.throws(() => withAuthorityConsumerContext(readRepositoryFile, () => true, context), /FCA_CONTEXT_READER/);
    assert.throws(() => withAuthorityConsumerContext(read, () => Promise.resolve(), context), /FCA_CONTEXT_SYNCHRONOUS/);
  });
  const finishedReads = reads;
  assert.throws(() => new saved.constructor(read), /FCA_CONTEXT_REQUIRED/);
  assert.throws(() => { Object.getPrototypeOf(saved).run = () => true; }, TypeError);
  assert.throws(() => saved.read(snapshot), /FCA_CONTEXT_CLOSED/);
  assert.equal(reads, finishedReads, 'closed contexts cannot even read the live source');
  assert.throws(() => withAuthorityConsumerContext(read, () => true, saved), /FCA_CONTEXT_CLOSED/);
  assert.throws(() => withAuthorityConsumerContext(read, () => true, {}), /FCA_CONTEXT_REQUIRED/);
});

test('the same public Finance view rejects source drift and omission after successful projection', () => {
  let change;
  const read = file => {
    if (file === source && change === 'missing') throw Error('synthetic missing source');
    const bytes = readRepositoryFile(file);
    return file === source && change === 'changed' ? Buffer.concat([bytes, Buffer.from('\nDrift')]) : bytes;
  };
  const view = authorityConsumerReadView(read);
  view(snapshot);
  for (change of ['changed', 'missing']) assert.throws(() => view(snapshot));
  change = undefined;
  assert.doesNotThrow(() => view(snapshot));
  const wrong = Buffer.concat([read(snapshot), Buffer.from('\nDrift')]);
  assert.equal(authorityConsumerReadView(file => file === snapshot ? wrong : read(file))(snapshot), wrong);
});

test('Capture and Sales reject a different live reader after an earlier valid context', () => {
  for (const validate of [validateCaptureSource, validateSalesAdmission]) {
    validate();
    assert.throws(() => validate(file => file === source ? Buffer.concat([readRepositoryFile(file), Buffer.from('\nDrift')]) : readRepositoryFile(file)));
    assert.throws(() => validate(file => { if (file === source) throw Error('synthetic missing source'); return readRepositoryFile(file); }));
  }
});

test('the common source scope accepts only the exact Finance delta', () => {
  assert.doesNotThrow(() => validateSourceScope());
});

for (const command of ['diff', 'cached', 'untracked'])
  test('the common source scope rejects undeclared ' + command + ' paths in the consumer folder', t => {
    const execute = childProcess.execFileSync;
    t.mock.method(childProcess, 'execFileSync', (program, args, options) => {
      const output = execute(program, args, options);
      const selected = command === 'diff' ? args[0] === 'diff' && !args.includes('--cached')
        : command === 'cached' ? args.includes('--cached') : args[0] === 'ls-files';
      return program === 'git' && options?.cwd === root && selected
        ? output + '\nregistry/consumers/unapproved.json\n' : output;
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    assert.throws(() => validateSourceScope(), /IC2_UNDECLARED_PATH:registry\/consumers\/unapproved.json/);
  });

test('the common source scope refuses altered Finance metadata after warmup', t => {
  validateSourceScope();
  const original = fs.readFileSync.bind(fs), target = path.join(root, snapshot);
  t.mock.method(fs, 'readFileSync', (file, ...options) => {
    const bytes = original(file, ...options);
    return typeof file === 'string' && path.resolve(file) === target ? Buffer.concat([bytes, Buffer.from('\nDrift')]) : bytes;
  });
  assert.throws(() => validateSourceScope());
});
