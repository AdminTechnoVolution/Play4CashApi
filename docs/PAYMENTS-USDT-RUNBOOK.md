# USDT y comandos recuperables: operación en pruebas

Esta entrega funciona exclusivamente con NOWPayments sandbox. La URL de producción está bloqueada en el adaptador y la política. Depósitos y retiros permanecen desactivados por defecto. No se ejecutaron transferencias reales. Todos los saldos previos se tratan como datos de prueba; no hay migración ni conciliación de Binance.

## Configuración mínima

MongoDB debe ser un replica set o clúster fragmentado con transacciones. Redis distribuye eventos y conserva sesiones de autenticación; no decide si un movimiento financiero ya fue aplicado. Cada instancia usa el mismo MongoDB y Redis.

```dotenv
FINANCE_V2_ENABLED=true
RELIABLE_COMMANDS_ENABLED=true
SOCKET_IO_REDIS_ADAPTER=true
PAYMENTS_DEPOSITS_ENABLED=false
PAYMENTS_WITHDRAWALS_ENABLED=false
PAYMENTS_WORKER=false
NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1
NOWPAYMENTS_SANDBOX_CASE=success
NOWPAYMENTS_IPN_URL=https://YOUR_GATEWAY/api/payments/ipn/nowpayments
```

Proveer `NOWPAYMENTS_API_KEY` y `NOWPAYMENTS_IPN_SECRET` desde un almacén de secretos. No incluirlos en la PWA, logs ni control de versiones. PWA requiere `VITE_RELIABLE_COMMANDS=true` conjuntamente con la API. Clientes anteriores no pueden enviar comandos financieros sin identificador y versión.

## Proceso independiente de pagos

El trabajador ahora vive en el proyecto hermano **Play4CashPaymentsWorker**, con su propio package.json, dependencias y despliegue. La API ya no registra el trabajador ni incluye un entrypoint para ejecutarlo. La API se inicia con `PAYMENTS_WORKER=false`; el proyecto del worker se inicia con `npm start` y define internamente su modo. Solo el worker recibe las credenciales NOWPAYMENTS_PAYOUT_*. Ambos usan la misma base y los mismos interruptores de depósitos/retiros.

La guía paso a paso para Azure y el origen de cada variable están en `Play4CashPaymentsWorker/CONFIGURACION-AZURE.md`. El worker expone únicamente `/health` y `/` para comprobaciones de Azure; no atiende solicitudes de jugadores ni recibe IPN. No necesita Redis.

Restringir salida a los servicios necesarios, administración mediante red privada y MFA, separar identidades MongoDB y limitar liquidez operativa en la cuenta. Esas restricciones pertenecen al despliegue: este repositorio no acredita que estén aplicadas. El diario `finance_journals` debe tener permisos de lectura e inserción, sin update/remove y sin heredar `readWrite` que restablezca esos permisos. La API no expone edición de diarios, pero un administrador de MongoDB puede modificarlos sin esa separación.

## Cuenta y geografía

Sandbox requiere un jugador activo; no requiere documentos KYC ni observaciones geográficas. No hay lista propia de países. Las señales de riesgo existentes siguen exigiendo revisión y una evidencia explícita de minoría de edad bloquea acceso. La autenticación y el aislamiento entre API y gateway siguen vigentes.

## Estados financieros y recuperación

Las nuevas órdenes usan `Idempotency-Key`; el mismo identificador con otro contenido devuelve conflicto. Depósitos quedan primero en `created`; el trabajador envía la orden una sola vez. La notificación firmada se guarda en `finance_ipn` antes de responder y despierta la consulta de estado. Solo se acredita `outcome_amount` confirmado en USDT y con identidad/red conciliadas. Parciales y discrepancias conservan el estado y la evidencia.

