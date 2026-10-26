# Inventory — mapa y diseño F1-10A

Propietario: `inventory`, única autoridad de posiciones, cantidades, movimientos y disponibilidad. **Diseño candidato; sin contratos nuevos ni consumo habilitado.** [ADR-063](../../../docs/arquitectura/decisiones/ADR-063-intencion-durable-y-finalizacion-de-venta-online.md) fija secuencia/autoridad/historia; [ventas](../sales/README.md) fija captura comercial y dinero; [F1-10](../../../docs/arquitectura/fase-1/F1-10.md) fija las tandas.

## Base y paquete previsto B

[Registro](../registry/contracts.json) e [índice](index.json), base contracts `77062daa13f6e1877b162908c1c7a4d82bbd4d8c`: `inventory.sale-stock.posted.v1` y `inventory.reconciliation-required.v1` son drafts, procedencia `4ec41110d2c4c68139101e0a13109f6fd1cdfcba`, sin tag declarado. Cierre referenciado: `events/event-envelope-v1.schema.json` y `events/sale-flow-common-v1.schema.json`. El resultado v1 carece de operación/proceso, variante/unidad/factor/versiones y snapshots suficientes; se preserva completo y se diseña sucesor **`inventory.sale-stock.posted.v2`, revisión 1**. Reconciliation v1 no se activa para representar un rechazo sin efecto.

Materialización B: HTTP inicial 1.0.0 en `inventory/http/public/v1/inventory-v1.yaml` y `inventory/http/private/v1/inventory-internal-v1.yaml`, tipos/policy de la capacidad en `http/shared/v1/`; comandos/resultados `commands/v1/`; hechos nuevos `events/v1/`, sucesor posted `events/v2/`; fixtures por capacidad bajo `inventory/fixtures/`; herramientas `scripts/inventory/`, tests externos `test/inventory/`. No crear archivos o admisiones en A, ni mover raíces históricas.

## Operaciones, autoridad y resultado

URLs efectivas; público exclusivamente en gateway con cookie/Origin/CSRF y autoridad nueva de identidad definida por ADR-063. Espejos privados no conceden autoridad al navegador. Permisos iniciales otorgables al OWNER del corte, scope organizacional y pertenencia sucursal/depósito/POS validados en backend.

| Intención | operationId / ruta o comando | Resultado / permiso |
| --- | --- | --- |
| Crear depósito inicial de sucursal | `createInitialWarehouse`, POST `/api/v1/inventory/warehouses` | `201` depósito y ubicación inicial propios/Location; `inventory.configure`; una inicial por sucursal, sin recrear en login |
| Resolver contexto autorizado | `listInventoryWarehouses`, GET `/api/v1/inventory/warehouses?branch_id=...` | `200` colección paginada; `inventory.read`; selección automática solo con unicidad autorizada demostrada |
| Cargar stock o ajustar | `adjustInventoryStock`, POST `/api/v1/inventory/adjustments` | `201` grupo/movimientos/versiones; `inventory.adjust`, motivo `opening_stock` o `correction`; expected_version por posición, cero solo si aún inexistente |
| Consultar posición/disponibilidad | `getInventoryPosition`, GET `/api/v1/inventory/positions/{position_id}`; `listInventoryPositions`, GET `/api/v1/inventory/positions` con filtros tipados | `200` cantidades/versiones/as_of; `inventory.read`; ausencia de posición no inventa movimiento inicial |
| Descontar intención aceptada | `inventory.post-sale-stock.v1`, resultado `inventory.post-sale-stock.result.v1` | Solo sales-pos, paso/huella verificados; `succeeded` con movimientos y diferencia autorizada cuando aplica, o `failed` por insuficiencia sin excepción válida |
| Consultar diferencias pendientes | `listInventoryReconciliations`, GET `/api/v1/inventory/reconciliations`; `getInventoryReconciliation`, GET `.../{reconciliation_id}` | `200` colección paginada/caso con ocurrencias paginadas y vínculos; `inventory.read`, tenant y filtros de posición/estado tipados |
| Resolver efecto incierto | `getInventorySaleStockResult`, GET privado `/api/v1/internal/inventory/sale-stock-results/{operation_id}` | `200` resultado retenido; `404` no visto no prueba que no haya comando en vuelo; solo coordinador sales-pos |
| Compensar salida precomercial | `inventory.compensate-sale-stock.v1`, resultado `inventory.compensate-sale-stock.result.v1` | Solo paso de compensación autorizado por sales-pos; cierre terminal/contramovimientos vinculados, sin devolución comercial |
| Reconstruir hechos retenidos | POST `/api/v1/inventory/history-read-sessions`; GET `.../{read_session_id}/facts` | `201` sesión/`200` página, `inventory.history.read` con motivo y step-up según ADR-063 |

