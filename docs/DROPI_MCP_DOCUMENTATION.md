# 🔌 Documentación Oficial: Nexora & Dropi Chile MCP Server
**Protocolo:** Model Context Protocol (MCP) — JSON-RPC 2.0 sobre `stdio`  
**Versión:** 1.0.0  
**Target:** Compatible con Cursor, Claude Desktop, Antigravity, LibreChat, Dify, LangChain, Flowise y cualquier cliente MCP.

---

## 1. ¿Cómo conectar este MCP a cualquier IA o Plataforma?

El servidor MCP expone herramientas mediante el protocolo estándar `stdio`. Puedes conectarlo de dos formas: **Local** (en tu máquina) o **Remoto por SSH** (conectándote al VPS desde cualquier lugar).

### Opción A: Configuración Local (Cursor / Claude Desktop / Antigravity)

Agrega esto en tu archivo de configuración de MCP (por ejemplo `claude_desktop_config.json` o en los ajustes de MCP de Cursor):

```json
{
  "mcpServers": {
    "dropi-nexora": {
      "command": "node",
      "args": [
        "F:/Open Code/Wentix AI MarketPlace/meibo-mvp/server/mcp.mjs"
      ],
      "env": {
        "DROPI_EMAIL": "man.emprendehoy@gmail.com",
        "DROPI_PASSWORD": "Swj8$f!2!juNT4P",
        "NEXORA_DB_PATH": "F:/Open Code/Wentix AI MarketPlace/meibo-mvp/data/nexora.sqlite"
      }
    }
  }
}
```

---

### Opción B: Conexión Remota al VPS (Recomendado para servidores u otras IAs en la nube)

Si tu IA o plataforma corre en otro servidor, en la nube o en otra computadora, puedes conectarte vía SSH directo al VPS de Nexora (`161.97.160.76`):

```json
{
  "mcpServers": {
    "dropi-nexora-vps": {
      "command": "ssh",
      "args": [
        "-o", "StrictHostKeyChecking=no",
        "root@161.97.160.76",
        "node /opt/nexora/server/mcp.mjs"
      ]
    }
  }
}
```
> **Nota de autenticación:** Asegúrate de tener la clave SSH agregada o usar sshpass/key.

---

## 2. Catálogo de Herramientas MCP de Dropi

### 🛠️ 1. `dropi_search_products`
**Descripción:** Busca productos en tiempo real en el marketplace mayorista de Dropi (Chile, Colombia o Brasil). Retorna costo para dropshipper, precio sugerido, margen estimado, stock real en bodegas y datos del importador.

**Parámetros:**
- `query` *(string, opcional)*: Término de búsqueda (ej: `"taladro"`, `"soldadora"`, `"cepillo"`, `"masajeador"`).
- `country` *(string, opcional, default: `"CHILE"`)*: `"CHILE"` | `"COLOMBIA"` | `"BRASIL"`.
- `limit` *(number, opcional, default: `20`)*: Cantidad máxima de productos a retornar.
- `user_verified` *(boolean, opcional)*: `true` para filtrar únicamente importadores verificados por Dropi.

**Ejemplo de Input:**
```json
{
  "query": "herramientas",
  "country": "CHILE",
  "limit": 5,
  "user_verified": true
}
```

**Ejemplo de Respuesta:**
```json
{
  "query": "herramientas",
  "country": "CHILE",
  "total": 5,
  "products": [
    {
      "id": 33369,
      "sku": "1920023",
      "name": "SET DE HERRAMIENTAS 108 PIEZAS",
      "type": "SIMPLE",
      "cost_price": 41000,
      "suggested_price": 70000,
      "profit_margin": 29000,
      "margin_pct": 41,
      "stock": 497,
      "warehouses": [
        { "warehouse_id": 1010, "stock": 497 }
      ],
      "supplier": {
        "id": 82275,
        "name": "vida y hogar spa",
        "verified": true
      },
      "image_url": "https://dropi-media.s3.amazonaws.com/chile/products/33369/..."
    }
  ]
}
```

---

### 📦 2. `dropi_get_product_detail`
**Descripción:** Obtiene la ficha técnica completa, galería de fotos HD en Amazon S3, stock exacto por bodega física y lista de variantes (colores, tallas, medidas) de un producto específico.

**Parámetros:**
- `product_id` *(number, requerido)*: ID numérico del producto en Dropi (ej: `33369`).

**Ejemplo de Input:**
```json
{
  "product_id": 33369
}
```

---

### 🚚 3. `dropi_get_orders`
**Descripción:** Consulta los pedidos en tiempo real de tu cuenta de vendedor (`DROPSHIPPER`), su estado logístico, número de seguimiento, transportadora asignada (Blue Express, Starken) y montos contraentrega (COD).

