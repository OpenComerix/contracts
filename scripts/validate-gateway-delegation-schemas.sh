#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
schema="$root/openapi/identity-gateway-delegation-v1.schema.json"
problem_schema="$root/openapi/problem-details-v1.schema.json"
examples="$root/openapi/examples/identity-gateway-delegation-v1"
jsonschema metaschema "$schema" >/dev/null
valid=0
invalid=0
for file in delegation-response-restricted.json delegation-response-tenant.json delegation-context-restricted.json delegation-context-tenant.json delegation-context-restricted-with-device.json delegation-context-active-no-tenant.json; do
  jsonschema validate "$schema" "$examples/$file" >/dev/null
  valid=$((valid+1))
done
jsonschema validate "$problem_schema" "$examples/problem-unauthorized.json" >/dev/null
jsonschema validate "$problem_schema" "$examples/problem-forbidden.json" >/dev/null
for file in negative-audience.json negative-type.json negative-session-missing.json negative-restricted-tenant-claims.json negative-issuer-invalid.json negative-jti-invalid.json negative-claim-names.json negative-claim-types.json negative-tenant-device-missing.json negative-tenant-device-unapproved.json negative-restricted-device-unbound.json negative-active-no-tenant-device-unbound.json negative-tenant-branch-unverified.json; do
  if jsonschema validate "$schema" "$examples/$file" >/dev/null 2>&1; then
    echo "ERROR: invalid delegation claims accepted: $file" >&2
    exit 1
  fi
  invalid=$((invalid+1))
done
jsonschema validate "$schema" "$examples/negative-tenant-device-mismatch.json" >/dev/null
valid=$((valid+1))
jsonschema validate "$schema" "$examples/negative-tenant-branch-mismatch.json" >/dev/null
valid=$((valid+1))
echo "Sourcemeta delegation schemas passed: schema=1 valid=$valid invalid_rejected=$invalid Problem_Details=2; optional device links require a session-context reference, and equality is checked by the policy validator."
