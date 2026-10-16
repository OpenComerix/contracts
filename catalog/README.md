# Contratos de catálogo y precios

Owner semántico: catalog-pricing. La organización física sigue [la guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14). [Índice](index.json): admisión G desde la fuente B–F publicada, con los límites funcionales indicados abajo. Los apartados B–F conservan mapas y comandos de cada capacidad; el estado vigente del paquete se fija en G.

Candidatos F1-07B:

- [Base de transporte](http/shared/v1/catalog-common-v1.schema.json): IDs, decimales, unidades, versiones, paginación y headers de esta capacidad; compartida por sus superficies y puertos de integración.
- [Solicitud canónica](http/shared/v1/catalog-request-v1.schema.json) y [política de seguridad](http/shared/v1/catalog-security-policy-v1.json): matriz de A, vínculos de solicitud, permisos/budgets y límites; no CRUD ni autoridad runtime.
- [Vectores de solicitud](fixtures/request/v1/catalog-request-v1-vectors.json), fixtures/base/v1 y fixtures/errors/v6: formatos/canonicalización y nuevos códigos propios de catálogo/precios. Los ejemplos de errores usados por puertos de identidad se referencian desde su inventario, sin otra copia.
- Herramientas: [scripts/catalog](../scripts/catalog/validate-security-v1.mjs); pruebas: [test/catalog](../test/catalog/security-v1.test.mjs). Ejecución completa y límites en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

Los OpenAPI públicos y privados completos corresponden a C/D y eventos a E. G registra su admisión sin migrar locks ni declarar productores/consumidores runtime.

## Candidato F1-07C

