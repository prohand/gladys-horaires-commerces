# Horaires Commerces — guía de uso

Esta integración trae a Gladys el **horario** de los comercios a los que va: qué
comercios están abiertos, cuándo abren o cierran, con escenas cuando un comercio abre
o cierra pronto.

Todo se calcula en Gladys. La única llamada externa va a OpenStreetMap, a través del
servicio overpass.ch y con su clave gratuita, para encontrar el horario de los
comercios alrededor de sus casas (ver **Clave de overpass.ch** más abajo). Sin clave,
escriba usted mismo el horario de sus comercios.

## Instalación

Abra **Integraciones**, busque la integración, instálela y rellene la pantalla
**Configuración**.

| Campo                             | Qué poner                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Clave de overpass.ch              | Su clave gratuita, para buscar el horario en OpenStreetMap (ver abajo).                           |
| Comercios y horario               | Sus comercios y su horario (ver abajo).                                                           |
| Casas alrededor de las que buscar | Las casas de Gladys alrededor de las que buscar. Ninguna marcada: todas las que tienen ubicación. |
| Radio de búsqueda ... (km)        | A qué distancia de una casa se buscan los comercios. Por defecto: 10.                             |
| Tipos de comercios ...            | Los tipos de comercios propuestos en la pestaña Descubrimiento. Ninguno marcado: ninguno.         |
| Aviso antes de ... (min)          | Cuándo se activan «abre pronto» / «cierra pronto». Por defecto: 30 min.                           |

Pulse después **Probar la configuración**: la respuesta dice, comercio por comercio,
si está abierto.

Por último, abra la pestaña **Descubrimiento** de la integración y cree los
dispositivos.

### Comercios y horario

Un comercio por entrada: un nombre, y luego `=` y su horario si quiere escribirlo. Separe los comercios con `|`:

```
Leclerc = Mo-Sa 08:30-20:00; PH off | Farmacia = Mo-Fr 09:00-19:00 | Panadería = Tu-Su 07:00-13:00,15:30-19:30
```

El horario sigue la sintaxis de OpenStreetMap — a menudo ya visible en la ficha del
comercio en un mapa:

| Usted escribe                       | Significa                                           |
| ----------------------------------- | --------------------------------------------------- |
| `Mo-Sa 08:30-20:00`                 | De lunes a sábado, de 8:30 a 20:00                  |
| `Mo-Fr 08:30-12:00,14:00-19:00`     | Con pausa al mediodía                               |
| `Mo-Sa 08:30-20:00; Su 09:00-12:30` | Reglas separadas por `;`                            |
| `Mo-Sa 08:30-20:00; We 08:30-21:00` | Una regla posterior sustituye a la anterior ese día |
| `...; PH off`                       | Cerrado los festivos franceses                      |
| `...; PH 09:00-12:30`               | Horario reducido los festivos                       |
| `24/7`                              | Siempre abierto                                     |

Días en inglés: `Mo Tu We Th Fr Sa Su`. `PH` = festivos franceses (lunes de Pascua,
Ascensión y lunes de Pentecostés incluidos). Las horas se leen en hora de París. 10
comercios como máximo.

El nombre identifica el comercio: cambiarlo crea un nuevo dispositivo en Gladys.

#### Horario encontrado automáticamente

Escriba solo el nombre: `Leclerc` (o `Leclerc = auto`). La integración busca entonces
en OpenStreetMap el comercio con ese nombre más cercano a sus casas de Gladys (todas
las casas con ubicación, indicada en **Ajustes → Casas**), y toma su horario. Para
buscar otras palabras que el nombre, escríbalas tras `auto:`, por ejemplo
`Panadería = auto: Boulangerie Dupont`. Los acentos y las mayúsculas no cuentan. Hace falta una clave gratuita de
overpass.ch (ver **Clave de overpass.ch** más abajo).

- Con varias casas, gana el comercio más cercano de todas: dé un nombre preciso
  (`auto: Carrefour Market Vierzon`) para elegir uno cerca de una casa concreta.
- **Probar la configuración** indica el comercio encontrado, su localidad, su
  distancia y su horario: compruebe que es el correcto.
- El horario se busca de nuevo una vez al día, y se guarda: un reinicio sin red lo
  conserva.
- Si OpenStreetMap no tiene horario para su comercio, o uno que la integración no
  sabe leer, escríbalo a mano (y, por qué no, añádalo en openstreetmap.org).

### Comercios alrededor de sus casas (pestaña Descubrimiento)

La integración busca en OpenStreetMap, alrededor de cada casa de Gladys con ubicación
(indicada en **Ajustes → Casas**), los comercios más cercanos de los tipos marcados en
la configuración — supermercados, panaderías, farmacias, oficinas de correos, puntos
limpios… — que publican su horario. Los 3 más cercanos de cada tipo, por casa.

Abra la pestaña **Descubrimiento** de la integración: cada comercio aparece con su
casa y su distancia, por ejemplo `E.Leclerc (Casa, 1.3 km)`. Cree aquellos a los que
va, en una habitación de la casa correcta, y cámbieles el nombre como quiera:
funcionan como los comercios que escribe, y su horario se actualiza una vez al día.

### Clave de overpass.ch

