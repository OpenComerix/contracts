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
