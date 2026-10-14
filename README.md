# Contratos propietarios de OpenComerix

Este repositorio contiene contratos versionados para productores y consumidores. Las decisiones de arquitectura y dominio se mantienen en la documentación del launcher.

La organización por dominio, superficie y versión, los manifiestos/locks de consumidores y el análisis de impacto se describen en [el registro contractual](registry/README.md). Esta tanda añade metadatos y gates; preserva rutas, bytes y validadores anteriores. Los exports nuevos permanecen como candidatos locales hasta publicación autorizada.

- `openapi/pos-sales-v1.yaml` y `openapi/pos-sync-v1.json`: contratos existentes de ventas y sincronización.
- `openapi/identity-onboarding-v1.yaml`: superficie v1 de identidad, sesiones, MFA, dispositivos, onboarding de organización y contexto.
- `openapi/identity-onboarding-v2.yaml` y `openapi/identity-gateway-delegation-v2.yaml`: contratos sucesores v2 de identidad. La lista de membresías acepta `limit` opcional (default 50, 1–100) y `cursor` opaco (máximo 2048 caracteres); no ofrece `sort` ni filtros. En una continuación, si se omite `limit`, rige el límite firmado en el cursor.
- `openapi/problem-details-v1.schema.json` y `errors/error-catalog-v1.json`: formato común de errores y catálogo versionado.
- `errors/error-catalog-v2.json`: catálogo aditivo que conserva las 18 entradas v1 y agrega `tenancy_invalid_cursor` para respuestas 400 restringidas.
- `errors/error-catalog-v3.json`: conserva las 19 entradas v2 y agrega `gateway_csrf_invalid`, error público 403 del gateway sin parámetros.
- `openapi/device-proof-v1-vectors.json` y su schema: vector positivo ECDSA P-256/SHA-256 y negativos de firma, nonce y vinculaciones; JSON Schema valida forma, el verificador local valida el vector criptográfico positivo y los cambios de nonce/firma.
- `commands/`: sobres y contratos para emails dirigidos de verificación y autoaprobación del dispositivo del Propietario; ni comandos ni resultados contienen destinatario, token, URL, cuerpo o respuesta cruda del proveedor.
- `events/`: sobres y schemas versionados de eventos de dominio.

## Organización por dominio

Los nuevos contratos se ubican físicamente en su dominio y se separan por transporte, superficie y versión mayor. Los artefactos publicados conservan sus rutas históricas. Convención y responsabilidades en [la guía contractual](../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14).

Mapas: [catalog](catalog/README.md), [identity](identity/README.md) y [common](common/README.md). Los README distinguen candidatos y contratos admitidos; los índices y locks conservan su procedencia. Fixtures por dominio/capacidad/versión; herramientas por capacidad bajo scripts y tests externos bajo test. El gate de layout y el discovery de referencias reutilizan el registro existente.

## F1-07B — Seguridad/base de catálogo (candidatos)

`identity/http/private/v1/identity-catalog-authority-v1.yaml` 1.0.0 materializa únicamente los dos puertos privados de identidad. Política/permisos de las 25 operaciones aprobadas en `catalog/http/shared/v1/catalog-security-policy-v1.json`; sus OpenAPI públicos/privados completos corresponden a C/D. Tipos comunes en `catalog/http/shared/v1/catalog-common-v1.schema.json`, objeto de siete campos en `catalog/http/shared/v1/catalog-request-v1.schema.json`. `common/errors/v6/error-catalog-v6.json` conserva íntegramente las 24 entradas v5 y añade 25; `common/http/shared/v3/problem-details-v3.schema.json` conserva v2 y admite 406/413/415.

Los nuevos archivos son candidatos locales: no están admitidos por los manifests/locks actuales ni tienen una procedencia publicada ficticia. Registry/planned, exports y consumidores vigentes permanecen intactos. F1-07G fija commits inmutables/publicación/admisión después de completar los cortes; F1-07F integra nuevos gates en CI. El productor real de identidad requiere otra tanda posterior antes de F1-08. No modificar contratos H2 para habilitar catálogo.

