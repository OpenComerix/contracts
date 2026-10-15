# Contratos de catálogo y precios

Owner semántico: catalog-pricing. La organización física sigue [la guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14). [Índice](index.json): intenciones públicas/privadas planned; no admisión ni runtime por existir archivos.

Candidatos F1-07B:

- [Base de transporte](http/shared/v1/catalog-common-v1.schema.json): IDs, decimales, unidades, versiones, paginación y headers de esta capacidad; compartida por sus superficies y puertos de integración.
- [Solicitud canónica](http/shared/v1/catalog-request-v1.schema.json) y [política de seguridad](http/shared/v1/catalog-security-policy-v1.json): matriz de A, vínculos de solicitud, permisos/budgets y límites; no CRUD ni autoridad runtime.
- [Vectores de solicitud](fixtures/request/v1/catalog-request-v1-vectors.json), fixtures/base/v1 y fixtures/errors/v6: formatos/canonicalización y nuevos códigos propios de catálogo/precios. Los ejemplos de errores usados por puertos de identidad se referencian desde su inventario, sin otra copia.
- Herramientas: [scripts/catalog](../scripts/catalog/validate-security-v1.mjs); pruebas: [test/catalog](../test/catalog/security-v1.test.mjs). Ejecución completa y límites en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

Los OpenAPI públicos y privados completos corresponden a C/D, eventos a E y admisión/publicación a G. No cambiar descriptores/locks para presentar estos candidatos como publicados.

## Candidato F1-07C

- HTTP [público](http/public/v1/catalog-pricing-v1.yaml) y [privado](http/private/v1/catalog-pricing-internal-v1.yaml): veinte operaciones de catálogo; cinco de precios reservadas D. Artefactos candidatos 1.0.0, sin admisión por existir archivos.
- [Entidades y solicitudes](http/shared/v1/catalog-entities-v1.schema.json): categorías, producto/variante predeterminada, presentación/barcode, unidades y clasificación fiscal versionada; reutiliza base B y preserva ownership.
- [Inventario HTTP](fixtures/http/v1/catalog-http-v1-fixtures.json), fixtures/http/v1/structure y fixtures/semantics/v1: positivos, errores aplicables, replay y negativos estructurales/semánticos. No validación de runtime.
- Gates: [validate-http-v1](../scripts/catalog/validate-http-v1.mjs), helpers de normalización/semántica separados y [tests](../test/catalog/http-v1.test.mjs). Comandos, versiones y límites en [README raíz](../README.md#f1-07c--http-de-catálogo-candidatos).

Índice/planned, registry y consumer locks sin modificaciones; precios D, eventos E, CI conjunta F y admisión/tags G conservan sus tandas/autorizaciones.

## Candidato F1-07D

- [Precios y lista](http/shared/v1/catalog-prices-v1.schema.json): lista predeterminada, precio vigente/histórico, página y solicitud estricta; reutiliza base decimal B, sin precio embebido en producto/presentación.
- Las superficies pública/privada anteriores completan 25 operaciones: veinte C preservadas y cinco pricing. Fuente candidata ampliada, no admisión/release completo.
- [Fixtures de precios](fixtures/pricing/v1/pricing-http-v1-fixtures.json): errores B referenciados, ejemplos HTTP, structure y semantics por esta capacidad.
- Gate [validate-pricing-http-v1](../scripts/catalog/validate-pricing-http-v1.mjs), helpers específicos y [tests externos](../test/catalog/pricing-http-v1.test.mjs); reutiliza el gate/extractor HTTP C y runner estructural B. Comandos y límites en [README raíz](../README.md#f1-07d--lista-predeterminada-y-precios-candidatos).

Sin nuevos dominios, CI, índices/admisiones/locks, servicios ni PWA. Eventos E, CI conjunta F y release G permanecen pendientes.

## Candidato F1-07E

Diseño concreto aprobado por chat el 2026-10-15: cuatro hechos de `catalog-pricing`, revisión inicial 1. Son candidatos contractuales; admisión G, CI conjunta F y productores siguen separados. Las 25 operaciones HTTP y el sobre publicado conservan sus bytes. No se agrega un cliente de eventos a ventas, PWA o reporting.

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
