# Validación local de pagos y recuperación

Datos exclusivamente ficticios. No se realizaron transferencias reales ni llamadas autenticadas a NOWPayments. La integración sigue bloqueada fuera de sandbox y requiere comprobar contratos, redes y comisiones con la cuenta.

## Pruebas automatizadas

- API: 401 pruebas unitarias; 34 pruebas de integración contra replica set local, incluyendo contabilidad, comandos recuperables y cuatro casos de torneos. Se añade regresión del rechazo de clientes sin protocolo recuperable.
- Gateway: 88 pruebas unitarias.
- PWA: 194 pruebas unitarias.
- TypeScript y compilaciones de producción se verifican por proyecto. El chequeo global de TypeScript incluye defectos de tipado previos en pruebas heredadas de recharge de API y `INestApplication.set` en una prueba del gateway; las compilaciones de aplicación excluyen esas pruebas.

## Carga de Socket.IO

Dos API y dos gateways locales, MongoDB replica set y Redis local. Connect Four, 2.500 salas, 5.000 conexiones sostenidas, 17.500 jugadas aceptadas y repetición de la primera jugada de cada sala. Se verificaron recibos persistidos, una liquidación por sala y saldos finales.

| Ruta | Duración de ronda | p95 ACK | Resultado |
| --- | --- | --- | --- |
| Dos API directas | 482 s | 21,22 ms | Cero efectos duplicados o recibos aceptados perdidos |
| Dos gateways y dos API | 475 s | 22,92 ms | Cero efectos duplicados o recibos aceptados perdidos |

La concurrencia de ejecución fue de **25 salas**; las 5.000 conexiones permanecieron abiertas. No demuestra 5.000 mutaciones simultáneas ni comportamiento de todos los juegos. El p95 interno por API al acabar la carga de gateway fue 21,34 ms y 19,99 ms en muestras acotadas de 4.096 respuestas. Estos datos pertenecen a la revisión probada durante la carga; correcciones posteriores se comprueban con regresiones, sin repetir la carga completa.

Una partida de dos jugadores atravesó ambos gateways con Redis pausado aproximadamente tres segundos: no hubo aceptación prematura durante la caída, el mismo comando se recuperó una vez y los siete movimientos terminaron con saldos ficticios 109/90. p95 ACK: 22,62 ms.

## Fallos encontrados durante validación

Se corrigieron callbacks que reutilizaban sesiones MongoDB expiradas, salida del último jugador que colisionaba con un índice único y comprobaciones de inicio sin cambios que incrementaban la versión. Las regresiones y la repetición de carga verificaron estas correcciones.

## Pendientes antes de producción

Contratos de la cuenta sandbox; controles adicionales para una futura activación con fondos reales; controles de infraestructura y permisos del diario; alertas externas; matriz de privacidad, reinicios y fallos de los seis juegos; carga de staging con mayor concurrencia de acciones. La revisión sigue siendo parcial y no acredita seguridad absoluta. Ver condiciones de activación en [runbook](./PAYMENTS-USDT-RUNBOOK.md).


Actualización 16 octubre: nuevas regresiones cubren depósitos sin registros geográficos, descubrimiento automático de redes USDT habilitadas, escenarios sandbox y rechazos explícitos del proveedor. El sandbox no requiere lista propia de países ni provisión manual KYC. La carga anterior no se ha repetido por este cambio de política.


Verificación de esta actualización: 413 pruebas unitarias de API, 39 de integración MongoDB, 7 del worker y 194 de PWA pasaron. Compilaciones API/PWA/worker correctas y ZIP del worker regenerado. Se usan respuestas de proveedor simuladas en pruebas; no se llamó al sandbox con credenciales del usuario ni se desplegó en Azure.
