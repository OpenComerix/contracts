import assert from 'node:assert/strict';
import path from 'node:path';
import { pointer } from './consumer-gate.mjs';
import { operationPointers } from './graph.mjs';

const schemaMaps = new Set(['properties', 'patternProperties', 'dependentSchemas']);
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const schemaChildren = new Set(['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'items',
  'contains', 'unevaluatedItems', 'not', 'if', 'then', 'else', 'contentSchema']);
const ignored = new Set(['$schema', '$id', '$defs', 'definitions', '$comment', 'description', 'examples', 'example', 'default', 'title', 'tsType']);
const runtimeOnly = new Set(['minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minProperties', 'maxProperties']);
const singleRequired = schema => schema?.required?.length === 1 && Object.keys(schema).length === 1;

export function typeIdentifier(name) {
  const result = name.replace(/(?:^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, item) => item.toUpperCase());
  assert(/^[A-Za-z][A-Za-z0-9]*$/.test(result), 'H5_TYPES_IDENTIFIER:' + name);
  return result;
}

export function projectH5TypeSchema({ descriptor, docs, operations, output }) {
  const { path: root, uriMappings = [] } = descriptor;
  const mappings = new Map(uriMappings.map(({ uri, path: file }) => [uri, file]));
  const definitions = Object.create(null), labels = new Map(), usedLabels = new Set();
  const target = (reference, from) => {
    const [relative, fragment = '', ...extra] = reference.split('#');
    assert(extra.length === 0, 'H5_TYPES_REFERENCE:' + reference);
    const id = docs.get(from).$id;
    const uri = relative && id ? new URL(relative, id).href : relative;
    const file = !relative ? from : /^[a-z][a-z0-9+.-]*:/i.test(uri) ? mappings.get(uri) :
      path.posix.normalize(path.posix.join(path.posix.dirname(from), relative));
    assert(docs.has(file), 'H5_TYPES_REFERENCE_OUTSIDE_PIN:' + reference);
    return { file, fragment, value: pointer(docs.get(file), fragment) };
  };

  function copy(schema, file) {
    if (typeof schema === 'boolean') return schema;
    assert(schema && typeof schema === 'object' && !Array.isArray(schema), 'H5_TYPES_INVALID_SCHEMA:' + file);
    if (Array.isArray(schema.const)) {
      // The generator widens const arrays when cardinality checks stay in the schema.
      assert(schema.const.every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)),
        'H5_TYPES_NONSCALAR_CONST_ARRAY:' + file);
      return { tsType: `[${schema.const.map(value => JSON.stringify(value)).join(', ')}]` };
    }
    const projected = Object.fromEntries(Object.entries(schema)
      .filter(([key]) => !ignored.has(key) && !runtimeOnly.has(key) && !key.startsWith('x-'))
      .map(([key, value]) => {
        if (key === '$ref') return [key, reference(value, file)];
        if (key === 'not' && singleRequired(value)) return [key, value];
        if (schemaMaps.has(key)) return [key, Object.fromEntries(Object.entries(value).map(([name, child]) => [name, copy(child, file)]))];
        if (schemaArrays.has(key)) return [key, value.map(child => copy(child, file))];
        return [key, schemaChildren.has(key) ? copy(value, file) : value];
      }));
    if (projected.required) {
      const properties = projected.properties ?? {};
      projected.properties = { ...Object.fromEntries(projected.required.map(key => [key, true])), ...properties };
    }
    return Object.keys(projected).length ? projected : true;
  }

  function reference(ref, file) {
    const entry = target(ref, file);
    const key = `${entry.file}#${entry.fragment}`;
    if (!labels.has(key)) {
      const basename = path.posix.basename(entry.file).replace(/(?:\.schema\.json|\.yaml)$/, '');
      const base = typeIdentifier(entry.fragment.split('/').at(-1) || basename);
      let name = base;
      for (let index = 2; usedLabels.has(name); index++) name = base + index;
      labels.set(key, name);
      usedLabels.add(name);
      definitions[name] = copy(entry.value, entry.file);
    }
    return '#/$defs/' + labels.get(key);
  }

  function dereference(value, file, visited = new Set()) {
    if (!value?.$ref) return { value, file };
    const entry = target(value.$ref, file);
    const key = `${entry.file}#${entry.fragment}`;
    assert(!visited.has(key), 'H5_TYPES_HTTP_REFERENCE_CYCLE:' + key);
    visited.add(key);
    return dereference(entry.value, entry.file, visited);
  }

  // Project the status-discriminated result arms. Other conditional rules keep
  // their runtime enforcement in the canonical schema.
  function resultForStatus(schema, file, status) {
    const { $ref, allOf = [], if: condition, then, else: otherwise, ...rest } = schema;
    const predicates = condition?.properties;
    const values = predicates?.status?.enum ?? [predicates?.status?.const];
    const matchesStatus = predicates && Object.keys(predicates).length === 1 &&
      Object.keys(condition).every(key => ['type', 'properties', 'required'].includes(key)) &&
      (condition.required ?? []).every(key => key === 'status') && values.every(value => typeof value === 'string');
    const selected = matchesStatus ? (values.includes(status) ? then : otherwise) : undefined;
    const parts = [copy(rest, file), ...allOf.map(child => resultForStatus(child, file, status))];
    if ($ref) {
      const entry = target($ref, file);
      parts.push(resultForStatus(entry.value, entry.file, status));
    }
    if (selected) parts.push(resultForStatus(selected, file, status));
    return { allOf: parts.filter(part => part !== true) };
  }

  function applyObjectRequirements(schema, ancestors = new Set()) {
    const visited = new Set(), required = new Set(), inherited = new Set(), excluded = new Set();
    const propertyTypes = new Map();
    function walk(part) {
      if (!part || typeof part !== 'object' || visited.has(part)) return;
      visited.add(part);
      const properties = part.properties ?? {};
      for (const name of part.required ?? []) {
        required.add(name);
        if (!Object.hasOwn(properties, name) || properties[name] === true) inherited.add(name);
      }
      for (const [name, field] of Object.entries(properties)) {
        if (field === true) continue;
        if (!propertyTypes.has(name)) propertyTypes.set(name, []);
        propertyTypes.get(name).push(field);
      }
      if (singleRequired(part.not)) excluded.add(part.not.required[0]);
      if (part.$ref) walk(pointer({ $defs: definitions }, part.$ref.slice(1)));
      for (const member of part.allOf ?? []) walk(member);
    }
    walk(schema);
    const lineage = new Set([...ancestors, ...visited]);
    const refinements = new Map();
    for (const [name, fields] of propertyTypes) {
      const combined = fields.length === 1 ? fields[0] : { allOf: fields };
      const refined = fields.length > 1 && fields.every(field => !lineage.has(field))
        ? applyObjectRequirements(combined, lineage) : combined;
      if (inherited.has(name) || refined !== combined) refinements.set(name, refined);
    }
    for (const name of excluded) {
      assert(!required.has(name), 'H5_TYPES_CONFLICTING_REQUIREMENTS:' + name);
      refinements.set(name, { tsType: 'never' });
    }
    if (!refinements.size) return schema;
    // Apply the actual field type together with the presence requirement. A
    // required unknown in a separate intersection admits optional undefined.
    return { allOf: [schema, { type: 'object', properties: Object.fromEntries(refinements),
      required: [...refinements.keys()].filter(name => required.has(name)) }] };
  }

  const closedObject = (properties, required = Object.keys(properties)) => ({
    type: 'object', properties, required, additionalProperties: false,
  });
  const content = (contentMap, file) => closedObject(Object.fromEntries(Object.entries(contentMap ?? {}).map(([mime, media]) => {
    assert(media.schema !== undefined, 'H5_TYPES_MEDIA_SCHEMA:' + mime);
    return [mime, copy(media.schema, file)];
  })));
  const parameterShape = (entry, file) => {
    if (entry.schema !== undefined) return copy(entry.schema, file);
    assert(entry.content && Object.keys(entry.content).length === 1, 'H5_TYPES_PARAMETER_SCHEMA:' + entry.name);
    return content(entry.content, file);
  };

  function projectOperation(operation, pathItem, method, route) {
    const parameters = new Map();
    for (const item of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
      const param = dereference(item, root);
      parameters.set(`${param.value.in}:${param.value.name}`, param);
    }
    const locations = new Map();
    for (const { value, file } of parameters.values()) {
      if (!locations.has(value.in)) locations.set(value.in, { fields: {}, required: [] });
      const location = locations.get(value.in);
      Object.defineProperty(location.fields, value.name, { value: parameterShape(value, file), enumerable: true });
      if (value.required || value.in === 'path') location.required.push(value.name);
    }
    const properties = {
      method: { const: method.toUpperCase() },
      path: { const: route },
      parameters: closedObject(Object.fromEntries([...locations].map(([name, { fields, required }]) =>
        [name, closedObject(fields, required)]))),
      responses: closedObject(Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => {
        const { value, file } = dereference(response, root);
        const headers = Object.entries(value.headers ?? {}).map(([name, entry]) => [name, dereference(entry, file)]);
        return [status, closedObject({
          content: content(value.content, file),
          headers: closedObject(Object.fromEntries(headers.map(([name, header]) => [name, parameterShape(header.value, header.file)])),
            headers.filter(([, header]) => header.value.required).map(([name]) => name)),
        })];
      }))),
    };
    const required = Object.keys(properties);
    if (operation.requestBody) {
      const body = dereference(operation.requestBody, root);
      properties.requestBody = content(body.value.content, body.file);
      if (body.value.required) required.push('requestBody');
    }
    return closedObject(properties, required);
  }

  const basename = path.posix.basename(output, '.d.ts');
  const document = docs.get(root);
  const name = typeIdentifier(basename) + (operations.length ? 'Operations' : '');
  let schema;
  if (operations.length) {
    const paths = operationPointers(document);
    schema = closedObject(Object.fromEntries(operations.map(id => {
      const fragment = paths.get(id);
      const method = fragment.split('/').at(-1);
      const route = fragment.split('/')[2].replaceAll('~1', '/').replaceAll('~0', '~');
      return [id, projectOperation(pointer(document, fragment), document.paths[route], method, route)];
    })));
  } else if (basename.includes('.result.')) {
    schema = { oneOf: ['succeeded', 'failed'].map(status => applyObjectRequirements({ allOf: [
      { type: 'object', properties: { status: { const: status } }, required: ['status'] },
      resultForStatus(document, root, status),
    ] })) };
  } else {
    schema = applyObjectRequirements(copy(document, root));
  }
  return { name, schema: { ...schema, $defs: definitions } };
}
