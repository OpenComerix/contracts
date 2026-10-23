# Contratos de identidad y tenencia

Owner semántico: identity-tenancy. [Índice admitido](index.json) y [registro](../registry/README.md) conservan las fuentes H2 exactas en sus rutas históricas. Organización nueva según [guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14).

Fuente F1-07B incluida en la admisión G:

- [HTTP privado de autoridad de catálogo](http/private/v1/identity-catalog-authority-v1.yaml), 1.0.0: dos puertos; emisor gateway con cookie/workload y comprobación por workload catalog-pricing. No es una API pública de catálogo.
- [Schemas](http/private/v1/identity-catalog-authority-v1.schema.json): requests, respuestas y claims; referencias a la base de catálogo y Problem Details comunes.
- [Inventario HTTP/estructural](fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json) y [contextos semánticos](fixtures/catalog-authority/v1/catalog-authority-semantic-v1-fixtures.json). Examples/semantic/structure bajo esa capacidad; refs cruzadas a fixtures catalog/common expresan su responsabilidad.
- Gates conjuntos de integración contractual en [scripts/catalog](../scripts/catalog/validate-security-v1.mjs) y tests externos [test/catalog](../test/catalog/security-v1.test.mjs). Uso en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

G agrega los descriptores desde la fuente F sin alterar admisiones/locks H2. [Procedencia, gates y publicación](../catalog/README.md#f1-07g--admisión-y-publicación). No reutilizar audiencias H2 para catálogo, mover archivos ni interpretar fixtures como autorización real. Productor de identidad en otra tanda antes de F1-08.

Las secciones F/G conservan la descripción de las fuentes candidatas publicadas. Las menciones a planned o ausencia de admisión se refieren a esas entregas; la selección actual se describe en [admisión H](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4).

## Candidato F1-08F — autoridad contractual de recuperación R3

- [API privada](http/private/v1/identity-catalog-recovery-authority-v1.yaml): emisión, comprobación, renovación explícita y revocación del grant, más catálogo de permisos.
- [Schema](http/shared/v1/identity-catalog-recovery-authority-v1.schema.json): vínculo cerrado a cuenta, membresía, organización, propósito, selección, destino y sesión; snapshot de decisión/versiones/MFA resuelto por identidad. `catalog.history.authorize` separado de `catalog.history.recover` y `catalog.history.configure`, ambos permisos efectivos dentro de la organización al conceder.
- [Fixtures/negativos](fixtures/catalog-recovery/v1/catalog-recovery-authority-v1-fixtures.json) y [gate semántico](../scripts/identity/validate-catalog-recovery-authority-v1.mjs): casos ejecutables de MFA reciente, tenant/selección/grant ajenos, revocación, expiración, OWNER/H2/header, dependencia indisponible, vínculo propósito–permiso y plazo.

Es candidato `planned`: la referencia de grant es opaca y de un solo propósito, con hash server-side; no es JWT ni contraseña. La autenticación del workload es independiente. Cada propósito admite un único permiso (`recover` o `configure`); el grant declara `lifetime_seconds` entre 1 y 900, y el productor debe comprobar que `expires_at = issued_at + lifetime_seconds`. JSON Schema acota el intervalo, pero la igualdad entre fechas requiere validación semántica. Todas las respuestas son `no-store` y la cookie conserva el nombre F1-07B `__Host-oc_session`. No acredita identidad runtime, MFA, firma, claves, SQL, broker, PWA, gateway ni recuperación R4. No se agrega ningún permiso por inferencia a OWNER, `catalog.read/manage` o H2, y no se modifican los contratos F1-07B publicados.

El [oráculo semántico](../scripts/identity/catalog-recovery-authority-v1-semantics.mjs) usa estado sintético confiable de identidad, permisos por membresía y reloj del servidor: rechaza emisión entre tenants/personas, membresía o decisión revocada y versiones obsoletas. Comprueba también el resultado de emisión/renovación antes de devolverlo. Renovar exige otro grant, una decisión y un evento MFA nuevos, conservando todo el binding; revocar exige autorización vigente del mismo contexto y conserva el resultado/instante original al repetir. Estos escenarios no sustituyen la implementación ni pruebas reales del productor de identidad.

CI ejecuta el gate semántico y genera DTO positivos/negativos bajo `.ci-artifacts/catalog-recovery-authority-v1`; el [gate Sourcemeta](../scripts/identity/validate-catalog-recovery-authority-v1.sh) comprueba esos payloads contra los schemas reales, junto a metaschema y Redocly lint/bundle sin warnings. No reutilizar el directorio generado para otra ejecución: el generador rechaza sobrescribirlo.

## Candidato F1-08G — verificación de recuperación v2

[API privada](http/private/v2/identity-catalog-recovery-verification-v2.yaml), [schema](http/shared/v2/identity-catalog-recovery-verification-v2.schema.json), [clasificación/policy](http/shared/v2/identity-catalog-recovery-verification-v2-policy.json), [vectores](fixtures/catalog-recovery/v2/catalog-recovery-verification-v2-vectors.json), [oráculo](../scripts/identity/catalog-recovery-verification-v2-semantics.mjs), [extractor](../scripts/identity/validate-catalog-recovery-verification-v2.mjs) y [tests externos](../test/catalog/recovery-verification-v2.test.mjs). Solo `POST /internal/v2/identity/catalog/recovery-grants/verify`, workload `catalog-pricing` y audiencia H1A R3 existente; emisión, renovación, revocación y todos los bytes v1 permanecen intactos.

La respuesta cerrada conserva los datos de verificación v1 y exige `issued_at` del mismo grant verificado; `valid_until` es su vencimiento original. No se calcula la emisión a partir de quince minutos ni se acepta del caller. R4 obtiene esta respuesta fresca para cada creación/página/reintento; el grant completo y el estado de la persona pertenecen al lado de identidad del puerto. La clasificación cubre subárboles heredados completos; el caller no conserva ni registra respuesta, referencia, emisión o snapshot. No hay admisión funcional ni runtime.

CI conserva los gates v1 y añade lint Redocly 2.53.3 sin warnings, bundle, extracción a una salida nueva y Sourcemeta 16.10.0 con positivos/negativos del DTO real. En la validación local, el bundle v2 emitió un warning por dos componentes `NoStore` con distinto contenido y renombró uno a `NoStore-2`; ambos exigen `Cache-Control: no-store`. El warning se conserva en la evidencia; la auditoría no observó alteración funcional. Los tests de catálogo recorren el productor sintético v2 y pasan únicamente su respuesta a R4; no acreditan autorización, SQL ni criptografía real.

~~~text
node scripts/identity/validate-catalog-recovery-verification-v2.mjs .ci-artifacts/catalog-recovery-verification-v2
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-recovery-verification-v2
jsonschema metaschema identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json
~~~

## F1-08H — Admisión de autoridad y verificación

El candidato local H registra las tres raíces R3 de identidad y las cuatro de verificación v2 contra la fuente inmutable y CI exacto indicados en [el mapa de admisión](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4). El [índice](index.json) fija su navegación; el [registro](../registry/contracts.json) fija hashes, versiones y procedencia. R3 v1, el puerto v2 y sus pins no cambian. No se asignan permisos a OWNER ni se implementan emisión, MFA, criptografía o SQL; productor, consumidores y publicación del candidato requieren sus cortes y permisos propios.

## Candidato F1-08I — Asignación explícita y perfiles de workload

[API privada](http/private/v1/identity-catalog-history-permissions-v1.yaml), [schema](http/shared/v1/identity-catalog-history-permissions-v1.schema.json), [política](http/shared/v1/identity-catalog-history-permissions-v1-policy.json) y [vectores sintéticos](fixtures/catalog-history-permissions/v1/catalog-history-permissions-v1-vectors.json). GET/PUT administran la asignación por membresía en la organización seleccionada. El mapeo inicial aprobado da a OWNER únicamente `catalog.history.permissions.manage`: `authorize`, `configure` y `recover` requieren asignación explícita, incluso para sí mismo. Cuenta/sesión/membresía vigentes, dispositivo aprobado, scope de organización y MFA de hasta 300 s se verifican en cada solicitud y replay. La versión durable evita recrear una intención antigua; asignación, versión de autorización de la membresía, resultado idempotente y auditoría pertenecen a la misma transacción local. GET lee el estado actual; un replay conserva el resultado histórico.

[Perfiles H1A por finalidad](http/shared/v1/identity-catalog-workload-profiles-v1.json) y [vectores](fixtures/catalog-workload/v1/catalog-workload-profiles-v1-vectors.json) conservan HTTP Basic y el body publicado `grant_type=client_credentials`. Cinco clientes independientes fijan caller/audiencia en servidor; los dos perfiles existentes conservan su identidad. Los clientes nuevos de catálogo y recuperación requieren secretos propios y rechazan fallback o selección de audiencia por request.

La entrega fuente conserva seis intenciones `planned`; su admisión seleccionada se describe debajo. Los exports consumidor y bytes publicados se preservan. Publicar fuentes, comprobar CI exacto y admitirlas son pasos previos al consumo runtime. No se acredita SQL, firma, entrega de credenciales, MFA real ni cierre de I. Los [tests externos](../test/identity/) recorren [oráculos y extractores](../scripts/identity/); los jobs `validate:identity-catalog-contracts` y `validate:identity-catalog-schema` añaden Redocly 2.53.3 sin warnings y Sourcemeta 16.10.0 con DTO positivos/negativos reales. El extractor exige salida nueva:

~~~text
node --test test/identity/*.test.mjs
node scripts/identity/validate-catalog-workload-profiles-v1.mjs
node scripts/identity/validate-catalog-history-permissions-v1.mjs .ci-artifacts/catalog-history-permissions-v1 .ci-artifacts/catalog-history-permissions-v1.bundle.json
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-history-permissions-v1
~~~

## F1-08I — Candidato de admisión seleccionada

Fuente inmutable: contracts/dev `f92a68a0bba46a7d96d69b8af8aa6c0d00187d7a`, [CI 2959407001 Passed](https://gitlab.com/opencomerix/contracts/-/pipelines/2959407001), doce jobs comprobados por SHA/ref exactos. El candidato local admite únicamente estas raíces; sus archivos/políticas conservan el estado y los bytes originales, sin habilitar producción:

| ID | Superficie / versión |
| --- | --- |
| identity.catalog-history-permissions.http.v1 | http-private / 1.0.0 |
| identity.catalog-history-permissions.schema.v1 | schema / v1 |
| identity.catalog-history-permissions.policy.v1 | policy / 1 |
| identity.catalog-history-permissions.fixtures.v1 | validation / v1 |
| identity.catalog-workload-profiles.policy.v1 | policy / 1 |
| identity.catalog-workload-profiles.fixtures.v1 | validation / v1 |

El [registro](../registry/contracts.json) fija commit, hash, operaciones y URI mappings acotados al cierre; el [índice](index.json) deriva las seis admisiones nuevas. Total: 115 raíces, con las 109 anteriores y los 236 artefactos preservados. Quedan las tres intenciones originales de venta y R1 v1; no se promueve AsyncAPI ni ningún draft ajeno. El [gate específico](../scripts/identity/validate-catalog-admission-v1.mjs) y sus [tests externos](../test/identity/catalog-admission-v1.test.mjs) verifican el paquete cerrado, procedencia, referencias, bloqueo transitivo de drafts y preservación. Los gates H siguen comprobando su paquete histórico y validan también I antes de aceptar su proyección.

No se ejecuta sync ni se modifican manifiestos, locks, exports, herramientas genéricas o CI. La admisión local requiere su auditoría y publicación propias; luego las admisiones consumidoras y pruebas runtime de identidad. Estado y permisos pendientes en [ESTADO](../../../ESTADO.md). Este candidato no acredita SQL, MFA/firma reales ni cierre de I.

## F1-08I — Candidato de renovación R3 v2 tras step-up

[HTTP privado](http/private/v2/identity-catalog-recovery-renewal-v2.yaml), [schema](http/shared/v2/identity-catalog-recovery-renewal-v2.schema.json), [política](http/shared/v2/identity-catalog-recovery-renewal-v2-policy.json) y [vectores](fixtures/catalog-recovery/v2/catalog-recovery-renewal-v2-vectors.json). Solo `POST /internal/v2/identity/catalog/recovery-grants/{grant_id}/renew`, con H1A gateway de recuperación y cookie vigente. Reutiliza los DTO R3; nunca acepta evidencia de rotación enviada por el cliente. R3 v1 y verificación v2 conservan sus bytes y reglas.

Con credencial cambiada exige prueba durable de una única rotación directa `completeSessionStepUp`, atómica con MFA y auditoría: versiones/hashes antes-después, mismo actor/sesión/tenant/dispositivo y nuevo evento MFA posterior al grant y de hasta 300 s. Revalida las otras versiones, permisos y binding completo; no admite cadenas, otra causa ni autoridad revocada. Emite un grant distinto con snapshot actual, sin extender o rehabilitar el anterior. Evidencia interna mínima hasta 24 h después del vencimiento original del grant asociado, sin extensión por lectura/renovación; auditoría independiente. Sin cambio de credencial conserva las comprobaciones originales de renovación con MFA nuevo.

Son cuatro intenciones `planned`: 115 admisiones y 236 artefactos previos intactos, siete planned totales. [Oráculo sintético](../scripts/identity/catalog-recovery-renewal-v2-semantics.mjs), [extractor](../scripts/identity/validate-catalog-recovery-renewal-v2.mjs), [preservación del registro](../scripts/identity/catalog-recovery-renewal-v2-registry.mjs) y [tests externos](../test/identity/catalog-recovery-renewal-v2.test.mjs) comprueban semántica, referencias y rechazo del consumo no admitido. Los dos jobs de identidad conservan sus pasos previos y agregan lint/bundle Redocly 2.53.3 y metaschema/DTO Sourcemeta 16.10.0 reales:

~~~text
node --test test/identity/*.test.mjs
node scripts/identity/validate-catalog-recovery-renewal-v2.mjs .ci-artifacts/catalog-recovery-renewal-v2 .ci-artifacts/catalog-recovery-renewal-v2.bundle.json
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-recovery-renewal-v2
~~~

El extractor exige una salida nueva y contrasta el bundle real con los schemas referenciados. Esta entrega no implementa SQL, MFA, firma, retención/purga, consumidores ni excepción runtime; requiere auditoría, publicación/CI exacto y admisión antes del consumo. [Decisión](../../../docs/arquitectura/decisiones/ADR-062-historia-y-recuperacion-de-catalogo.md) y [estado](../../../ESTADO.md).

## F1-08I — Candidato de admisión de renovación R3 v2

Fuente inmutable: contracts/dev `56724471a5460e22d936bd09bef448efe46d87e6`, [CI 2960251901 Passed](https://gitlab.com/opencomerix/contracts/-/pipelines/2960251901), doce jobs por SHA/ref exactos. Este candidato admite únicamente las cuatro fuentes descritas arriba, conservando sus bytes y sus estados internos de candidato; la admisión de registro no habilita producción.

| ID | Superficie / versión |
| --- | --- |
| identity.catalog-recovery-renewal.http.v2 | http-private / 2.0.0 |
| identity.catalog-recovery-renewal.schema.v2 | schema / v2 |
| identity.catalog-recovery-renewal.policy.v2 | policy / 2 |
| identity.catalog-recovery-renewal.fixtures.v2 | validation / v2 |

El [registro](../registry/contracts.json) fija commit/hash/operaciones y mappings limitados al cierre; el [índice](index.json) deriva las cuatro altas. Total 119 raíces: 115 descriptores anteriores y 236 artefactos preservados; quedan las tres intenciones originales de venta y R1 v1. Las menciones a cuatro planned arriba describen la fuente publicada, que los tests siguen verificando íntegramente contra Git. El [gate específico](../scripts/identity/catalog-recovery-renewal-v2-registry.mjs) acepta solo esa fuente o la admisión completa exacta, comprueba el árbol actual antes de proyectar su sufijo para H/I y rechaza alteraciones o paquetes parciales. [Pruebas externas de admisión](../test/identity/catalog-recovery-renewal-admission-v2.test.mjs) contrastan procedencia, cierres, locks sintéticos y drafts transitivos, además de la preservación de fuentes y herramientas publicadas.

No se modifica R3 v1, verificación v2, semántica, source_pins, transporte, fixtures, CI, resolvedor genérico ni dependencias; no se ejecuta sync ni se migran consumidores, manifiestos, locks o exports. Auditoría/publicación/CI de esta admisión y admisiones consumidoras conservan sus cortes propios antes del productor. No acredita SQL, MFA/firma, rotación, retención/purga ni autoridad reales; I sigue abierta. [Estado](../../../ESTADO.md).
# F1-08M — Sucesor candidato de perfiles H1A

[Política v2](http/shared/v2/identity-catalog-workload-profiles-v2.json) y [vectores](fixtures/catalog-workload/v2/catalog-workload-profiles-v2-vectors.json) conservan las cinco asignaciones anteriores y agregan `catalog-pricing.history-recovery` → `catalog-pricing` / `catalog-pricing.history-recovery`, separado del cliente R3 `catalog-pricing.catalog-recovery`. La política v1, sus bytes, fixtures, admisión y pins permanecen inmutables. [Gate y tests externos](../scripts/identity/validate-catalog-workload-profiles-v2.mjs) prueban aislamiento y preservación; CI ejecuta ambos gates v1/v2. Es sucesor candidato: no cambia locks/admisiones ni autoriza configurar el secreto en producción o consumirlo fuera del alcance aprobado.

## F1-08O3 — Admisión seleccionada de perfiles H1A v2

Se admiten únicamente la política v2 y sus vectores desde contracts 9223c3b6b7c5077d7230d14d16da26a8129d0c51, con hashes Git exactos y [CI fuente Passed, 14/14](https://gitlab.com/opencomerix/contracts/-/pipelines/2980742219). El registro conserva las 119 raíces anteriores, 236 artefactos preservados y tres intenciones pendientes: total 121 raíces. La política y los vectores publicados conservan sus bytes y estado candidato; active describe esta admisión contractual, sin afirmar habilitación productiva.

| ID | Superficie / versión |
| --- | --- |
| identity.catalog-workload-profiles.policy.v2 | policy / 2 |
| identity.catalog-workload-profiles.fixtures.v2 | validation / v2 |

El [validador de admisión](../scripts/identity/catalog-workload-profiles-v2-registry.mjs) comprueba el paquete completo antes de proyectarlo para los controles históricos; sus [pruebas externas](../test/identity/catalog-workload-profiles-admission-v2.test.mjs) verifican procedencia, cierre y negativos. Política v1, seis perfiles aislados, herramientas genéricas, CI, dependencias, manifiestos/locks/exports y runtime permanecen intactos. La migración consumidora y la composición operativa requieren cortes y permisos propios. Esta admisión no cierra O/F1-08 ni acredita SQL, criptografía o despliegue.
