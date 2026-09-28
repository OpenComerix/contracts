#!/bin/sh
set -eu
dir=${1:?usage: validate-device-registration-challenge-v2.sh <prepared-fixture-dir>}
jsonschema metaschema "$dir"/schema-*.json >/dev/null
jsonschema validate "$dir/schema-challenge-request.json" "$dir/challenge-request-valid.json" >/dev/null
jsonschema validate "$dir/schema-registration-request.json" "$dir/registration-request-valid.json" >/dev/null
jsonschema validate "$dir/schema-key-binding-shape.json" "$dir/challenge_registration_key_mismatch.json" >/dev/null
reject() {
  schema=$1 fixture=$2
  if jsonschema validate "$dir/$schema" "$dir/$fixture" >/dev/null 2>&1; then
    echo "ERROR: Sourcemeta accepted negative fixture $fixture" >&2
    exit 1
  fi
}
reject schema-challenge-request.json missing_public_key.json
reject schema-challenge-request.json private_jwk_member.json
reject schema-challenge-request.json malformed_jwk.json
echo "Sourcemeta device challenge schemas passed: valid=2 structurally_invalid_rejected=3 key_binding_shape=1 (semantic mismatch rejected by bundle gate)."
