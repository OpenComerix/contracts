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
