# Observabilidad

## F1-OBS-PWA-CONTRATO — Ingestión PWA v1

[OpenAPI](http/public/v1/pwa-telemetry-v1.yaml) · [Schema del lote](http/shared/v1/pwa-telemetry-batch-v1.schema.json) · [Catálogo de errores](errors/v1/pwa-telemetry-errors-v1.json) · [Fixtures](fixtures/pwa-telemetry/v1/batch-tests.json)

Gateway admite `POST /api/v1/telemetry/pwa` en el mismo origen HTTPS, con sesión vigente, Origin exacto y token CSRF vinculado a esa sesión. Cada lote tiene hasta 16 muestras y 8 KiB UTF-8. El presupuesto de admisión separado del tráfico comercial permite seis lotes por minuto por sesión y 120 por instancia de Gateway. Gateway asigna servicio, ambiente y timestamp. Un `204` confirma la admisión del lote para diagnóstico acotado.

| Métrica | Población y unidad |
| --- | --- |
| `pos_ready` | Tiempo hasta POS utilizable en una carga con sesión vigente. Milisegundos enteros. |
| `catalog_search` | Tiempo desde el despacho de una búsqueda hasta que el resultado queda disponible para la interfaz. Milisegundos enteros. |
| `sale_confirmation` | Tiempo desde el despacho de la confirmación hasta su resultado visible. Milisegundos enteros. |
| `web_lcp`, `web_inp` | LCP e INP cuando el navegador ofrezca la medición. Milisegundos enteros. |
| `web_cls` | CLS adimensional cuando esté disponible. |
| `pos_load_failure`, `pos_update_failure` | Una ocurrencia de fallo en carga o actualización, respectivamente. Valor 1. |

Web-pos mantiene un buffer acotado en memoria y descarta muestras al quedar sin sesión, cambiar de contexto, perder el transporte o exceder su presupuesto. El lote contiene únicamente el nombre y el valor de cada muestra. El backend dueño conserva el conteo de efectos comerciales. Alloy conserva las credenciales del proveedor. El fallo de la telemetría conserva el resultado y el camino comercial.

El [perfil 400](http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json) usa un título fijo y una referencia diagnóstica. El 403 reutiliza el [perfil CSRF v3 publicado](../openapi/csrf-v3-problem.schema.json). Ambos rechazan los campos `detail`, `errors` y `correlation_id`. El catálogo clasifica el lote inválido como `warning`.

Validación de la fuente con Redocly 2.53.3 y JSON Schema CLI 16.10.0.

```text
node scripts/validate-redocly-no-warnings.mjs observability/http/public/v1/pwa-telemetry-v1.yaml
jsonschema metaschema observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json
jsonschema test observability/fixtures/pwa-telemetry/v1/batch-tests.json --resolve observability/http/shared/v1/pwa-telemetry-batch-v1.schema.json
jsonschema test observability/fixtures/pwa-telemetry/v1/*-problem-tests.json --resolve observability/http/shared/v1/pwa-telemetry-invalid-batch-v1.schema.json --resolve common/http/shared/v3/problem-details-v3.schema.json --resolve openapi/csrf-v3-problem.schema.json
node --test test/observability/pwa-telemetry-v1.test.mjs
```

La admisión registra las tres raíces como `active` y las fija al commit inmutable de la fuente A. El consumo requiere verificar la CI completa de la revisión conjunta por SHA y ref exactos. Las dependencias semánticas incluyen el [catálogo común v11](../common/errors/v11/error-catalog-v11.json), las suites nativas y los ejemplos CSRF publicados que estas leen. La prueba de navegador conectado, la validación efectiva de sesión, los límites en bytes y los presupuestos temporales pertenecen al corte runtime.