Validación local con Node24.21.0 y dependencias congeladas del repositorio:

```text
pnpm install --frozen-lockfile
node --test test/catalog/*.test.mjs
npx --yes @redocly/cli@2.53.3 lint identity/http/private/v1/identity-catalog-authority-v1.yaml
node scripts/validate-redocly-no-warnings.mjs identity/http/private/v1/identity-catalog-authority-v1.yaml
npx --yes @redocly/cli@2.53.3 bundle identity/http/private/v1/identity-catalog-authority-v1.yaml --dereferenced --ext json --output /tmp/identity-catalog-authority-v1.bundle.json
node scripts/catalog/validate-security-v1.mjs /tmp/identity-catalog-authority-v1.bundle.json .ci-artifacts/catalog-security-v1 --self-test
jsonschema metaschema catalog/http/shared/v1/catalog-common-v1.schema.json catalog/http/shared/v1/catalog-request-v1.schema.json identity/http/private/v1/identity-catalog-authority-v1.schema.json common/http/shared/v3/problem-details-v3.schema.json common/errors/v6/error-catalog-v6.schema.json
jsonschema validate common/errors/v6/error-catalog-v6.schema.json common/errors/v6/error-catalog-v6.json --format-assertion
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-security-v1
```

Usar directorio de extracción nuevo; no sobrescribir evidencia previa. Sourcemeta16.10.0 exige metaschemas y valida cada positivo y negativo contra el schema exacto. Un negativo cuenta únicamente por rechazo de instancia (exit2 y diagnóstico de validación), no por archivo ausente, parsing, referencia rota o error de herramienta. El inventario compara ambos sentidos de los ejemplos y todos los archivos de fixture; los autocontroles comprueban seguridad/matriz/compatibilidad.

