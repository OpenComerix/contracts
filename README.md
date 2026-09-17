# Contratos públicos de OpenComerix

Este directorio contiene los contratos versionados que deben validar productores y consumidores en CI.

- `openapi/pos-sales-v1.yaml`: API pública inicial del flujo de venta y consulta de estado.
- `openapi/pos-sync-v1.json`: bootstrap, cambios incrementales y entrega de operaciones offline.
- `events/event-envelope-v1.schema.json`: sobre común de eventos de dominio.
- `events/sale-flow-common-v1.schema.json`: tipos reutilizables del flujo de venta.
- `events/sales.sale.completed.v1.schema.json`: evento inmutable de venta completada.
- Los demás archivos `*.v1.schema.json` formalizan reversión, inventario, reconciliación, pagos, cuenta corriente y resultados fiscales.

Las decisiones funcionales se explican en `docs/arquitectura/CONTRATO_VENTA_V1.md`. Los contratos de esta carpeta son la representación validable de esas decisiones.

## Validación automática

El pipeline raíz ejecuta tres controles independientes:

- lectura de todos los contratos JSON y resolución de cada referencia local mediante `scripts/validate-contract-refs.mjs`;
- validación semántica de OpenAPI 3.1 con Redocly CLI;
- validación de los JSON Schema Draft 2020-12 contra su metaesquema con Sourcemeta JSON Schema CLI.

Las versiones de Node y de las herramientas quedan fijadas en `.node-version` y `.gitlab-ci.yml`. Esta automatización se trasladará junto con los contratos al repositorio dedicado cuando se cree.

## Reglas de compatibilidad

- Se pueden agregar campos opcionales sin cambiar la versión principal.
- No se eliminan campos ni se cambia su significado dentro de una versión.
- Un cambio incompatible crea un nuevo endpoint principal o un nuevo `event_type`.
- Los consumidores deben ignorar campos desconocidos.
- Los ejemplos deben validarse en CI junto con los esquemas.
