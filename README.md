# Contratos propietarios de OpenComerix

Este repositorio contiene contratos versionados para productores y consumidores. Las decisiones de arquitectura y dominio se mantienen en la documentación del launcher.

- `openapi/pos-sales-v1.yaml` y `openapi/pos-sync-v1.json`: contratos existentes de ventas y sincronización.
- `openapi/identity-onboarding-v1.yaml`: superficie v1 de identidad, sesiones, MFA, dispositivos, onboarding de organización y contexto.
- `openapi/identity-onboarding-v2.yaml` y `openapi/identity-gateway-delegation-v2.yaml`: contratos candidatos v2.0.2. La lista de membresías acepta `limit` opcional (default 50, 1–100) y `cursor` opaco (máximo 2048 caracteres); no ofrece `sort` ni filtros. En una continuación, si se omite `limit`, rige el límite firmado en el cursor.
- `openapi/problem-details-v1.schema.json` y `errors/error-catalog-v1.json`: formato común de errores y catálogo versionado.
- `errors/error-catalog-v2.json`: catálogo aditivo que conserva las 18 entradas v1 y agrega `tenancy_invalid_cursor` para respuestas 400 restringidas.
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

## Contratos sucesores del corte inicial del Propietario (PF1-06A-R1)

`openapi/identity-onboarding-v2.yaml` y `openapi/identity-gateway-delegation-v2.yaml` son contratos aditivos versionados, sin alterar H1, H1A ni PF1-06A v1. El corte contempla exclusivamente el onboarding inicial del Propietario; no incluye las operaciones generales `requestDeviceApproval` ni `decideDeviceApproval`.

La revisión 2.0.1 aclara en H1 v2 que la PWA presenta cookie restringida y CSRF para MFA, mientras que el JWT de servicio se añade únicamente en el salto privado. Sustituye la descripción ambigua de 2.0.0 sin mover sus tags ni cambiar la seguridad declarada de las operaciones.

H1 v2 describe la API publica del gateway, no el salto privado a identity-tenancy. Sus 19 operaciones externas nunca exigen `serviceToService` ni `delegatedBearer` a la PWA: registro, verificacion de email e inicio de sesion son publicos; las operaciones autenticadas usan la cookie opaca y CSRF segun el metodo. `completeMfaChallenge` usa la cookie restringida y CSRF, sin JWT interno del navegador. Las dos rutas de material de correo mantienen su seguridad interna separada.

La matriz privada `identity-gateway-delegation-policy-v2.json` clasifica exactamente cuatro operaciones service-only (registro, verificacion de email, login y `completeMfaChallenge`), quince operaciones delegated y excluye las dos rutas internas. En el salto privado, completar MFA requiere el JWT de servicio del gateway junto con la misma cookie restringida, CSRF y el desafio vinculado a esa sesion; consume el desafio una vez y rota la cookie. El JWT de servicio aislado no completa MFA ni autoriza operaciones autenticadas. Para las otras quince operaciones, el gateway presenta un delegado y la cookie; identity-tenancy revalida la sesion y la autorizacion.

La delegacion privada v2 conserva las reglas de PF1-06A v1: sesion y contexto comprobados en servidor, claims tenant solo cuando corresponden, dispositivo aprobado y coincidente para contexto tenant, y branch_id solo cuando coincide con el contexto verificado. El policy v2 inventaria los 25 fixtures sinteticos (cuatro contextos positivos, 17 negativos y cuatro fixtures publicados, con las referencias de contexto deduplicadas). Los validadores cotejan inventarios, seguridad declarada, contextos y vinculos de claims; los schemas solo validan forma y no demuestran firmas JWT ni comportamiento de produccion.

CI valida ambos OpenAPI v2 con Redocly CLI 2.53.3 sin advertencias, genera bundles dereferenciados y ejecuta los gates de cobertura REST, matriz y autocontroles. El validador comprueba por separado la seguridad publica de H1 v2 (cookie/CSRF y ausencia de JWT internos) y la clasificacion privada 4+15+2. Sourcemeta JSON Schema CLI 16.10.0 valida schemas y fixtures v2 positivos y rechaza los fixtures negativos. La regresion completa de H1, H1A y PF1-06A v1 se conserva. PF1-06A-R1 no implementa endpoints; PF1-06B0 y PF1-06B permanecen fuera de esta tanda y requieren auditoria/publicacion separadas.

## Compatibilidad

- Se pueden agregar campos opcionales sin cambiar la versión principal.
- No se eliminan campos ni se cambia su significado dentro de una versión.
- Un cambio incompatible requiere una nueva versión contractual aprobada.
- Los consumidores ignoran campos desconocidos cuando corresponda al formato.

## Autenticacion interna de servicios H1A

`openapi/identity-internal-auth-v1.yaml` es el contrato aditivo e independiente para las rutas privadas de `identity-tenancy`; no modifica H1. Se usa solo entre workloads en la red privada, nunca desde un navegador o gateway publico. TLS es obligatorio salvo en desarrollo y pruebas locales aislados.

`POST /internal/identity/oauth/token` usa OAuth 2.0 `client_credentials` con credenciales HTTP Basic propias de cada workload. El servidor asigna la audiencia desde una allowlist por cliente; inicialmente `notifications` recibe solo `identity-tenancy.delivery-material`. Los JWT ES256 duran como maximo 300 segundos y no se emite refresh token. Los errores usan JSON OAuth en lugar de Problem Details; las respuestas y errores no se cachean ni revelan secretos o la existencia de un cliente.

