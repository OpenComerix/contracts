# Sales — mapa y diseño F1-10A

Propietario semántico: `sales-pos`. **Diseño A con paquete D candidato; sin consumo habilitado ni runtime.** Arquitectura compartida y protocolo de autoridad/historia en [ADR-063](../../../docs/arquitectura/decisiones/ADR-063-intencion-durable-y-finalizacion-de-venta-online.md); secuencia, aceptación y cortes en [F1-10](../../../docs/arquitectura/fase-1/F1-10.md). Este mapa define el transporte de ventas; no duplica un motor de procesos ni traslada stock/caja al dominio.

## Inventario vigente y compatibilidad

Fuente: [registro](../registry/contracts.json) e [índice sales](index.json), contracts `77062daa13f6e1877b162908c1c7a4d82bbd4d8c`. `sales.http.v1` (`openapi/pos-sales-v1.yaml`, 1.0.0), `sales.sale.completed.v1` y `sales.sale.reversed.v1` (`events/`) conservan estado `draft`, procedencia `4ec41110d2c4c68139101e0a13109f6fd1cdfcba`, sin tag declarado en sus descriptores. El registro mantiene `sales.complete-snapshot.successor` planned. Esto no acredita ausencia de release, uso o datos externos.

El HTTP histórico mezcla pago electrónico/offline/fiscalidad y usa bearer público; no sirve como superficie F1 con cookie/CSRF e intención previa. Completed v1 tiene payload/líneas cerrados y no contiene descripción, variante, unidad/factor, definición fiscal ni snapshot discriminado: agregarlo rompe su forma. Se diseñan **HTTP 2.0.0** en `sales/http/public/v2/pos-sales-v2.yaml` y espejo privado `sales/http/private/v2/pos-sales-internal-v2.yaml`, manteniendo URLs efectivas `/api/v1`; evento **`sales.sale.completed.v2`, revisión 1**, bajo `sales/events/v2/`. No modificar rutas/bytes/tags históricos ni consumir reversed v1, habilitar devoluciones o publicar doble por defecto. Consumo previo descubierto exige migración autorizada antes de D/E.

Los siete descriptores históricos de sales/inventory/finance cierran sobre `events/event-envelope-v1.schema.json` y `events/sale-flow-common-v1.schema.json`; HTTP sales no tiene refs externos. No hay manifiesto consumidor de sales/inventory/finance entre los cinco consumidores conocidos. Una búsqueda local no descarta consumidores externos. [Inventario de stock](../inventory/README.md) y [caja](../finance/README.md) conservan sus estados propios.

## Intenciones y operaciones del corte

Rutas de la tabla son **URLs efectivas**; los OpenAPI nuevos usarán servidor terminado en `/api/v1` y paths sin repetirlo. Público solo en gateway; espejo privado solo para el workload/autoridad fijados en ADR-063. `operation_id` del body es UUID de negocio; `operationId` nombra la operación de transporte.

| Intención | Operación / superficie | Resultado y permiso |
| --- | --- | --- |
| Finalizar compra online | `finalizeOnlineSale`, `POST /api/v1/sales/finalizations` | `202`, Location de operación; `sales.finalize`. Rechazo previo no crea efectos |
| Recuperar operación incierta | `getSaleFinalization`, `GET /api/v1/sales/finalizations/{operation_id}` | `200` operación/versiones/estados/resultados mínimos, `404` inexistente/ajena; `sales.read` |
| Consultar venta terminada | `getCompletedSale`, `GET /api/v1/sales/{sale_id}` | `200` snapshot comercial/estados y referencias de dueño; `404` si aún no finalizada; `sales.read` |
| Reanudar proceso detenido | `resumeSaleFinalization`, `POST /api/v1/sales/finalizations/{operation_id}/resume` | `202` misma operación o `409` estado/versión; `sales.process.resume`, motivo y step-up; no edición del intento |
| Validar comando durable | `authorizeSaleProcessStep`, `POST /api/v1/internal/sales/process-step-authorizations` | `200` decisión acotada o denegación; solo inventory/finance, jamás PWA |
| Validar captura previa de catálogo | `authorizeSaleCatalogCapture`, `POST /api/v1/internal/sales/catalog-capture-authorizations` | `200` decisión acotada sobre preparación de 60 s; solo catálogo |
| Leer historia retenida | `createSalesHistoryReadSession` / `readSalesHistoryFacts`, POST sesión y GET facts de ADR-063 §4 | `201` sesión/Location, `200` página; `sales.history.read`, motivo/step-up. Sin republicación |

