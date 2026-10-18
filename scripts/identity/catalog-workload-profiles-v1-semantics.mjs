// Synthetic contract oracle. authenticated/verified stand for trusted test context,
// never request fields or a demonstration of real OAuth/JWT cryptography.
export function issueProfile(policy, clientId, request, authenticated) {
  if (!authenticated || !policy.profiles.some(row => row.client_id === clientId)) return { status: 401, error: 'invalid_client' };
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length !== 1 || typeof request.grant_type !== 'string' || request.grant_type.length === 0)
    return { status: 400, error: 'invalid_request' };
  if (request.grant_type !== 'client_credentials') return { status: 400, error: 'unsupported_grant_type' };
  const profile = policy.profiles.find(row => row.client_id === clientId);
  return { status: 200, claims: { caller: profile.caller, aud: profile.audience, type: profile.type }, maximum_seconds: profile.maximum_seconds };
}
export function acceptsProfile(policy, expectedClientId, claims, verified) {
  const profile = policy.profiles.find(row => row.client_id === expectedClientId);
  return Boolean(verified && profile && claims && typeof claims.aud === 'string' &&
    claims.aud === profile.audience && claims.caller === profile.caller && claims.type === 'service');
}