`GET /internal/identity/jwks.json` no requiere bearer dentro de la red privada, para evitar una dependencia circular. Publica solo claves publicas EC P-256/ES256: la actual y la anterior unicamente durante la ventana aprobada de rotacion, limitada a 300 segundos. La anterior desaparece del JWKS al vencer su aceptacion. La cache maxima es 30 segundos. Los consumidores validan firma, alg, kid, issuer, audience, type, expiracion y caller; el token no reemplaza permisos ni autorizacion del dominio.

El OpenAPI publica nueve ejemplos positivos ligados exhaustivamente por operacion, request/respuesta, status, media type y nombre a sus fixtures versionados. El gate cubre ademas los cinco ejemplos inline restantes de headers y Problem Details, sin aceptar ejemplos nuevos o faltantes fuera del inventario. Sourcemeta valida los catorce positivos. Los dos controles negativos (`token-request-missing-grant-type.json` y `jwks-private-key-rejected.json`) permanecen fuera de `examples` y Sourcemeta comprueba que cada uno viola su schema exacto. El preparador falla si un ejemplo se mueve de ruta/status/schema, cambia su contenido, queda sin cobertura o se publica accidentalmente un negativo. Los autocontroles ejercitan cada rechazo. Los ejemplos positivos son sinteticos: no contienen credenciales reales, claves privadas ni JWT operativos.

`TokenResponse.access_token` es obligatorio y se devuelve como campo de respuesta; el fixture usa solo un JWT sintético, no un token operativo. Este contrato no implementa rutas ni adaptadores. SOL audita y publica H1A; PF1-05B depende de esa publicación.

## Delegacion privada gateway-identity (PF1-06A)

`openapi/identity-gateway-delegation-v1.yaml` agrega el endpoint privado de solicitud de delegacion; H1 y H1A permanecen inmutables. El endpoint requiere simultaneamente JWT de servicio de `gateway-bff` con audiencia fija `identity-tenancy.gateway` y la cookie opaca de sesion por HTTPS privado. Solo las tres operaciones previas a sesion y esta solicitud aceptan esa capacidad de servicio. Las otras 18 operaciones H1 externas requieren delegado; las dos rutas internas H1 de material de correo se excluyen. `gateway-bff` usa su propia credencial `client_credentials`; identity-tenancy asigna la audiencia desde la allowlist y el cliente no la elige.

Identity-tenancy comprueba la sesion vigente antes de emitir un JWT delegado ES256, `type=delegated`, `caller=gateway-bff`, audiencia `identity-tenancy.user-api` y vigencia maxima de 60 segundos. Una sesion restringida no incluye claims tenant. El gateway no firma ni expone tokens a la PWA; el delegado no contiene cookie y no sustituye autorizacion. El servicio vuelve a validar sesion y autorizacion por operacion. No hay cache de delegaciones entre requests.

`openapi/identity-gateway-delegation-policy-v1.json` inventaria method, path y operationId de las 21 operaciones externas (3 service + 18 delegated) y las dos exclusiones internas. El gate compara el inventario completo con H1 y falla ante omisiones, sobrantes o cambios. Tambien coteja los ejemplos OpenAPI publicados con el inventario y sus fixtures. Los fixtures usan el issuer URI sintetico de `.env.example`; cada ambiente configura su propio issuer. Los claims usan `session_id`, `authenticated_at` y `security_version` como cadenas, y exigen `jti` UUIDv4 canonico. JSON Schema comprueba forma; el validador compara issuer configurado, sesion, audiencia/tipo, vigencias y ausencia de contexto tenant restringido. Ninguno verifica firmas JWT: corresponde a pruebas del servicio en PF1-06B.

CI ejecuta Redocly CLI 2.53.3 para lint sin advertencias y Sourcemeta JSON Schema CLI 16.10.0 para los ejemplos/fixtures. Autocontroles negativos cubren issuer no URI o contradictorio, jti invalido, nombres/tipos incompatibles de claims, audiencia/tipo incorrectos, sesion ausente o contradictoria, claims tenant restringidos, ejemplo no inventariado y alteracion de matriz.

## PF1-06A-R2 — paginación contractual de membresías

Los cambios candidatos elevan ambos OpenAPI v2 a `2.0.2`; H1, H1A y PF1-06A v1 permanecen intactos. `GET /tenancy/memberships` lista membresías de la cuenta autenticada y no concede autoridad tenant. El cursor usa keyset `created_at ASC, membership_id ASC`, HMAC-SHA-256 y vínculo con la cuenta; vence como máximo a los 30 minutos. Un cursor alterado, vencido, de otra cuenta o con una versión/clave desconocida responde `400 tenancy_invalid_cursor`; un límite mal formado responde `400 identity_invalid_request`.

El gate candidate-only valida el bundle real Redocly, los dos ejemplos Problem Details y la aditividad del catálogo: conserva exactamente las 18 entradas v1 y agrega una entrada sin parámetros permitidos. Sourcemeta 16.10.0 valida cinco fixtures de query positivos y rechaza cuatro negativos. La firma, rotación de clave, vencimiento, vínculo con cuenta y continuación del límite se probarán en PF1-06B0; los fixtures y JSON Schema solo acreditan forma contractual y no demuestran criptografía.
