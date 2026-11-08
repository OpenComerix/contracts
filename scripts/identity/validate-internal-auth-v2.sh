#!/bin/sh
set -eu
dir=${1:-.ci-artifacts/identity-internal-auth-v2}
count_valid=0
count_invalid=0
# Compile/check each distinct schema once for this bounded contract package.
awk -F '\t' '!seen[$3]++ {print $3}' "$dir/cases.tsv" | while IFS= read -r schema; do
  jsonschema metaschema "$dir/$schema" >/dev/null
done
while IFS="$(printf '\t')" read -r id expectation schema fixture; do
  [ -n "$id" ] || continue
  [ -r "$dir/$schema" ] && [ -f "$dir/$fixture" ] && [ -r "$dir/$fixture" ] || { echo "H1A v2 missing case file: $id" >&2; exit 1; }
  if [ "$expectation" = valid ]; then
    jsonschema validate "$dir/$schema" "$dir/$fixture" >/dev/null
    count_valid=$((count_valid+1))
  elif [ "$expectation" = invalid ]; then
    if jsonschema validate "$dir/$schema" "$dir/$fixture" >/dev/null 2>&1; then
      echo "H1A v2 invalid case accepted: $id" >&2
      exit 1
    fi
    count_invalid=$((count_invalid+1))
  else
    echo "H1A v2 unknown expectation: $expectation" >&2
    exit 1
  fi
done < "$dir/cases.tsv"
[ "$count_valid" -eq 15 ] || { echo "H1A v2 expected 15 positives, got $count_valid" >&2; exit 1; }
[ "$count_invalid" -eq 21 ] || { echo "H1A v2 expected 21 negatives, got $count_invalid" >&2; exit 1; }
echo "Sourcemeta H1A v2: positives=$count_valid negatives_rejected=$count_invalid; no runtime claim"