Retiro: cotización de neto/comisión/total, código por correo con expiración e intentos limitados, reserva atómica, revisión o envío. Superar 500 USDT por retiro o 1.000 USDT en 24 horas requiere revisión; reservas activas y pagos se contabilizan al reservar. Una señal de riesgo confiable también exige revisión. Los administradores revisan desde `/payments`, con motivo y TOTP. Configurar `FINANCE_ADMIN_TOTP_SECRETS` como mapa secreto de ID de administrador a semilla; cada contador TOTP se consume una sola vez.

Si hay timeout después de solicitar al proveedor, conservar la reserva. No volver a crear el payout ni devolver dinero por timeout. Con ID conocido, el trabajador consulta y puede repetir la verificación del mismo batch. Sin ID inequívoco, queda `uncertain`: investigación manual y evidencia del proveedor obligatorias. La administración permite proponer un ID con MFA y motivo. El trabajador consulta al proveedor y exige `order_id` para depósitos o `unique_external_id` para payouts antes de vincularlo; dirección e importe coincidentes no bastan. Si el proveedor no devuelve la identidad interna, se rechaza la propuesta y la reserva continúa sin cambios. No editar estados directamente.

Los ajustes administrativos usan `/admin/payments/adjustments`, MFA, motivo, cantidad decimal y clave idempotente. Transfieren entre `house:main` y saldo disponible; no generan fondos sin contrapartida. Tesorería y reversión antiguas quedan bloqueadas con FINANCE_V2. La pantalla administrativa permite estos ajustes y conserva la clave durante reintentos.

Los diarios, órdenes y comandos no tienen TTL. Solo desafíos de verificación separados expiran por TTL. Aperturas de datos de prueba se registran una sola vez al primer movimiento. La cuenta externa de apertura permite esos saldos ficticios y no demuestra respaldo en el proveedor.

## Comunicación recuperable

Comandos de seis juegos incluyen `commandId`, `roomId` y `expectedVersion`. Estado, recibo, fondos y eventos de salida se guardan en una transacción. La confirmación se emite después del commit. Un recibo aceptado permanece recuperable aunque se pierda el socket; repetirlo devuelve el resultado anterior. La PWA conserva pendientes por usuario y consulta su estado al reconectar. Si no existe y cambió la versión, recupera una instantánea y no inventa una jugada nueva.

Los eventos se publican desde `game_outbox`; puede haber duplicados de entrega, pero los efectos financieros y comandos no se repiten. Versiones antiguas se descartan. Redis interrumpido produce espera o fallo de autenticación explícito; nunca acredita dinero como sustituto de MongoDB. Los vencimientos de turno y gracia tienen leases persistentes recuperables. Los callbacks diferidos salen del contexto de la transacción para no usar sesiones expiradas.

## Verificación

```sh
npm test -- --runInBand
P4C_TEST_MONGO_URI='mongodb://127.0.0.1:27184/?replicaSet=p4c-test' npm run test:finance
# Replica set local p4c-test y Redis local 6388, exclusivamente datos desechables:
node scripts/start-finance-test-api.cjs 3184
node scripts/start-finance-test-api.cjs 3185
npm run test:game-sockets
P4C_LOAD_PLAYERS=5000 P4C_LOAD_SECONDS=600 P4C_LOAD_CONCURRENCY=25 node scripts/load-game-sockets.cjs
```

Los scripts de sockets solo apuntan a localhost y al DB `p4c_game_e2e`, crean jugadores y fondos ficticios, mantienen conexiones entre rondas y verifican siete recibos y una liquidación por partida. No prueban todas las variantes de los seis juegos ni sustituyen carga de staging atravesando el gateway. El p95 del script mide ACK (red y cola incluidas); `/admin/payments/health` expone p95 interno por instancia en una muestra acotada de 4.096 comandos. Agregar cada instancia por separado en monitoreo.

Conciliación pendiente cada minuto y contable diaria a las 03:00 UTC. Supervisar logs `payment_uncertain`, `payout_requires_reconciliation`, `ledger_imbalance`, `provider_balance_difference`, `payment_queue_deferred`; health muestra retiros inciertos, reservas y eventos pendientes. Falta integrar alertas externas, verificar liquidez y límites de toda la API del proveedor para la cuenta real.