No hay endpoints públicos para fijar manualmente `paid`, `posted`, `completed`, modificar snapshots o compensar dinero. El GET de operación distingue resultado del proceso y datos mínimos de efectos previos; no expone tokens, estado interno de colas ni otra organización. La futura UI dice «Procesando», «Venta completada» o la acción concreta; no exige operar una saga ni selecciona una interfaz por plan.

## Solicitud, captura y hecho

Solicitud F1: IDs `operation_id` (= Idempotency-Key), `sale_id`, contexto organizacional/sucursal/POS/dispositivo, depósito/ubicación, caja/turno; `occurred_at` declarado, fecha operativa y zona/política; 1–100 líneas con `line_id` único, presentación, cantidad, barcode leído opcional y versiones observadas producto/presentación/precio/clasificación; total y precio observados para detectar divergencia, e intención de efectivo con `payment_id`, moneda, aplicado y recibido. El servidor deriva actor/membresía y valida toda referencia; UUIDs del cliente, importes observados o body fiscal no conceden autoridad. No acepta reglas, impuestos finales, descuentos/promociones, cliente identificado, medio distinto de cash, indicadores offline ni instrucciones fiscales del cliente.

Ampliación de stock aprobada: cada línea física puede declarar `physical_presence_confirmed` en la confirmación ordinaria de finalización, con significado visible de producto presente. Esto permite resolver una diferencia sin otro diálogo por producto, pero no autoriza la excepción: identidad comprueba separadamente `inventory.sell_with_stock_difference` y scope para las líneas/cantidades del intento. Ventas conserva esa concesión en su manifest durable; inventory decide con su política/saldos actuales. Sin presencia/permiso se opera solo con saldo suficiente. No existe flag libre `ignore_stock`, política elegida por cliente ni stock inicial positivo obligatorio para una venta con diferencia válida. Véase ADR-063 §2.1.

Captura de catálogo: puerto nuevo `captureSaleCatalog` de ADR-063, sin consumir como sales los GET privados gateway-only. Las definiciones de datos leídas son `catalog/http/shared/v1/catalog-{common,entities,prices}-v1.schema.json`; productos activos, presentación activa, unidad/base, factor/fraccionamiento y definición de clasificación efectiva, precio vigente ARS/impuestos incluidos y lista. El grupo se lee en un corte local consistente. Capturar valores y versiones no equivale a reservar stock ni a cerrar un perfil tributario. Servicio/tipo desconocidos o falta de clasificación/precio impiden aceptar; después de aceptar no se repone el snapshot con maestros nuevos.

| Familia | Captura propia de la intención/venta y presencia |
| --- | --- |
| D01 | Tenant y contexto validados; IDs venta/operación/proceso, número comercial solo al completar, versión de venta; referencias de identidad opacas y versiones como cadenas, UUIDv7 en IDs propios |
| D02 | Ocurrencia declarada, recepción/aceptación/captura/finalización del backend UTC RFC3339; fecha operativa y zona/política usadas, sin tomar arrival del evento como ocurrencia |
| D03 | IDs/versiones producto, variante, presentación, lista/precio; descripción/SKU, código leído realmente usado; versión de variante cubierta por producto cuando su contrato no tiene contador propio |
| D04 | Cantidad vendida/unidad de presentación, base/factor, cantidad base exacta, mínimo/incremento/fraccionamiento capturados; agrupación física sin perder `line_id` |
| D05–D06 | Precio bruto/moneda/inclusión, bruto y total comercial por línea/documento, descuentos/cargos ausentes en F1 y política de cálculo versionada; recibido/vuelto referenciados de finance |
| D07 | Código/versión y definición de clasificación con país/jurisdicción/componentes tipados y reglas referenciadas; sintética no significa impuesto productivo |
| D08–D11 | Unión fiscal discriminada siguiente: nunca completar valores faltantes ni mezclar variantes |
| D12 | Procedencia por familia: catálogo aportó valores, ventas validó/calculó y backend capturó contexto; códigos/versiones de decisiones, sin secretos o actor libre |
| D13 | Comandos/resultados, IDs/versiones de movimientos y cobro confirmados por sus dueños; stock posted separado de conciliación requerida, IDs de caso/ocurrencia y warning de diferencia; estados conocidos con instante, fiscal pendiente. Hecho de venta no sustituye esos hechos |

