import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { assess, revoke, validPermissionCatalog } from './catalog-recovery-authority-v1-semantics.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const readYaml = relative => parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const apiPath = 'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml';
const schemaPath = 'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json';
const selectionSchemaPath = 'catalog/http/shared/v1/catalog-history-recovery-v1.schema.json';
const fixturesPath = 'identity/fixtures/catalog-recovery/v1/catalog-recovery-authority-v1-fixtures.json';
const catalogFixturesPath = 'catalog/fixtures/recovery/v1/catalog-history-recovery-v1-fixtures.json';

const api = readYaml(apiPath);
const schema = readJson(schemaPath);
const selectionSchema = readJson(selectionSchemaPath);
const fixtures = readJson(fixturesPath);
const catalogFixtures = readJson(catalogFixturesPath);

assert.deepEqual(Object.keys(api.paths), [
  '/internal/v1/identity/catalog/recovery-grants',
  '/internal/v1/identity/catalog/recovery-grants/verify',
  '/internal/v1/identity/catalog/recovery-grants/{grant_id}/renew',
  '/internal/v1/identity/catalog/recovery-grants/{grant_id}/revoke',
  '/internal/v1/identity/catalog/recovery-permissions'
]);
assert.equal(api.info.version, '1.0.0');
assert.match(api.info.description, /opaque/);
assert.match(api.info.description, /opaque grant/i);
assert.equal(api.components.securitySchemes.catalogWorkloadBearer.type, 'http');
assert.equal(api.components.securitySchemes.currentSessionCookie.in, 'cookie');
assert.equal(api.components.securitySchemes.currentSessionCookie.name, '__Host-oc_session');
for (const route of Object.values(api.paths)) {
  for (const operation of Object.values(route)) {
    for (const [status, response] of Object.entries(operation.responses)) {
      const resolved = response.$ref ? api.components.responses[response.$ref.split('/').at(-1)] : response;
      assert.equal(resolved.headers?.['Cache-Control']?.$ref, '#/components/headers/NoStore', `${operation.operationId} ${status} must not be cached`);
    }
  }
}
assert.equal(api.components.headers.NoStore.schema.const, 'no-store');
assert.equal(schema.$defs.Grant.properties.revocable.const, true);
assert.equal(schema.$defs.Grant.properties.status.const, 'active');
assert.ok(schema.$defs.Grant.required.includes('lifetime_seconds'));
assert.equal(schema.$defs.Grant.properties.lifetime_seconds.maximum, 900);
assert.equal(schema.$defs.Grant.properties.lifetime_seconds.minimum, 1);
for (const [name, permissionProperty] of [
  ['IssuePurposePermission', 'requested_permissions'],
  ['GrantPurposePermission', 'permissions'],
  ['VerifyPurposePermission', 'required_permission'],
  ['VerifiedPurposePermission', 'permission']
]) {
  const rule = schema.$defs[name];
  assert.equal(rule.if.properties.binding.properties.purpose.const, 'exceptional-history-recovery');
  assert.deepEqual(rule.then.properties[permissionProperty].const, permissionProperty === 'required_permission' || permissionProperty === 'permission' ? 'catalog.history.recover' : ['catalog.history.recover']);
  assert.deepEqual(rule.else.properties[permissionProperty].const, permissionProperty === 'required_permission' || permissionProperty === 'permission' ? 'catalog.history.configure' : ['catalog.history.configure']);
}
for (const name of ['IssueRequest', 'Grant', 'RenewRequest']) {
  assert.equal(schema.$defs[name].properties[name === 'Grant' ? 'permissions' : 'requested_permissions'].maxItems, 1);
}
assert.equal(schema.$defs.PermissionCatalog.properties.version.const, '1.0.0');
assert.equal(selectionSchema.$defs.Selection.properties.aggregate_ids.items.format, 'uuid');
assert.equal(selectionSchema.$defs.Destination.properties.workload.const, 'catalog-pricing');
assert.equal(fixtures.status, 'planned');
assert.equal(fixtures.runtime_authorization_demonstrated, false);
assert.match(fixtures.credential_decision, /no-jwt-grant/);
assert.deepEqual(fixtures.permission_catalog.permissions.map(p => p.id), [
  'catalog.history.recover', 'catalog.history.authorize', 'catalog.history.configure'
]);
for (const permission of fixtures.permission_catalog.permissions) {
  assert.equal(permission.mfa_required, true);
  assert.equal(permission.owner_inference, false);
  assert.equal(permission.scope, 'organization');
}
assert.equal(new Set(fixtures.negative.map(row => row.id)).size, fixtures.negative.length);
for (const field of ['account_id', 'membership_id', 'organization_id', 'session_id']) {
  assert.ok(schema.$defs.GrantBinding.required.includes(field));
}
assert.ok(schema.$defs.Grant.required.includes('authority'));
assert.ok(schema.$defs.VerifyResponse.required.includes('authority'));
assert.equal(schema.$defs.PermissionCatalog.properties.permissions.uniqueItems, true);
assert.equal(schema.$defs.PermissionCatalog.properties.permissions.items.oneOf.length, 3);
assert.equal(validPermissionCatalog(fixtures.permission_catalog), true);
const duplicatedPermission = structuredClone(fixtures.permission_catalog);
duplicatedPermission.permissions[1] = structuredClone(duplicatedPermission.permissions[0]);
assert.equal(validPermissionCatalog(duplicatedPermission), false, 'duplicate permission ID must fail');
const wrongAction = structuredClone(fixtures.permission_catalog);
wrongAction.permissions[0].action = 'grant';
assert.equal(validPermissionCatalog(wrongAction), false, 'mismatched ID/action must fail');

