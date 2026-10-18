import { isDeepStrictEqual as same } from 'node:util';

// Contract oracle over schema-validated wire DTOs and SYNTHETIC trusted identity
// records. Flags here model authenticated local state, never request fields.
// This is not a runtime authorizer, SQL transaction or cryptographic verifier.
const code = suffix => 'identity_catalog_recovery_' + suffix;
const denied = code('not_authorized'), invalid = code('invalid_request');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const version = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const permission = purpose => ({ 'exceptional-history-recovery':'catalog.history.recover', 'restricted-history-configuration':'catalog.history.configure' })[purpose];
const snapshotFields = {
  account_security_version:['account','security_version'], session_credential_version:['session','credential_version'],
  organization_version:['organization','version'], membership_version:['membership','version'],
};

function validInterval(grant) {
  return Number.isFinite(time(grant.issued_at)) && Number.isFinite(time(grant.expires_at)) &&
    Number.isInteger(grant.lifetime_seconds) && grant.lifetime_seconds >= 1 && grant.lifetime_seconds <= 900 &&
    time(grant.expires_at) === time(grant.issued_at) + grant.lifetime_seconds * 1000;
}

function directStepUp(input) {
  const { previous_grant: prior, previous_state: state, context: current, rotation } = input;
  if (!record(rotation) || !record(rotation.before) || !record(rotation.after)) return false;
  const { before, after } = rotation;
  return rotation.origin === 'identity-local-step-up-transaction' && rotation.operation === 'completeSessionStepUp' &&
    rotation.committed === true && rotation.audit_committed === true && uuid(rotation.proof_id) && uuid(rotation.audit_id) &&
    rotation.source_grant_id === prior.grant_id && rotation.source_grant_original_expires_at === prior.expires_at &&
    rotation.account_id === prior.binding.account_id && rotation.session_id === prior.binding.session_id &&
    rotation.organization_id === prior.binding.organization_id && rotation.membership_id === prior.binding.membership_id &&
    rotation.device_id === state.device.device_id && rotation.mfa_event_id === current.mfa_event_id &&
    rotation.occurred_at === current.mfa_authenticated_at &&
    time(rotation.occurred_at) > time(prior.issued_at) && time(rotation.occurred_at) <= time(current.now) &&
    version(before.credential_version) && version(after.credential_version) &&
    before.credential_version === prior.authority.session_credential_version &&
    after.credential_version === current.session.credential_version &&
    BigInt(after.credential_version) === BigInt(before.credential_version) + 1n &&
    digest(before.credential_hash) && digest(after.credential_hash) && before.credential_hash !== after.credential_hash &&
    before.credential_hash === state.credential_hash && after.credential_hash === current.session.credential_hash;
}

