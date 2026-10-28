# Herramientas de arquitectura contractual

- `cli.mjs`: registro, snapshots, consumidores e impacto; comandos en el README raíz.
- `graph.mjs`: cierres, selección semántica, locks e impacto.
- `git-source.mjs`: lectura agrupada de blobs desde commits completos e inmutables. Comparte objetos por repositorio, devuelve copias y limita precarga a 16 MiB y caché de bytes a 64 MiB por proceso; cada blob conserva el límite de 8 MiB. Lo que no se precarga se lee bajo demanda.
- `consumer-gate.mjs`, `registry.mjs`, `layout.mjs` y `yaml-source.mjs`: validación de consumidores, registro, organización y parsing.

La caché Git es solo memoria del proceso: no guarda resultados de validación ni lecturas del árbol actual, tags o lectores inyectados. No cambia contratos, versiones, pins, admisiones ni comandos CI. Cada validación de preservación sigue comprobando las fuentes actuales. Las pruebas externas de `test/architecture/git-source.test.mjs` usan Git real y ejercitan bytes binarios, procedencia, aislamiento, respuestas incompletas y rechazo de rutas inválidas.
