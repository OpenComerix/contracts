#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "usage: sh scripts/validate-session-rotation-replay-v5.sh <prepared-fixtures-dir>" >&2
  exit 2
fi
prepared=$1
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
schemas=0
valid=0
invalid=0
for schema in "$prepared"/schema-*.json; do
  [ -f "$schema" ] || { echo "missing R5 generated schema" >&2; exit 1; }
  jsonschema metaschema "$schema" --verbose
  schemas=$((schemas+1))
done
while IFS="$(printf '\t')" read -r schema instance expected; do
  [ -n "$schema" ] || continue
  case "$expected" in
    valid)
      jsonschema validate "$prepared/$schema" "$root/openapi/examples/$instance" --verbose
      valid=$((valid+1))
      ;;
    invalid)
      if jsonschema validate "$prepared/$schema" "$root/openapi/examples/$instance" --verbose >/dev/null 2>&1; then
        echo "ERROR: expected invalid R5 fixture to be rejected: $instance" >&2
        exit 1
      fi
      invalid=$((invalid+1))
      ;;
    *) echo "ERROR: unknown R5 fixture expectation: $expected" >&2; exit 1 ;;
  esac
done < "$prepared/cases.tsv"
[ "$valid" -eq 19 ] || { echo "expected 19 valid R5 fixtures, got $valid" >&2; exit 1; }
[ "$invalid" -eq 10 ] || { echo "expected 10 rejected R5 fixtures, got $invalid" >&2; exit 1; }
echo "Sourcemeta PF1-06A-R5 passed: schemas=$schemas valid=$valid invalid_rejected=$invalid. JSON Schema checks shape only; cookie binding, HMAC fingerprint, session state and authorization are runtime identity-tenancy responsibilities."
