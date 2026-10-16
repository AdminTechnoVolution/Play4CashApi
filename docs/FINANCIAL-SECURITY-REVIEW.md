# Revisión financiera y de recuperación — 14 octubre 2026

Revisión de código y pruebas locales, parcial. Los datos son de prueba y no se realizaron transferencias reales. La severidad indica impacto potencial si se conectaran fondos reales. No acredita explotación histórica ni seguridad absoluta. La nueva implementación queda en sandbox hasta completar las condiciones del runbook.

| Severidad | Evidencia y escenario reproducible | Corrección | Regresión |
| --- | --- | --- | --- |
| Crítica | Actualizaciones independientes de usuario, sala y premio en gateways y servicios de torneo: caída entre débito y creación de partida o entre finalización y premio deja fondos sin estado consistente. | Libro de doble entrada, cuenta de escrow por sala/torneo, transacciones compartidas con estado, recibos estables por operación y recuperación persistente de liquidación. | `payments.integration.spec.ts` revierte saldos ante caída; `reliable-commands.integration.spec.ts` revierte estado y dinero juntos y liquida una sola vez; partida real entre dos API. |
| Crítica | Reserva/retiro sin resultado inequívoco: si el proveedor acepta pero expira HTTP, reenvío o devolución puede gastar dinero dos veces. | CAS antes del envío, persistencia de IDs antes de verificación del batch, estado incierto con reserva conservada, consultas del mismo payout. | Timeout conserva reserva y no reenvía; fallo de verificación conserva el identificador y no recrea payout. |
| Alta | Verificación concurrente y retiro contra apuesta: dos lecturas de saldo pueden autorizar gasto superior al disponible. | Saldo disponible y reservado separados, débito condicional y diario en la misma transacción; desafío consumido y límites revisados al reservar. | Concurrencia de débito intenta sobregastar sin saldo negativo. Falta expandir prueba integrada de OTP y ventana móvil bajo múltiples procesos. |
| Alta | Duplicados de notificaciones o liquidaciones vuelven a incrementar saldo/contadores sin recibo persistente. | Índices únicos de operación, hash de contenido, diario y contadores atómicos; notificación solo despierta consulta del proveedor. | Diez notificaciones concurrentes, repetición tras reinicio de trabajador, ID reutilizado con contenido distinto, rechazo duplicado sin doble devolución. |
| Alta | Acreditar importe solicitado o activo incorrecto puede entregar crédito sin respaldo. | Identidad de orden/proveedor/moneda verificadas; acreditar exclusivamente importe final reconciliado. | Pago final duplicado y moneda incorrecta; importe decimal exacto. Contrato externo de redes/comisiones pendiente de credenciales sandbox. |
| Alta | Jugada persistida sin recibo o estado emitido antes de commit: pérdida de ACK causa repetición; concurrencia de movimiento y timeout altera turnos. | Versión en MongoDB, transacción de estado/comando/outbox, confirmación después del commit, recuperación por comando y snapshot. | Veinte comandos sobre misma versión aceptan uno; replay devuelve resultado; fallo antes de commit deja ningún efecto; siete movimientos y replay entre dos instancias. |
| Alta | Callback diferido heredó sesión MongoDB cerrada y produjo `MongoExpiredSessionError`, deteniendo una API durante la prueba real entre instancias. | Callback sale de ambas AsyncLocalStorage; captura rechazos; vencimientos v2 usan registros persistentes y leases recuperables. | `context.spec.ts` comprueba aislamiento de sesiones; repetición de partida entre instancias pasa. |
| Alta | Identidad o país confiados a cabeceras reenviadas/`req.ip` permite falsificación cuando el proxy confía en IP declarada. | Autenticación JWT/sesión independiente en API; país solo desde gateway confiable y conexión física, cabeceras externas eliminadas. | Middleware rechaza IP reenviada que imita gateway; WS elimina token de query y revalida cada paquete. |
| Alta | Tablero naval podía recibir flotas arbitrarias, superpuestas o fuera de rango; servidor no debe confiar en la UI. | Validación compartida de cinco barcos, tamaños, geometría, rango y ausencia de superposición; colocación inmutable; disparos enteros 0–9. | `placement.validation.spec.ts`; ampliar pruebas de disparos y liquidación naval. |
| Alta | Operaciones administrativas antiguas pueden modificar contabilidad fuera del nuevo libro. | Reversión directa y tesorería antigua bloqueadas en FINANCE_V2; ajustes nuevos con contrapartida, MFA, motivo y recibo; TOTP con contador de uso único. | Pruebas de diario e idempotencia; falta regresión integrada completa de MFA/roles de decisiones administrativas. |
| Media | Sesiones de jugador utilizadas para observar otra sala/juego o publicar payload privado a toda una namespace. | Comprobación de sala/actor/juego y destinos privados `player:<id>`; snapshot autorizado; espectadores no ejecutan comandos. | Actor fuera de sala rechazado; validaciones de ámbito. Falta matriz integral de privacidad para los seis juegos y roles. |
| Media | Aritmética monetaria con Number puede redondear importes y ocultar diferencias. | Nuevo libro Decimal128 y decimal.js, contratos nuevos con cadenas y rechazo de precisión excesiva; lectura JSON del proveedor preserva tokens decimales. | Fracción mínima y magnitudes grandes, asientos desbalanceados rechazados. Entradas nuevas de apuestas/torneos y montos autoritativos usan cadenas/Decimal128; siguen campos Number de presentación heredada. |
| Alta | La salida de la última persona podía escribir una sala activa sin jugadores y colisionar con el índice único `players.playerId: null`, terminando una API durante carga. | Desconexión persistida, serialización por versión, última salida cierra sala; reintentos de recuperación y captura de fallos fuera del filtro de paquetes. | Dos desconexiones de salas distintas con índice activo pasan sin colisión; carga local de 5.000 conexiones completada. |
| Media | Cola ilimitada o desconexión pierde silenciosamente acciones pendientes. | Cola del gateway acotada, respuesta explícita de saturación; pendientes PWA persistidos por usuario; cleanup de timers al abandonar namespace. | Suite de gateway y PWA; falta ensayo de saturación/fallos prolongados atravesando gateway. |

