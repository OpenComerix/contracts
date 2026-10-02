#!/bin/sh
set -eu
dir=${1:?usage: validate-session-step-up-v1.sh <prepared-fixture-dir>}
[ -d "$dir" ] || { echo "fixture directory missing: $dir" >&2; exit 1; }
valid=0
invalid=0
schemas=0
awk -F '\t' 'NF != 5 { print "malformed fixture row" > "/dev/stderr"; exit 1 } !seen[$3]++ { print $3 }' "$dir/cases.tsv" | while IFS= read -r schema; do
  jsonschema metaschema "$dir/$schema" --default-dialect https://json-schema.org/draft/2020-12/schema >/dev/null
done
schemas=$(awk -F '\t' 'NF == 5 && !seen[$3]++ {n++} END {print n+0}' "$dir/cases.tsv")
rows=$(awk -F '\t' 'NF == 5 {n++} END {print n+0}' "$dir/cases.tsv")
while IFS="$(printf '\t')" read -r id expectation schema fixture pointer; do
  [ -n "$id" ] || continue
  [ -f "$dir/$schema" ] && [ -f "$dir/$fixture" ] || { echo "missing prepared schema/fixture for $id" >&2; exit 1; }
  case "$expectation" in
    valid)
      jsonschema validate "$dir/$schema" "$dir/$fixture" --verbose >/dev/null
      valid=$((valid+1));;
    invalid)
      if jsonschema validate "$dir/$schema" "$dir/$fixture" --verbose >/dev/null 2>&1; then echo "structural negative accepted: $id" >&2; exit 1; fi
      invalid=$((invalid+1));;
    *) echo "unknown fixture expectation for $id: $expectation" >&2; exit 1;;
  esac
done < "$dir/cases.tsv"
[ "$rows" -gt 0 ] || { echo "prepared fixture inventory is empty" >&2; exit 1; }
[ "$((valid + invalid))" -eq "$rows" ] || { echo "not every inventoried structural case was validated" >&2; exit 1; }
[ "$valid" -gt 0 ] && [ "$invalid" -gt 0 ] && [ "$schemas" -gt 0 ] || { echo "positive, negative, and extracted schema coverage are required" >&2; exit 1; }
first_valid=$(awk -F '\t' '$2=="valid" {print $3 "\t" $4; exit}' "$dir/cases.tsv")
first_invalid=$(awk -F '\t' '$2=="invalid" {print $3 "\t" $4; exit}' "$dir/cases.tsv")
oldifs=$IFS; IFS="$(printf '\t')"; set -- $first_valid; valid_schema=$1; valid_fixture=$2; set -- $first_invalid; invalid_schema=$1; invalid_fixture=$2; IFS=$oldifs
if jsonschema validate "$dir/$invalid_schema" "$dir/$invalid_fixture" >/dev/null 2>&1; then echo "negative autocontrol failed: invalid fixture accepted" >&2; exit 1; fi
jsonschema validate "$dir/$valid_schema" "$dir/$valid_fixture" >/dev/null
echo "Sourcemeta step-up schema gate passed: extracted_schemas=$schemas structural_cases=$rows positive=$valid negative_rejected=$invalid; autocontrols=2"