Crear depósito no crea productos ni stock. Un adjustment requiere referencia y snapshot de producto/variante/presentación/unidad verificados por el dueño de catálogo antes del efecto; no acepta factor, tipo o nombre libres autoritativos. El diseño de lectura privada de catálogo debe cubrir este uso acotado de inventory junto a la captura de ventas, con audiencia propia y autoridad humana fresca; no ampliar caller de un contrato publicado ni usar sales como maestro de stock. Es prerrequisito contractual/runtime del ajuste, no una capacidad ya disponible.

## Posición, snapshot y atomicidad

Posición F1: organización/sucursal, `warehouse_id`, `location_id` propia inicial y variante/unidad base. Inventory valida su pertenencia; identidad valida sucursal/POS canónicos. Producto `STOCKED_GOOD` usa stock simple; `NON_STOCK_GOOD`/`SERVICE` no crean movimiento y el resultado explicita líneas `not_required` con la causa/snapshot verificados, sin fingir cantidad descontada. La excepción online por producto presente sigue ADR-063 §2.1; lotes/series/reservas/bloqueos/transferencias/valoración y política offline no se incorporan.

Cada línea conserva referencia a intención/venta/line_id y producto/variante/presentación, descripción mínima, versiones fuente, unidad base/presentación, cantidad y factor usados, cantidad base exacta, dirección, posición, motivo, instante UTC/fecha operativa/zona y versión de posición/movimiento. D01/D02/D03/D04/D12 propios; D13 vincula proceso/comando/resultado. No capturar precio/costo/perfil fiscal o identidad personal del cajero en eventos de stock sin finalidad.

Cuando hay insuficiencia, añadir política/versión aplicadas, presencia declarada y motivo tipado, cantidad anterior/posterior firmadas y referencia de concesión/origen auditada, caso/ocurrencia de conciliación. Los saldos pueden ser negativos: strings decimales canónicos con signo solo cuando negativo, hasta 38 dígitos enteros/9 decimales, sin −0/exponentes ni truncamiento; la magnitud de cada movimiento sigue positiva con dirección separada. Esta capacidad no modifica el formato histórico ni autoriza a la PWA a elegir política o permiso.

Cantidad base = cantidad de presentación × factor exactos; admite hasta 9 decimales derivados y hasta 38 dígitos enteros, sin truncar al máximo de entrada 3. Ajuste transporta magnitud positiva y dirección separada; no se confunde cero con ausencia. Magnitudes/unidades incompatibles, escala, mínimo/incremento o rango inválidos se rechazan antes de persistir. Posiciones consolidadas por variante suman las líneas del mismo intento antes de comprobar disponibilidad; el resultado conserva trazabilidad por línea aunque dos presentaciones afecten la misma posición.

Salida es **todo o nada** por grupo de intención: lock/versión y comprobación local de saldos/política en todas las posiciones. Default F1 `ALLOW_AND_ALERT`: únicamente una línea insuficiente declarada presente y cubierta por `inventory.sell_with_stock_difference`, concedido por backend y ligado al intento, permite saldo negativo con evidencia. Con `BLOCK`, falta de permiso/presencia o ámbito inválido, rechazo del grupo entero sin salida ni cobro. Saldo, movimientos, resultado terminal, historia, auditoría/inbox/outbox y caso/ocurrencia/alerta locales se confirman juntos. Disponibilidad previa no garantiza aceptación ni fija el saldo de aplicación. Ajustes que producirían negativo siguen rechazados. `available=on_hand` en el corte sin reservas/bloqueos, incluidos sus negativos visibles.

Posición aún sin movimientos: acumulador inicial cero, sin fingir conteo físico ni entrada de stock, y primera salida autorizada con diferencia. No exigir carga inicial positiva para esta venta. Concurrencia: dos salidas autorizadas pueden generar un negativo mayor, exactamente explicado por ambas; sin excepción se conserva el rechazo por insuficiencia. No perder actualizaciones, normalizar a cero ni cambiar producto/depósito para eludir la diferencia.

La conciliación agrupa ocurrencias bajo un caso abierto por tenant/posición, con identidad única por operación/posición. Una repetición devuelve los mismos movimientos, caso y ocurrencia, sin otro warning/alerta lógica. Cada caso conserva cantidades, causa, movimiento/operación/venta, política/versión y origen autorizado; no copia credenciales ni PII en eventos. La advertencia tipada `inventory_stock_difference_recorded` tiene severidad `action_required`, referencias mínimas y no bloquea finance. Consultar el pendiente no altera stock ni declara resuelta la diferencia. El ajuste autorizado `correction` puede enlazar `reconciliation_id`; verificar/resolver la discrepancia física tiene evidencia propia y no equivale a reconstruir técnicamente el saldo. Este corte no añade sesiones de conteo ni una acción genérica de cerrar alertas sin verificación.

Idempotencia semántica: organización + operación de venta + line_id + tipo de efecto, y grupo único por intención; mismo comando/contenido devuelve el resultado estable. IDs de comando nuevos no permiten otra salida de la misma venta. La compensación tiene operación/command_id propios y referencia a la salida original; restaura exactamente magnitudes/posiciones originales una vez. Si llega antes, persiste cierre terminal del intento de salida; una salida tardía no se aplica. Rechazo financiero terminal es precondición, no una orden del usuario de devolver mercadería. Factores/versiones actuales no se usan para rehacerla.

