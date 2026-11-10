# HomeKit Controller

Esta integración convierte Gladys en un **controlador HomeKit**: se empareja
directamente con sus accesorios HomeKit Wi-Fi / Ethernet y los controla en
local, **sin iPhone, Apple TV ni HomePod**, y sin ninguna nube.

## Antes de empezar

- Un accesorio HomeKit solo acepta **un controlador** a la vez. Si ya está
  en la app **Casa** de Apple (o en Home Assistant…), elimínelo allí
  primero. Si no, restablezca el accesorio a los valores de fábrica.
- Tenga a mano el **código de configuración de 8 cifras** (`123-45-678`):
  está impreso en el accesorio, en su caja o en su manual.
- El accesorio debe estar en la **misma red local** que Gladys.
- Solo se admiten accesorios **IP** (Wi-Fi, Ethernet). Los accesorios
  Bluetooth y Thread no.
- Se requiere **Gladys 5.3.0 o posterior**.

## Emparejar un accesorio

1. Abra la pestaña **Configuración** de la integración.
2. Pulse **Buscar accesorios**. La lista muestra, para cada accesorio: su
   nombre, su tipo, su ID de HomeKit, su dirección IP y su estado
   (`listo para emparejar`, `emparejado en otro sitio`,
   `emparejado con Gladys`).
3. Pulse **Emparejar un accesorio** y rellene:
   - **Accesorio**: el nombre, el ID o la dirección IP mostrados por la
     búsqueda. Si la búsqueda no lo encuentra, escriba su dirección como
     `IP:port` (por ejemplo `192.168.1.20:51826`);
   - **Código de configuración**: las 8 cifras, con o sin guiones.
4. El emparejamiento tarda unos segundos (hasta un minuto en módulos
   pequeños). Después abra la pestaña **Descubrir**: los dispositivos del
   accesorio están listos para añadirse.

Un **puente** HomeKit da un dispositivo de Gladys por cada accesorio
conectado al puente.

## Dispositivos compatibles

| Servicio HomeKit              | En Gladys                                                                  |
| ----------------------------- | -------------------------------------------------------------------------- |
| Bombilla                      | Encendido/apagado, brillo, color, temperatura de color                     |
| Interruptor, enchufe, válvula | Encendido/apagado                                                          |
| Medición de energía (Eve)     | Potencia (W), energía (kWh), tensión, corriente                            |
| Ventilador                    | Encendido/apagado, velocidad                                               |
| Termostato                    | Temperatura, temperatura objetivo, humedad, modo, estado de funcionamiento |
| Climatizador (calor / frío)   | Encendido/apagado, modo, temperatura objetivo, temperatura                 |
| Persiana, ventana, puerta     | Posición, abrir / parar / cerrar                                           |
| Cerradura                     | Bloqueada / desbloqueada                                                   |
| Sensores                      | Temperatura, humedad, luminosidad, movimiento,                             |
|                               | ocupación, contacto, fuga, humo, CO, CO2,                                  |
|                               | partículas PM2.5 / PM10, COV, NO2, ozono, SO2                              |
| Batería                       | Nivel, batería baja                                                        |
| Botón, timbre                 | Pulsación                                                                  |

Un **botón** da una funcionalidad «Botón» cuyo valor cambia en cada
pulsación: `1` simple, `2` doble, `6` larga. Un **timbre** da una
funcionalidad «Timbre» (`1` en cada llamada). Úselas con el disparador
habitual sobre el estado de un dispositivo, o con el disparador **Botón
HomeKit pulsado** (ver más abajo).

Climatizador: el modo vale `0` auto, `1` frío, `2` calor (HomeKit no tiene
modos deshumidificación ni solo ventilador). La temperatura objetivo sigue
el modo: umbral de calefacción en modo calor, umbral de refrigeración si no.

Tras una actualización de la integración, un dispositivo ya creado puede
ganar nuevas funcionalidades: la pestaña **Descubrir** propone entonces
actualizarlo.

