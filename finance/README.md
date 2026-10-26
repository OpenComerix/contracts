# Finance — mapa y diseño F1-10A

Propietario: `finance`, autoridad exclusiva de caja, turno, cobro y movimientos de fondos. **Diseño candidato; sin contratos nuevos ni consumo habilitado.** Secuencia/autoridad/historia en [ADR-063](../../../docs/arquitectura/decisiones/ADR-063-intencion-durable-y-finalizacion-de-venta-online.md), captura/dinero en [ventas](../sales/README.md), corte físico en [inventario](../inventory/README.md), tandas en [F1-10](../../../docs/arquitectura/fase-1/F1-10.md).

## Base y paquete previsto C

[Registro](../registry/contracts.json) e [índice](index.json), contracts `77062daa13f6e1877b162908c1c7a4d82bbd4d8c`: `finance.sale-payment.recorded.v1` y `finance.customer-receivable.created.v1` son drafts de procedencia `4ec41110d2c4c68139101e0a13109f6fd1cdfcba`, sin tag declarado. Sus refs cierran sobre `events/event-envelope-v1.schema.json` y `events/sale-flow-common-v1.schema.json`; no hay HTTP de caja en el índice. Payment v1 no conserva movimiento/caja, operación/proceso, recibido/vuelto ni versiones suficientes: preservar y diseñar **`finance.sale-payment.recorded.v2`, revisión 1**. Customer-receivable permanece fuera de F1, sin consumo nuevo.

C materializa HTTP 1.0.0 en `finance/http/public/v1/finance-v1.yaml`, espejo privado `finance/http/private/v1/finance-internal-v1.yaml`, tipos/policy en `http/shared/v1/`, comandos/resultados en `commands/v1/`, nuevos hechos `events/v1/` y payment sucesor `events/v2/`. Fixtures por capacidad bajo `finance/fixtures/`, herramientas `scripts/finance/`, tests externos `test/finance/`; sin schemas/índices/locks ni nuevos archivos de transporte en A.

## Intenciones y operaciones

URLs efectivas bajo `/api/v1`, prefijo una sola vez. Humanas solo por gateway, con cookie/Origin/CSRF, delegación/autoridad nueva de identidad y permisos explícitos del OWNER; validar tenant, sucursal/POS y recursos propios. Comandos solo del coordinador autenticado con vínculo al paso durable; no se autoriza por `user_id`, nombre de rol o header libre.

| Intención | operationId / ruta o comando | Resultado / permiso |
| --- | --- | --- |
| Crear caja lógica del POS | `createPosCashRegister`, POST `/api/v1/finance/cash-registers` | `201` caja/Location; `finance.cash.configure`, una caja lógica inicial por POS |
| Resolver caja autorizada | `listCashRegisters`, GET `/api/v1/finance/cash-registers?pos_id=...` | `200` colección; `finance.cash.read`; no crear por una consulta |
| Abrir turno | `openCashShift`, POST `/api/v1/finance/cash-shifts` | `201` turno/opening_float/Location; `finance.cash.open` |
| Consultar turno/esperado | `getCashShift`, GET `/api/v1/finance/cash-shifts/{cash_shift_id}`; `getCashShiftExpected`, GET `.../{cash_shift_id}/expected` | `200` turno/versión o esperado ARS/efectivo/as_of; `finance.cash.read` |
| Registrar cobro de intención | `finance.record-sale-cash.v1`, resultado `finance.record-sale-cash.result.v1` | Solo sales-pos tras stock confirmado; `succeeded` con cobro/movimiento/versión, o `failed` terminal sin cobro |
| Resolver respuesta perdida | `getSaleCashResult`, GET privado `/api/v1/internal/finance/sale-cash-results/{operation_id}` | `200` resultado retenido o `404` no visto; solo sales-pos, sin concluir que un comando en vuelo no ejecutará |
| Recuperar hechos retenidos | POST `/api/v1/finance/history-read-sessions`; GET `.../{read_session_id}/facts` | `201` sesión, `200` página; `finance.history.read`, motivo y step-up de ADR-063 |

No se incorpora cierre/arqueo, ingreso/retiro manual, pagos combinados/electrónicos, cuenta corriente, reintegros, reapertura o transferencia de caja. No hay endpoint para editar esperado o marcar un cobro libremente como pagado. La ausencia de cierre en F1 no permite ignorar un turno ausente/cerrado en fixtures ni relajar su estado en runtime.

## Caja, turno y hecho financiero

Caja pertenece a organización/sucursal/POS lógico canónicos. El turno conserva caja/pos/sucursal, responsable account/membership derivados por backend, dispositivo, apertura UTC, fecha operativa/zona/política y versión. Constraint local: un turno activo por caja. Inicio de fondo ARS no negativo; positivo crea movimiento `opening_float`, cero queda explícito en apertura sin movimiento monetario cero ficticio. Apertura repetida devuelve mismo turno/fondo, nunca vuelve a sumarlo. Un turno puede cruzar medianoche y no se cierra por reloj.

Cobro F1: una asignación `cash`, ARS, `payment_id` estable, operación/proceso/venta, caja/turno, importe comercial aplicado, recibido y vuelto separados. Importes finales escala 2 y rango de hasta 38 dígitos enteros; sin exponentes/float, cuantización automática ni ajuste de efectivo. Aplicado >0 y exactamente igual al total aceptado; recibido ≥ aplicado; vuelto = recibido − aplicado. Ledger ingresa el neto aplicado; recibido/vuelto son evidencia de la entrega declarada y no dos cobros adicionales. Finance confirma su registro, no promete comprobar físicamente los billetes ni un cobro físico exactamente una vez.

