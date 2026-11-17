#!/bin/sh
set -eu
dir=${1:?prepared IANA fixture directory required}
[ "$#" -eq 1 ]
[ "$(jsonschema --version)" = '16.10.0' ]
jsonschema metaschema "$dir/schema.json"
jsonschema validate "$dir/schema.json" "$dir/instances.json" --format-assertion
if output=$(jsonschema validate "$dir/schema.json" "$dir/invalid.json" --format-assertion 2>&1); then
  echo 'IANA_INVALID_CONTROL_ACCEPTED' >&2
  exit 1
else
  code=$?
  [ "$code" -eq 2 ] || { printf '%s\n' "$output" >&2; exit 1; }
  case "$output" in
    *'Schema validation failure'*) ;;
    *) printf '%s\n' "$output" >&2; exit 1 ;;
  esac
fi
echo 'IANA Sourcemeta 16.10.0: batch validated, invalid control rejected; runtime_demonstrated=false'
