# as400-api

REST API que expone autenticación contra IBM AS400 / DB2 y contra Active Directory (LDAP) para los frontends de la suite.

## Endpoints

- `POST /api/auth/as400` — valida credenciales contra `GXICAGEO.USUMOBILE` (tabla SGM).
- `POST /api/auth/ldap` — valida credenciales contra Active Directory via LDAP bind, y consulta `ADMSEC.USUARIOS` + `ADMSEC.GRPUSU` para resolver pertenencia al grupo Despacho.

Ambos endpoints devuelven una respuesta con la forma:

```json
{ "outcome": "OK | INVALID_CREDS | NOT_FOUND | DISABLED | UNAVAILABLE", "success": true | false, "user": { ... }, "message": "..." }
```

## Variables de entorno relevantes

| Variable | Default | Descripción |
|----------|---------|-------------|
| `AS400_ENCRYPT_KEY` | `e57bfc8ea91ab3e2f1201b5b3612eea2` | Clave Twofish usada para comparar passwords contra `USUMOBILEPASSWORD`. |
| `LDAP_HOST` | `192.168.1.7` | Servidor de Active Directory. |
| `LDAP_PORT` | `389` | Puerto LDAP. |
| `LDAP_DOMAIN` | `glp` | Dominio NetBIOS para construir el `bindDN` (`DOMAIN\username`). |
| `LDAP_BASE_DN` | `DC=glp,DC=riogas,DC=com,DC=uy` | Base DN para la búsqueda de atributos del usuario. |
| `AS400_GRUPO_DESPACHO_ID` (alias `LDAP_GROUP_DESPACHO`) | `52` | `GRPID` de `ADMSEC.GRPUSU` que representa al grupo Despacho. |

## Deuda técnica conocida

### `/api/auth/ldap` no distingue "usuario no existe en AD" de "credenciales inválidas"

El endpoint actual hace un único bind directo contra Active Directory usando `DOMAIN\username` y la password recibida. Si ese bind falla con cualquier código que no sea de transporte (`ConnectionError`, `UnavailableError`, `ServerDownError`, `TimeoutError`), el endpoint responde `outcome: 'INVALID_CREDS'` sin importar la causa real.

**Consecuencia funcional (AC-02 / AC-14 degradados):**
Los usuarios que existen en `ADMSEC.USUARIOS` con `UsuAutAD='A'` pero que **no** existen en Active Directory **no** van a hacer fallback a la validación de password contra `ADMSEC.USUARIOS` — van a recibir 401 directo, igual que si la password fuera incorrecta.

**Cómo resolverlo (cuando se pueda provisionar una service account de LDAP):**

1. Provisionar `LDAP_BIND_USER` y `LDAP_BIND_PASSWORD` en el `.env` de `as400-api` apuntando a una cuenta de servicio con permisos de lectura sobre el árbol del dominio.
2. Modificar `/api/auth/ldap` (`as400-api/src/routes/auth.js`) para implementar **search-then-bind**:
   - Bind inicial con la service account.
   - `search` por `sAMAccountName=<username>` (usando `EqualityFilter` ya importado) para obtener el DN del usuario.
   - Si el search no devuelve resultados → `outcome: 'NOT_FOUND'` (esto sí permite a los consumidores activar el fallback contra `ADMSEC.USUARIOS`).
   - Si el search devuelve un DN → segundo bind con ese DN y la password recibida → `outcome: 'OK'` o `outcome: 'INVALID_CREDS'`.

El bloque del endpoint `/ldap` en `as400-api/src/routes/auth.js` ya tiene un comentario inline apuntando a esta sección como referencia.
