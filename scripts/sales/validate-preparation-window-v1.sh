#!/bin/sh
set -eu
dir=${1:?prepared fixture directory required}
schemas=0
while IFS= read -r schema; do
  [ -n "$schema" ] || continue
  jsonschema metaschema "$dir/$schema" >"$dir/$schema-meta.log" 2>&1 || { cat "$dir/$schema-meta.log" >&2; exit 1; }
  schemas=$((schemas+1))
done < "$dir/schemas.txt"
accepted=0
rejected=0
while IFS="$(printf '\t')" read -r id expected schema fixture; do
  [ -n "$id" ] || continue
  if jsonschema validate "$dir/$schema" "$dir/$fixture" --format-assertion >"$dir/$id-validation.log" 2>&1; then
    [ "$expected" = accept ] || { echo "ID04_INVALID_ACCEPTED:$id" >&2; exit 1; }
    accepted=$((accepted+1))
  else
    code=$?
    [ "$expected" = reject ] && [ "$code" -eq 2 ] && grep -q 'Schema validation failure' "$dir/$id-validation.log" || {
      cat "$dir/$id-validation.log" >&2; echo "ID04_UNEXPECTED_FAILURE:$id:$code" >&2; exit 1;
    }
    rejected=$((rejected+1))
  fi
done < "$dir/cases.tsv"
[ "$schemas" -eq 10 ] && [ "$accepted" -eq 10 ] && [ "$rejected" -eq 24 ]
echo "ID-04 Sourcemeta 16.10.0: schemas=$schemas accepted=$accepted invalid_rejected=$rejected runtime_demonstrated=false"
