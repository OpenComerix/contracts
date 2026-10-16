import assert from 'node:assert/strict';
import { isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';

// Limits cover both the syntax tree and its expanded JSON representation.
// Shared alias objects still count on every occurrence, before canonical hashing.
const maxBytes = 8 * 1024 * 1024;
const maxNodes = 100000;
const maxDepth = 128;
const scalarTags = new Set(['null', 'bool', 'int', 'float', 'str'].map(name => 'tag:yaml.org,2002:' + name));

export function parseYamlSource(bytes, file) {
  assert(bytes.length <= maxBytes, 'YAML_SOURCE_BYTES: ' + file);
  const document = parseDocument(bytes.toString('utf8'), { uniqueKeys: true, merge: false });
  assert.equal(document.errors.length, 0,
    'Invalid YAML ' + file + ': ' + document.errors.map(error => error.message).join('; '));
  const anchors = new Map(), targets = new Map();
  let syntaxNodes = 0;
  const children = node => {
    if (isMap(node)) {
      const keys = new Set();
      return node.items.flatMap(pair => {
        assert(isScalar(pair.key), 'YAML_SCALAR_KEYS: ' + file);
        assert.notEqual(pair.key.value, '<<', 'YAML_MERGE_UNSUPPORTED: ' + file);
        // Match yaml 2.9.1's object-key conversion, including null -> ''.
        const key = pair.key.value === null ? '' : String(pair.key.value);
        assert(!keys.has(key), 'YAML_KEY_COLLISION: ' + file);
        keys.add(key);
        return [pair.key, pair.value];
      });
    }
    if (isSeq(node)) return node.items;
    assert(isScalar(node), 'YAML_NODE_UNSUPPORTED: ' + file);
    return [];
  };
  const inspect = (node, depth) => {
    assert(depth <= maxDepth, 'YAML_DEPTH: ' + file);
    assert(++syntaxNodes <= maxNodes, 'YAML_SYNTAX_NODES: ' + file);
    if (node === null) return;
    if (isAlias(node)) {
      assert(anchors.has(node.source), 'YAML_ALIAS_UNKNOWN: ' + file);
      targets.set(node, anchors.get(node.source));
      return;
    }
    assert(!node.tag || (isMap(node) ? node.tag === 'tag:yaml.org,2002:map'
      : isSeq(node) ? node.tag === 'tag:yaml.org,2002:seq' : scalarTags.has(node.tag)),
    'YAML_JSON_TAG: ' + file);
    if (node.anchor) {
      assert(!anchors.has(node.anchor), 'YAML_ANCHOR_AMBIGUOUS: ' + file);
      anchors.set(node.anchor, node);
    }
    for (const child of children(node)) inspect(child, depth + 1);
  };
  inspect(document.contents, 0);
  const active = new Set();
  let expandedNodes = 0, expandedBytes = 0;
  const boundExpansion = (node, depth) => {
    assert(depth <= maxDepth, 'YAML_EXPANDED_DEPTH: ' + file);
    assert(++expandedNodes <= maxNodes, 'YAML_EXPANDED_NODES: ' + file);
    if (node === null) {
      expandedBytes += 6;
      assert(expandedBytes <= maxBytes, 'YAML_EXPANDED_BYTES: ' + file);
      return;
    }
    assert(!active.has(node), 'YAML_ALIAS_CYCLE: ' + file);
    active.add(node);
    if (isAlias(node)) boundExpansion(targets.get(node), depth + 1);
    else {
      expandedBytes += 2;
      if (isScalar(node)) {
        const value = node.value;
        assert(value === null || ['string', 'boolean', 'number'].includes(typeof value),
          'YAML_JSON_SCALAR: ' + file);
        assert(typeof value !== 'number' || Number.isFinite(value), 'YAML_JSON_NUMBER: ' + file);
        expandedBytes += Buffer.byteLength(JSON.stringify(value));
      }
      assert(expandedBytes <= maxBytes, 'YAML_EXPANDED_BYTES: ' + file);
      for (const child of children(node)) boundExpansion(child, depth + 1);
    }
    active.delete(node);
  };
  boundExpansion(document.contents, 0);
  // Keep the pinned library's amplification guard as an independent check.
  const result = document.toJS({ maxAliasCount: 100 });
  // Independently reject native values that JSON/canonical hashing would drop
  // or reinterpret. Shared aliases are valid; cyclic results are not.
  const activeValues = new Set(), checkedValues = new Set();
  const validateJSON = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      assert(Number.isFinite(value), 'YAML_JSON_NUMBER: ' + file);
      return;
    }
    assert(typeof value === 'object' && (Array.isArray(value)
      || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
    'YAML_JSON_VALUE: ' + file);
    assert(!activeValues.has(value), 'YAML_ALIAS_CYCLE: ' + file);
    if (checkedValues.has(value)) return;
    activeValues.add(value);
    for (const child of Object.values(value)) validateJSON(child);
    activeValues.delete(value);
    checkedValues.add(value);
  };
  validateJSON(result);
  return result;
}