Compensar una salida con negativo no elimina ni resuelve automáticamente el caso/ocurrencia: agrega la referencia de compensación y conserva la diferencia pendiente de verificación. Tampoco basta que un ingreso posterior deje saldo positivo.

Éxito con movimientos físicos publica `inventory.sale-stock.posted.v2`; ajuste, `inventory.stock-adjustment.recorded.v1`; compensación de movimientos, `inventory.sale-stock.compensated.v1`. Un grupo solo de líneas sin control físico devuelve éxito con `not_required`, sin evento falso de salida; un cierre adelantado sin movimientos solo produce su resultado/auditoría. Cada hecho tiene identidad/versiones propias y copia original en historia. Los resultados dirigidos tienen `command_id`, `result_id`, tipo/revisión, tenant/proceso/operación, status succeeded/failed, retryable/error_code según sobre publicado, IDs/versiones/estado propios y causalidad. Rechazo sin efecto conserva resultado/auditoría, sin evento falso de movimiento. Ventas consume el resultado; no ejecuta nuevamente stock por recibir el evento informativo.

Una diferencia autorizada mantiene `posted` como resultado físico e informa separadamente `reconciliation_required`, policy/version, IDs de caso/ocurrencia y warning. Caso/ocurrencia también tienen hecho retenido `inventory.reconciliation-required.v2`, revisión 1, bajo `events/v2/`: el v1 histórico no se amplía. No usar un estado de conciliación como si el movimiento no hubiera ocurrido. Alerta es local de inventory; emails/reporting son capacidades separadas.

## Errores y recuperación

| Código nuevo | HTTP / retryable | Semántica |
| --- | --- | --- |
| `inventory_invalid_request`, `inventory_invalid_history_cursor` | 400 / false | Forma/query/cursor |
| `inventory_resource_not_found` | 404 / false | Recurso ajeno/inexistente |
| `inventory_version_conflict`, `inventory_state_conflict`, `inventory_operation_conflict`, `inventory_idempotency_key_reused` | 409 / false | Conflicto determinístico de versión/estado/identidad/carga |
| `inventory_idempotency_request_in_progress` | 409 / true | Reserva concurrente todavía en curso |
| `inventory_insufficient_stock` | 422 / false | Insuficiencia sin excepción válida por política/permiso/presencia; rechazo sin salida parcial ni cobro |
| `inventory_quantity_invalid`, `inventory_catalog_reference_invalid` | 422 / false | Conversión/escala/rango/referencia de catálogo inválidos |
| `inventory_history_coverage_changed` | 409 / false | Reiniciar corte por disposición concurrente |
| `inventory_delegation_invalid`, `inventory_delegation_request_mismatch` | 401, 403 respectivamente / false | Autenticación/vínculo del delegado |

B registra códigos aditivamente; reutiliza errores comunes/identidad con su significado, no los de catálogo para su dominio. Los comandos usan esos códigos en resultado `failed`; error técnico transitorio no fija rechazo definitivo ni habilita compensación. Mensaje/versión desconocida o contradicción va a cuarentena sin efecto. Reintento/timeout y presupuesto de autoridad siguen ADR-063 y ADR-019; no retry con identidad nueva.

Historia propia incluye ajustes, salidas y compensaciones con sus snapshots originales. Lectura autorizada y cobertura siguen ADR-063 §4; el saldo se reconstruye desde movimientos retenidos, no desde eventos de catálogo ni outbox. Si falta historia previa de una posición se declara parcial; no ofrecer saldo reconstruido como completo ni generar ajustes silenciosos.

## Evidencia pendiente

B: positivos/negativos por operación, escala de entrada/base derivada, tenant/scopes, referencia de catálogo, dos líneas de la misma posición, stock cero/ya negativo/sin movimientos previos, excepción válida o denegada por presencia/permiso/política, duplicate/conflict sin doble caso/ocurrencia, compensación adelantada y posterior a diferencia, versiones e historia; perfiles productor estricto/consumidor compatible y AsyncAPI de comandos/resultados/hechos. E conecta venta y finance con salida normal, salida con diferencia y rechazo sin excepción. Sin actualización de gitlinks en B.

F1-11 acredita con PostgreSQL/broker/autoridad reales RLS, concurrencia por política (sin excepción solo una venta consume el último stock; con excepción ambas salidas se explican y el negativo es exacto), rollback de grupo/saldo/movimientos/caso/ocurrencia/alerta/historia/auditoría, unicidad tardía, inbox/outbox, cierre del intento por compensación sin borrar la discrepancia y reconstrucción después de limpiar transporte. El ajuste requiere además el puerto de catálogo aceptado. Documentos/fixtures no acreditan esas pruebas ni habilitan runtime o purga.
