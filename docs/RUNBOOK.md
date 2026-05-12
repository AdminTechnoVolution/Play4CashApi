# Play4Cash — Runbook operativo

Guía operativa del control de actualización de la PWA y de la sesión cross-app.
Para el contrato técnico de variables ver `docs/SECURITY-ENV.md`.

```
[ PWA ] ──HTTPS──▶ [ Gateway ] ──HTTPS──▶ [ API ] ──▶ [ Mongo + Redis ]
```

---

## 1. Liberar una versión nueva de la PWA

### 1.1 Compatible hacia atrás (caso más común)

1. Bump `Play4CashPWA/package.json#version` (semver). Helper:
   ```bash
   cd Play4CashPWA && npm run version:bump:patch   # 1.0.0 → 1.0.1
   ```
   (`version:bump:minor` y `version:bump:major` también disponibles. NO hace `git commit`,
   sólo modifica `package.json`.)
2. Commit + merge a `main`. La pipeline `main_p4c-web.yml` corre `npm run build`. Vite
   inyecta `__APP_VERSION__` (`package.json#version`) y `__APP_GIT_SHA__` (corto).
3. Deploy del `dist/` al CDN/Static Web App. **No tocar** `PWA_MIN_VERSION` en API/Gateway.
4. Comportamiento esperado:
   - Clientes con tab abierta detectan la actualización dentro de 60 min (15 min en
     standalone) y ven el **modal opcional** "Nueva versión disponible".
   - Clientes que cargan la app por primera vez después del deploy sirven la nueva
     versión directamente.

### 1.2 Incompatible (cambio breaking)

Cuando el API rompió un contrato (rename de endpoint, schema de payload, evento WS,
JWT claims, etc.) y la PWA vieja **no puede operar** con el API nuevo:

1. Igual que 1.1, pero **antes** del switch DNS / antes de tu strategy de deploy:
2. Setea en **API y Gateway** la misma variable:
   ```
   PWA_MIN_VERSION=1.2.0   # nueva versión que sí es compatible
   ```
3. Deploy API + Gateway. A partir de este momento:
   - Cada response HTTP del API lleva `X-App-Min-Version: 1.2.0`.
   - Cada handshake WebSocket del Gateway compara `auth.appVersion` (o `X-App-Version`).
4. La PWA vieja recibe el header → dispara modal **forzado** "Actualización requerida"
   sin botón "Después".
5. Clientes con conexión WebSocket activa reciben evento `version_mismatch` y son
   desconectados; el modal forzado aparece igual.

> **Importante**: `PWA_MIN_VERSION` debe ser **igual o menor** a la versión actual del bundle
> que ya está en el CDN. Si subís el mínimo a una versión que aún no desplegaste, **todos los
> clientes quedan bloqueados sin opción de actualizar**.

### 1.3 Rollback de un deploy de PWA

1. Re-publicar el bundle anterior al CDN (Azure Static Web App soporta swap de slots).
2. Si `PWA_MIN_VERSION` se subió en 1.2 hay que bajarlo o quitarlo, sino la versión vieja
   queda autobloqueada.

---

## 2. Sesiones y JWT

### 2.1 Token expira mientras el usuario tiene la app abierta

Comportamiento normal — el access token vence. Próxima request HTTP devuelve 401, el
interceptor (`ApiClient.ts`) llama a `/api/login/refresh` con el refresh httpOnly cookie,
recibe nuevo access token, reintenta la request original. WebSockets reciben
`connect_error` 401 y refrescan el handshake en el lugar (`refreshSocketHandshake`).

**No requiere acción operativa.**

### 2.2 Usuario no abre la app durante el TTL del refresh

Por defecto `JWT_REFRESH_TTL_SECS=86400` (1 día) en `.env.example` — pero producción
debería usar 14 días (`1209600`). Si el usuario excede ese plazo:

- El refresh cookie ya expiró en el browser (httpOnly `Max-Age`).
- `loadSession()` llama `/api/login/refresh` → 401 → la PWA dispara `p4c:auth-failure`
  → redirección a `/login` con un toast "Sesión expirada".

**Si es masivo** (muchos usuarios reportan login forzado simultáneo): probable rotación
involuntaria de `JWT_SECRET`. Ver §2.5.

### 2.3 Reuse detection (refresh token usado dos veces)

Mecanismo activo. Si un atacante captura un refresh token y el usuario legítimo ya lo rotó:

- El segundo intento (replay) llega con un `jti` que ya no matchea `currentJti` del
  `sessionFamily` en Redis.
- `AuthService.refreshToken` revoca **toda la familia** (`familyAccesses:` +
  `familyRefreshes:` + `sessionFamilies:`).
- Ambas sesiones (víctima y atacante) son cerradas.
- Log: `[AuthService] Refresh reuse detected family=<id> → revoking session`.