export function assessRenewal(input) {
  if (!record(input) || !record(input.context) || input.context.authority_available !== true) return code('dependency_unavailable');
  const { context: current, previous_grant: prior, previous_state: state, request, grant } = input;
  if (!['account','session','organization','membership','device','approval'].every(key => record(current[key])) ||
      !record(prior) || !record(prior.binding) || !record(prior.authority) || !record(state) ||
      !record(state.device) || !record(state.approval) || !record(request) || !record(grant) || !record(grant.authority)) return code('dependency_unavailable');
  const now = time(current.now);
  if (!Number.isFinite(now)) return code('dependency_unavailable');
  if (current.workload_authenticated !== true || current.workload_caller !== 'gateway-bff' ||
      current.workload_audience !== 'identity-tenancy.catalog-recovery' || current.workload_type !== 'service') return code('authentication_required');
  const binding = prior.binding;
  if (current.account.active !== true || current.account.email_verified !== true || current.session.active !== true ||
      current.organization.active !== true || current.membership.active !== true ||
      current.session.account_id !== binding.account_id || current.account.account_id !== binding.account_id ||
      current.session.session_id !== binding.session_id || current.session.organization_id !== binding.organization_id ||
      current.session.membership_id !== binding.membership_id || current.organization.organization_id !== binding.organization_id ||
      current.membership.membership_id !== binding.membership_id || current.membership.account_id !== binding.account_id ||
      current.membership.organization_id !== binding.organization_id || current.membership.scope?.kind !== 'organization' ||
      current.membership.scope.organization_id !== binding.organization_id ||
      !Number.isFinite(time(current.session.expires_at)) || time(current.session.expires_at) <= now ||
      !Number.isFinite(time(current.session.absolute_expires_at)) || time(current.session.absolute_expires_at) <= now) return denied;
  if (current.device.approved !== true || current.device.device_id !== state.device.device_id ||
      current.device.account_id !== binding.account_id || current.device.version !== state.device.version ||
      current.session.device_id !== state.device.device_id || current.approval.active !== true ||
      current.approval.approval_id !== state.approval.approval_id || current.approval.version !== state.approval.version ||
      current.approval.account_id !== binding.account_id || current.approval.organization_id !== binding.organization_id ||
      current.approval.device_id !== state.device.device_id || !Number.isFinite(time(current.approval.expires_at)) ||
      time(current.approval.expires_at) <= now) return denied;
  if (input.path_grant_id !== prior.grant_id || request.grant_reference !== prior.grant_reference ||
      !same(request.binding, binding)) return denied;
  const required = permission(binding.purpose);
  if (!required || !same(request.requested_permissions,[required]) || !same(prior.permissions,[required])) return invalid;
  if (!Array.isArray(current.membership.permissions) || !['catalog.history.authorize',required].every(value => current.membership.permissions.includes(value))) return denied;
  if (prior.status === 'revoked') return code('revoked');
  if (prior.status !== 'active' || prior.revocable !== true || !validInterval(prior)) return invalid;
  if (now >= time(prior.expires_at)) return code('expired');
  if (now < time(prior.issued_at) || state.decision_active !== true || state.decision_id !== prior.authority.decision_id || current.decision_active !== true) return denied;
  for (const [field,[owner,key]] of Object.entries(snapshotFields)) {
    if (!version(prior.authority[field]) || !version(current[owner][key])) return code('dependency_unavailable');
    if (field !== 'session_credential_version' && prior.authority[field] !== current[owner][key]) return denied;
  }
  const mfaAt = time(current.mfa_authenticated_at);
  if (!uuid(current.mfa_event_id) || current.mfa_event_active !== true || current.mfa_event_account_id !== binding.account_id ||
      current.mfa_event_session_id !== binding.session_id || !Number.isFinite(mfaAt) || mfaAt > now || now-mfaAt > 300_000 ||
      mfaAt <= time(prior.issued_at) || current.mfa_event_id === prior.authority.mfa_event_id ||
      !uuid(current.decision_id) || current.decision_id === prior.authority.decision_id) return code('mfa_required');
  if (!digest(state.credential_hash) || !digest(current.session.credential_hash)) return code('dependency_unavailable');
  if (prior.authority.session_credential_version === current.session.credential_version) {
    if (state.credential_hash !== current.session.credential_hash || input.rotation !== undefined) return denied;
  } else if (!directStepUp(input)) return denied;
  if (!validInterval(grant) || grant.status !== 'active' || grant.revocable !== true ||
      !uuid(grant.grant_id) || grant.grant_id === prior.grant_id ||
      !/^ocgr_[A-Za-z0-9_-]{43}$/.test(grant.grant_reference ?? '') || grant.grant_reference === prior.grant_reference ||
      !same(grant.binding,binding) || !same(grant.permissions,[required]) ||
      !Number.isFinite(time(request.requested_at)) || time(request.requested_at) > now ||
      time(grant.issued_at) < time(request.requested_at) || time(grant.issued_at) < mfaAt || time(grant.issued_at) > now ||
      time(grant.expires_at) <= now || grant.authority.decision_id !== current.decision_id ||
      grant.authority.mfa_event_id !== current.mfa_event_id || grant.authority.mfa_authenticated_at !== current.mfa_authenticated_at ||
      Object.entries(snapshotFields).some(([field,[owner,key]])=>grant.authority[field] !== current[owner][key])) return invalid;
  if (current.audit_available !== true) return code('dependency_unavailable');
  return null;
}

export function renew(input) {
  const rejection = assessRenewal(input);
  return rejection ? { rejection } : { response: structuredClone(input.grant), previous_grant_changed:false };
}