// Contract-level semantic examples only. These executable decisions do not attest a runtime producer.
const issueCase = () => ({
  operation: 'issue', request: structuredClone(fixtures.positive.issue),
  grant: structuredClone(fixtures.positive.grant), context: structuredClone(fixtures.trusted_context)
});
const verifyCase = () => {
  const value = issueCase();
  value.operation = 'verify';
  value.context.now = '2026-10-16T12:05:00Z';
  value.context.workload_caller = 'catalog-pricing';
  value.request = {
    grant_reference: value.grant.grant_reference,
    binding: structuredClone(value.grant.binding),
    required_permission: value.grant.permissions[0],
    checked_at: '2026-10-16T12:05:00Z'
  };
  return value;
};
const renewCase = () => {
  const value = issueCase();
  value.operation = 'renew';
  value.previous_grant = structuredClone(value.grant);
  value.path_grant_id = value.previous_grant.grant_id;
  value.request.grant_reference = value.previous_grant.grant_reference;
  value.request.requested_at = '2026-10-16T12:10:00Z';
  value.context.now = '2026-10-16T12:10:01Z';
  value.context.decision_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  value.context.mfa_event_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  value.context.mfa_authenticated_at = '2026-10-16T12:10:00Z';
  value.grant.grant_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  value.grant.grant_reference = 'ocgr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  value.grant.issued_at = value.context.now;
  value.grant.expires_at = '2026-10-16T12:25:01Z';
  value.grant.authority.decision_id = value.context.decision_id;
  value.grant.authority.mfa_event_id = value.context.mfa_event_id;
  value.grant.authority.mfa_authenticated_at = value.context.mfa_authenticated_at;
  return value;
};
const revokeCase = () => {
  const value = issueCase();
  value.operation = 'revoke';
  value.path_grant_id = value.grant.grant_id;
  value.request = { grant_reference: value.grant.grant_reference, reason_code: 'operator_request', revoked_at: value.context.now };
  return value;
};
const cases = { issue: issueCase, verify: verifyCase, renew: renewCase, revoke: revokeCase };
assert.equal(assess(issueCase()), null, 'positive issue must be accepted');
assert.equal(assess(verifyCase()), null, 'positive verification must be accepted');
assert.equal(assess(renewCase()), null, 'renewal with a new decision/MFA must be accepted');
assert.equal(assess(revokeCase()), null, 'authorized revocation must be accepted');
const revocation = revoke(revokeCase());
assert.ok(revocation.response);
const repeat = revokeCase();
repeat.grant = revocation.grant;
repeat.context.now = '2026-10-16T12:00:02Z';
assert.deepEqual(revoke(repeat).response, revocation.response, 'revocation must retain the original result/time');
const afterRevocation = verifyCase();
afterRevocation.grant = revocation.grant;
assert.equal(assess(afterRevocation), 'identity_catalog_recovery_revoked');
const configure = issueCase();
configure.request.binding.purpose = 'restricted-history-configuration';
configure.request.requested_permissions = ['catalog.history.configure'];
configure.grant.binding.purpose = 'restricted-history-configuration';
configure.grant.permissions = ['catalog.history.configure'];
assert.equal(assess(configure), null, 'restricted configuration requires its separate permission');
const configureVerify = verifyCase();
configureVerify.request.binding.purpose = 'restricted-history-configuration';
configureVerify.request.required_permission = 'catalog.history.configure';
configureVerify.grant.binding.purpose = 'restricted-history-configuration';
configureVerify.grant.permissions = ['catalog.history.configure'];
assert.equal(assess(configureVerify), null, 'restricted verification requires its separate permission');
for (const row of fixtures.negative) {
  assert.ok(Object.hasOwn(cases, row.operation), `${row.id}: unknown operation`);
  const scenario = cases[row.operation]();
  assert.ok(Object.keys(row.changes).length > 0, `${row.id}: missing executable mutation`);
  for (const [address, value] of Object.entries(row.changes)) {
    const parts = address.split('.');
    let target = scenario;
    for (const part of parts.slice(0, -1)) {
      if (!Object.hasOwn(target, part)) target[part] = {};
      target = target[part];
    }
    target[parts.at(-1)] = value;
  }
  assert.equal(assess(scenario), row.expected_code, `${row.id}: expected semantic rejection`);
}
for (const operation of ['issue', 'renew']) {
  for (const delta of [
    { lifetime_seconds: 0 }, { lifetime_seconds: 901 },
    { expires_at: '2026-10-16T11:59:59Z' }, { expires_at: 'invalid' }
  ]) {
    const scenario = cases[operation]();
    Object.assign(scenario.grant, delta);
    assert.equal(assess(scenario), 'identity_catalog_recovery_invalid_request', `${operation}: malformed output rejected before delivery`);
  }
}
assert.equal(catalogFixtures.authority_required, true);
assert.equal(catalogFixtures.selection_does_not_grant_authority, true);
assert.deepEqual(catalogFixtures.grant_permissions_allowed, [
  'catalog.history.recover', 'catalog.history.configure'
]);
if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  assert.ok(output.startsWith(path.join(root, '.ci-artifacts') + path.sep), 'schema artifacts must stay in .ci-artifacts');
  assert.equal(fs.existsSync(output), false, 'refuse to overwrite existing schema artifacts');
  const verification = verifyCase();
  const verified = {
    authorized: true, grant_id: verification.grant.grant_id,
    binding: verification.grant.binding, authority: verification.grant.authority,
    permission: verification.request.required_permission,
    valid_until: verification.grant.expires_at, status: 'active'
  };
  const positives = {
    IssueRequest: issueCase().request, Grant: issueCase().grant,
    VerifyRequest: verification.request, VerifyResponse: verified,
    RenewRequest: renewCase().request, RevokeRequest: revokeCase().request,
    RevokeResponse: revocation.response, PermissionCatalog: fixtures.permission_catalog
  };
  for (const [definition, value] of Object.entries(positives)) {
    const directory = path.join(output, definition);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'valid.json'), JSON.stringify(value));
  }
  const negative = (definition, name, change) => {
    const value = structuredClone(positives[definition]);
    change(value);
    fs.writeFileSync(path.join(output, definition, `invalid-${name}.json`), JSON.stringify(value));
  };
  for (const definition of ['IssueRequest', 'Grant', 'VerifyRequest', 'VerifyResponse', 'RenewRequest']) {
    negative(definition, 'purpose-permission', value => { value.binding.purpose = 'restricted-history-configuration'; });
    negative(definition, 'missing-person', value => { delete value.binding.account_id; });
  }
  negative('Grant', 'missing-authority', value => { delete value.authority; });
  negative('Grant', 'lifetime', value => { value.lifetime_seconds = 901; });
  negative('PermissionCatalog', 'duplicate', value => { value.permissions[1] = structuredClone(value.permissions[0]); });
  negative('PermissionCatalog', 'action', value => { value.permissions[0].action = 'grant'; });
  console.log(`Schema artifacts prepared: ${path.relative(root, output)} (8 positive / 14 negative).`);
}
console.log(`catalog-recovery-authority-v1 gate passed: operations=${Object.keys(api.paths).length} permissions=${fixtures.permission_catalog.permissions.length} executable_negatives=${fixtures.negative.length}; runtime_authorization_demonstrated=false.`);
