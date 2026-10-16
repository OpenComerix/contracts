import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Executable R4 contract oracle over validated synthetic inputs. No SQL, HTTP,
// cryptographic credential generator, producer or runtime authorization is implemented.
export const limits = Object.freeze({ eventsDefault: 100, eventsMax: 500, ranges: 500,
  requestBytes: 131072, eventBytes: 131072, responseBytes: 1048576,
  sessionMs: 3600000, metadataMs: 86400000, deadlineMs: 10000 });
export const cursorHash = value => createHash('sha256').update(value, 'utf8').digest('hex');
export const encodedBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const rejected = code => ({ rejection: code });
const error = suffix => 'catalog_recovery_' + suffix;
const number = value => BigInt(value);
const minimum = (a, b) => a < b ? a : b;
const maximum = (a, b) => a > b ? a : b;
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => isDeepStrictEqual(canonical(a), canonical(b));
export const bindingHash = value => cursorHash(JSON.stringify(canonical(value)));

export function create({ request, session, source, context, verification, next_cursor: nextCursor }) {
  const reused = Boolean(session);
  const rejection = authorize(request, context, verification);
  if (rejection) return rejected(rejection);
  if (encodedBytes(request) > limits.requestBytes) return rejected('platform_payload_too_large');
  const now = Date.parse(context.now);
  if (!Number.isFinite(now) || request.recovery_id === request.binding.session_id) return rejected('catalog_invalid_request');
  if (session) {
    if (session.recovery_id !== request.recovery_id || session.organization_id !== request.binding.organization_id || session.workload !== context.workload.caller) return rejected(error('not_found'));
    if (!equal(session.binding, request.binding) || session.requested_after !== request.after_position) return rejected(error('intent_conflict'));
    if (now >= Date.parse(session.expires_at)) return rejected(error('expired'));
  } else {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request.recovery_id)) return rejected('catalog_invalid_request');
    const timestamp = Number.parseInt(request.recovery_id.slice(0, 8) + request.recovery_id.slice(9, 13), 16);
    if (timestamp > now) return rejected('catalog_invalid_request');
    if (timestamp < Date.parse(verification.response.issued_at)) return rejected(error('expired'));
    if (context.active_sessions >= 2) return rejected('platform_rate_limited');
    if (!source.available || !source.integrity_verified) return rejected(error('source_unverifiable'));
    if (number(request.after_position) > number(source.high_water)) return rejected(error('intent_conflict'));
    if (!sourceSegments(source, request.binding.organization_id, source.high_water)) return rejected(error('source_unverifiable'));
    session = { recovery_id: request.recovery_id, organization_id: request.binding.organization_id, workload: context.workload.caller,
      binding: structuredClone(request.binding), requested_after: request.after_position, cut_position: source.high_water,
      created_at: context.now, expires_at: new Date(now + limits.sessionMs).toISOString() };
  }
  if (context.elapsed_ms >= limits.deadlineMs || !context.source_available) return rejected('platform_dependency_unavailable');
  const completed = Boolean(session.closed_at);
  return { status: reused ? 200 : 201, session: structuredClone(session),
    response: { recovery_id: session.recovery_id, organization_id: session.organization_id, selection: structuredClone(session.binding.selection),
      requested_after: session.requested_after, cut_position: session.cut_position, created_at: session.created_at, expires_at: session.expires_at,
      state: completed ? 'completed' : 'active', initial_cursor: completed ? null : nextCursor },
    initial_cursor_metadata: completed ? null : { hash: cursorHash(nextCursor), recovery_id: session.recovery_id,
      organization_id: session.organization_id, workload: session.workload, binding_hash: bindingHash(session.binding),
      cut_position: session.cut_position, after_position: session.requested_after, expires_at: session.expires_at, version: 1 } };
}

export function authorize(request, context, verification) {
  const workload = context.workload;
  if (!workload.authenticated || workload.type !== 'service') return 'catalog_history_workload_invalid';
  if (workload.caller !== 'catalog-pricing' || workload.audience !== 'catalog-pricing.history-recovery') return error('not_authorized');
  if (request.binding.purpose !== 'exceptional-history-recovery') return error('not_authorized');
  // This is the fresh trusted identity port result for THIS request. It is not
  // part of the caller's wire body, a cached decision or a gateway Grant.
  if (!verification || verification.rejection === 'identity_catalog_recovery_dependency_unavailable') return 'platform_dependency_unavailable';
  if (verification.rejection || !verification.response) return error('not_authorized');
  const decision = verification.response;
  const start = Date.parse(decision.issued_at), end = Date.parse(decision.valid_until), now = Date.parse(context.now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now) ||
      start > now || now >= end || end <= start || end - start > 900000 || (end - start) % 1000 !== 0) return error('not_authorized');
  if (decision.authorized !== true || decision.status !== 'active' ||
      decision.permission !== 'catalog.history.recover' || !equal(decision.binding, request.binding)) return error('not_authorized');
  return null;
}

