# Transporte transversal

Coordinación: platform-contracts, sin servicio ni base compartidos. Solo abstracciones de transporte transversales; los dominios emisores conservan la propiedad de sus códigos. [Índice admitido](index.json) y [registro](../registry/README.md) fijan procedencias existentes; [guía contractual](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14) rige contratos nuevos.

Fuentes F1-07B incluidas en la admisión G:

- [Problem Details v3](http/shared/v3/problem-details-v3.schema.json): forma v2 preservada, con 406/413/415 adicionales; nueva identidad de schema bajo esta ruta.
- [Catálogo de errores v6](errors/v6/error-catalog-v6.json) y [schema](errors/v6/error-catalog-v6.schema.json): conserva las 24 entradas v5 y agrega 25 códigos aprobados con owners explícitos.
- fixtures/errors/v6 contiene códigos transversales que no están usados como ejemplos HTTP de los dos puertos; esos ejemplos permanecen vinculados a la capacidad que prueban. [Inventario/gates B](../identity/fixtures/catalog-authority/v1/identity-catalog-authority-v1-fixtures.json), ejecución en [README principal](../README.md#f1-07b--seguridadbase-de-catálogo-candidatos).

Artefactos anteriores en openapi/errors/events y admisiones H2 permanecen inmutables. G registra los nuevos descriptores sin reemplazar pins. [Procedencia, gates y publicación](../catalog/README.md#f1-07g--admisión-y-publicación); no trasladar negocio a common ni equiparar carpeta con autoridad.
