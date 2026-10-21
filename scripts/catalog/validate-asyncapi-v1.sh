#!/bin/sh
set -eu
dir=${1:?usage: validate-asyncapi-v1.sh <new-prepared-directory>}
[ "$(jsonschema --version)" = '16.10.0' ] || { echo 'Sourcemeta version mismatch' >&2; exit 1; }
logs="$dir/sourcemeta"
mkdir "$logs" # one execution per prepared output; preserve all earlier logs
valid_schemas=0
invalid_schemas=0
while IFS="$(printf '\t')" read -r id expected schema; do
  [ -n "$id" ] || continue
  if jsonschema metaschema "$dir/$schema" >"$logs/$id-metaschema.log" 2>&1; then
    [ "$expected" = accept ] || { echo "invalid schema accepted: $id" >&2; exit 1; }
    valid_schemas=$((valid_schemas+1))
  else
    code=$?
    [ "$expected" = reject ] && [ "$code" -eq 2 ] && grep -q 'Schema validation failure' "$logs/$id-metaschema.log" || { cat "$logs/$id-metaschema.log" >&2; echo "unexpected metaschema failure: $id (exit $code)" >&2; exit 1; }
    invalid_schemas=$((invalid_schemas+1))
  fi
done < "$dir/schemas.tsv"
valid=0
invalid=0
while IFS="$(printf '\t')" read -r id expected schema fixture; do
  [ -n "$id" ] || continue
  if jsonschema validate "$dir/$schema" "$dir/$fixture" --resolve "$dir/source/events/event-envelope-v1.schema.json" --resolve "$dir/source/catalog/events/v1/catalog-event-data-v1.schema.json" --format-assertion >"$logs/$id-validation.log" 2>&1; then
    [ "$expected" = accept ] || { echo "invalid instance accepted: $id" >&2; exit 1; }
    valid=$((valid+1))
  else
    code=$?
    [ "$expected" = reject ] && [ "$code" -eq 2 ] && grep -q 'Schema validation failure' "$logs/$id-validation.log" || { cat "$logs/$id-validation.log" >&2; echo "unexpected instance failure: $id (exit $code)" >&2; exit 1; }
    invalid=$((invalid+1))
  fi
done < "$dir/cases.tsv"
[ "$valid_schemas" -eq 7 ] && [ "$invalid_schemas" -eq 2 ] && [ "$valid" -eq 5 ] && [ "$invalid" -eq 22 ] || { echo 'incomplete AsyncAPI payload matrix' >&2; exit 1; }
echo "F1-08N Sourcemeta payload gate passed: schemas=$valid_schemas invalid_schemas_rejected=$invalid_schemas valid=$valid invalid_rejected=$invalid; no broker/runtime admission."
