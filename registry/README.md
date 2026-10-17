# Registro contractual

`contracts.json` declara ownership, superficie, estado y versión de cada raíz histórica. Los índices por dominio la referencian. `planned` registra intención y no admite consumo. Las fuentes se leen desde commits/tags exactos, sin trasladar ni normalizar contratos publicados.

La [guía contractual del launcher](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14) fija la ubicación física de nuevos contratos: dominio/transporte/superficie/versión y fixtures por capacidad. Las raíces globales anteriores se conservan exclusivamente para los artefactos preservados; no alojan sucesores nuevos. Los READMEs de dominio permiten navegar candidatos sin modificar index.json, planned ni admisiones por inferencia. El gate de layout obtiene los dominios y las excepciones del registro actual.

Los schemas `manifest-v1.schema.json` y `lock-v1.schema.json` describen la intención y admisión de cada consumidor. `consumers/index.json` establece la cobertura conocida; sus cuatro exports derivan de manifiesto/lock, con revisión base y hashes. `local-candidate` no demuestra publicación ni ausencia de consumidores externos.

Con Node 24.21.0 y pnpm 12.4.2 ejecutar instalación congelada y `pnpm test:architecture`, `pnpm registry:check`, `pnpm contracts:consumers`, `pnpm contracts:impact --output .ci-artifacts/contract-impact.json`. Para verificar los checkouts vecinos del launcher: `node tools/architecture/cli.mjs consumers --local`.

`node tools/architecture/cli.mjs sync --write` genera metadatos exclusivamente durante una implementación autorizada; conserva pins existentes y nunca se ejecuta en CI. Candidatos consumidor y herramienta copiada siguen no publicados. `import-published --service NAME --revision SHA --write` requiere revisión/publicación/pipelines autorizados; lee el manifiesto y lock desde el commit Git especificado. No actualiza consumidores ni dispara pipelines remotos.

El resolvedor sigue selecciones por operación/pointer, referencias locales/URI mapeadas y seguridad efectiva. Los manifiestos agregan policy, errores y fixtures explícitos. Referencias/keywords desconocidos o cobertura omitida fallan cerrados; los dos schemas de metadatos usan un subconjunto estricto del gate nativo. Sourcemeta/Redocly y los gates runtime existentes permanecen obligatorios.

F1-08H añade lectura acotada de aliases YAML de valores mediante `tools/architecture/yaml-source.mjs`; límites, rechazos y semántica de hashes en [Grafo e impacto](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#grafo-e-impacto). No modifica fuentes publicadas ni migra admisiones. Las pruebas `test/architecture/yaml-source.test.mjs` incluyen el R4 real y casos adversos.

El reporte separa impacto funcional de documentación/validación y propone pruebas. Cambios de forma o semántica requieren revisión; no son automáticamente compatibles. Requests, responses, errores, headers, seguridad y recuperación forman parte del contrato. `sales.sale.completed.v1` es inmutable; un sucesor incompatible pertenece a F1-10.

## F1-08H — Candidato de admisión seleccionada

El [mapa H](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4) delimita las 24 raíces nuevas desde la fuente publicada y su CI exacto. Se conservan los 85 descriptores previos y se retiran únicamente esas intenciones de planned; los índices catalog/common/identity se derivan del registro, sin ejecutar sync ni regenerar consumidores. Mappings nuevos se limitan a archivos del cierre resuelto; no promueven contratos ajenos. La clasificación v2 conserva sus pins originales y no habilita producción. La admisión permanece como candidato local hasta completar gates, auditoría y publicación; estados y bloqueos en [ESTADO](../../../ESTADO.md).
