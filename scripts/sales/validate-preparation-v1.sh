#!/bin/sh
set -eu
dir=${1:?prepared fixture directory required}
schemas=0
while IFS= read -r schema; do
  [ -n "$schema" ] || continue
  jsonschema metaschema "$dir/$schema" >"$dir/$schema-meta.log" 2>&1 || { cat "$dir/$schema-meta.log" >&2; exit 1; }
  schemas=$((schemas+1))
done < "$dir/schemas.txt"
positive=0
negative=0
while IFS="$(printf '\t')" read -r id expected schema fixture; do
  [ -n "$id" ] || continue
  if jsonschema validate "$dir/$schema" "$dir/$fixture" --format-assertion >"$dir/$id-validation.log" 2>&1; then
    [ "$expected" = accept ] || { echo "PREPARATION_INVALID_ACCEPTED:$id" >&2; exit 1; }
    positive=$((positive+1))
  else
    code=$?
    [ "$expected" = reject ] && [ "$code" -eq 2 ] && grep -q 'Schema validation failure' "$dir/$id-validation.log" || { cat "$dir/$id-validation.log" >&2; echo "PREPARATION_UNEXPECTED_FAILURE:$id:$code" >&2; exit 1; }
    negative=$((negative+1))
  fi
done < "$dir/cases.tsv"
[ "$schemas" -eq 6 ] && [ "$positive" -eq 18 ] && [ "$negative" -eq 59 ]
echo "F1-13A Sourcemeta 16.10.0: schemas=$schemas accepted=$positive invalid_rejected=$negative runtime_demonstrated=false"
