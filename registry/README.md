# Registro contractual

`contracts.json` declara ownership, superficie, estado y versión de cada raíz histórica. Los índices por dominio la referencian. `planned` registra intención y no admite consumo. Las fuentes se leen desde commits/tags exactos, sin trasladar ni normalizar contratos publicados.

Los schemas `manifest-v1.schema.json` y `lock-v1.schema.json` describen la intención y admisión de cada consumidor. `consumers/index.json` establece la cobertura conocida; sus cuatro exports derivan de manifiesto/lock, con revisión base y hashes. `local-candidate` no demuestra publicación ni ausencia de consumidores externos.

Con Node 24.21.0 y pnpm 12.4.2 ejecutar instalación congelada y `pnpm test:architecture`, `pnpm registry:check`, `pnpm contracts:consumers`, `pnpm contracts:impact --output .ci-artifacts/contract-impact.json`. Para verificar los checkouts vecinos del launcher: `node tools/architecture/cli.mjs consumers --local`.

`node tools/architecture/cli.mjs sync --write` genera metadatos exclusivamente durante una implementación autorizada; conserva pins existentes y nunca se ejecuta en CI. Candidatos consumidor y herramienta copiada siguen no publicados. `import-published --service NAME --revision SHA --write` requiere revisión/publicación/pipelines autorizados; lee el manifiesto y lock desde el commit Git especificado. No actualiza consumidores ni dispara pipelines remotos.

El resolvedor sigue selecciones por operación/pointer, referencias locales/URI mapeadas y seguridad efectiva. Los manifiestos agregan policy, errores y fixtures explícitos. Referencias/keywords desconocidos o cobertura omitida fallan cerrados; los dos schemas de metadatos usan un subconjunto estricto del gate nativo. Sourcemeta/Redocly y los gates runtime existentes permanecen obligatorios.

El reporte separa impacto funcional de documentación/validación y propone pruebas. Cambios de forma o semántica requieren revisión; no son automáticamente compatibles. Requests, responses, errores, headers, seguridad y recuperación forman parte del contrato. `sales.sale.completed.v1` es inmutable; un sucesor incompatible pertenece a F1-10.
