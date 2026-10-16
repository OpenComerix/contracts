#!/bin/sh
set -eu
output=${1:?schema artifacts directory required}
schema=identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json
selection=catalog/http/shared/v1/catalog-history-recovery-v1.schema.json
positive=0
negative=0
for definition in IssueRequest Grant VerifyRequest VerifyResponse RenewRequest RevokeRequest RevokeResponse PermissionCatalog; do
  jsonschema validate "$schema" "$output/$definition/valid.json" --entrypoint "/\$defs/$definition" --resolve "$selection" --format-assertion
  positive=$((positive + 1))
  for instance in "$output/$definition"/invalid-*.json; do
    [ -f "$instance" ] || continue
    if jsonschema validate "$schema" "$instance" --entrypoint "/\$defs/$definition" --resolve "$selection" --format-assertion; then
      echo "Invalid payload unexpectedly accepted: $instance" >&2
      exit 1
    fi
    negative=$((negative + 1))
  done
done
[ "$positive" -eq 8 ]
[ "$negative" -eq 14 ]
echo "Recovery schema gate passed: $positive positive / $negative negative."
