# Registro contractual

`contracts.json` declara ownership, superficie, estado y versión de cada raíz histórica. Los índices por dominio la referencian. `planned` registra intención y no admite consumo. Las fuentes se leen desde commits/tags exactos, sin trasladar ni normalizar contratos publicados.

La [guía contractual del launcher](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#organización-física-de-contratos-nuevos--aprobada-el-2026-10-14) fija la ubicación física de nuevos contratos: dominio/transporte/superficie/versión y fixtures por capacidad. Las raíces globales anteriores se conservan exclusivamente para los artefactos preservados; no alojan sucesores nuevos. Los READMEs de dominio permiten navegar candidatos sin modificar index.json, planned ni admisiones por inferencia. El gate de layout obtiene los dominios y las excepciones del registro actual.

Los schemas `manifest-v1.schema.json` y `lock-v1.schema.json` describen la intención y admisión de cada consumidor. `consumers/index.json` establece cinco consumidores conocidos, incluido catalog-pricing exclusivamente para validación; los exports derivan de manifiesto/lock, con revisión base y hashes. `local-candidate` no demuestra publicación ni ausencia de consumidores externos.

Con Node 24.21.0 y pnpm 12.4.2 ejecutar instalación congelada y `pnpm test:architecture`, `pnpm registry:check`, `pnpm contracts:consumers`, `pnpm contracts:impact --output .ci-artifacts/contract-impact.json`. Para verificar los checkouts vecinos del launcher: `node tools/architecture/cli.mjs consumers --local`.

`node tools/architecture/cli.mjs sync --write` genera metadatos exclusivamente durante una implementación autorizada; conserva pins existentes y nunca se ejecuta en CI. Candidatos consumidor y herramienta copiada siguen no publicados. `import-published --service NAME --revision SHA --write` requiere revisión/publicación/pipelines autorizados; lee el manifiesto y lock desde el commit Git especificado. No actualiza consumidores ni dispara pipelines remotos.

El resolvedor sigue selecciones por operación/pointer, referencias locales/URI mapeadas y seguridad efectiva. Los manifiestos agregan policy, errores y fixtures explícitos. Referencias/keywords desconocidos o cobertura omitida fallan cerrados; los dos schemas de metadatos usan un subconjunto estricto del gate nativo. Sourcemeta/Redocly y los gates runtime existentes permanecen obligatorios.

F1-08H añade lectura acotada de aliases YAML de valores mediante `tools/architecture/yaml-source.mjs`; límites, rechazos y semántica de hashes en [Grafo e impacto](../../../docs/arquitectura/ARQUITECTURA_CONTRACTUAL.md#grafo-e-impacto). No modifica fuentes publicadas ni migra admisiones. Las pruebas `test/architecture/yaml-source.test.mjs` incluyen el R4 real y casos adversos.

El reporte separa impacto funcional de documentación/validación y propone pruebas. Cambios de forma o semántica requieren revisión; no son automáticamente compatibles. Requests, responses, errores, headers, seguridad y recuperación forman parte del contrato. `sales.sale.completed.v1` es inmutable; un sucesor incompatible pertenece a F1-10.

## F1-08J — Validación de la base persistente de catálogo

[catalog-pricing.json](consumers/catalog-pricing.json) añade 17 dependencias de validación, sin operaciones, assets runtime ni bindings. Sus fuentes permanecen en `4ec41110d2c4c68139101e0a13109f6fd1cdfcba`, `68d923e903b6341eedb980af3586890c0eab7d5e` y `28be1edf02a3771629febf554f8b5f4856452877`, verificadas por CI exacto antes del consumo. Selecciona schemas completos y secciones técnicas/de almacenamiento de las políticas; no habilita endpoints, productor ni recuperación.

El [validador J](../scripts/catalog/catalog-foundation-v1-registry.mjs) exige preservar íntegramente las 119 raíces, 236 artefactos, tres intenciones y cuatro exports existentes; solo amplía cobertura e índice. H/I/renovación proyectan esa decisión explícita a su cobertura histórica; sin la decisión exacta siguen rechazando una ampliación arbitraria. Las [pruebas J](../test/architecture/catalog-foundation.test.mjs) verifican transición, roles, pins, index y preservación; las pruebas históricas conservan fuentes inmutables para el índice anterior. El tooling genérico y los contratos publicados no cambian. Auditoría, publicaciones y próximo paso se centralizan en [ESTADO](../../../ESTADO.md).

El control J de CI admite `local-candidate` con su base prevista o `published` con SHA completo bien formado, conservando identidad, manifiesto, lock, hashes, roles y pins exactos. Ese control no acredita publicación: `consumers --local` verifica obligatoriamente manifiesto/lock desde el commit Git admitido del consumidor, mediante el mecanismo existente; CI standalone no necesita un checkout vecino. Las pruebas sintéticas de esa separación no acreditan un commit ni pipeline nuevos. Publicar/importar mantiene autorización y CI por SHA/ref exactos.

## F1-08H — Candidato de admisión seleccionada

El [mapa H](../catalog/README.md#f1-08h--admisión-seleccionada-r1r4) delimita las 24 raíces nuevas desde la fuente publicada y su CI exacto. Se conservan los 85 descriptores previos y se retiran únicamente esas intenciones de planned; los índices catalog/common/identity se derivan del registro, sin ejecutar sync ni regenerar consumidores. Mappings nuevos se limitan a archivos del cierre resuelto; no promueven contratos ajenos. La clasificación v2 conserva sus pins originales y no habilita producción. La admisión permanece como candidato local hasta completar gates, auditoría y publicación; estados y bloqueos en [ESTADO](../../../ESTADO.md).

## F1-08I — Candidato de admisión de identidad

La [selección de identidad](../identity/README.md#f1-08i--candidato-de-admisión-seleccionada) añade seis raíces desde `f92a68a0bba46a7d96d69b8af8aa6c0d00187d7a`, con CI fuente Passed por SHA/ref exactos. Preserva íntegramente las 109 admisiones y 236 artefactos previos; total 115, con tres intenciones planned originales. Solo deriva identity/index.json; no cambia consumers, locks, pins ni bytes de transporte. El gate de I acepta la fuente candidata histórica o el paquete admitido exacto, nunca una admisión parcial; los gates H conservan sus verificaciones. Admisión y runtime mantienen sus permisos y evidencia propios.

## F1-08I — Candidato de renovación R3 v2

La [renovación tras step-up](../identity/README.md#f1-08i--candidato-de-renovación-r3-v2-tras-step-up) agrega únicamente cuatro intenciones planned, sin promover sus fuentes ni cambiar las 115 admisiones/236 artefactos o los cuatro exports. H/I conservan sus comprobaciones históricas; proyectan solo ese sufijo exacto y cerrado, cuya preservación completa se comprueba por separado. No hay tolerancia a intenciones arbitrarias, paquetes parciales o nuevas admisiones. Los siete planned actuales incluyen las tres intenciones originales. Auditoría/publicación/CI y admisión preceden al runtime.

## F1-08I — Candidato de admisión de renovación R3 v2

La [selección de renovación](../identity/README.md#f1-08i--candidato-de-admisión-de-renovación-r3-v2) incorpora únicamente cuatro raíces desde `56724471a5460e22d936bd09bef448efe46d87e6`, fuente publicada con CI exacto Passed. Preserva las 115 admisiones, 236 artefactos y tres planned originales; total 119 raíces. Solo deriva identity/index.json y retira las cuatro intenciones seleccionadas. El gate específico verifica la fuente histórica o la transición admitida completa antes de proyectar para H/I; no oculta cambios ajenos ni admite paquetes parciales. Se conservan transporte, políticas, semántica, pins, CI, tooling genérico y consumidores/locks/exports. No hay sync ni runtime; auditoría/publicación y admisión consumidora mantienen sus permisos propios. La sección fuente anterior conserva su descripción de siete planned históricos.

## F1-08K — HTTP privado y captura original aislados

El [export de catálogo](consumers/catalog-pricing.json) conserva las 17 selecciones J y añade 12 para las 25 operaciones privadas, autoridad ordinaria/OAuth/JWKS, normalización/seguridad/errores y cuatro resultados originales locales. [Gate K](../scripts/catalog/catalog-runtime-v1-registry.mjs) y [pruebas](../test/architecture/catalog-runtime.test.mjs) exigen contenido, pins, hashes y roles exactos, sin assets/bindings ni activación funcional antes de O.

K acepta el candidato en su base prevista o contenido publicado idéntico con SHA completo. Solo pueden variar lifecycle/sourceCommit: la etiqueta no demuestra publicación ni CI. El mecanismo existente `consumers --local` conserva la lectura obligatoria del manifiesto/lock desde el commit Git registrado; `import-published` se ejecuta después de verificar el pipeline exacto del consumidor. No modificar el verificador genérico ni ejecutar sync global. Publicación y cierre se registran en ESTADO.

## F1-08L — Protección y disposición aisladas

El [export de catálogo](consumers/catalog-pricing.json) preserva las 29 selecciones K y agrega ocho R1/R2 y una R3 limitada a `verifyCatalogRecoveryGrant` para `catalog.history.configure`: total 38, sin assets/bindings ni fuentes nuevas. El [gate L](../scripts/catalog/catalog-lifecycle-v1-registry.mjs) y sus [pruebas](../test/architecture/catalog-lifecycle.test.mjs) comprueban el delta exacto, los pins publicados, las 119 raíces/236 artefactos, índices y cuatro exports ajenos. J/K proyectan exclusivamente esa ampliación completa; la procedencia Git genérica sigue siendo obligatoria para publicación. Sin recuperación M, broker o activación antes de O; auditoría/publicación y estado en ESTADO.