Antes del cobro: validar turno `open`, correspondencia de contexto y responsable autorizado, versión/estado actuales y paso de proceso habilitado con stock confirmado. La petición no obliga a que el contador del turno sea todavía el observado al iniciar el carrito: otros cobros legítimos pueden haberlo avanzado; se bloquea/verifica el estado actual. Nunca cambiar de turno silenciosamente por faltar/cerrar el original. No llamar a ventas/identidad sosteniendo locks.

Una salida `posted` con diferencia autorizada y conciliación pendiente de inventory es stock confirmado: habilita el mismo cobro y no se rechaza por su warning o saldo negativo. Finance no concede la excepción, modifica stock ni cierra el pendiente; conserva solo las referencias necesarias del resultado del dueño.

Transacción única: cobro inmutable + movimiento + esperado por medio/moneda + resultado semántico + historia + auditoría + inbox/outbox. Un fallo revierte todo; rechazo determinístico persiste resultado terminal sin movimiento. Clave semántica por organización/intención/venta/payment_id/medio, además de command_id. Otro command_id o clave HTTP no duplica un cobro de esa venta. Reutilización con contenido diferente se rechaza; identidad retenida con el hecho sobrevive al replay HTTP/inbox.

Resultado dirigido usa el sobre publicado: command_id/result_id, result_type/revisión, status succeeded/failed, retryable/error_code, causalidad y payload tenant/proceso/operación; éxito incluye cobro/movimiento/caja/turno/versiones/moneda/importes/recorded_at. Movimiento/apertura publican `finance.cash-movement.recorded.v1` y `finance.cash-shift.opened.v1`; cobro publica `finance.sale-payment.recorded.v2` con snapshot financiero completo. No propagar factura fiscal, costo, datos de tarjeta o PII superflua. D01/D02/D05/D12/D13 propios y vínculos, sin duplicar D08–D11 de ventas.

## Fallos, errores y recuperación

Timeout no es rechazo; consultar o reenviar el mismo intento con autoridad técnica actual de ADR-063. Si el cobro ocurrió y se perdió respuesta, devolver sus IDs/importes/versiones originales y completar venta. Un rechazo terminal por turno/contexto/importe cierra ese intento en finance, evitando que un duplicado atrasado cobre después de la compensación de stock. Fallo técnico no puede escribirse como rechazo sin cobro. Resultado contradictorio conserva evidencia/atención, no elige el más conveniente.

| Código nuevo | HTTP / retryable | Semántica |
| --- | --- | --- |
| `finance_invalid_request`, `finance_invalid_history_cursor` | 400 / false | Forma/query/cursor |
| `finance_resource_not_found` | 404 / false | Caja/turno/recurso ajeno o inexistente |
| `finance_cash_shift_required`, `finance_cash_shift_not_open`, `finance_cash_shift_already_open` | 409 / false | Falta de turno, cerrado/no operativo o exclusividad |
| `finance_version_conflict`, `finance_state_conflict`, `finance_operation_conflict`, `finance_idempotency_key_reused` | 409 / false | Conflicto de versión/transición/identidad/carga |
| `finance_idempotency_request_in_progress` | 409 / true | Reserva concurrente todavía sin resultado |
| `finance_cash_amount_invalid`, `finance_currency_unsupported` | 422 / false | Aplicado/recibido/vuelto/escala/rango/ARS incompatibles |
| `finance_history_coverage_changed` | 409 / false | Reiniciar corte por disposición concurrente |
| `finance_delegation_invalid`, `finance_delegation_request_mismatch` | 401, 403 respectivamente / false | Autenticación/vínculo del delegado |

C registra códigos aditivamente y usa Problem Details común sin alterar bytes históricos; errores de comando mantienen el código del dueño en `failed`. Comunes de identidad/CSRF/negociación/tamaño/rate/capacidad/dependencia/deadline conservan su semántica; no transformar 503/504 en turno inexistente o cobro rechazado. Retry/unknown/DLQ/versiones y límites HTTP/mensajes son los de ADR-063/019, sin otro presupuesto reiniciado por duplicado.

Historia de finance separada de outbox conserva apertura/fondo y cobros/movimientos, recibido/vuelto, moneda, vínculos y versiones originales. Reconstruir esperado suma el ledger retenido, no los totales de ventas; si falta historia se declara parcial. Lectura por sesiones/cortes/checkpoints de ADR-063 §4, con privacidad FINANCIAL/PAYMENT, autoridad actual y cobertura explícita. No autorizar por este diseño administración de holds ni purga de fondos.

## Evidencia pendiente

C: fixtures positivos/negativos de apertura cero/positiva, exclusividad, turno ausente/cerrado/ajeno, cash ARS/aplicado/recibido/vuelto, duplicate/conflict, pérdida de respuesta, versionado e historia; productor estricto y consumidor compatible, AsyncAPI y gates propios. E conecta salida de stock → cobro → venta/compensación, sin reserva ni devolución comercial.

F1-12: PostgreSQL/RLS y broker reales, carrera de apertura/cobro, rollback conjunto cobro/movimiento/esperado/historia/auditoría, respuesta perdida con efecto confirmado, rechazo terminal frente a duplicado atrasado, inbox/outbox y reconstrucción tras limpiar transporte. La autoridad nueva de identidad debe estar aceptada antes del consumo. A no acredita SQL, caja física, criptografía, H4 ni esos runtimes.
