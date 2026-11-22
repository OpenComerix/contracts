#!/bin/sh
set -eu

batch=observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json
invalid=observability/http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json
problem=common/http/shared/v3/problem-details-v3.schema.json
csrf=openapi/csrf-v3-problem.schema.json
fixtures=observability/fixtures/pwa-telemetry/v1

jsonschema metaschema "$batch" "$invalid" --verbose
jsonschema test "$fixtures/batch-tests.json" --resolve "$batch"
jsonschema test "$fixtures/invalid-batch-problem-tests.json" "$fixtures/csrf-problem-tests.json" --format-assertion --resolve "$invalid" --resolve "$problem" --resolve "$csrf"