**Parámetros:**
- `limit` *(number, opcional, default: `30`)*: Cantidad de pedidos a recuperar.
- `start` *(number, opcional, default: `0`)*: Índice de paginación.

**Ejemplo de Input:**
```json
{
  "limit": 10,
  "start": 0
}
```

**Respuesta típica:**
```json
{
  "total": 1,
  "orders": [
    {
      "id": 98214,
      "dropi_order_id": 98214,
      "created_at": "2026-10-15T12:30:00Z",
      "status": "GUIA GENERADA",
      "total": 24990,
      "carrier": "Blue Express",
      "guide_number": "100071069",
      "tracking_url": "https://www.bluex.cl/seguimiento?guia=100071069",
      "cod": true,
      "customer": {
        "name": "Carlos Muñoz",
        "phone": "+56987654321",
        "address": "Av Providencia 1234",
        "city": "PROVIDENCIA"
      },
      "items": [
        { "product_id": 33369, "name": "SET DE HERRAMIENTAS 108 PIEZAS", "quantity": 1, "price": 24990 }
      ]
    }
  ]
}
```

---

### 🏢 4. `dropi_get_suppliers`
**Descripción:** Lista las importadoras y proveedores mayoristas verificados en Chile (ej: Zaga Importadora, Oferfly, Intra Herramientas, Ventmar), con sus teléfonos y direcciones de bodegas físicas en Santiago o regiones.

**Parámetros:**
- `query` *(string, opcional)*: Nombre o parte del nombre del proveedor.
- `limit` *(number, opcional, default: `20`)*: Límite de proveedores.

**Ejemplo de Input:**
```json
{
  "query": "Zaga",
  "limit": 5
}
```

---

### 📥 5. `dropi_import_product`
**Descripción:** Importa automáticamente un producto de Dropi hacia el catálogo maestro de Nexora ERP, asignándole un SKU maestro (`NEX-00XXX`), registrando stock inicial y vinculando el código externo de Dropi para que esté disponible para venta multicanal.

**Parámetros:**
- `product_id` *(number, requerido)*: ID del producto en Dropi.

**Ejemplo de Input:**
```json
{
  "product_id": 33369
}
```

**Respuesta:**
```json
{
  "success": true,
  "action": "imported",
  "product_id": "3b2e5914-...",
  "variant_id": "a1f9042b-...",
  "name": "SET DE HERRAMIENTAS 108 PIEZAS",
  "sku": "NEX-00201",
  "dropi_id": 33369,
  "supplier": "vida y hogar spa",
  "cost_price": 41000,
  "retail_price": 70000,
  "stock": 497
}
```

---

### 🔄 6. `dropi_sync_orders`
**Descripción:** Sincroniza y descarga automáticamente todas las órdenes de Dropi Chile a la tabla central de órdenes de Nexora ERP.

**Parámetros:** Ninguno `{}`.

---

## 3. System Prompt Recomendado para pasarle a tu IA

Copia y pega este prompt en las instrucciones de tu IA para que sepa exactamente cómo y cuándo usar estas herramientas:

```markdown
Eres un Asistente Experto en Comercio Electrónico y Dropshipping conectado a Dropi Chile y Nexora ERP mediante Model Context Protocol (MCP).

Tienes acceso a las siguientes capacidades mediante tus herramientas MCP:
1. `dropi_search_products`: Para buscar productos ganadores en Dropi Chile. Siempre que te pidan recomendaciones de productos, verifica el costo mayorista (`cost_price`), el precio de venta sugerido (`suggested_price`), el margen neto (`profit_margin` y `margin_pct`) y el stock real en bodegas (`stock`). Solo recomienda productos con stock > 30 unidades para evitar quiebres.
2. `dropi_get_product_detail`: Para ver las fotos HD de Amazon S3, especificaciones técnicas y variantes de un producto.
3. `dropi_get_orders`: Para informar al usuario sobre pedidos realizados, estados logísticos (Pendiente, Guía Generada, En tránsito, Entregado) y enlaces de seguimiento de Blue Express o Starken.
4. `dropi_get_suppliers`: Para consultar importadoras y ubicaciones de bodegas físicas en Chile.
5. `dropi_import_product`: Cuando el usuario decida vender un producto de Dropi en sus tiendas, usa esta herramienta para agregarlo al catálogo maestro de Nexora ERP con su SKU maestro.
6. `dropi_sync_orders`: Para sincronizar las ventas de Dropi a la cola de empaque de Nexora.

Formatea los precios siempre en Pesos Chilenos (CLP) con formato moneda (ej: $41.000).
```
