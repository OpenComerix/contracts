# Contratos de identidad y tenencia

Owner semántico: identity-tenancy. [Índice admitido](index.json) y [registro](../registry/README.md) conservan las fuentes H2 exactas en sus rutas históricas. Organización nueva según [guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14).

Candidato F1-07B:

- [HTTP privado de autoridad de catálogo](http/private/v1/identity-catalog-authority-v1.yaml), 1.0.0: dos puertos; emisor gateway con cookie/workload y comprobación por workload catalog-pricing. No es una API pública de catálogo.
- [Schemas](http/private/v1/identity-catalog-authority-v1.schema.json): requests, respuestas y claims; referencias a la base de catálogo y Problem Details comunes.
- [Inventario HTTP/estructural](fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json) y [contextos semánticos](fixtures/catalog-authority/v1/catalog-authority-semantic-v1-fixtures.json). Examples/semantic/structure bajo esa capacidad; refs cruzadas a fixtures catalog/common expresan su responsabilidad.
- Gates conjuntos de integración contractual en [scripts/catalog](../scripts/catalog/validate-security-v1.mjs) y tests externos [test/catalog](../test/catalog/security-v1.test.mjs). Uso en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

Sin admisión ni productor runtime todavía. No reutilizar audiencias H2 para catálogo, mover sus archivos ni interpretar fixtures como prueba de criptografía/autorización real. Publicación/admisión en G y productor de identidad en otra tanda antes de F1-08.
