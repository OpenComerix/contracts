# Transporte transversal

Coordinación: platform-contracts, sin servicio ni base compartidos. Solo abstracciones de transporte transversales; los dominios emisores conservan la propiedad de sus códigos. [Índice admitido](index.json) y [registro](../registry/README.md) fijan procedencias existentes; [guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14) rige contratos nuevos.

Fuentes F1-07B incluidas en la admisión G:

- [Problem Details v3](http/shared/v3/problem-details-v3.schema.json): forma v2 preservada, con 406/413/415 adicionales; nueva identidad de schema bajo esta ruta.
- [Catálogo de errores v6](errors/v6/error-catalog-v6.json) y [schema](errors/v6/error-catalog-v6.schema.json): conserva las 24 entradas v5 y agrega 25 códigos aprobados con owners explícitos.
- fixtures/errors/v6 contiene códigos transversales que no están usados como ejemplos HTTP de los dos puertos; esos ejemplos permanecen vinculados a la capacidad que prueban. [Inventario/gates B](../identity/fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json), ejecución en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

Artefactos anteriores en openapi/errors/events y admisiones H2 permanecen inmutables. G registra los nuevos descriptores sin reemplazar pins. [Procedencia, gates y publicación](../catalog/README.md#f1-07g--admisión-y-publicación); no trasladar negocio a common ni equiparar carpeta con autoridad.

## F1-08B — Admisión del envelope de eventos

Decisión autorizada por el usuario el 2026-10-15: `common.event-envelope.v1` pasa de `draft` a `active` en registro e índice, conservando ruta, versión, commit fuente, hash, mappings y bytes publicados. El [schema](../events/event-envelope-v1.schema.json) sigue siendo un sobre de transporte; cada perfil de dominio restringe productor, tipo/revisión, agregado y payload. La admisión elimina esa dependencia draft del cierre de los ocho perfiles de catálogo/precios, sin modificar los perfiles ni ampliar su semántica.

Los demás drafts, incluido AsyncAPI de catálogo, conservan su prohibición de uso funcional. No se migran manifiestos, locks ni exports consumidores ni se habilitan productores/runtime por esta admisión. La auditoría aislada de F1-08B fue satisfactoria el 2026-10-15; publicación y CI se acreditan en [ESTADO](../../../ESTADO.md). Consumir una revisión nueva exige autorización y CI de SHA/ref exactos. Historia/recuperación de ADR-062 y productor de identidad siguen en cortes propios antes del runtime.

Gates: tests de arquitectura/catálogo, registro, consumidores/impacto y cotejo local del launcher; extractor de eventos con autocontroles, metaschemas y fixtures positivos/negativos con Sourcemeta 16.10.0, más la regresión del wrapper contracts. `test/architecture/catalog-admission.test.mjs` conserva el rechazo histórico M1 desde su revisión inmutable, comprueba la única transición de estado y la aceptación del mismo cierre con pins/impacto, y rechaza los demás drafts. Comandos existentes en [guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#ejecución-y-ci) y [mapa de eventos](../catalog/README.md#candidato-f1-07e). Estas pruebas no acreditan autoridad, SQL, entrega, orden ni recuperación runtime.

Las secciones candidatas siguientes describen sus fuentes publicadas previas a admisión. El [candidato H](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4) incorpora solo las raíces seleccionadas; R1 v1 y su schema común continúan planned.

## Candidato F1-08C — Catálogo de políticas de ciclo de vida

[data-lifecycle-policy-v1.schema.json](http/shared/v1/data-lifecycle-policy-v1.schema.json) define la forma versionada de metadatos de políticas requerida por ADR-016/035: propietario, perfiles, clasificación de almacenamientos, fuentes de clasificación por campo, retención, copias, evidencia y prerrequisitos. Coordinación `platform-contracts`; cada dominio conserva sus reglas y aplicación. El schema valida estructura; los gates del dominio verifican rangos, vínculos y semántica aprobada. No es un evaluador de elegibilidad, un motor de purgas ni un mecanismo de autorización.

Primer catálogo candidato: [historia de catalog-pricing](../catalog/README.md#candidato-f1-08c--políticas-de-historia-r1). Registro e índice conservan únicamente la intención `planned`, sin descriptor admitido, procedencia de publicación inventada ni migración de locks. Gates y fixtures pertenecen a esa capacidad; Sourcemeta 16.10.0 valida el schema y los casos reales en CI. Admisión/publicación y capacidades runtime requieren sus cortes propios.

## Candidato F1-08E — Catálogo de errores v7

[Catálogo v7](errors/v7/error-catalog-v7.json) y [schema](errors/v7/error-catalog-v7.schema.json) conservan íntegramente las entradas de v6 y agregan seis códigos internos propiedad de catalog-pricing para autoridad workload/fuente/holds, conflicto, reconciliación y referencia tardía. La coordinación común no traslada el dominio. Uso candidato limitado a [R2](../catalog/README.md#candidato-f1-08e--obligaciones-y-cierres-r2); no migra APIs publicadas ni consumidores. Registro/índice mantienen planned, sin procedencia ni admisión inventadas. Tests comprueban preservación, códigos/status/retryability y ausencia de detalles; Sourcemeta valida el schema y el catálogo reales.

## Candidato F1-08H — clasificación completa v2

[Schema v2](http/shared/v2/data-lifecycle-policy-v2.schema.json) evoluciona la forma de metadatos de ciclo de vida, preservando v1. Distingue fuentes inmutables, clasificación de transporte con herencia estricta y campos lógicos persistidos. Los almacenamientos completos deben declarar sus fuentes y no pueden conservar pendientes; una declaración de transporte no concede autoridad de persistencia. Los perfiles de clasificación incluyen propietario, consumidores y alcance de retención, sin sustituir las políticas del dueño.

[Catálogo/gates de historia v2](../catalog/README.md#candidato-f1-08h--clasificación-conjunta-v2-fuente-previa-a-admisión). Schema, catálogo y fixtures mantienen intención `planned` hasta publicación y admisión posteriores autorizadas. No acredita runtime, SQL, autoridad real ni purgas, y no migra consumidores.

## F1-08H — Admisión de errores y clasificación

El candidato local incorpora los catálogos de errores v7/v8 y sus schemas, más el schema de ciclo de vida v2. Versiones y bytes anteriores permanecen intactos; no se reemplaza v6 ni se actualizan consumidores. El schema común v1 conserva intención planned, sin habilitar el catálogo R1 v1 incompleto. [Selección y fuente inmutable](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4); [índice](index.json), [registro](../registry/contracts.json) y [estado/gates pendientes](../../../ESTADO.md).

## F1-10B — Errores v9 candidatos

[Catálogo](errors/v9/error-catalog-v9.json) y [schema](errors/v9/error-catalog-v9.schema.json) preservan las entradas v8 y agregan errores de inventario, credenciales/caller de workload y el puerto de autoridad Sales, con owner explícito, status y retryability definidos en el [mapa B](../inventory/README.md#f1-10b--paquete-candidato). Los sobres de comando/resultado/evento, Problem Details v3 y lifecycle v2 se reutilizan sin modificación. Nuevas intenciones planned; sin reemplazo de pins, admisión funcional ni consumo por nombre de carpeta.

## F1-10C — Errores v10 candidatos

[Catálogo](errors/v10/error-catalog-v10.json) y [schema](errors/v10/error-catalog-v10.schema.json) preservan íntegramente v9 y añaden únicamente los códigos de finance del [mapa C](../finance/README.md#f1-10c--paquete-candidato), con owner/status/retryability explícitos y sin parámetros sensibles. Problem Details v3 y sobres históricos se conservan; errores técnicos no se fijan como rechazo terminal de cobro. Solo planned, sin migración de pins/consumidores ni admisión funcional.

## F1-10D — Errores v11 candidatos

[Catálogo](errors/v11/error-catalog-v11.json) y [schema](errors/v11/error-catalog-v11.schema.json) conservan todas las entradas v10 y agregan los códigos Sales online/historia/delegación. sales_online_invalid_request es aditivo, aprobado por el usuario para el request de venta online; sales_invalid_request interno de B conserva exposición/semántica/bytes. No reemplaza pins ni amplía admisiones; Problem Details v3 y sobres históricos permanecen intactos. [Paquete y gates D](../sales/README.md#f1-10d--paquete-candidato-de-venta-autosuficiente).