El horario se busca en OpenStreetMap a través del servicio
[overpass.ch](https://overpass.ch), con su propia clave gratuita: sin clave, no se
busca nada (los comercios escritos con su horario funcionan igual). El plan gratuito
(sin tarjeta, para uso personal) da 10 000 peticiones al mes; la integración hace una
al día.

1. Abra [overpass.ch/signup](https://overpass.ch/signup) (botón **Get a free key** en
   la página de inicio).
2. Rellene **E-mail**, **Password** (10 caracteres como mínimo) y **Website** (por
   ejemplo `https://github.com/prohand/gladys-horaires-commerces`), acepte las
   condiciones y pulse **Create account** (o **Continue with Google**).
3. Abra el correo recibido y pulse el enlace de confirmación.
4. Inicie sesión (**Log in**) y abra la página de claves:
   [overpass.ch/dashboard/keys](https://overpass.ch/dashboard/keys). Cree una clave.
   **No rellene «Allowed referers» ni marque «Reject requests without a referer»**: la
   integración no envía referer, el servidor rechazaría sus peticiones (error 403
   `forbidden_referer`).
5. Copie la clave. Su dirección completa, `https://api.overpass.ch/v1/…/interpreter`,
   también sirve.
6. En Gladys: **Integraciones** → **Horaires Commerces** → **Configuración**, péguela en
   **Clave de overpass.ch** y guarde.
7. Pulse **Probar la configuración**. Los logs de la integración dicen
   `OpenStreetMap answered by api.overpass.ch` cuando la clave funciona.

La clave es personal: no la publique (foro, repositorio de código, captura de
pantalla). Una clave rechazada o una cuota del mes agotada se
indica en **Probar la configuración** y en los logs
(`OpenStreetMap lookup failed: overpass.ch refused the key (403)`); el horario ya
encontrado se mantiene, y la búsqueda vuelve a intentarlo en la próxima hora.

## Dispositivos

| Dispositivo   | Función                            | Notas                                       |
| ------------- | ---------------------------------- | ------------------------------------------- |
| Cada comercio | Abierto (1 = abierto, 0 = cerrado) | Utilizable en cualquier condición de escena |
| Cada comercio | Minutos hasta abrir o cerrar       | Actualizado cada minuto                     |

## Escenas

### Disparadores

- **Un comercio abre pronto** (`store_opening_soon`) y **Un comercio cierra pronto**
  (`store_closing_soon`): una sola vez, los minutos configurados antes. Filtro: el
  comercio (vacío = cualquiera). Variables: nombre del comercio, hora, minutos
  restantes. Ejemplo: «{{store_name}} cierra a las {{time}}, quedan {{minutes_left}}
  minutos.»

«El comercio está abierto» es un estado: use las condiciones de dispositivo de
Gladys.

### Acciones

- **¿Está abierto un comercio?** (`is_store_open`): elija un comercio. Salidas:
  _abierto_ (sí/no), la hora del próximo cambio (HH:MM) y los minutos hasta entonces.

## Panel

- **Horario de comercios**: todos los comercios de un vistazo (abierto o cerrado,
  hasta cuándo), o — con el ajuste _Comercio_ — un comercio en detalle, con una cuenta
  atrás y el horario de hoy. El ajuste _Días siguientes mostrados_ (0 a 6) añade el
  horario de los días siguientes, con los festivos señalados: 6 muestra toda la
  semana.

## Solución de problemas

- **La pestaña Descubrimiento está vacía**: pulse **Probar la configuración**: busca
  de nuevo en OpenStreetMap y dice por qué (casa sin ubicación, ningún tipo marcado,
  OpenStreetMap inaccesible, ningún comercio de esos tipos en el radio).
- **«Falta la clave de overpass.ch»**: pegue su clave en la configuración (ver
  **Clave de overpass.ch** más arriba).
- **«No se pudo contactar con OpenStreetMap»**: el mensaje dice por qué (clave
  rechazada, cuota agotada, servidor inaccesible). Compruebe la clave en
  [overpass.ch/dashboard/keys](https://overpass.ch/dashboard/keys); nuevo intento en la
  próxima hora.
- **«Ningún comercio con este nombre ... en OpenStreetMap»**: pruebe con menos
  palabras, un **Radio de búsqueda** mayor, o escriba el horario a mano.
- **«Ninguna casa de Gladys tiene ubicación»**: indique la ubicación de la casa en
  **Ajustes → Casas**.
- **«No se entiende el horario»**: el mensaje cita la parte errónea. Use los días en
  inglés (`Mo`, no `Lu`) y horas `HH:MM` (`08:30`, no `8.30`).
- **Un comercio «no se entiende»**: cada entrada debe ser `Nombre = horario`, entradas
  separadas por `|`.

## Datos

Para encontrar el horario (comercios escritos sin horario, y pestaña Descubrimiento),
las palabras buscadas, los tipos de comercios y la ubicación de sus casas (una zona
del radio de búsqueda alrededor de cada una) se envían con su clave a la API Overpass
de overpass.ch (`api.overpass.ch`, en Alemania), una vez al día. El horario encontrado se guarda en
`/data/hours.json`. Para no enviar nada: no ponga clave, y escriba el horario de todos
los comercios.