Los demás servicios (cámaras, televisores…) se ignoran por ahora. En cada
conexión, los registros listan los servicios no compatibles de cada
accesorio (`HomeKit service(s) not supported: …`) y las características
propias del fabricante (`vendor characteristic(s) not supported: …`):
añada estas líneas a una solicitud de compatibilidad.

Medición de energía: HomeKit no tiene una característica estándar para la
potencia. La integración lee las de **Eve** (accesorios Eve, muchos plugins
de Homebridge). Un enchufe que solo muestra su consumo en su propia app
(Aqara…) solo da encendido/apagado.

Solo es visible lo que el puente publica en **HomeKit**: un dispositivo que
un hub solo comparte en **Matter** no aparece aquí. Es el caso de los
climatizadores infrarrojos de los hubs Aqara (M2, M3): añádalos con la
integración Matter de Gladys.

## Ajustes

- **Intervalo de actualización**: HomeKit envía los cambios en tiempo real.
  Gladys también vuelve a leer todo el accesorio con este intervalo, como
  red de seguridad (60 s por defecto).
- **Duración de la búsqueda**: cuánto tiempo se escucha la red durante una
  búsqueda (10 s por defecto).

## Acciones

- **Buscar accesorios**: enumera los accesorios HomeKit de la red.
- **Emparejar un accesorio**: ver más arriba.
- **Identificar un dispositivo**: el accesorio se hace notar (parpadea,
  emite un pitido…), útil para localizarlo.
- **Desemparejar un accesorio**: elimina el emparejamiento del accesorio y
  de Gladys. En un puente, afecta a todos sus dispositivos. Después elimine
  los dispositivos en Gladys.

## Escenas

Activadores (en una escena, **Añadir activador → Integraciones**):

- **Botón HomeKit pulsado**: se ha pulsado un botón o un timbre. Filtros
  opcionales: el dispositivo, el tipo de pulsación (simple, doble, larga) y
  el número del botón (para un mando con varios botones). Variables:
  accesorio, botón, número del botón, pulsación, timbre.
- **Accesorio HomeKit desconectado / de vuelta**: un accesorio ha dejado de
  estar accesible o ha vuelto. Filtros opcionales: el dispositivo y el
  estado. En un puente, cada dispositivo conectado envía su propio evento.

Para elegir un botón en el filtro «Dispositivo», cree primero su
dispositivo en Gladys (pestaña **Descubrir**). Si no, deje el filtro vacío.

Acciones (en una escena, **Nueva acción → Integraciones**):

- **Identificar un dispositivo HomeKit**: el accesorio se hace notar.
- **Releer un dispositivo HomeKit**: lee al instante todos sus valores (útil
  antes de una condición).

## Widget del panel

El widget **Accesorios HomeKit** muestra cuántos accesorios están en línea y
desconectados, la lista de accesorios (primero los inaccesibles) y, cuando
uno está desconectado, un botón **Reconectar**.

## Solución de problemas

- **La búsqueda no encuentra el accesorio**: asegúrese de que está
  encendido y en la misma red (misma VLAN) que Gladys. Pruebe una duración
  de búsqueda más larga, o empareje con `IP:port`.
- **«emparejado en otro sitio»**: elimínelo de la app Casa o restablézcalo
  a los valores de fábrica.
- **Accesorio inaccesible**: la pestaña **Configuración** de la integración muestra qué
  accesorios están desconectados. La integración vuelve a intentarlo por sí
  sola y encuentra de nuevo el accesorio si su dirección IP ha cambiado.
  Para evitarlo, asigne al accesorio una dirección IP fija (reserva DHCP).
- Los emparejamientos se guardan en el volumen `/data` de la integración:
  se conservan entre actualizaciones.
- Para más detalles, consulte los registros de la integración
  (`LOG_LEVEL=debug`).
