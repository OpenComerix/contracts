#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
jsonschema metaschema errors/error-catalog-v3.schema.json openapi/csrf-v3-problem.schema.json --verbose
jsonschema validate errors/error-catalog-v3.schema.json errors/error-catalog-v3.json --verbose
jsonschema validate openapi/csrf-v3-problem.schema.json openapi/examples/gateway-csrf-invalid-v3.json --verbose
if jsonschema validate openapi/csrf-v3-problem.schema.json openapi/examples/gateway-csrf-invalid-with-detail-negative-v3.json >/dev/null 2>&1; then
  echo "ERROR: CSRF Problem Details schema accepted a fixture containing sensitive detail" >&2
  exit 1
fi
echo "Sourcemeta CSRF v3 passed: catalog_entries=20 positive_problem=1 sensitive_detail_negative_rejected=1."
