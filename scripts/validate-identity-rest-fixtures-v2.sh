#!/bin/sh
set -eu
dir=${1:?usage: validate-identity-rest-fixtures.sh <fixture-dir>}
count_valid=0
count_invalid=0
schema_count=0
check_valid() {
  schema=$1; fixture=$2
  jsonschema validate "$dir/$schema" "$dir/$fixture" >/dev/null
}
check_invalid() {
  schema=$1; fixture=$2
  if jsonschema validate "$dir/$schema" "$dir/$fixture" >/dev/null 2>&1; then
    echo "ERROR: invalid fixture accepted: $fixture" >&2; return 1
  fi
}
awk -F '\t' '!seen[$3]++ {print $3}' "$dir/cases.tsv" | while IFS= read -r schema; do
  jsonschema metaschema "$dir/$schema" >/dev/null
done
schema_count=$(awk -F '\t' '!seen[$3]++ {n++} END {print n+0}' "$dir/cases.tsv")
while IFS="$(printf '\t')" read -r id expectation schema fixture pointer; do
  [ -n "$id" ] || continue
  if [ "$expectation" = valid ]; then check_valid "$schema" "$fixture"; count_valid=$((count_valid+1));
  else check_invalid "$schema" "$fixture"; count_invalid=$((count_invalid+1)); fi
done < "$dir/cases.tsv"
[ "$count_valid" -eq 56 ] || { echo "expected 56 schema-valid cases, got $count_valid" >&2; exit 1; }
[ "$count_invalid" -eq 15 ] || { echo "expected 15 schema-invalid requests, got $count_invalid" >&2; exit 1; }
# Boundary controls: accepting a known-invalid request or rejecting a known-valid one must fail the gate.
first_invalid=$(awk -F '\t' '$2=="invalid" {print $3 "\t" $4; exit}' "$dir/cases.tsv")
first_valid=$(awk -F '\t' '$2=="valid" && $1 ~ /request-valid$/ {print $3 "\t" $4; exit}' "$dir/cases.tsv")
oldifs=$IFS; IFS="$(printf '\t')"; set -- $first_invalid; invalid_schema=$1; invalid_file=$2; set -- $first_valid; valid_schema=$1; valid_file=$2; IFS=$oldifs
if check_valid "$invalid_schema" "$invalid_file" 2>/dev/null; then echo "negative control failed: invalid accepted" >&2; exit 1; fi
if check_invalid "$valid_schema" "$valid_file" 2>/dev/null; then echo "negative control failed: valid rejected" >&2; exit 1; fi
echo "Sourcemeta REST fixture gate passed: extracted_schemas=$schema_count valid=$count_valid invalid_rejected=$count_invalid; classification negative controls=2"
