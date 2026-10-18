// Contract oracle over synthetic trusted state. No authentication, SQL or runtime proof.
export const managementPermission = 'catalog.history.permissions.manage';
export const assignablePermissions = Object.freeze([
  'catalog.history.authorize', 'catalog.history.configure', 'catalog.history.recover',
]);
export const maximumVersion = 9223372036854775807n;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const version = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= maximumVersion;
const permissions = value => Array.isArray(value) && value.length <= 3 && new Set(value).size === value.length && value.every(item => assignablePermissions.includes(item));
const copy = value => structuredClone(value);

export function problem(status, code, retryable = false) {
  return { status, headers: { 'Cache-Control': 'no-store', ...(retryable ? { 'Retry-After': '1' } : {}) },
    body: { type: 'urn:opencomerix:problem:' + code, title: 'Administración de permisos de historial rechazada', status,
      instance: 'urn:uuid:019a0010-0000-7000-8000-000000000007', code,
      trace_id: '019a0010-0000-7000-8000-000000000008', retryable } };
}

function authorize(context, command) {
  const workload = context?.workload;
  if (!workload?.authenticated || workload.caller !== 'gateway-bff' || workload.audience !== 'identity-tenancy.gateway' || workload.type !== 'service')
    return problem(401, 'identity_invalid_credentials');
  if (!context.available) return problem(503, 'platform_dependency_unavailable', true);
  const actor = context.actor, now = instant(context.now);
  if (!record(actor) || now === null) return problem(503, 'platform_dependency_unavailable', true);
  if (!['account_id','membership_id','organization_id','session_id'].every(key => uuid.test(actor[key] ?? '')))
    return problem(401, 'identity_session_invalid_or_expired');
  if (!actor.active || !actor.session_active || !actor.credentials_current || instant(actor.session_expires_at) === null || instant(actor.session_expires_at) <= now)
    return problem(401, 'identity_session_invalid_or_expired');
  if (!actor.email_verified || !actor.organization_active || !actor.membership_active ||
      !Array.isArray(actor.permissions) || !actor.permissions.includes(managementPermission) ||
      actor.scope?.kind !== 'organization' || actor.scope.organization_id !== actor.organization_id)
    return problem(403, 'identity_access_denied');
  if (!actor.device_approved || instant(actor.approval_expires_at) === null || instant(actor.approval_expires_at) <= now)
    return problem(403, 'identity_device_not_approved');
  const mfa = instant(actor.mfa_authenticated_at);
  if (mfa === null || mfa > now || now - mfa > 300_000) return problem(403, 'identity_mfa_required');
  if (!record(command) || !['GET','PUT'].includes(command.method) || !uuid.test(command.target_membership_id ?? ''))
    return problem(400, 'identity_invalid_request');
  if (!context.target?.active || context.target.membership_id !== command.target_membership_id || context.target.organization_id !== actor.organization_id)
    return problem(404, 'tenancy_membership_invalid');
  return null;
}

function validState(state, context) {
  return record(state) && state.organization_id === context.actor.organization_id && state.membership_id === context.target.membership_id &&
    version(state.assignment_version) && permissions(state.permissions) &&
    (state.assignment_version === '0' ? state.permissions.length === 0 && state.updated_at === null : instant(state.updated_at) !== null);
}

export function evaluate({ context, state, command, ledger = [] }) {
  const denied = authorize(context, command);
  if (denied) return denied;
  if (!validState(state, context)) return problem(503, 'platform_dependency_unavailable', true);
  const success = body => ({ status: 200, headers: { 'Cache-Control': 'no-store' }, body: copy(body) });
  if (command.method === 'GET') {
    if (command.body !== undefined || command.query !== undefined) return problem(400, 'identity_invalid_request');
    return success(state);
  }
  const body = command.body;
  if (!uuid.test(command.idempotency_key ?? '') || command.query !== undefined || !record(body) ||
      Object.keys(body).sort().join(',') !== 'expected_version,permissions' || !version(body.expected_version) || !permissions(body.permissions))
    return problem(400, 'identity_invalid_request');
  // Deterministic intent comparison only; production fingerprints use identity's protected ledger.
  const intent = JSON.stringify([command.target_membership_id, body.expected_version, body.permissions]);
  const now = instant(context.now);
  if (!Array.isArray(ledger) || ledger.some(row => !record(row) || instant(row.expires_at) === null))
    return problem(503, 'platform_dependency_unavailable', true);
  const previous = ledger.find(row => row.organization_id === context.actor.organization_id && row.operation_id === 'replaceCatalogHistoryPermissionAssignment' && row.key === command.idempotency_key && instant(row.expires_at) > now);
  if (previous) {
    if (previous.actor_account_id !== context.actor.account_id || previous.actor_membership_id !== context.actor.membership_id || previous.intent !== intent)
      return problem(409, 'identity_idempotency_key_reused');
    if (previous.status === 'in_progress') return problem(409, 'identity_idempotency_request_in_progress', true);
    if (previous.status !== 'completed' || !validState(previous.result, context)) return problem(503, 'platform_dependency_unavailable', true);
    return { ...success(previous.result), replay: true, mutation: false };
  }
  if (state.assignment_version !== body.expected_version || BigInt(state.assignment_version) === maximumVersion)
    return problem(409, 'identity_state_or_version_conflict');
  if (!context.audit_available) return problem(503, 'platform_dependency_unavailable', true);
  const next = { ...state, assignment_version: (BigInt(state.assignment_version) + 1n).toString(), permissions: [...body.permissions].sort(), updated_at: new Date(now).toISOString() };
  return { ...success(next), replay: false, mutation: true, next_state: copy(next),
    atomic_effects: ['assignment', 'membership_authorization_version', 'idempotency_result', 'mandatory_audit'],
    ledger_entry: { organization_id: context.actor.organization_id, operation_id: 'replaceCatalogHistoryPermissionAssignment', key: command.idempotency_key,
      actor_account_id: context.actor.account_id, actor_membership_id: context.actor.membership_id, intent, status: 'completed', result: copy(next),
      created_at: context.now, expires_at: new Date(now + 604800_000).toISOString() } };
}