export function selected(event, selection) {
  return selection.aggregate_types.includes(event.aggregate_type) &&
    (!selection.aggregate_ids.length || selection.aggregate_ids.includes(event.aggregate_id)) &&
    (!selection.versions.length || selection.versions.includes(String(event.aggregate_version)));
}

// Every position at/after the supported frontier must be accounted for by a
// retained original or an explicit disposed range. Unknown gaps are not disposal.
export function sourceSegments(source, organizationId, cut) {
  const high = number(cut), frontier = number(source.frontier_position);
  if (!source.available || !source.integrity_verified || frontier < 1n || frontier > number(source.high_water) + 1n || high > number(source.high_water)) return null;
  const segments = source.records.filter(row => number(row.position) >= frontier && number(row.position) <= high).map(row => ({
    from: number(row.position), through: number(row.position), event: row.event
  }));
  for (const row of source.disposed_ranges) {
    const from = number(row.from_position), through = number(row.through_position);
    if (from < 1n || through < from || !row.policy_id || !Number.isInteger(row.policy_version) || row.policy_version < 1) return null;
    if (through >= frontier && from <= high) segments.push({ from: maximum(from, frontier), through: minimum(through, high), reason: 'disposed', policy_id: row.policy_id, policy_version: row.policy_version });
  }
  segments.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0);
  let expected = minimum(frontier, high + 1n);
  const eventIds = new Set();
  for (const segment of segments) {
    if (segment.from !== expected || segment.through < segment.from) return null;
    if (segment.event) {
      const event = segment.event;
      if (event.organization_id !== organizationId || event.producer !== 'catalog-pricing' || event.schema_version !== 1 || eventIds.has(event.event_id)) return null;
      eventIds.add(event.event_id);
      const pairs = { category: 'catalog.category.changed.v1', product: 'catalog.product.changed.v1',
        presentation: 'catalog.presentation.changed.v1', presentation_price: 'pricing.presentation-price.changed.v1' };
      if (pairs[event.aggregate_type] !== event.event_type) return null;
    }
    expected = segment.through + 1n;
  }
  if (expected !== high + 1n) return null;
  if (frontier > 1n && high > 0n) segments.unshift({ from: 1n, through: minimum(frontier - 1n, high), reason: 'before_supported_frontier', policy_id: null, policy_version: null });
  return segments;
}

function appendCoverage(coverage, segment) {
  const list = segment.reason ? coverage.missing_ranges : coverage.available_ranges;
  const previous = list.at(-1);
  const matching = previous && number(previous.through_position) + 1n === segment.from &&
    (!segment.reason || previous.reason === segment.reason && previous.policy_id === segment.policy_id && previous.policy_version === segment.policy_version);
  if (matching) previous.through_position = String(segment.through);
  else list.push({ from_position: String(segment.from), through_position: String(segment.through),
    ...(segment.reason ? { reason: segment.reason, policy_id: segment.policy_id, policy_version: segment.policy_version } : {}) });
}

function pageCandidate(session, context, after, scanned, events, coverage, nextCursor) {
  const end = scanned === number(session.cut_position);
  return { recovery_id: session.recovery_id, cut_position: session.cut_position, expires_at: session.expires_at,
    events, coverage: { ...coverage, scanned_through: String(scanned) }, end_of_traversal: end,
    complete: end && coverage.status === 'complete', next_cursor: end ? null : nextCursor };
}

