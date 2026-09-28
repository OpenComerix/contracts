#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
valid=0
invalid=0
for fixture in default minimum maximum cursor continued-limit; do
  jsonschema validate openapi/membership-pagination-v2.schema.json "openapi/examples/membership-pagination-v2-query-$fixture.json.json" >/dev/null
  valid=$((valid+1))
done
for fixture in invalid-zero invalid-over-max invalid-non-integer invalid-long-cursor; do
  path="openapi/examples/membership-pagination-v2-query-$fixture.json.json"
  if jsonschema validate openapi/membership-pagination-v2.schema.json "$path" >/dev/null 2>&1; then
    echo "ERROR: invalid pagination fixture accepted: $path" >&2; exit 1
  fi
  invalid=$((invalid+1))
done
jsonschema validate errors/error-catalog-v2.schema.json errors/error-catalog-v2.json >/dev/null
jsonschema validate openapi/problem-details-v1.schema.json openapi/examples/membership-pagination-v2-problem-invalid-limit.json openapi/examples/membership-pagination-v2-problem-invalid-cursor.json >/dev/null
[ "$valid" -eq 5 ] || { echo "expected 5 valid query fixtures, got $valid" >&2; exit 1; }
[ "$invalid" -eq 4 ] || { echo "expected 4 invalid query fixtures, got $invalid" >&2; exit 1; }
echo "Sourcemeta membership pagination passed: catalog_v2=1 Problem_Details=2 query_valid=$valid query_invalid_rejected=$invalid."
