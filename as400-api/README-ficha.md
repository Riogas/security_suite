# as400-api — router `/api/ficha`

Lectura y escritura de la ficha de cliente sobre `GXCALDTA.CLIENTE` para el injerto de la ficha
(`FichaGoya.exe` → goya-backend → as400-api → AS400). No toca ninguna ruta existente:
`/api/auth/*`, `/api/db/*`, `/api/clientes` y `/api/pedidos` quedan igual.

Todo el router pide el header **`x-api-key`** (comparación en tiempo constante contra `FICHA_API_KEY`).
Sin la env definida el router responde 500; con api-key equivocada, 401.

## Rutas

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/ficha/cliente/:cliid` | Ficha completa (identidad + dirección + geo). 404 si no existe. |
| `GET` | `/api/ficha/cliente/:cliid/senales` | Pedidos últimos 12 meses, históricos y último pedido. |
| `GET` | `/api/ficha/cliente/:cliid/telefonos` | Teléfonos de `GXCALDTA.TELCLI`. **Solo lectura** (fase 1). |
| `PATCH` | `/api/ficha/cliente/:cliid` | Escribe los campos de la lista blanca. Soporta `dryRun`. |

`:cliid` tiene que ser un entero mayor a 0 (si no → 400). Toda respuesta es `{ok:true, …}` o `{ok:false, error}`.

Detalles a tener presentes:

- **`DIRCORX` es la latitud y `DIRCORY` la longitud** (los nombres X/Y están invertidos en el AS400).
  `DIRICAX` / `DIRICAY` son UTM 21S (EPSG:32721).
- En `lat` / `lng` / `utmX` / `utmY` el **0 se devuelve como `null`** (significa "sin dato"). El resto de los
  números conservan el 0.
- `ICAMET` se **lee** (`direccion.icaMet`) pero **no se escribe**: su semántica no está confirmada.

## Escritura

Solo se pueden escribir las columnas de `src/ficha/campos.js` (`CAMPOS_ESCRIBIBLES`). Cualquier otra clave
del body es un error explícito, no un campo ignorado. Los nombres de columna del `UPDATE` salen **siempre**
de las claves de esa lista blanca y los valores viajan como parámetros (`?`), nunca interpolados.

- `char`: se trimea; si supera el largo → error (no se trunca en silencio).
- `int`: entero dentro de `0…max`.
- `dec`: número finito, redondeado a la escala de la columna; se rechaza si excede los dígitos enteros.
- `fecha8`: exactamente 8 dígitos y fecha real (`YYYYMMDD`).
- `null` limpia el campo, salvo en `CLIOPUPD` / `CLIFCH` (auditoría, siempre con valor).

`dryRun` solo acepta `true` / `false` (o los strings `"true"` / `"false"`). Cualquier otro valor —
`1`, `"si"`, un objeto— es **400**, no un ensayo silencioso: nadie que quiso probar puede terminar
escribiendo en el AS400 por mandar el tipo equivocado.

Si `afectados === 0` la respuesta es 404 (`cliente inexistente`). En consola se loguea el `cliid`, las
columnas tocadas y los afectados — **nunca los valores**. Si el `UPDATE` explota, queda el error en el log
con el `cliid` y las columnas del intento antes de propagar el 500.

## Variables de entorno nuevas

| Variable | Requerida | Descripción |
|---|---|---|
| `FICHA_API_KEY` | **Sí** | Api-key que exige el header `x-api-key` de `/api/ficha/*`. Sin ella el router responde 500. La comparte con goya-backend. |
| `AS400_FICHA_USER` | No | Usuario AS400 dedicado (permisos mínimos) para las consultas y el UPDATE de la ficha. |
| `AS400_FICHA_PASSWORD` | No | Password de ese usuario. |

Si `AS400_FICHA_USER` / `AS400_FICHA_PASSWORD` no están definidas, `getPoolFicha()` **cae al pool actual**
(`AS400_USER`), así que la ficha funciona igual hasta que el usuario dedicado exista. El pool de la ficha se
crea una sola vez y se cachea.

## Ejemplo: `PATCH` con `dryRun`

```bash
curl -X PATCH http://127.0.0.1:5000/api/ficha/cliente/1704636 \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FICHA_API_KEY" \
  -d '{
        "campos": {
          "CALPRINID": 4069,
          "NROPUERTA": 3084,
          "DIRCORX": -34.78525,
          "DIRCORY": -56.19987,
          "DIRICAX": 573204.5693,
          "DIRICAY": 6150480.30157,
          "DIRFCHGEO": "20260817",
          "CLIOPUPD": "DMEDAGLIA",
          "CLIFCH": "20260817"
        },
        "dryRun": true
      }'
```

Respuesta (no se ejecutó nada contra el AS400):

```json
{
  "ok": true,
  "dryRun": true,
  "sql": "UPDATE GXCALDTA.CLIENTE SET CALPRINID = ?, NROPUERTA = ?, DIRCORX = ?, DIRCORY = ?, DIRICAX = ?, DIRICAY = ?, DIRFCHGEO = ?, CLIOPUPD = ?, CLIFCH = ? WHERE CLIID = ?",
  "valores": [4069, 3084, -34.78525, -56.19987, 573204.5693, 6150480.30157, "20260817", "DMEDAGLIA", "20260817", 1704636]
}
```

Sacando `"dryRun": true` la misma llamada escribe y responde `{"ok":true,"afectados":1}`.
