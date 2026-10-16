import { assess } from './catalog-recovery-authority-v1-semantics.mjs';

// Identity-side executable contract example. Grant and current identity state
// remain on this side of the port; catalog receives only the versioned DTO.
// Synthetic inputs do not implement HTTP, persistence or runtime authority.
export function verify({ request, grant, context }) {
  const rejection = assess({ operation: 'verify', request, grant, context });
  if (rejection) return { rejection };
  return { response: { authorized: true, grant_id: grant.grant_id,
    binding: structuredClone(grant.binding), authority: structuredClone(grant.authority),
    permission: request.required_permission, issued_at: grant.issued_at,
    valid_until: grant.expires_at, status: 'active' } };
}
