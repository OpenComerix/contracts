# Contratos propietarios de OpenComerix

Este repositorio contiene contratos versionados para productores y consumidores. Las decisiones de arquitectura y dominio se mantienen en la documentación del launcher.

- `openapi/pos-sales-v1.yaml` y `openapi/pos-sync-v1.json`: contratos existentes de ventas y sincronización.
- `openapi/identity-onboarding-v1.yaml`: superficie v1 de identidad, sesiones, MFA, dispositivos, onboarding de organización y contexto.
- `openapi/problem-details-v1.schema.json` y `errors/error-catalog-v1.json`: formato común de errores y catálogo versionado.
- `openapi/device-proof-v1-vectors.json` y su schema: vector positivo ECDSA P-256/SHA-256 y negativos de firma, nonce y vinculaciones; JSON Schema valida forma, el verificador local valida el vector criptográfico positivo y los cambios de nonce/firma.
- `commands/`: sobres y contratos para emails dirigidos de verificación y autoaprobación del dispositivo del Propietario; ni comandos ni resultados contienen destinatario, token, URL, cuerpo o respuesta cruda del proveedor.
- `events/`: sobres y schemas versionados de eventos de dominio.

## Validación en CI

El pipeline valida:

- JSON y referencias locales de `events`, `commands`, `openapi` y `errors` con `scripts/validate-contract-refs.mjs`;
- los dos OpenAPI existentes con Redocly CLI 2.53.3, y el OpenAPI de identidad con la misma versión exigiendo cero advertencias;
- bundle dereferenciado del OpenAPI nuevo y fixtures REST estaticos versionados en `openapi/identity-rest-fixtures-v1.json`: 23 operaciones ligadas a metodo, ruta, status y schema; 23 errores Problem Details, 22 exitos con body y un 204 sin body; las 17 operaciones con request body tienen requests validos e invalidos publicados;
- los 11 schemas existentes de `events` y los nueve schemas JSON de F1-01 (seis de `commands`, Problem Details, catálogo de errores y vector criptográfico) contra Draft 2020-12 con Sourcemeta JSON Schema CLI 16.10.0;
- schema adicional del vector criptográfico y el catálogo contra sus schemas;
- `errors/error-catalog-v1.json` contra su schema;
- vector de prueba de dispositivo contra su schema y verificación ECDSA con `node:crypto`; los negativos de propósito/dispositivo/organización se comprueban como vínculos server-side, no como criptografía;
- el ejemplo del comando y los dos ejemplos de resultados contra sus schemas y sobres referenciados;
- los ejemplos del comando de autoaprobación del dispositivo, su aceptación durable y su fallo reintentable contra los schemas y sobres referenciados;
- controles del OpenAPI de identidad, el catálogo de errores, ejemplos Problem Details en línea, claves JSON duplicadas y controles negativos reales del validador de solo lectura; este carga obligatoriamente el ejemplo de aprobación de dispositivo y comprueba que `organization_id` del envelope coincida con el del payload.

El job OpenAPI comprueba cobertura de fixtures estaticos y extrae los schemas exactos del bundle dereferenciado para el job Sourcemeta JSON Schema CLI 16.10.0. Sourcemeta valida los 79 casos: 62 instancias validas (requests, exitos y errores Problem Details) y 17 requests invalidos que deben rechazarse. El control tambien comprueba status, codigo registrado, Problem Details y 204 sin body. Los ejemplos no se generan desde schemas. Los tests del servicio F1-04 aun deben demostrar rechazo criptografico y transiciones reales; JSON Schema no demuestra criptografia. F1-01 no queda completa ni aceptada hasta auditoria de SOL. Este repositorio no implementa servicios ni infraestructura.

Las versiones de Node y herramientas quedan fijadas en `.node-version` y `.gitlab-ci.yml`. El launcher ofrece una prueba de regresión para los contratos que ya descubre.

## Compatibilidad

- Se pueden agregar campos opcionales sin cambiar la versión principal.
- No se eliminan campos ni se cambia su significado dentro de una versión.
- Un cambio incompatible requiere una nueva versión contractual aprobada.
- Los consumidores ignoran campos desconocidos cuando corresponda al formato.