**Acción operativa**: en spike de estos logs, contactar a los usuarios afectados (`userId`
está en el log) e invalidar sus sesiones residuales (logout forzado).

### 2.4 Logout global de un usuario

Hoy el endpoint `POST /api/login/logout` revoca solo la familia activa. Para revocar
**todas las familias** del usuario (e.g. account compromise):

```bash
# Conectarse a Redis y barrer las claves del usuario.
redis-cli --scan --pattern 'sessionFamilies:*' | while read k; do
  v=$(redis-cli get "$k")
  echo "$v" | grep -q "\"userId\":\"<userIdAqui>\"" && redis-cli del "$k"
done
```

(Idealmente esto se vuelve un endpoint admin futuro.)

### 2.5 Rotación de `JWT_SECRET`

**Cambiar `JWT_SECRET` invalida TODAS las sesiones inmediatamente** (los tokens firmados
con el secret viejo dejan de verificar). Procedimiento controlado:

1. Anunciar mantenimiento.
2. Cambiar `JWT_SECRET` en API **y** Gateway al mismo tiempo (deben ser idénticos).
3. Reiniciar ambos servicios.
4. Todos los usuarios verán "Sesión expirada" y deberán re-loggear.

Si necesitás rotar sin invalidar todo, requiere implementar un esquema de
`JWT_SECRET_PREVIOUS` con verificación dual — no está implementado hoy.

---

## 3. Observabilidad — distribución de versiones

### 3.1 Endpoint admin

```bash
GET /api/admin/app-versions/stats?days=7

# Auth: Bearer <admin-jwt>
# Throttler: 30 req/min
```

Respuesta:

```json
{
  "daily":      [{ "date": "2026-05-05", "versions": {...}, "staleVersions": {...} }, ...],
  "totals":     { "1.0.0": 84, "1.1.0": 312 },
  "staleTotals":{ "1.0.0": 84 },
  "currentMinVersion": "1.1.0",
  "sampleRate": 0.1,
  "degraded":   false
}
```

- **`totals`**: requests muestreados por versión. Multiplicar por `1/sampleRate` para
  estimar volumen real (ej: con sampleRate 0.1, multiplicar por 10).
- **`staleTotals`**: clientes que mandan una `X-App-Version` debajo de
  `currentMinVersion`. Útiles para decidir cuándo subir el mínimo (esperar a que sean <5%).
- **`degraded: true`**: alguna lectura de Redis falló durante esta consulta. Si TODAS
  fallaron, el endpoint devuelve **HTTP 503** con el `summary` parcial.

### 3.2 Sample rate

Default `PWA_STATS_SAMPLE_RATE=0.1` (10% de requests). En producción con 100 RPS = 10
escrituras Redis/s — bajo. Bajar a 0.05 si Redis está cargado, subir a 0.2 si necesitás
más fidelidad. **No usar 1.0 sin medir antes**.

### 3.3 Retención

Default `PWA_STATS_RETENTION_DAYS=31` (cada HASH `appVersionDaily:<YYYY-MM-DD>` expira a
31 días). El endpoint clamp el query a 1..60 (no se pueden pedir más días que los retenidos).

---

## 4. Falla de Redis

| Componente | Comportamiento si Redis cae |
|------------|------------------------------|
| **Login** | Falla. Login requiere Redis para grabar la familia. |
| **Refresh** | Falla. Requiere lookup en `sessionFamilies:`. |
| **AuthGuard (HTTP)** | Falla todos los requests autenticados (lookup `accessTokens:`). |
| **WS handshake** | Falla. Mismo lookup. |
| **`X-App-Min-Version` header** | Sigue funcionando (lee de env, no de Redis). |
| **Stats interceptor** | Falla silenciosamente (fire-and-forget). No afecta requests. |
| **`/api/admin/app-versions/stats`** | Devuelve `degraded: true`. Con todo failing, HTTP 503. |

**Acción**: Redis es dependencia crítica del path de auth. Monitorear con health check
estándar (`redis-cli ping`) y alertar bajo failover automático.

---

## 5. Smoke test post-deploy

Script: `scripts/smoke-app-version-contract.sh` (ver `Play4CashApi/scripts/`).

```bash
GATEWAY_URL=https://gateway.tu-dominio.com bash scripts/smoke-app-version-contract.sh
```

Valida:

1. El Gateway responde 2xx en `/api/health` (o el endpoint configurable).
2. La response trae `X-App-Min-Version` en los headers (si está configurada en API).
3. CORS expone el header (`Access-Control-Expose-Headers` lista `X-App-Min-Version`).
4. Mandar `X-App-Version` en el request no rompe (preflight pasa).

Falla con exit code distinto de 0 y output explicativo.