El evento v2 conserva el documento comercial completo y la captura fiscal en el mismo payload, no en un evento auxiliar requerido. Con `fiscal_context.context_status: pending_profile`, revisión de estructura 1, `reason: profile_unavailable`, `fiscal_status: pending`: D01–D07/D12 y D13 aplicables completos; prohibidos emisor/receptor ficticios, perfil/regla productivos o total fiscal definitivo. `resolved` exige D08–D11: identidades aplicables y motivo del receptor anónimo, perfil/vigencia/versiones, componentes por línea (jurisdicción, impuesto, tratamiento, concepto, base/tasa/importe/inclusión/regla), grupos y totalizadores exactos, cotización/procedencia si aplica. Esta variante se prueba sintéticamente en D, pero F1 runtime solo produce pending_profile. Perfil posterior no rellena una venta cerrada ni acredita emisión.

## Datos monetarios y versiones

Política F1 propuesta `sales-f1-ars-1`: precio de presentación hasta 12 dígitos enteros/2 decimales; cantidad hasta 12/3, o entera si indivisible; factor hasta 12/6. Validar escala antes de normalizar, sin exponentes, signo positivo explícito ni separadores; entradas positivas. Cantidad base es multiplicación exacta (hasta 9 decimales); no truncar al límite de entrada de 3. No hay conversión entre dimensiones incompatibles ni factor inferido del texto de unidad. Importes finales ARS con 2 decimales, intermedios ≥34 dígitos significativos; campos derivados admiten hasta 38 dígitos enteros, rango cerrado antes de aceptar/persistir.

F1 sin descuentos/cargos: importe de línea = HALF_UP(precio × cantidad, 2); total comercial = suma exacta de importes cerrados. Este corte de cobro exige total positivo representable (mínimo ARS 0.01): un carrito cuyos importes cierran a cero se rechaza antes de aceptar, sin descontar stock ni emitir cobro. Sin perfil no separar un IVA supuesto ni ajustar ese total para fingir sumas fiscales. En resolved: pipeline, agrupación, cierre y mayor resto por `line_id` de ADR-030; impuestos no soportados fallan cerrados. Finance verifica aplicado=total, recibido≥aplicado y vuelto=recibido−aplicado, sin redondeo físico nuevo. La fórmula fiscal no se aplica a pending_profile ni el vuelto modifica la venta.

Vectores D, con entradas/pasos/resultados exactos, incluirán: `0.10 × 3 = 0.30`; `1.25 × 0.004 = 0.005 → 0.01`; `0.001 × 0.000001 = 0.000000001` base; importe `10.000` rechazado antes de normalizar; indivisible `1.5` rechazado; recibido `100.00`, aplicado `75.25`, vuelto `24.75`; empate de reparto `0.01` en tres líneas iguales asigna `0.01` al menor line_id y cero a las demás. Resolved agrega IVA incluido, múltiples tributos/jurisdicciones, exento/no gravado explícitos y negativos de suma/versión/regla. No activar cálculo tributario productivo por existir vectores.

Separar mayor del tipo, `schema_version`, `tax_snapshot_schema_version`, política de cálculo, versiones de agregado y versiones opacas de identidad. Primer productor: `sales.sale.completed.v2`/revisión 1/snapshot 1/política admitida. Productor estricto; consumidor solo tolera extensiones opcionales expresamente declaradas en zonas de metadata sin efecto. Enums críticos y parejas desconocidas: cuarentena/error sin aplicar ni marcar inbox exitoso. El paquete compartido de vectores es transporte/evidencia; no un motor de cálculo compartido ni DTO de negocio.

## Idempotencia, errores y límites

Mutaciones humanas llevan clave UUIDv7, expected_version al reanudar y el perfil canónico de ADR-063. Replay de finalize conserva el `202`, body/Location iniciales e indicador `Idempotency-Replayed: true`; GET devuelve el estado actual. Clave repetida con otra carga se rechaza; `sale_id`/`payment_id` no pueden usarse para otro intento aunque cambie la clave. Replay HTTP siete días, unicidad semántica retenida con el hecho; vencimiento del replay no recrea la venta ni su número. Comandos de stock/cobro/compensación tienen IDs propios persistidos, causados por el mismo proceso; nunca se inventan al reintentar.

