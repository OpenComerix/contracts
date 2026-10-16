import { isDeepStrictEqual } from 'node:util';

// Executable contract oracle over schema-validated DTOs and synthetic, server-resolved context.
// Not a runtime authorizer; structural rejection is exercised separately with Sourcemeta.
const code = suffix => `identity_catalog_recovery_${suffix}`;
const invalid = code('invalid_request');
const denied = code('not_authorized');
const versions = {
  account_security_version: ['account', 'security_version'],
  session_credential_version: ['session', 'credential_version'],
  organization_version: ['organization', 'version'],
  membership_version: ['membership', 'version']
};
export const permissionForPurpose = purpose => ({
  'exceptional-history-recovery': 'catalog.history.recover',
  'restricted-history-configuration': 'catalog.history.configure'
})[purpose];

function livePerson(binding, current) {
  return current.account.active && current.session.active && current.organization.active &&
    current.membership.active && binding.account_id === current.account.account_id &&
    binding.session_id === current.session.session_id && current.session.account_id === binding.account_id &&
    binding.organization_id === current.organization.organization_id &&
    binding.membership_id === current.membership.membership_id &&
    current.membership.account_id === binding.account_id &&
    current.membership.organization_id === binding.organization_id;
}
function matchingVersions(grant, current) {
  return Object.entries(versions).every(([key, [owner, field]]) =>
    grant.authority[key] === current[owner][field]);
}
function freshMfa(current) {
  const age = Date.parse(current.now) - Date.parse(current.mfa_authenticated_at);
  return current.mfa_recent && Number.isFinite(age) && age >= 0 && age <= 300_000;
}
function validInterval(grant) {
  const start = Date.parse(grant.issued_at);
  const end = Date.parse(grant.expires_at);
  return Number.isFinite(start) && Number.isFinite(end) && Number.isInteger(grant.lifetime_seconds) &&
    grant.lifetime_seconds >= 1 && grant.lifetime_seconds <= 900 &&
    end === start + grant.lifetime_seconds * 1000;
}
function validOutput(grant, request, current) {
  const expected = permissionForPurpose(request.binding.purpose);
  return validInterval(grant) && grant.status === 'active' && grant.revocable === true &&
    isDeepStrictEqual(grant.binding, request.binding) &&
    isDeepStrictEqual(grant.permissions, [expected]) && matchingVersions(grant, current) &&
    grant.authority.decision_id === current.decision_id &&
    grant.authority.mfa_event_id === current.mfa_event_id &&
    grant.authority.mfa_authenticated_at === current.mfa_authenticated_at &&
    Date.parse(grant.issued_at) >= Date.parse(request.requested_at) &&
    Date.parse(grant.issued_at) <= Date.parse(current.now) &&
    Date.parse(grant.expires_at) > Date.parse(current.now);
}
function stateOfGrant(grant, current) {
  if (!validInterval(grant)) return invalid;
  if (grant.status === 'revoked') return code('revoked');
  if (grant.status !== 'active') return invalid;
  if (Date.parse(current.now) >= Date.parse(grant.expires_at)) return code('expired');
  if (Date.parse(current.now) < Date.parse(grant.issued_at)) return denied;
  return null;
}
export function assess({ operation, request, grant, previous_grant: previous, path_grant_id: pathId, context: current }) {
  if (!current.authority_available) return code('dependency_unavailable');
  if (!Number.isFinite(Date.parse(current.now))) return invalid;
  const personOperation = ['issue', 'renew', 'revoke'].includes(operation);
  if (!personOperation && operation !== 'verify') throw new Error(`unsupported operation: ${operation}`);
  const binding = operation === 'revoke' ? grant.binding : request.binding;
  if (!livePerson(binding, current)) return denied;
  const expectedCaller = personOperation ? 'gateway-bff' : 'catalog-pricing';
  if (current.workload_caller !== expectedCaller || current.workload_audience !== 'identity-tenancy.catalog-recovery') return denied;
  if (!current.membership.permissions.includes('catalog.history.authorize')) return denied;
  if (personOperation) {
    if (!freshMfa(current)) return code('mfa_required');
  }
  if (operation === 'revoke') {
    if (pathId !== grant.grant_id || request.grant_reference !== grant.grant_reference) return denied;
    if (!['operator_request', 'authority_changed', 'session_expired', 'security_event'].includes(request.reason_code) ||
        !Number.isFinite(Date.parse(request.revoked_at))) return invalid;
    return null;
  }
  if (!current.decision_active) return denied;
  const permission = permissionForPurpose(binding.purpose);
  if (!permission) return invalid;
  if (!current.membership.permissions.includes(permission)) return denied;
  if (operation === 'verify') {
    if (request.required_permission !== permission) return invalid;
    const state = stateOfGrant(grant, current);
    if (state) return state;
    if (request.grant_reference !== grant.grant_reference ||
        !isDeepStrictEqual(binding, grant.binding) || !isDeepStrictEqual(grant.permissions, [permission]) ||
        !matchingVersions(grant, current) || grant.authority.decision_id !== current.decision_id) return denied;
    return null;
  }
  if (!isDeepStrictEqual(request.requested_permissions, [permission])) return invalid;
  if (operation === 'renew') {
    const state = stateOfGrant(previous, current);
    if (state) return state;
    if (pathId !== previous.grant_id || request.grant_reference !== previous.grant_reference ||
        !isDeepStrictEqual(binding, previous.binding) || !isDeepStrictEqual(request.requested_permissions, previous.permissions) ||
        !matchingVersions(previous, current)) return denied;
    if (current.decision_id === previous.authority.decision_id || current.mfa_event_id === previous.authority.mfa_event_id ||
        Date.parse(current.mfa_authenticated_at) <= Date.parse(previous.issued_at)) return code('mfa_required');
    if (grant.grant_id === previous.grant_id || grant.grant_reference === previous.grant_reference) return invalid;
  }
  return validOutput(grant, request, current) ? null : invalid;
}

export function revoke(scenario) {
  const rejection = assess(scenario);
  if (rejection) return { rejection };
  const grant = structuredClone(scenario.grant);
  if (grant.status !== 'revoked') {
    grant.status = 'revoked';
    grant.revoked_at = scenario.context.now;
  }
  return { grant, response: { grant_id: grant.grant_id, status: 'revoked', revoked_at: grant.revoked_at } };
}

export function validPermissionCatalog(catalog) {
  const actions = { 'catalog.history.recover': 'read', 'catalog.history.authorize': 'grant', 'catalog.history.configure': 'configure' };
  return catalog.version === '1.0.0' && catalog.permissions.length === 3 &&
    new Set(catalog.permissions.map(row => row.id)).size === 3 && catalog.permissions.every(row =>
      Object.hasOwn(actions, row.id) && actions[row.id] === row.action && row.mfa_required === true &&
      row.owner_inference === false && row.scope === 'organization');
}
