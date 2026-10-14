#!/bin/sh
set -eu
dir=${1:?usage: validate-catalog-security-v1.sh <prepared-fixture-dir>}
count_valid=0
count_invalid=0
while IFS="$(printf '\t')" read -r id expected schema fixture; do
  [ -n "$id" ] || continue
  jsonschema metaschema "$dir/$schema" >/dev/null
  if jsonschema validate "$dir/$schema" "$dir/$fixture" --resolve catalog/http/shared/v1/catalog-common-v1.schema.json --format-assertion >"$dir/$id-validation.log" 2>&1; then
    [ "$expected" = accept ] || { echo "invalid case accepted: $id" >&2; exit 1; }
    count_valid=$((count_valid+1))
  else
    code=$?
    [ "$expected" = reject ] && [ "$code" -eq 2 ] && grep -q 'Schema validation failure' "$dir/$id-validation.log" || { cat "$dir/$id-validation.log" >&2; echo "case $id failed unexpectedly with exit $code" >&2; exit 1; }
    count_invalid=$((count_invalid+1))
  fi
done < "$dir/cases.tsv"
[ "$count_valid" -gt 0 ] && [ "$count_invalid" -gt 0 ] || { echo 'missing fixture classifications' >&2; exit 1; }
echo "F1-07B Sourcemeta gate passed: valid=$count_valid invalid_rejected=$count_invalid; unexpected errors never count as successful rejection."