| Código nuevo de ventas | HTTP / retryable | Alcance |
| --- | --- | --- |
| `sales_invalid_request`, `sales_invalid_history_cursor` | 400 / false | Forma/query/cursor; no tratar parsing como rechazo de negocio |
| `sales_resource_not_found` | 404 / false | Venta/operación ajena o inexistente |
| `sales_idempotency_key_reused`, `sales_operation_conflict`, `sales_version_conflict`, `sales_state_conflict` | 409 / false | Carga/identidad/versión/transición incompatibles |
| `sales_idempotency_request_in_progress` | 409 / true | Reserva concurrente aún sin resultado reproducible |
| `sales_catalog_version_conflict` | 409 / false | Revisión/importe de catálogo observado cambió antes de aceptar |
| `sales_totals_mismatch`, `sales_total_not_positive`, `sales_quantity_invalid`, `sales_fiscal_context_invalid`, `sales_snapshot_too_large` | 422 / false | Semántica/cálculo/total cero/variante/tamaño serializado del futuro evento |
| `sales_history_coverage_changed` | 409 / false | Disposición concurrente obliga a nuevo corte |
| `sales_delegation_invalid`, `sales_delegation_request_mismatch` | 401, 403 respectivamente / false | Autenticación o vínculo del delegado, sin filtrar detalle |

Reutilizar los errores transversales existentes solo con su significado/status: identidad/autorización/CSRF; 406/413/415 de transporte; 429 con Retry-After; 500 genérico; dependencia/capacidad 503; gateway_deadline_exceeded 504. Los rechazos posteriores de inventory/finance aparecen con el código original del dueño en el resultado de operación, GET 200; no se traducen a cobro exitoso ni se cambia el status permitido de su Problem. Nuevos códigos se materializan aditivamente en D, sin editar v6.

Body hasta 1 MiB; snapshot/evento/comando serializado hasta 128 KiB antes de aceptar, sin truncar ni usar archivos externos implícitos. Presupuesto HTTP gateway 10 s, llamada privada hasta 3 s, autoridad hasta 1 s, dueño hasta 5 s y lock hasta 1 s, siempre subordinados al restante y a autoridad vigente. Finalize devuelve aceptación durable y no mantiene HTTP esperando la saga. Consulta/reenviar paso técnico: máximo cinco intentos con backoff exponencial desde 1 s y jitter, tope 30 s respetando Retry-After; a los 15 min sin convergencia o al agotar intentos, atención. Redelivery de transporte conserva ADR-019 y no reinicia el presupuesto lógico; consulta/reanudación explícita conserva IDs y primero resuelve unknown. No fijar SLO productivo con estos límites iniciales.

## Materialización y pruebas pendientes

F1-10D: HTTP v2, snapshot/evento v2, contratos privados de autorización de paso/captura, vectores/fixtures en `sales/fixtures/`, herramientas en `scripts/sales/` y tests externos en `test/sales/`. Historia y política de campos se materializan bajo sales; tipos de dinero verdaderamente comunes y catálogo aditivo de errores bajo common solo con su registro/corte explícito. Prerrequisitos identity/catalog tienen su propietario y publicación separados. E verifica el conjunto, versiones y release; no iniciar F1-13 antes de H4 y runtimes/prerrequisitos aceptados.

Obligaciones runtime F1-13: PostgreSQL/RLS, outbox/inbox, operación/numero únicos, captura inmutable, reordenamiento y recuperación tras limpiar outbox, continuidad técnica sin sesión, compensación limitada y proceso reiniciado en cada transición. F1-15: navegación de pending/unknown/atención, reintento con mismo intento y ticket inequívocamente no fiscal, paridad decimal y contexto actual. A solo valida documentos; no acredita contratos ejecutables, SQL, firma, broker, navegador ni H4.

La venta con diferencia autorizada sigue hasta cobro/completed y conserva el pendiente de stock; no se presenta como fallo ni obliga a cobrar dos veces. F1-13/15 deben probar aviso breve, acceso posterior a conciliación y confirmación comprensible de presencia, tanto con stock 0 como ya negativo, además de denegar excepción ajena/ausente. La UI no concede el permiso ni fuerza supervisor si el operador ya lo tiene.

## F1-10B — Selección privada de autoridad de inventario candidata

[HTTP](http/private/v1/sales-inventory-step-authority-v1.yaml) y [schema](http/shared/v1/sales-inventory-step-authority-v1.schema.json) materializan en B únicamente la selección inventory de authorizeSaleProcessStep, POST /api/v1/internal/sales/process-step-authorizations; audiencia sales-pos.process-authority. No materializan API pública, venta completed, captura comercial ni contrato de caja de C/D.

