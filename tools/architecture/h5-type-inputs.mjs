import assert from 'node:assert/strict';
import path from 'node:path';
import { gitReader, parseSource, resolveSelection } from './graph.mjs';
import { readJSON, safePath, sha256 } from './consumer-gate.mjs';

const planPath = 'tools/architecture/h5-type-selections.json';
export const completedV3 = 'sales.f1-14e.iana.events.sales.sale.completed.v3';

function declarationPath(descriptor) {
  const file = descriptor.path;
  const version = /^(?:v)?([1-9][0-9]*)(?:\.|$)/.exec(descriptor.version)?.[1];
  assert(version, 'H5_TYPES_VERSION:' + descriptor.id);
  const legacy = /^(openapi|commands|events)\//.exec(file)?.[1];
  const surface = legacy === 'openapi' ? 'http/shared' : legacy;
  const directory = legacy ? `${descriptor.domain}/${surface}/v${version}` : path.posix.dirname(file);
  const name = path.posix.basename(file).replace(/(?:\.schema\.json|\.yaml)$/, '');
  return `${directory}/generated/${name}.d.ts`;
}

export function readH5TypeInputs(root, plan = readJSON(root, planPath)) {
  const registry = readJSON(root, 'registry/contracts.json');
  const descriptors = new Map(registry.contracts.map(row => [row.id, row]));
  const snapshots = new Map(), readers = new Map(), blobs = new Map(), groups = new Map();
  const readBlob = (revision, file, expected) => {
    const key = `${revision}:${file}`;
    if (!blobs.has(key)) {
      if (!readers.has(revision)) readers.set(revision, gitReader(root, revision));
      const bytes = readers.get(revision)(file);
      blobs.set(key, { bytes, hash: sha256(bytes) });
    }
    const blob = blobs.get(key);
    assert.equal(blob.hash, expected, 'H5_TYPES_PIN_BYTES:' + key);
    return blob.bytes;
  };
  const selections = plan.flatMap(family => family.selections);
  assert.equal(selections.length, 107, 'H5_TYPES_SELECTION_COUNT');
  for (const row of selections) {
    const descriptor = descriptors.get(row.id);
    assert(descriptor && ['active', 'historical'].includes(descriptor.status), 'H5_TYPES_ADMISSION:' + row.id);
    assert.equal(descriptor.commit, row.sourceCommit, 'H5_TYPES_REVISION:' + row.id);
    assert(/^[a-z-]+$/.test(row.owner), 'H5_TYPES_OWNER');
    if (!snapshots.has(row.owner)) snapshots.set(row.owner, readJSON(root, `registry/consumers/${row.owner}.json`));
    const matches = snapshots.get(row.owner).lock.entries.filter(pin =>
      pin.id === row.id && pin.role === row.role && pin.commit === row.sourceCommit);
    assert.equal(matches.length, 1, 'H5_TYPES_PIN:' + row.id);
    const [pin] = matches;
    assert.equal(pin.root, descriptor.path, 'H5_TYPES_ROOT:' + row.id);
    assert.equal(pin.version, descriptor.version, 'H5_TYPES_VERSION:' + row.id);
    assert(pin.files.some(file => file.path === pin.root && file.sha256 === descriptor.sha256), 'H5_TYPES_ROOT_BYTES:' + row.id);
    const operations = row.operations ?? [], pointers = row.pointers ?? [];
    assert(operations.length > 0 ? pointers.length === 0 : pointers.length === 1 && pointers[0] === '', 'H5_TYPES_SELECTOR:' + row.id);
    assert(operations.every(id => pin.operations.includes(id)) && pointers.every(fragment => pin.pointers.includes(fragment)),
      'H5_TYPES_UNPINNED_SELECTOR:' + row.id);
    const key = `${row.sourceCommit}:${pin.root}`;
    if (!groups.has(key)) groups.set(key, { descriptor, operations: new Set(), pointers: new Set(), files: new Map(), units: new Map() });
    const group = groups.get(key);
    assert.equal(group.descriptor.id, row.id, 'H5_TYPES_DESCRIPTOR:' + key);
    for (const id of operations) group.operations.add(id);
    for (const fragment of pointers) group.pointers.add(fragment);
    for (const file of pin.files) group.files.set(file.path, readBlob(pin.commit, file.path, file.sha256));
    for (const unit of pin.units) {
      const location = `${unit.path}#${unit.pointer}`;
      assert(!group.units.has(location) || group.units.get(location) === unit.sha256, 'H5_TYPES_PIN_UNIT_DRIFT:' + location);
      group.units.set(location, unit.sha256);
    }
  }
  assert.equal(groups.size, 55, 'H5_TYPES_ROOT_COUNT');
  const paths = new Set();
  return [...groups.values()].map(group => {
    const { descriptor } = group;
    const operations = [...group.operations].sort();
    const closure = resolveSelection(file => {
      assert(group.files.has(file), 'H5_TYPES_UNPINNED_REFERENCE:' + file);
      return group.files.get(file);
    }, descriptor, { version: descriptor.version, operations, pointers: [...group.pointers] }, registry);
    for (const unit of closure.units) {
      const location = `${unit.path}#${unit.pointer}`;
      assert.equal(unit.sha256, group.units.get(location), 'H5_TYPES_UNIT:' + location);
    }
    const output = declarationPath(descriptor);
    safePath(root, output);
    assert(!paths.has(output), 'H5_TYPES_DUPLICATE_OUTPUT:' + output);
    paths.add(output);
    return { descriptor, operations, output, docs: new Map(closure.files.map(({ path: file }) =>
      [file, parseSource(group.files.get(file), file)])) };
  });
}