export function page({ request, recovery_id: recoveryId, session, cursor, source, context, verification, next_cursor: nextCursor }) {
  const rejection = authorize(request, context, verification);
  if (rejection) return rejected(rejection);
  if (encodedBytes(request) > limits.requestBytes) return rejected('platform_payload_too_large');
  if (!session || session.recovery_id !== recoveryId || session.organization_id !== request.binding.organization_id || session.workload !== context.workload.caller) return rejected(error('not_found'));
  if (!equal(session.binding, request.binding)) return rejected(error('intent_conflict'));
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) return rejected('catalog_invalid_request');
  if (now >= Date.parse(session.expires_at)) return rejected(error('expired'));
  const version = /^ocrc([1-9][0-9]{0,2})_/.exec(request.cursor)?.[1];
  if (!version) return rejected(error('cursor_invalid'));
  // An untrusted prefix cannot reveal supported-session details: ownership and
  // fresh authority were checked above, before returning 410.
  if (version !== '1') return rejected(error('cursor_version_unsupported'));
  if (!cursor || cursor.hash !== cursorHash(request.cursor)) return rejected(error('cursor_invalid'));
  if (cursor.recovery_id !== recoveryId || cursor.organization_id !== session.organization_id || cursor.workload !== session.workload) return rejected(error('not_found'));
  if (cursor.binding_hash !== bindingHash(session.binding) || cursor.cut_position !== session.cut_position || cursor.version !== 1 || cursor.expires_at !== session.expires_at) return rejected(error('intent_conflict'));
  if (now >= Date.parse(cursor.expires_at)) return rejected(error('expired'));
  const after = number(cursor.after_position), cut = number(session.cut_position);
  if (after < number(session.requested_after) || after > cut) return rejected(error('intent_conflict'));
  const limit = request.limit ?? limits.eventsDefault;
  if (!Number.isInteger(limit) || limit < 1 || limit > limits.eventsMax) return rejected('catalog_invalid_request');
  if (session.closed_at && (session.terminal_after !== String(after) || session.terminal_limit !== limit)) return rejected(error('closed'));
  if (context.in_flight || context.pages_in_last_second >= 5) return rejected('platform_rate_limited');
  if (context.elapsed_ms >= limits.deadlineMs || !context.source_available) return rejected('platform_dependency_unavailable');
  const segments = sourceSegments(source, session.organization_id, session.cut_position);
  if (!segments) return rejected(error('source_unverifiable'));
  const partial = segments.some(row => row.reason && row.through > number(session.requested_after));
  const coverage = { requested_after: session.requested_after, requested_through: session.cut_position,
    scanned_after: String(after), scanned_through: String(after), frontier_position: source.frontier_position,
    evaluated_at: context.now, status: partial ? 'partial' : 'complete', available_ranges: [], missing_ranges: [] };
  let response = pageCandidate(session, context, after, after, [], coverage, nextCursor);
  for (const original of segments) {
    if (original.through <= after) continue;
    const segment = { ...original, from: maximum(original.from, after + 1n) };
    const include = segment.event && selected(segment.event, session.binding.selection);
    if (include && response.events.length >= limit) break;
    if (segment.event && encodedBytes(segment.event) > limits.eventBytes) return rejected(error('event_unrepresentable'));
    const nextCoverage = structuredClone(response.coverage);
    appendCoverage(nextCoverage, segment);
    if (nextCoverage.available_ranges.length + nextCoverage.missing_ranges.length > limits.ranges) break;
    const events = include ? [...response.events, { position: String(segment.from), event: structuredClone(segment.event) }] : response.events;
    const next = pageCandidate(session, context, after, segment.through, events, nextCoverage, nextCursor);
    if (encodedBytes(next) > limits.responseBytes) {
      if (response.coverage.scanned_through === String(after)) return rejected(error('event_unrepresentable'));
      break;
    }
    response = next;
  }
  if (encodedBytes(response) > limits.responseBytes) return rejected(error('event_unrepresentable'));
  // Disposal may fragment a previously terminal page beyond today's budgets.
  // Closed sessions cannot admit continuation cursors: require a new intent.
  if (session.closed_at && !response.end_of_traversal) return rejected(error('closed'));
  if (!response.end_of_traversal && response.coverage.scanned_through === String(after)) return rejected(error('source_unverifiable'));
  return { response, close: response.end_of_traversal ? { closed_at: session.closed_at ?? context.now,
    terminal_after: String(after), terminal_limit: limit } : null,
    next_cursor_metadata: response.next_cursor === null ? null : { hash: cursorHash(response.next_cursor),
      recovery_id: recoveryId, organization_id: session.organization_id, workload: session.workload,
      binding_hash: bindingHash(session.binding), cut_position: session.cut_position,
      after_position: response.coverage.scanned_through, expires_at: session.expires_at, version: 1 } };
}