La decisión se vincula al comando ya persistido/habilitado, tenant/proceso/paso/versión/target/huella, caller y consulta, con presupuesto <=2000 ms descontado desde antes de red. Comando no incluye su propio digest circular: inventory calcula SHA-256 del JCS completo para consultar al dueño. Concesión de diferencia solo refiere líneas/cantidades/contexto autorizados al aceptar; no procede del mensaje o sesión revocada. Compensación exige rechazo financiero terminal verificable, ausencia de pago y venta no completada; un cierre terminal local impide efecto tardío aunque la decisión haya sido positiva.

Los comandos de inventory transportan `payload.step_id`, incluido en la huella completa y copiado sin cambios a la solicitud de autorización; no se elige otro paso al consultar. Las referencias de decisión de origen permanecen en auditoría restringida del dueño, fuera de resultados, hechos físicos y consultas públicas.

Fixtures de pasos viven junto a sus comandos/resultados en inventory/fixtures/{effects,compensation}/v1; [gates B](../inventory/README.md#f1-10b--paquete-candidato). Solo planned; no publicación, admisión ni runtime. D completa las superficies restantes y E comprueba H4; el contrato no vuelve existente su implementación.

## F1-10C — Selección privada de autoridad de finance candidata

[HTTP](http/private/v1/sales-finance-step-authority-v1.yaml) y [schema](http/shared/v1/sales-finance-step-authority-v1.schema.json) materializan exclusivamente la selección finance de `authorizeSaleProcessStep`. Misma URL efectiva de proceso, artefacto separado del perfil B inmutable; caller finance y audiencia sales-pos.process-authority. Decisión ligada a tenant/operación/proceso/versión/step_id/comando/target y SHA-256 JCS del comando completo persistido/habilitado; no hay digest circular dentro del comando. Incluye stock confirmado y responsable/turno originales de la intención; `posted` con conciliación pendiente conserva autorización del cobro, sin conceder o resolver la diferencia.

Presupuesto <=2000ms desde antes de red, sin bearer transferible ni autoridad del humano retenida en colas; cierre terminal de finance prevalece ante decisión atrasada. Solo planned, sin API pública de venta ni completed nuevos; [gates y fixtures C](../finance/README.md#f1-10c--paquete-candidato). Runtime Sales/finance y publicación/admisión exactas son prerrequisitos posteriores.

## F1-10D — Paquete candidato de venta autosuficiente

Fuentes candidatas, sin admisión funcional ni runtime. Se conserva HTTP histórico/v1 y su cierre; no hay doble publicación. H4 y verificación conjunta corresponden a E.

| Superficie | Fuente |
| --- | --- |
| HTTP 2.0.0 | [Público](http/public/v2/pos-sales-v2.yaml) y [espejo privado](http/private/v2/pos-sales-internal-v2.yaml), seis operaciones humanas; aceptación 202 distinta de venta completed |
| Snapshot | [Productor](http/shared/v2/sales-types-v2.schema.json), [lector](http/shared/v2/sales-consumer-types-v2.schema.json), [política](http/shared/v2/sales-protocol-policy-v2.json) |
| Hecho | [completed v2 revisión 1](events/v2/sales.sale.completed.v2.schema.json), [lector](events/v2/sales.sale.completed.v2.consumer.schema.json), [AsyncAPI](events/v2/sales-flow-v2.asyncapi.yaml) |
| Dependencias nuevas | [Autoridad Identity](../identity/http/private/v1/identity-sales-authority-v1.yaml), [captura comercial Catalog](../catalog/http/private/v1/catalog-sale-capture-v1.yaml), [callback de preparación](http/private/v2/sales-catalog-capture-authority-v2.yaml) |
| Historia/privacidad | [Clasificación por campo y almacenamiento](http/shared/v2/sales-lifecycle-policy-v2.json), [schema](http/shared/v2/sales-lifecycle-policy-v2.schema.json); fuente retenida independiente de outbox, cobertura explícita |

Las selecciones de autoridad técnica B/C permanecen en v1 sin ampliar sus callers ni alterar comandos/resultados. HTTP mantiene URLs /api/v1. Se valida autoridad actual antes del replay, captura y aceptación; reanudación e historia exigen permiso específico, motivo y step-up reciente. La continuación técnica conserva IDs/step_id/huella del comando persistido; ninguna preferencia, presencia declarada o plan concede autoridad. La excepción de stock es una decisión separada de Identity para las líneas/contexto exactos; su denegación permite vender con stock suficiente. Sesión/grant/actor/dispositivo de origen quedan en auditoría restringida, fuera de completed.

El snapshot D01–D13 conserva datos y versiones leídos en grupo por Catalog, cantidad/factor y base exacta, importes comerciales y procedencia. Número comercial incluye serie/ámbito/valor/formato capturados y es distinto del UUID y del número fiscal; solo se asigna al completar. F1 produce pending_profile, sin identidad ni total fiscal inventados. Resolved se verifica con datos y reglas explícitamente sintéticos (SYNTHETIC_VAT@1/SYNTHETIC_OTHER@1); no es un motor fiscal productivo, perfil real ni emisión ARCA. Crear un perfil o cambiar un maestro no rellena hechos cerrados.

Los vectores exactos [compartibles con consumidores futuros](fixtures/vectors/v2/decimal.json) cubren HALF_UP, cantidades/factores, escala/rango, IVA incluido sintético, múltiples tributos/jurisdicciones, exento/no gravado explícitos y mayor resto con desempate por line_id. Oráculos con racionales BigInt no ejecutan dominio ni eligen una biblioteca decimal para runtime. Venta/cobro/stock/fiscalidad siguen estados independientes; unknown/404 no habilitan rechazo, compensación ni otro cobro. Compensación de stock solo ante rechazo financiero terminal; cobro exitoso exige completar la misma venta.

Productor estricto y consumidor con una única extensión opcional declarada payload.extensions.source_note sin efecto. Pareja completed.v2/revisión 1/snapshot 1/política sales-f1-ars-1; desconocidos críticos fallan sin efecto/checkpoint. Respuestas HTTP admiten extensiones compatibles mediante Http*, conservando perfil productor estricto. Límite de evento 128KiB verificado antes de aceptar; no truncar ni externalizar el snapshot.

El cierre sintético de incluidos conserva base y cálculo teórico a 34 decimales fraccionarios, calcula el tributo por grupo antes de cerrar a centavos y asigna por mayor resto con desempate line_id. allocated_base conserva el neto asignado a cada línea sin alterar su bruto; base_residue y allocated_residue explicitan las diferencias respecto de base/cálculo teóricos, incluidos sus signos. Las sumas de grupos y totalizadores usan los valores asignados y verifican cierre exacto. Solo admite las reglas sintéticas declaradas, también en receptor y decisiones. Los casos conectados de uno, dos y tres centavos no se reconstruyen desde bases redondeadas. HTTP y hecho comparten CommercialNumber; stock prueba cobertura de líneas físicas y los estados de operación exigen la evidencia correspondiente, incluidas las implicaciones desde compensado/pagado.

Gates desde contracts: node --test --test-reporter=tap test/sales/*.test.mjs; node scripts/sales/run-gate-v2.mjs schema, openapi --offline, asyncapi e impact (modos separados). Redocly 2.53.3 sin warnings nuevos, Sourcemeta 16.10.0 sobre fixtures reales, parser AsyncAPI 3.6.4. CI agrega solo validate:sales-contracts y validate:sales-schema con instalación congelada; conserva los 18 jobs anteriores. La preservación valida el paquete D completo y hashes exactos antes de proyectar sus bytes para controles históricos; no admite drift ni sustituye auditoría. Los dos archivos de soporte finance fueron autorizados expresamente por el usuario.

Incidencias de implementación conservadas en recibos: referencias locales Name160/TaxCode faltantes, duplicación de sales_invalid_request y seis enums privados duplicados. Correcciones sin relajar validadores: referencias cerradas, código aditivo sales_online_invalid_request aprobado por el usuario (código interno anterior intacto) y enums únicos. Windows conserva DEP0190 del shim npx; no se cambia TLS/ACL/confianza. La autorización inicial de los dos archivos de soporte fue rechazada por revisión automática por alcance no explícito y luego autorizada expresamente por el usuario; no se ejecutó la operación rechazada.

Fixtures y gates no acreditan SQL/RLS, concurrencia, numeración atómica, autoridad/firma/HMAC reales, broker ni caja física. F1-13 acredita intención/proceso/numeración/historia/auditoría/inbox/outbox y fallos reales; F1-15, navegador y paridad. Publicación, admisiones y runtimes propietarios aceptados son prerrequisitos antes de consumidores; E mantiene H4 abierto hasta su release autorizado.