## Límites de cobertura

- Pagos son simulados en pruebas; adaptador NOWPayments aún requiere verificar contratos con cuenta sandbox y redes habilitadas. No basta que el proveedor anuncie una moneda globalmente.
- El diario es inmutable por API, pero requiere permisos MongoDB de inserción/lectura para protección frente a credenciales de aplicación comprometidas. La conciliación diaria compara cada cuenta con sus diarios.
- Actualización 16 octubre: sandbox ya no exige lista local de países ni geolocalización/KYC provisionados. Requiere usuario activo; evidencia explícita de minoría de edad y señales de riesgo siguen tratándose. Las respuestas del proveedor se respetan. Esto no acredita que el proveedor valide el país de cada jugador.
- Una operación incierta sin ID conserva fondos; la nueva propuesta administrativa se vincula únicamente si el trabajador comprueba identidad interna inequívoca. Falta validar ese contrato del proveedor en sandbox. No editar manualmente reservas como sustituto.
- Las pruebas actuales no cubren todas las caídas posibles ni todas las reglas de los seis juegos. La carga local atraviesa dos gateways y dos API, pero no equivale a staging multinodo ni a 5.000 mutaciones simultáneas.
- Faltan restricciones de infraestructura verificadas, alertas externas, liquidez, pruebas de roles administrativos y revisión de cambios de wallet/autenticación completos.

Ver configuración, comandos y condiciones de activación en [PAYMENTS-USDT-RUNBOOK.md](./PAYMENTS-USDT-RUNBOOK.md).


## Correcciones adicionales verificadas

- Retiro: prueba inmutable de autorización vinculada al diario; alteración de destinatario o reserva sin prueba bloquea llamadas al proveedor. Reservas antiguas y pagos confirmados hoy se incluyen en el límite móvil.
- Torneo: inscripción se cobra una vez; la partida no vuelve a cobrarla. Cancelación exige MFA y compite con liquidación, conserva cierres y reembolsos recuperables. Cuatro pruebas integradas cubren estas rutas.
- Recuperación: publicación del outbox espera confirmación de Redis; interrupción del broker conserva eventos. Los recibos aceptados del actor siguen consultables después de abandonar la sala.
- Compatibilidad: cliente sin protocolo recuperable se rechaza antes de entrar a una partida financiada. Consultas MongoDB dentro de estas rutas se ejecutan secuencialmente para no compartir una transacción en paralelo.

Resultados y limitaciones medidos en [PAYMENTS-USDT-VALIDATION.md](./PAYMENTS-USDT-VALIDATION.md).


## Actualización del 16 de octubre: sandbox sin lista propia de países

Se retiró la lista geográfica de P4C en pagos, entradas de salas y torneos. La cuenta activa sigue validándose dentro de transacciones al reservar. Las redes se descubren entre las monedas USDT habilitadas de la cuenta. Los depósitos solicitan el escenario sandbox documentado y la interfaz avisa que no se envíen fondos reales.

Un rechazo HTTP estructurado y explícito, sin identificadores de operación, se diferencia de un timeout/error ambiguo. El rechazo de creación de un payout permite devolver la reserva atómicamente una vez. Si el batch ya fue creado y falla su verificación, se conservan los IDs y la reserva. No se considera un 403 genérico o una página HTML prueba suficiente para liberar fondos.