## Condiciones de activación pendientes

1. Probar contratos reales del sandbox, depósitos/payouts/redes, comisión, neto y respuestas con credenciales de la cuenta; ninguna llamada con credenciales del proveedor se realizó en las pruebas locales.
2. Verificar contratos de cuenta y el método permitido para devoluciones supervisadas. `/fund-return-requests` registra casos sin aplicar el filtro de países ni mover fondos; administración los consulta. Verificar en sandbox que el proveedor devuelve identidad interna para resolver payouts inciertos.
3. Verificar precisión de todas las vistas y contratos heredados: las entradas nuevas de apuestas e inscripciones son cadenas y sus importes contables autoritativos usan Decimal128; permanecen campos Number de compatibilidad para presentación.
4. Completar pruebas de fallos/reinicio y recuperación por cada juego; ejecutar carga sostenida de 5.000 usuarios en staging con gateway y medir p95 interno por instancia.
5. Configurar roles de base de datos, secretos, red privada, salida restringida, backups y alertas. Verificar conciliación íntegra antes de habilitar el primer interruptor.
6. Revisar y cambiar deliberadamente el bloqueo de producción solamente después de aprobar las condiciones anteriores. Esta fase no incluye dinero real.

Referencias oficiales consultadas: [firma e IPN](https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup), [integración y payouts](https://nowpayments.io/help/about-nowpayments/how-to-start/i-want-to-integrate-nowpayments). La guía IPN requiere HMAC SHA512 sobre JSON ordenado; publica un límite de tres creaciones de pago por segundo. El trabajador limita creaciones a dos por segundo por cuenta compartida.


## Validación local y controles adicionales

Ver [PAYMENTS-USDT-VALIDATION.md](./PAYMENTS-USDT-VALIDATION.md) para resultados y alcance de la carga local a través de dos gateways y dos API. Esta evidencia no sustituye la carga de staging.

Con FINANCE_V2, la PWA debe anunciar `x-p4c-command-protocol: 1` en HTTP y `auth.commandProtocol: "1"` en sockets antes de entrar a juegos financiados. Los clientes incompatibles se rechazan antes del cobro. No desactivar FINANCE_V2 después de crear contabilidad: las rutas heredadas no deben volver a escribir saldos fuera del libro.

La reserva de retiro conserva prueba inmutable de autorización y asientos. El trabajador compara destinatario, red, neto, comisión y total con esa prueba antes de enviar; diferencias requieren revisión. Los límites incluyen todas las reservas activas, aunque sean antiguas, y pagos confirmados durante las últimas 24 horas. Falta de liquidez conserva la reserva y reintenta la comprobación después de 60 segundos. Health informa reservas estancadas y bloqueadas por liquidez; conectar alertas externas.

Cancelar torneos exige MFA, motivo y clave idempotente. La cancelación y el premio compiten dentro de transacciones; el cierre de salas y los eventos quedan persistidos y las devoluciones se recuperan por recibos. El historial de salas financiadas no se elimina mediante DELETE.

El proceso HTTP rechaza secretos de verificación de payouts. Mantener contraseña y TOTP únicamente en el trabajador privado. Los índices deben crearse con una identidad de bootstrap antes de restringir permisos del diario; la configuración de estos roles sigue pendiente de infraestructura.


## Escenarios sandbox

El trabajador envía `case: success` al crear depósitos por defecto; NOWPayments simula el procesamiento sin transferir fondos reales. Cambiar NOWPAYMENTS_SANDBOX_CASE a failed, partially_paid o common permite otros ensayos sobre nuevas órdenes. La PWA identifica estos pagos como pruebas. Un rechazo estructurado explícito del proveedor rechaza la orden; en retiros aún sin ID, devuelve la reserva mediante diario atómico. Timeouts y errores ambiguos conservan reserva e incertidumbre. Ver guía del proyecto worker para la primera prueba en Azure.
