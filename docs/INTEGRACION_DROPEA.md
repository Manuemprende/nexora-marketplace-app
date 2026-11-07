# Integración Dropea API & Webhooks - Nexora

Documentación técnica de la integración de **Dropea Dropshipping & Pago Contra Entrega (COD)** en Nexora.

---

## 1. Arquitectura y Credenciales

Dropea opera como red de dropshipping y distribución mayorista con cobro contra reembolso en Chile (`CL`), España (`ES`), Portugal (`PT`), Italia (`IT`) y México (`MX`).

### Protocolo de Autenticación
- **API Token (Bearer JWT):** Se envía en el encabezado `Authorization: Bearer <API_KEY_TOKEN>`.
- **Firma HMAC de Webhooks:** Dropea envía una firma HMAC-SHA256 en la cabecera `X-Dropea-Signature` (o `X-Hub-Signature-256`) calculada sobre el cuerpo crudo (raw body) de la petición HTTP.
- **Identificador de Evento (Idempotencia):** Encabezado `X-Dropea-Event-Id` o atributo `event_id` en el cuerpo del webhook.

---

## 2. Endpoints y Entornos

| Mercado | Host Base API |
| :--- | :--- |
| **Chile (CL)** (Predeterminado) | `https://cl.public-api.dropea.com` |
| **España (ES)** | `https://es.public-api.dropea.com` |
| **Portugal (PT)** | `https://pt.public-api.dropea.com` |
| **Italia (IT)** | `https://it.public-api.dropea.com` |
| **México (MX)** | `https://mx.public-api.dropea.com` |

Documentación OpenAPI oficial: `https://public-api.dropea.com/dropshipper/docs`

---

## 3. Endpoints Implementados en Nexora

### Panel Administrativo y API Local (`server/dropea.mjs`)

- `GET /api/integrations/dropea/status`
  - Retorna estado de configuración, token enmascarado, mercado activo, URL de webhook y total de eventos recibidos.
  - Exige sesión activa de usuario con rol `admin`.

- `POST /api/integrations/dropea/test`
  - Ejecuta un ping en vivo contra `/dropshipper/me` para verificar la conectividad de red y validez del token.

- `POST /api/integrations/dropea/configure`
  - Guarda y cifra con AES-256-GCM las credenciales en la base de datos SQLite (`dropea_connections`).
  - Admite actualizar `token`, `hmacSecret`, `market` y `baseUrl`.

- `POST /api/integrations/dropea/sync-orders`
  - Consulta órdenes remotas desde Dropea (`/dropshipper/orders`) y registra la fecha de última sincronización.

### Receptor de Webhooks (`server/dropea-notifications.mjs`)

- `POST /api/integrations/dropea/webhook`
  - Recibe notificaciones asíncronas de Dropea (`order.created`, `order.status.changed`, `order.cancelled`, etc.).
  - Verifica la firma HMAC criptográficamente con tiempo constante (`timingSafeEqual`) para prevenir ataques de temporización.
  - Deduplica entregas repetidas según el `event_id`.
  - Registra el payload en la tabla `dropea_webhooks` sin alterar stock erróneamente de forma prematura.

---

## 4. Estructura de Base de Datos SQLite

### Tabla `dropea_connections`
```sql
CREATE TABLE dropea_connections (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL DEFAULT 'CL',
  api_token_encrypted TEXT,
  hmac_secret_encrypted TEXT,
  base_url TEXT NOT NULL DEFAULT 'https://cl.public-api.dropea.com',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','error')),
  webhook_registered INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Tabla `dropea_webhooks`
```sql
CREATE TABLE dropea_webhooks (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE,
  topic TEXT NOT NULL,
  market TEXT,
  resource_id TEXT,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','failed','ignored'))
);
```

---

## 5. Pruebas Automatizadas

La suite `tests/dropea.test.mjs` valida:
1. Cifrado y descifrado simétrico AES-256-GCM de secrets y tokens en reposo.
2. Verificación matemática de firmas HMAC-SHA256 (positivas, payloads manipulados y claves incorrectas).
3. Recepción segura de webhooks con rechazo de firmas inválidas y deduplicación en reintentos.
4. Protección de control de acceso RBAC (bloqueo a roles no administradores).

Ejecución de pruebas:
```bash
npm test
```