- HTTP [público](http/public/v1/catalog-pricing-v1.yaml) y [privado](http/private/v1/catalog-pricing-internal-v1.yaml), 1.0.0: veinte operaciones de catálogo y cinco de precios de D. Fuente B–F preservada en G.
- [Entidades y solicitudes](http/shared/v1/catalog-entities-v1.schema.json): categorías, producto/variante predeterminada, presentación/barcode, unidades y clasificación fiscal versionada; reutiliza base B y preserva ownership.
- [Inventario HTTP](fixtures/http/v1/catalog-http-v1-fixtures.json), fixtures/http/v1/structure y fixtures/semantics/v1: positivos, errores aplicables, replay y negativos estructurales/semánticos. No validación de runtime.
- Gates: [validate-http-v1](../scripts/catalog/validate-http-v1.mjs), helpers de normalización/semántica separados y [tests](../test/catalog/http-v1.test.mjs). Comandos, versiones y límites en [README raíz](../README.md#f1-07c--http-de-catálogo-candidatos).

D/E completan precios/eventos y F integra CI. G retira las tres intenciones F1-07 materializadas; la intención de venta F1-10 y los locks de consumidores se conservan.

## Candidato F1-07D

- [Precios y lista](http/shared/v1/catalog-prices-v1.schema.json): lista predeterminada, precio vigente/histórico, página y solicitud estricta; reutiliza base decimal B, sin precio embebido en producto/presentación.
- Las superficies pública/privada anteriores completan 25 operaciones: veinte C preservadas y cinco pricing. Fuente candidata ampliada, no admisión/release completo.
- [Fixtures de precios](fixtures/pricing/v1/pricing-http-v1-fixtures.json): errores B referenciados, ejemplos HTTP, structure y semantics por esta capacidad.
- Gate [validate-pricing-http-v1](../scripts/catalog/validate-pricing-http-v1.mjs), helpers específicos y [tests externos](../test/catalog/pricing-http-v1.test.mjs); reutiliza el gate/extractor HTTP C y runner estructural B. Comandos y límites en [README raíz](../README.md#f1-07d--lista-predeterminada-y-precios-candidatos).

Sin nuevos dominios, migración de locks, servicios ni PWA. E aporta eventos; F conecta los gates y G registra la admisión/publicación contractual.

## Candidato F1-07E

Diseño concreto aprobado por chat el 2026-10-15: cuatro hechos de `catalog-pricing`, revisión inicial 1. Fuente contractual B–F; CI conjunta en F, admisión G y productores separados. Las 25 operaciones HTTP y el sobre publicado conservan sus bytes. No se agrega un cliente de eventos a ventas, PWA o reporting.

| Hecho | Perfil productor | Agregado/versionado |
| --- | --- | --- |
| Categoría | [catalog.category.changed.v1](events/v1/catalog.category.changed.v1.schema.json) | categoría |
| Producto | [catalog.product.changed.v1](events/v1/catalog.product.changed.v1.schema.json) | producto y variante predeterminada |
| Presentación | [catalog.presentation.changed.v1](events/v1/catalog.presentation.changed.v1.schema.json) | presentación y barcodes |
| Precio | [pricing.presentation-price.changed.v1](events/v1/pricing.presentation-price.changed.v1.schema.json) | secuencia organización/lista/presentación; aggregate_id es presentation_id |

- [Snapshots estrictos](events/v1/catalog-event-data-v1.schema.json) conservan los campos conocidos de HTTP y definición fiscal capturada; sin colecciones ilimitadas de códigos ni datos de autoridad. Un cambio posterior de maestro o cierre de intervalo no modifica un evento ya capturado.
- [Política E](events/v1/catalog-event-policy-v1.json): matriz operación→hecho, fuente de cada definición, pares admitidos, topología prevista e inventario campo→sensibilidad/categorías/finalidad/acceso/cifrado/log/retención según ADR-035. Los snapshots pertenecen a `catalog-pricing`; no son entidades persistidas compartidas.
- [AsyncAPI 3.0](events/v1/catalog-events-v1.asyncapi.yaml), codificada como JSON compatible con YAML: un topic lógico y cola/DLQ futuras de reporting. Las referencias de payload usan explícitamente Draft 2020-12 mediante [Multi Format Schema](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multi-format-schema-object). El gate propio comprueba inventario, referencias y topología; no se declara una certificación completa de AsyncAPI ni se añade un parser nuevo.
- Los archivos `*.consumer.schema.json` mantienen el sobre común cerrado y validan todos los campos conocidos. La zona opcional `payload.extensions` está vacía en la revisión real 1. Fixtures de evolución **sintética** habilitan solo `display_label` en una revisión 2 de prueba, con lectores anterior/nuevo y la misma interpretación comercial. Esa revisión no se admite, publica ni acepta por los perfiles reales. Un enum crítico o pareja no soportada falla cerrado.
- [Inventario de fixtures](fixtures/events/v1/catalog-event-v1-fixtures.json), effects y [vectores](fixtures/events/v1/event-v1-vectors.json): las trece mutaciones, alta/cambio de unidad con ambos agregados, primer precio/reemplazo y cero eventos nuevos en rechazo/rollback/replay. IDs UUID sintéticos sustituyen el marcador opaco de las fixtures HTTP solo para satisfacer el sobre existente; no cambian contratos de identidad.
- [Gate](../scripts/catalog/validate-events-v1.mjs), [semántica de fixtures](../scripts/catalog/event-v1-semantics.mjs) y [tests externos](../test/catalog/events-v1.test.mjs): coherencia HTTP→evento, tenant, agregado/versiones, causa/correlación, payload, decimales, historia y privacidad. No son un publicador, motor de precios ni runtime de consumidor.

Tras las regresiones B/C/D del README raíz, ejecutar mediante `opencomerix check contracts`, con Node 24.21.0 y dependencias existentes congeladas cuando corresponda:

```text
node --test test/architecture/*.test.mjs test/catalog/*.test.mjs
node scripts/catalog/validate-events-v1.mjs .ci-artifacts/catalog-events-v1 --self-test
jsonschema metaschema catalog/events/v1/*.schema.json
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-events-v1
```

Usar salida nueva. El extractor resuelve las referencias reales de cada perfil antes de Sourcemeta 16.10.0; no implementa otro motor JSON Schema. El runner estructural conserva el nombre/mensaje histórico B, pero ejecuta todos los casos E de su `cases.tsv`. Un negativo exige exit 2 y diagnóstico de instancia; errores de preparación/referencias/herramienta no cuentan. Preservación y regresiones requieren su evidencia propia. Los resultados vigentes están en ESTADO del launcher, no en conteos duplicados aquí.

CAF-01/02/03/04/07/08/09/10/14 tienen alcance contractual: preservación, vínculos y captura, precisión, perfiles, rechazo de desconocidos y minimización. Ninguna fixture acredita autorización real, transacciones, entrega, orden, deduplicación, cuarentena efectiva o reconstrucción durable. CAF-11/12 exigen antes del productor F1-08 hecho/historia+auditoría+outbox atómicos y fuente histórica propia con exportación/replay autorizados; outbox no es archivo de negocio. `TECHNICAL_SHORT` clasifica el transporte serializado, no habilita purgar historia comercial/fiscal. El perfil histórico versionado, holds y obligaciones heredadas se cierran en el dueño antes del runtime; no se inventan plazos legales. La futura venta captura datos/versiones efectivamente usados; E no crea su schema ni permite vender por recibir un evento.

## Candidato F1-07F — Validación conjunta en CI

La [configuración CI](../.gitlab-ci.yml) añade dos jobs obligatorios y conserva íntegros los ocho anteriores. No añade dependencias, modifica transporte ni admite contratos. Ejecutar los comandos de `before_script` y `script` de cada job desde contracts, con las imágenes fijadas; transferir solo los artefactos declarados por sus `needs`. Usar un checkout limpio y salidas nuevas: los extractores rechazan sobrescrituras.

| Job | Cobertura y transferencia |
| --- | --- |
| `validate:catalog-contracts` | Node24.21.0/pnpm12.4.2 e instalación congelada; tests externos B–E; Redocly2.53.3 lint sin warnings y bundles de autoridad, HTTP público y privado; cuatro extractores con `--self-test`. Publica bundles y los cuatro directorios de casos por un día. |
| `validate:catalog-schema` | Sourcemeta16.10.0; `needs` del job anterior con descarga de artefactos; metaschemas de transporte B–E y catálogo de errores v6; runner estructural existente sobre cada directorio. Requiere positivos y negativos, y solo acepta rechazo de instancia con exit2/diagnóstico previsto. |

La matriz CAF contractual se comprueba con los gates existentes: arquitectura/preservación para CAF-01; B/C para autoridad/contexto CAF-02; D/E para captura histórica y precisión CAF-03/04/07; perfiles productor/consumidor y evolución sintética E para CAF-08/09/10; inventario campo→clasificación/finalidad/acceso/retención y negativos E para CAF-14. Las matrices operación→hecho→campo e inventarios de fixtures conservan sus fuentes B–E, sin otro inventario paralelo.

Mantener aparte la regresión del wrapper `opencomerix contracts`: descubre referencias, lint de ventas/sync y once schemas históricos de eventos; no ejecuta por sí solo la matriz nueva. Reproducción local de jobs y transferencia de artefactos no equivalen a pipeline GitLab: se verifica el SHA/ref exacto al publicar/consumir. Estado, resultados y próximo paso en [ESTADO del launcher](../../../ESTADO.md); la publicación G requiere autorización específica. Los límites runtime/CAF-11/12 y AsyncAPI de E permanecen vigentes.

## F1-07G — Admisión y publicación

El registro canónico incorpora 30 raíces B–F: HTTP público/privado 1.0.0, autoridad privada 1.0.0, schemas/policies compartidos, Problem Details v3, errores v6, cuatro perfiles de productor/lector wire 1 e inventarios/vectores de validación. Sus IDs, versiones y hashes pertenecen al [registro](../registry/contracts.json) y a los índices de dominio; no se duplican en otra lista. AsyncAPI conserva estado 'draft' documental y su topología futura; ninguna revisión wire 2 sintética se admite como transporte.

Toda raíz nueva fija los bytes Git del commit publicado '68d923e903b6341eedb980af3586890c0eab7d5e'. Los descriptores anteriores, 236 artefactos históricos, intención de venta F1-10 y manifiestos/locks/exports H2 permanecen intactos. Las marcas candidate de las fuentes B–F describen su corte de origen; no se reescriben para publicar metadatos. 'active' expresa vigencia contractual de la raíz; no concede uso funcional si su cierre contiene dependencias draft ni acredita runtime o consumidores nuevos.

El resolvedor de locks/impacto aplica la organización de dominios registrada también a las referencias nuevas: transporte con superficie/versión y 'externalValue' de fixtures por capacidad. Rechaza dominios/rutas desconocidos y schemas que referencien fixtures. Conserva los pins existentes; no ejecutar 'sync --write' ni importar admisiones consumidoras como parte de G. Las pruebas externas de admisión resuelven los cierres reales desde la fuente inmutable y contrastan preservación e inventario.

La admisión funcional (`producer`, `consumer`, `semantic-owner`) exige que la raíz y las dependencias registradas de su cierre seleccionado no sean `draft`, también al regenerar con pins. Impacto informa `unresolved` si se viola ese límite. En G, los ocho perfiles de eventos quedaron bloqueados por `common.event-envelope.v1` draft; G no promovió ese descriptor ni modificó sus bytes. La [admisión F1-08B](../common/README.md#f1-08b--admisión-del-envelope-de-eventos), autorizada en corte propio y auditada satisfactoriamente, cambia únicamente su estado a active y verifica la resolución funcional del mismo cierre; publicación y CI constan en [ESTADO](../../../ESTADO.md). Las admisiones consumidoras requieren cortes propios. AsyncAPI conserva draft. Un mapping a un draft ajeno a la selección no bloquea por sí solo una operación HTTP válida.

Referencia de release: tag inmutable 'catalog-contracts-v1.0.0' sobre el commit de admisión G; las raíces conservan el SHA fuente anterior y 'tag/tagObject: null', sin asociarles un tag de otro commit. Consumir únicamente tras verificar commit/tag y CI por SHA/ref exactos; launcher integra ese commit mediante gitlink autorizado. Los resultados de publicación se registran en [ESTADO](../../../ESTADO.md). No mover tags previos ni fabricar procedencias. Los comandos de validación siguen en la configuración CI F y el registro.

Perfil histórico versionado y productor de identidad siguen pendientes de tandas propias antes de F1-08. Este paquete no cierra H3 ni acredita CAF runtime o certificación AsyncAPI completa; tampoco autoriza iniciar servicios, gateway o PWA.

## Candidato F1-08C — Políticas de historia R1

[catalog-history-policy-v1.json](http/shared/v1/catalog-history-policy-v1.json) materializa como metadatos candidatos ADR-062/R1 bajo el [schema común](../common/http/shared/v1/data-lifecycle-policy-v1.schema.json). El catálogo versiona clasificación, finalidad, hito, retención, configuración restringida, bloqueos por obligaciones/holds, copias y evidencia. Historia original e índice conservan su ciclo propio; transporte, auditoría y evidencia crítica mantienen sus políticas independientes. La interpretación jurídica y el cálculo fiscal existente no se sustituyen.

La clasificación de cada campo referencia el inventario completo de [la política E](events/v1/catalog-event-policy-v1.json), fijado por commit/hash y verificado contra Git y el checkout. Conserva sus metadatos, reemplazando exclusivamente la asignación de retención al persistir historia. La intención futura de un consumidor en E no concede acceso: los requisitos de autoridad de ADR-062/R3 permanecen pendientes. Los campos adicionales de índices, obligaciones, sesiones/grants y cobertura se señalan `pending-protocol`; archivos temporales siguen prohibidos. Ningún almacenamiento está habilitado para producción por este candidato.

- [Vectores](fixtures/history-policy/v1/history-policy-v1-vectors.json): base, casos estructurales para Sourcemeta y negativos semánticos de rango, cierre, holds, obligaciones, privacidad, configuración, cobertura y procedencia.
- [Validador/extractor](../scripts/catalog/validate-history-policy-v1.mjs) y [tests externos](../test/catalog/history-policy-v1.test.mjs): integridad de fuentes, cobertura y coherencia de políticas; no calculan elegibilidad ni ejecutan purgas. El extractor usa una salida vacía y nunca sobrescribe evidencia.
- Los jobs existentes `validate:catalog-contracts`/`validate:catalog-schema` añaden extracción y validación, conservando sus comandos anteriores y transferencia de artefactos. El runner Sourcemeta compartido exige rechazo de instancia, no errores de herramienta/preparación.

Desde contracts, mediante `opencomerix check contracts`, con Node 24.21.0/pnpm 12.4.2 y Sourcemeta 16.10.0:

```text
node --test --test-reporter=tap test/architecture/*.test.mjs test/catalog/*.test.mjs
node scripts/catalog/validate-history-policy-v1.mjs .ci-artifacts/catalog-history-policy-v1 --self-test
jsonschema metaschema common/http/shared/v1/data-lifecycle-policy-v1.schema.json
jsonschema validate common/http/shared/v1/data-lifecycle-policy-v1.schema.json catalog/http/shared/v1/catalog-history-policy-v1.json --format-assertion
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-history-policy-v1
```

También ejecutar registro, consumidores/impacto y el cotejo local del launcher de la guía contractual. El registro/índices solo añaden intenciones `planned`; las raíces admitidas, publicados, pins y locks previos se conservan. Admisión funcional/publicación, protocolos R2–R4 y productor de identidad requieren cortes propios antes de F1-08. Fixtures no acreditan SQL, autoridad, criptografía, disposición, recuperación ni CAF-11/12/14 runtime. Estado y evidencia vigente: [ESTADO](../../../ESTADO.md).

## Candidato F1-08E — Obligaciones y cierres R2

[API privada](http/private/v1/catalog-history-protection-v1.yaml), [schema](http/shared/v1/catalog-history-protection-v1.schema.json) y [política normativa](http/shared/v1/catalog-history-protection-v1-policy.json) concretan ADR-062/R2. Un POST recibe mensajes de baseline, altas/cambios/liberaciones de obligaciones, checkpoints, cierres y holds. La fuente entrega duraderamente después de su commit; la venta no espera esa entrega. No se amplían las 25 operaciones comerciales ni se usa la API de recuperación R3/R4.

- Autoridad: H1A ES256 de workload, audiencia exclusiva y admisión local vigente por fuente/contrato/caller/tenant/ámbito. El schema Inventory describe configuración local, no un endpoint de autorregistro. Evidencias son IDs opacos cuya autoridad actual debe verificar el backend; ni el body ni el JWT por sí solos conceden autoridad de dominio. Liberar holds exige autoridad reforzada, también al aplicar un baseline preparado antes. Cada fuente futura conserva contrato y adaptación propios; ninguna se habilita aquí.
- Identidad: sequence y versiones son decimales canónicos en strings, sin pérdida por Number. La secuencia es contigua por organización/fuente entre todos sus ámbitos; las versiones son contiguas por obligación/hold fuera de snapshots conciliados. La igualdad idempotente ordena claves de objetos y preserva orden de arrays, tipos y valores, sin normalizar fechas. Mensaje/JSON y secuencia se conservan al reintentar; primero se revalida autoridad. Tombstones y vínculos necesarios viven con la protección, independientemente del TTL de inbox.
- Baseline: páginas de hasta 100 entradas en total entre las cuatro listas; ID/corte inmutables, numeración desde 1 y cierre con conteos exactos. La asociación organización/fuente/ámbito/corte y el manifiesto de páginas/cierre se conservan después de completar, durante el ciclo de protección; no se borran con staging o inbox. Un snapshot posterior usa ID nuevo; un ID completado no se reabre, aunque su contenido coincida. El replay conserva el mensaje original. Cut corresponde al stream confirmado antes de las páginas; cambios protectores posteriores exigen otro baseline. Las obligaciones/holds locales omitidos se conservan; solo tombstones explícitos y autorizados pueden liberarlos. Un salto de versión solo se acepta dentro de snapshot conciliado, sin acortar obligaciones conocidas. Los inventarios locales no imponen un cupo total de referencias.
- Reconciliación: un hueco del stream compartido bloquea toda la fuente, incluidos sus ámbitos cerrados: el ámbito del mensaje posterior no delimita el del mensaje ausente. Se reproducen los mensajes originales faltantes y se revalida cada ámbito mediante baseline nuevo o checkpoint fresco; los cerrados usan checkpoint sin reabrir su fence. Solo entonces se levanta el bloqueo de fuente. El checkpoint usado como prueba exige cero mensajes y operaciones pendientes; declarar trabajo pendiente también invalida una prueba anterior. Un cambio posterior invalida la prueba previa de ese ámbito; completar un único baseline o vaciar el hueco no libera los demás. Otras fuentes permanecen independientes. Contradicciones o referencias tardías tras cierre conservan bloqueo y requieren resolución explícita del dueño; un baseline vacío no las borra. No se incluye un atajo administrativo que fuerce liberación.
- Cierre: checkpoint inmediatamente anterior del stream, baseline vigente, conteos conciliados, cero trabajo/mensajes pendientes y fence durable de la fuente contra nuevas referencias. Puede haber obligaciones o holds vigentes: el cierre no los libera. Nuevos ámbitos, cambios de inventario o nuevas credenciales no pueden eludir cierres previos. Altas incompatibles tardías se rechazan, bloquean y alertan; liberar obligaciones existentes o administrar holds autorizados mantiene el fence.
- Retención y privacidad: perfil/versión/jurisdicción, hito/vencimiento explícitos o desconocidos y suspensiones pertenecen a la fuente. No se recalculan plazos fiscales aquí. Holds son independientes y no desaparecen por vencimiento; una liberación no ejecuta purga. R1 permanece intacto; la política R2 clasifica sus campos de transporte y H integrará el catálogo conjunto. No hay PII copiada, payloads de negocio, secretos ni valores en telemetría.
- Errores: [catálogo canónico candidato v7](../common/errors/v7/error-catalog-v7.json), preservando v6. 409 no aplica la liberación solicitada pero puede conservar bloqueo/cuarentena auditados; requiere reconciliación, sin retry ciego. 401/403 son genéricos. 200 aplicado/duplicado no autoriza disposición. Cada respuesta impide cache y los errores omiten detalles libres. El presupuesto es 10 s incluido body y 128 KiB UTF-8 por mensaje; saturación técnica usa Retry-After, sin cupo comercial ni diferencia de plan.

[Vectores sintéticos](fixtures/history-protection/v1/history-protection-v1-vectors.json), [oráculo/extractor](../scripts/catalog/validate-history-protection-v1.mjs) y [tests externos](../test/catalog/history-protection-v1.test.mjs) verifican forma y trazas contractuales. Desde contracts, mediante opencomerix check contracts:

~~~text
node --test --test-reporter=tap test/architecture/*.test.mjs test/catalog/*.test.mjs
node scripts/catalog/validate-history-protection-v1.mjs .ci-artifacts/catalog-history-protection-v1 --self-test
sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-history-protection-v1
jsonschema metaschema catalog/http/shared/v1/catalog-history-protection-v1.schema.json common/errors/v7/error-catalog-v7.schema.json
jsonschema validate common/errors/v7/error-catalog-v7.schema.json common/errors/v7/error-catalog-v7.json --format-assertion
~~~

Redocly 2.53.3 ejecuta lint sin warnings y bundle; Sourcemeta 16.10.0 ejecuta metaschemas y positivos/negativos reales. Se conservan jobs/gates anteriores, registro/consumidores/impacto y cotejo local del launcher. Extractores requieren una salida nueva vacía. Registro e índices solo incorporan planned: sin locks ni admisión funcional. Fixtures no acreditan identidad/firma/autorización reales, SQL/inbox, carreras, ausencia real de referencias/offline, fences ni disposición segura. Esos prerrequisitos siguen pendientes antes del runtime; estado en [ESTADO](../../../ESTADO.md).