`scripts/catalog/security-v1-common.mjs` contiene helpers de prueba, no autorización runtime ni un cliente SDK. El serializer JCS sigue [RFC8785](https://www.rfc-editor.org/rfc/rfc8785): orden UTF-16 y serialización directa de claves (también numéricas), Unicode válido y números finitos. El helper de metadatos `canonical` no se reutiliza como JCS. Normalización de nombres/SKU/decimales ocurre antes del serializer; validar escala antes de quitar ceros. El body debe haber pasado el schema específico y normalización C/D: la forma genérica de B no acredita CRUD. GET usa body/clave null, query conserva solo parámetros presentes como cadenas y cursor opaco; no expandir defaults. El parser compartido rechaza claves JSON duplicadas antes de JCS.

Claims/contextos y JWT de ejemplo son sintéticos. Los gates prueban forma y coherencia de vínculo/autoridad modelada; no firma ES256, HMAC, credenciales vigentes reales, revocación, cursor firmado, SQL, fairness ni atomicidad distribuida. Medir vigencia desde antes del envío con reloj monotónico, descontar red/waits; no mantener locks durante consulta a identidad, ni cachear decisión/replay. Step-up únicamente para cambio fiscal de producto ya activo. Ningún token, cookie/hash, señal, tenant elegido o versión numérica de identidad se vuelve autoridad pública por esta documentación.

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

- Agregar campos opcionales requiere comprobar compatibilidad estructural y semántica con los consumidores admitidos; un objeto estricto puede exigir una nueva versión principal.
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

Los tags `identity-onboarding-v2.0.2` e `identity-gateway-delegation-v2.0.2` publicaron los cambios de paginación; H1, H1A y PF1-06A v1 permanecen intactos. `GET /tenancy/memberships` lista membresías de la cuenta autenticada y no concede autoridad tenant. El cursor usa keyset `created_at ASC, membership_id ASC`, HMAC-SHA-256 y vínculo con la cuenta; vence como máximo a los 30 minutos. Un cursor alterado, vencido, de otra cuenta o con una versión/clave desconocida responde `400 tenancy_invalid_cursor`; un límite mal formado responde `400 identity_invalid_request`.

El gate candidate-only valida el bundle real Redocly, los dos ejemplos Problem Details y la aditividad del catálogo: conserva exactamente las 18 entradas v1 y agrega una entrada sin parámetros permitidos. Sourcemeta 16.10.0 valida cinco fixtures de query positivos y rechaza cuatro negativos. La firma, rotación de clave, vencimiento, vínculo con cuenta y continuación del límite se probarán en PF1-06B0; los fixtures y JSON Schema solo acreditan forma contractual y no demuestran criptografía.

## PF1-06A-R3 — entrega contractual de CSRF

Los OpenAPI candidatos v2.0.3 separan el contrato público del gateway del salto privado a identity-tenancy. El gateway valida Origin exacto y un token HMAC vinculado a la cookie vigente; la PWA lo conserva solo en memoria. Se documenta `X-CSRF-Token` en `createSession` 200, `GET /identity/session` 200 y las respuestas 200/201 que rotan cookie de MFA, posesión de dispositivo, autoaprobación del Propietario y bootstrap. Todas esas respuestas son `no-store`; logout expira la cookie sin emitir token nuevo. Las 13 mutaciones autenticadas requieren cookie, CSRF y Origin permitido y pueden devolver Problem Details 403 `gateway_csrf_invalid` sin parámetros ni detalle sensible. `createRegisteredDeviceAuthenticationChallenge` conserva su clasificación privada delegated y ahora declara CSRF en la seguridad pública.

El token CSRF y Origin se validan en el gateway antes de invocar identidad. El JWT de servicio acredita el workload únicamente; no es una atestación CSRF y el contrato privado no introduce un header de validación. Los bundles y fixtures comprueban forma, ubicación, status, catálogo y matriz; no prueban el HMAC, el vínculo criptográfico con sesión ni Origin dinámicamente. Esas pruebas corresponden al gateway en PF1-06C. Sourcemeta valida el catálogo v3 y el Problem Details sintético positivo y rechaza el negativo que intenta incluir detalle sensible.

## PF1-06A-R4 — clave candidata del desafío de registro

Los OpenAPI candidatos v2.0.4 requieren `public_key` (JWK pública EC P-256 mínima) al solicitar el desafío de registro. La PWA genera primero el par WebCrypto, conserva la clave privada no exportable y envía la pública candidata; `POST /identity/devices` debe presentar la misma JWK. Identity-tenancy compara la clave recibida con la candidata persistida antes de verificar la firma. Se conservan el mensaje firmado, ECDSA P-256/SHA-256, firma raw `r || s`, vencimiento y consumo único del desafío.

El gate usa el bundle dereferenciado Redocly real para comprobar que ambos requests reutilizan exactamente `DevicePublicJwk`, que los ejemplos publicados comparten la misma clave y que los fixtures negativos cubren clave ausente, miembro privado, forma inválida y claves discordantes entre solicitudes. Sourcemeta valida la estructura de los requests; el gate semántico verifica el vínculo entre ambas solicitudes. Estos checks contractuales no ejecutan la verificación criptográfica dinámica de la firma, que corresponde a pruebas del servicio en PF1-06B. La matriz privada permanece en cuatro operaciones service-only, quince delegated y dos rutas internas excluidas.

## PF1-06A-R5 — replay privado de respuestas que rotan sesión

Los OpenAPI candidatos avanzan juntos a 2.0.5. Las cuatro operaciones públicas que rotan cookie (`proveRegisteredDevicePossession`, `confirmOwnerDeviceSelfApproval`, `createInitialOrganization` y `selectActiveOrganization`) declaran `Idempotency-Replayed` en sus status/body existentes; `selectActiveOrganization` también entrega cookie, `X-CSRF-Token` y `Cache-Control: no-store`. Las cuatro rotaciones y los dos desafíos expresan `Idempotency-Replayed` como booleano en OpenAPI; el valor serializado en HTTP es `false` o `true`. El contrato de logout exige una `Idempotency-Key` UUIDv7 y separa el 204 idempotente de limpieza local tras un rechazo explícito de sesión inválida; cookie ausente, Origin/CSRF inválido o indisponibilidad no se convierten en éxito.

`createDeviceRegistrationChallenge` y `createRegisteredDeviceAuthenticationChallenge` documentan que una repetición exacta conserva el nonce y vencimiento originales de cinco minutos, aun vencidos. No extiende ni crea el desafío de nuevo; una clave diferente solicita uno nuevo. El resultado solo se entrega por el canal autenticado y no va a logs ni eventos.

La única recuperación permitida con la cookie anterior es el POST privado `session-rotation-replays`: exige a la vez JWT service de `gateway-bff`, cookie anterior y la misma `Idempotency-Key` UUIDv7 de la operación rotativa, además del `operation_id` y el `original_request` exactos. Method/path se derivan de una allowlist de cuatro operationId. El OpenAPI separa dos esquemas para el mismo nombre de cookie: la delegación ordinaria exige la vigente y el replay privado exige la anterior; esta última no autentica otras operaciones. Un 200 privado `no-store`/`no-cache` devuelve status/body públicos originales y `session_credential` únicamente al gateway autenticado. Su forma contractual es base64url canónico sin padding de 32 bytes (43 caracteres), pero la forma no demuestra entropía: runtime debe generar esos bytes mediante CSPRNG. Los cuatro fixtures usan el marcador sintético `SYNTHETIC-NON-FUNCTIONAL-000000000000000004`, que no es una credencial operativa. No repite efectos, no extiende vencimientos y falla si sesión, autorización, aprobación o credencial ya cambiaron. Conflicto de clave/en curso usa los códigos catalogados existentes; las respuestas de autenticación no revelan cuál precondición falló. La cookie anterior nunca autoriza delegación ordinaria.

El manifiesto R5 inventaría exhaustivamente operaciones y fixtures positivos/negativos, incluidos el rechazo de credencial mal formada y los seis headers de replay booleanos. Sus validadores comparan OpenAPI y ejemplos contra bundles dereferenciados reales; Sourcemeta valida schemas extraídos de esos bundles y fixtures sintéticos. Las credenciales, tokens y firmas de los fixtures son marcadores no funcionales, nunca secretos ni JWT operativos. Estos gates verifican la forma, el mapeo de requests/responses, las reglas documentadas y la cobertura de fixtures. No demuestran la entropía del material, el HMAC de idempotencia, el vínculo criptográfico de cookie, el estado actual de sesión/autorización ni el almacenamiento y recuperación seguros en ejecución; esas garantías corresponden a la implementación identity-tenancy y sus pruebas.

## PF1-06A-R6 — señal privada de cliente (2.0.6)

R6 versiona únicamente `identity-gateway-delegation-v2.yaml` a 2.0.6. `identity-onboarding-v2.yaml` permanece en 2.0.5; H1, H1A, PF1-06A v1, sus tags y operationId no cambian. La extensión OpenAPI privada enlaza el componente `OCClientSignal` con la matriz privada existente: exactamente cuatro operaciones service-only y quince delegated. Las dos rutas de material de notifications están excluidas.

`X-OC-Client-Signal` es obligatoria en esas 19 llamadas gateway→identity. Su forma es `v1.` más HMAC-SHA-256 de 32 bytes codificado en base64url canónico sin padding. gateway-bff deriva la señal del origen público verificado: IPv4 completo o prefijo IPv6 /64, con separación de dominio y una clave CSPRNG exclusiva de al menos 32 bytes. El gateway elimina copias que aporte el navegador. identity-tenancy autentica primero el JWT interno y luego valida solamente la sintaxis; no comparte ni verifica la clave HMAC y no sustituye la señal por `X-Forwarded-*`. Ausencia, duplicado o formato inválido falla cerrado con `identity_invalid_request` genérico. La señal no otorga autoridad.

Los límites son por propósito y configurables por ambiente: 10 por cuenta y 100 por señal en ventanas separadas de 15 minutos; no se configuran por organización. PF1-06C implementará derivación desde un ingress explícitamente confiable. Los 11 casos sintéticos y el gate verifican forma, cobertura, exclusiones y ausencia en el contrato público. No demuestran HMAC, detección real de IP ni resistencia a spoofing en runtime.

CI conserva la regresión pública v2.0.5 y R5, valida el privado v2.0.6, usa bundles Redocly dereferenciados reales para el gate R6 y Sourcemeta JSON Schema 16.10.0 para el manifiesto de fixtures.

## Catálogo candidato v4 de errores de identidad

`errors/error-catalog-v4.json` conserva sin cambios las 20 entradas de v3 y agrega tres códigos precisos: `identity_access_denied` (403), `identity_device_proof_invalid` (422) e `identity_reauthentication_required` (403). Así, la denegación de un permiso no se presenta como falta de aprobación del dispositivo, una prueba criptográfica inválida no se confunde con el estado del dispositivo y una reautenticación pendiente no se describe como conflicto de versión. El OpenAPI público candidato 2.0.6 agrega `403 identity_mfa_required` a `GET /tenancy/memberships`, comprobado sobre el bundle real; el OpenAPI privado permanece en 2.0.6. Los OpenAPI publicados y sus tags no se modifican. Catálogo y OpenAPI candidatos requieren publicación y pipeline antes de aceptar PF1-06B2. CI valida el schema, la aditividad exacta y los controles negativos.

## PF1-06A-R7 — timeout público del gateway (candidata 2.0.7)

La candidata pública `identity-onboarding-v2.yaml` pasa a 2.0.7 y declara `gateway_deadline_exceeded` como Problem Details público, status 504 y `retryable: true` en las 19 operaciones externas del corte del Propietario. Las dos rutas internas de entrega de material de notifications siguen excluidas. `platform_dependency_unavailable` mantiene su único status 503.

`problem-details-v2.schema.json` sucede de forma aditiva al schema v1: conserva su estructura y agrega 504. `error-catalog-v5.json` conserva exactamente las 23 entradas v4 en el mismo orden y agrega únicamente `gateway_deadline_exceeded`. Los schemas, catálogos y OpenAPI históricos, H1 v1, H1A y el OpenAPI privado v2.0.6 permanecen sin cambios. El gate R7 valida un bundle Redocly dereferenciado real; sus controles negativos cubren las 19 respuestas, las exclusiones, el ejemplo, la aditividad y el comportamiento 503. Sourcemeta 16.10.0 valida schemas y fixtures en CI.

## PF1-06A-R8 — compatibilidad contractual del recorrido OWNER (candidatas 2.0.8 / 2.0.7)

El OpenAPI público candidato pasa a 2.0.8 y el privado a 2.0.7. Login y MFA dejan la sesión restricted sin autoridad tenant; registrar una cuenta no vincula ni activa la sesión. La prueba del dispositivo siempre rota: sin destino explícito conserva restricted, y con destino activa solo después de revalidar membresía/version, MFA, aprobación específica, permisos y scopes. `renew_session` no cambia de tenant. Selección permite restricted elegible o active y devuelve el contexto posterior. La confirmación OWNER vincula el dispositivo candidato probado solo si no existía vínculo, rechaza cambios de un vínculo ya establecido, rota y permanece restricted. Bootstrap conserva su transacción atómica y su activación propia.

`SessionContext` describe el estado posterior al efecto. `next_actions` mantiene sus valores y condiciones como navegación, nunca como permisos o aprobación local. La solicitud OWNER reproduce en replay el `OwnerDeviceApprovalPending` original; `Idempotency-Replayed` es booleano con ejemplos false/true fuera del JSON, sin `already_issued`, reenvío, extensión de expiración ni headers de rotación. El gate `owner-session-flow-v1` compara fixtures estáticos con schemas y ejemplos publicados y comprueba relaciones semánticas entre sesión, dispositivo, organización y membresía. Sus resultados son consistencia contractual; no prueban autorización, RLS, HMAC, cookies, CSRF, firma runtime ni entrega de correo.

El gate aplica las mismas invariantes de navegación a respuestas de login y a cada contexto observado: registro exige email verificado, MFA elegible, ningún desafío pendiente y sesión sin dispositivo; el bootstrap exige ser realmente el primero; la aprobación OWNER exige candidato vinculado, membresía OWNER vigente y otro dispositivo aprobado/utilizable de esa organización; selección exige dispositivo probado y ligado globalmente aprobado más MFA elegible. El manifiesto contiene ocho contextos positivos, 26 negativos semánticos y 32 autocontroles ligados a las invariantes del validador.

La solicitud y confirmación OWNER requieren otro dispositivo aprobado y utilizable en esa organización; confirmación vuelve a validarlo dentro de la transacción y mantiene cerrada la recuperación excepcional cuando falta. La prueba enlaza el dispositivo probado con la sesión y rota; sin destino explícito conserva `restricted` y tenant nulo. Login, bootstrap y confirmación conservan sus cuerpos HTTP inmediatos (`LoginResponse`, `OrganizationOnboardingResponse` y `DeviceApprovalStatus`); las observaciones posteriores de sesión se inventarían por separado como `GET /identity/session`. El manifiesto comprueba selectores exactos y cada ejemplo publicado del recorrido en ambas direcciones. La metadata de transición es solo de prueba, fuera de los schemas wire, y no acredita comportamiento runtime.

CI valida bundles Redocly dereferenciados reales para ambas candidatas, mantiene regresiones R4/R5/R6, CSRF, paginación, catálogo de errores y deadline, y ejecuta fixtures nuevos positivos/negativos con Sourcemeta JSON Schema 16.10.0.

## PF1-06A-R9 — step-up HTTP explícito (candidatas 2.1.0)

Las candidatas pública y privada pasan a 2.1.0 e incorporan `POST /identity/step-up-challenges` y `POST /identity/step-up-confirmations`. El step-up requiere contraseña y luego TOTP o código de recuperación de un uso ligados a la misma sesión; MFA de login y enrolamiento no sirven como prueba. El desafío vence en cinco minutos y admite hasta cinco intentos. La confirmación rota la credencial de esa sesión y limita la reautenticación al menor entre quince minutos desde la contraseña verificada y los vencimientos de sesión. No activa tenant ni asigna permisos. Ambas operaciones son delegated en el contrato privado y `completeSessionStepUp` añade la quinta rama al replay privado sin cambiar las cuatro anteriores.

`session-step-up-v1` prepara schemas únicamente desde selectores de bundles dereferenciados Redocly, comprueba inventario bidireccional de ejemplos y relaciones de escenarios de prueba, y valida positivos y negativos estructurales con Sourcemeta 16.10.0. El gate semántico comparte invariantes para aceptación, rechazo y autocontroles. Estas fixtures acreditan forma y consistencia contractual; no prueban autenticación, MFA, autorización ni persistencia runtime.

Las operaciones comparten el bucket de rate limiting `session_step_up`, independiente del propósito `step_up` del desafío: identity limita 10 intentos por cuenta y 100 por señal en ventanas independientes de 900 segundos; gateway limita 300 solicitudes por señal y propósito en esa ventana. Los cinco intentos por desafío se suman a esos límites y una Idempotency-Key nueva no los reinicia. La retención idempotente de siete días no garantiza que el replay siga disponible durante todo ese plazo. Las huellas usan HMAC-SHA-256 versionado y los resultados sensibles se conservan cifrados; si falta la versión de clave persistida, la recuperación falla cerrada.

El replay privado de `completeSessionStepUp` exige JWT de servicio gateway, cookie anterior vinculada, operación/clave/request canónicos y credencial resultante aún vigente. Revalida sesión, step-up y autoridad antes y después del descifrado. El desafío de origen ya consumido o vencido no impide por sí solo recuperar el resultado confirmado mientras el step-up y las demás condiciones continúen vigentes; no se consume el factor, rota otra vez ni extiende vencimientos. CSRF y deadline son rechazos del gateway, no respuestas atribuidas al productor privado. El manifiesto R9 inventaría en ambas direcciones los ejemplos Problem Details inline y externos de las dos operaciones y los contrasta con el catálogo v5, incluidos código, status y retryable.

## F1-07C — HTTP de catálogo (candidatos)

Superficies [pública](catalog/http/public/v1/catalog-pricing-v1.yaml) y [privada](catalog/http/private/v1/catalog-pricing-internal-v1.yaml), ambas 1.0.0 candidata: veinte operaciones de catálogo (8 GET y 12 mutaciones: tres 201/nueve 200). F1-07D añade cinco operaciones de precios para completar la matriz de 25 antes de F/G. No consumir este corte como un release completo; registro, índices, admisiones y locks siguen intactos. Las rutas efectivas aplican /api/v1 una sola vez.

[Entidades/requests](catalog/http/shared/v1/catalog-entities-v1.schema.json) reutilizan catalog-common-v1. Requests cerrados y respuestas extensibles en todos los niveles propios, manteniendo campos conocidos obligatorios. Producto/default_variant y presentación/base_presentation_id separados; precio y stock no se incrustan. Clasificación fiscal code/version con opciones y reglas sintéticas, sin alícuotas productivas. Mutaciones tienen cookie/Origin/CSRF en la superficie pública y delegado/señal en la privada; ETag individual, no-store, idempotencia y Location solo para altas consultables. No cookie ni tokens internos en la respuesta pública. Los ejemplos de replay conservan body/status/Location/version y cambian solo el indicador.

[Inventario](catalog/fixtures/http/v1/catalog-http-v1-fixtures.json): selectores exactos por superficie/operación/método/ruta/status/media/schema/headers y cobertura de archivos en ambos sentidos. Ejemplos de errores de B referenciados sin copiarlos. Casos estructurales positivos/negativos en fixtures/http/v1/structure; contextos semánticos en fixtures/semantics/v1. Incluyen conversión exacta, reserva/equivalencia GTIN, categorías/ciclos/profundidad, unidad base protegida, clasificación/activación, control de versión/replay, búsqueda barcode y cursores. Contextos de propietario verificados son inputs sintéticos, no autoridad enviada por la PWA.

Herramientas: http-v1-common.mjs (normalización/contratos), http-v1-semantics.mjs (invariantes de fixtures) y validate-http-v1.mjs (inventario/extracción). Tests externos en test/catalog/http-v1.test.mjs. No segundo motor JSON Schema: se reutilizan helpers de B y su runner Sourcemeta. Headers idénticos en schema/valor se validan estructuralmente una vez por par, tras comprobar los headers de cada selector; no se omite cobertura del inventario.

Después de ejecutar la regresión H2/B, con las mismas herramientas fijadas:

```text
node --test test/catalog/*.test.mjs
npx --yes @redocly/cli@2.53.3 lint catalog/http/public/v1/catalog-pricing-v1.yaml catalog/http/private/v1/catalog-pricing-internal-v1.yaml
node scripts/validate-redocly-no-warnings.mjs catalog/http/public/v1/catalog-pricing-v1.yaml
node scripts/validate-redocly-no-warnings.mjs catalog/http/private/v1/catalog-pricing-internal-v1.yaml
npx --yes @redocly/cli@2.53.3 bundle catalog/http/public/v1/catalog-pricing-v1.yaml --dereferenced --ext json --output .ci-artifacts/catalog-public-v1.bundle.json
npx --yes @redocly/cli@2.53.3 bundle catalog/http/private/v1/catalog-pricing-internal-v1.yaml --dereferenced --ext json --output .ci-artifacts/catalog-private-v1.bundle.json
node scripts/catalog/validate-http-v1.mjs .ci-artifacts/catalog-public-v1.bundle.json .ci-artifacts/catalog-private-v1.bundle.json .ci-artifacts/catalog-http-v1 --self-test
jsonschema metaschema catalog/http/shared/v1/catalog-entities-v1.schema.json
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-http-v1
```

Usar directorio de extracción nuevo; el runner estructural mantiene su nombre/mensaje histórico de B y ejecuta los casos C de ese directorio. Negativos solo por exit2/causa de validación: errores de selector, parsing, archivos o herramienta fallan el gate. El hash de inventario detecta pérdida/alteración accidental de cobertura, no autentica contra manipulación deliberada. Integración CI conjunta reservada F; admisión/publicación G. Fixtures no acreditan SQL, rollback, autorización/criptografía, firma de cursores, concurrencia o recuperación reales.
