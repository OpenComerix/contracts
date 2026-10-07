import assert from 'node:assert/strict';

export function verifyLocalSnapshot(local, registered, readPublished) {
  assert.equal(local.publication, 'local-candidate');
  if (registered.publication === 'local-candidate') {
    assert.deepEqual(local, registered, 'Consumer export drift; regenerate reviewed metadata');
    return;
  }
  assert.equal(registered.publication, 'published', 'Unknown snapshot lifecycle');
  // Verify admitted bytes at their Git revision; local HEAD does not prove publication.
  assert.deepEqual(
    readPublished(registered.sourceCommit),
    registered,
    'Published consumer provenance drift',
  );
  const contents = ({ publication, sourceCommit, ...rest }) => rest;
  assert.deepEqual(
    contents(local),
    contents(registered),
    'Consumer export drift; regenerate reviewed metadata',
  );
}

export function domainIndex(registry, domain) {
  const contracts = registry.contracts.filter((row) => row.domain === domain);
  const surfaces = [...new Set(contracts.map((row) => row.surface))].sort().map((surface) => ({
    surface,
    versions: contracts
      .filter((row) => row.surface === surface)
      .map(({ id, version, path, status }) => ({ id, version, path, status })),
  }));
  return {
    formatVersion: 1,
    domain,
    registry: '../registry/contracts.json',
    contracts: contracts.map((row) => row.id),
    surfaces,
    planned: registry.planned.filter((row) => row.domain === domain).map((row) => row.id),
  };
}
export function validateCoverage(index, required) {
  assert.equal(index.formatVersion, 1);
  assert(
    ['local-candidate', 'published'].includes(index.lifecycle),
    'Unknown consumer registry lifecycle',
  );
  assert(
    typeof index.coverage === 'string' && index.coverage.length > 0,
    'Coverage limit omitted',
  );
  assert(Array.isArray(required) && required.length > 0, 'Expected coverage omitted');
  assert.equal(new Set(required).size, required.length, 'Duplicate required consumer');
  assert(Array.isArray(index.consumers) && index.consumers.length > 0, 'No consumer coverage');
  const actual = index.consumers.map((row) => row.service);
  assert.equal(new Set(actual).size, actual.length, 'Duplicate consumer');
  assert.deepEqual(
    [...actual].sort(),
    [...required].sort(),
    'Known consumer coverage omitted or expanded without a registry decision',
  );
  for (const row of index.consumers) {
    assert(/^[a-z][a-z0-9-]+$/.test(row.service), 'Invalid consumer identity');
    assert.equal(row.file, row.service + '.json', 'Snapshot identity mismatch');
    assert(
      typeof row.localDirectory === 'string' && row.localDirectory.length > 0,
      'Consumer checkout mapping omitted',
    );
  }
}
