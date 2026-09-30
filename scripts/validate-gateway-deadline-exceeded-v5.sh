#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
schema="$root/openapi/problem-details-v2.schema.json"
positive="$root/openapi/examples/gateway-deadline-exceeded-v5.json"
negative_status="$root/openapi/examples/gateway-deadline-exceeded-v5-invalid-status.json"
negative_code="$root/openapi/examples/gateway-deadline-exceeded-v5-invalid-code.json"

jsonschema metaschema "$schema" --verbose
jsonschema validate "$schema" "$positive" --verbose
for fixture in "$negative_status" "$negative_code"; do
  if jsonschema validate "$schema" "$fixture" --verbose; then
    echo "expected invalid Problem fixture to be rejected: $fixture" >&2
    exit 1
  fi
done
jsonschema metaschema "$root/errors/error-catalog-v5.schema.json" --verbose
jsonschema validate "$root/errors/error-catalog-v5.schema.json" "$root/errors/error-catalog-v5.json" --verbose
