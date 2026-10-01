#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: sh scripts/validate-owner-session-flow-v1.sh <prepared-output-dir>" >&2
  exit 2
fi

output=$1
for schema in "$output"/*.schema.json; do
  jsonschema metaschema "$schema" --default-dialect https://json-schema.org/draft/2020-12/schema --verbose
done

for group in positive semantic_negative; do
  for schema_dir in "$output/$group"/*; do
    [ -d "$schema_dir" ] || continue
    schema="$output/$(basename "$schema_dir").schema.json"
    for instance in "$schema_dir"/*.json; do
      [ -f "$instance" ] || continue
      jsonschema validate "$schema" "$instance" --default-dialect https://json-schema.org/draft/2020-12/schema --verbose
    done
  done
done

for schema_dir in "$output/schema_negative"/*; do
  [ -d "$schema_dir" ] || continue
  schema="$output/$(basename "$schema_dir").schema.json"
  for instance in "$schema_dir"/*.json; do
    [ -f "$instance" ] || continue
    if jsonschema validate "$schema" "$instance" --default-dialect https://json-schema.org/draft/2020-12/schema --verbose; then
      echo "expected Sourcemeta rejection for $instance" >&2
      exit 1
    fi
  done
done

printf '%s\n' "owner-session-flow-v1 Sourcemeta 16.10.0 fixtures passed; static instance examples were not generated from schemas."
