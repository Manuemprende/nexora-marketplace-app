# Nexora — Model Context Protocol (MCP) Server

Servidor oficial de **Model Context Protocol (MCP)** para **Nexora: Commerce Orchestration**. Permite a asistentes de inteligencia artificial (Claude Desktop, Cursor, AntiGravity, Codex y agentes autónomos) interactuar de forma segura con el catálogo maestro, stock atómico, sincronización multi-marketplace y procesamiento de pedidos.

---

## 🚀 1. Arranque Rápido

El servidor MCP de Nexora corre sobre transporte estándar **stdio** (JSON-RPC 2.0) utilizando el motor de Node.js 24 con SQLite nativo.

```powershell
# Desde el directorio del proyecto:
npm run start:mcp
```

### Variables de Entorno Opcionales
- `NEXORA_DB_PATH`: Ruta absoluta a la base de datos SQLite (por defecto: `data/nexora.sqlite`).

---

## ⚙️ 2. Configuración en Clientes MCP

### A. Claude Desktop (`claude_desktop_config.json`)
Ruta en Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nexora": {
      "command": "node",
      "args": [
        "F:\\Open Code\\Wentix AI MarketPlace\\meibo-mvp\\server\\mcp.mjs"
      ],
      "env": {
        "NEXORA_DB_PATH": "F:\\Open Code\\Wentix AI MarketPlace\\meibo-mvp\\data\\nexora.sqlite"
      }
    }
  }
}
```

### B. Cursor (`.cursor/mcp.json` o Settings > MCP)
```json
{
  "mcpServers": {
    "nexora-commerce": {
      "command": "node",
      "args": [
        "F:\\Open Code\\Wentix AI MarketPlace\\meibo-mvp\\server\\mcp.mjs"
      ]
    }
  }
}
```

### C. Google AntiGravity / Gemini Sandbox
```json
{
  "nexora": {
    "command": "node",
    "args": ["server/mcp.mjs"],
    "cwd": "F:\\Open Code\\Wentix AI MarketPlace\\meibo-mvp"
  }
}
```

---

## 🛠️ 3. Catálogo de Herramientas (Tools) Disponibles

### 1. `nexora_search_catalog`
Busca productos y variantes en el catálogo centralizado por nombre, categoría, SKU maestro o código de cualquier marketplace.
- **Parámetros:**
  - `query` (string, obligatorio): Término de búsqueda, SKU maestro (`NEX-00125`) o código externo (`MELI-88310`, `DR-87452`, `SHOPI-101`).
  - `limit` (number, opcional): Máximo de resultados (por defecto `10`).
- **Respuesta:** Lista de variantes con ID, SKU maestro, precio base, stock físico, reservado, disponible y códigos asociados.

### 2. `nexora_get_stock`
Consulta el estado de inventario atómico en tiempo real para una variante.
- **Parámetros:**
  - `sku_or_id` (string, obligatorio): SKU maestro o UUID de la variante.
- **Respuesta:**
  ```json
  {
    "sku": "NEX-00125",
    "physical_on_hand": 184,
    "reserved": 4,
    "available": 180,
    "status": "DISPONIBLE"
  }
  ```

### 3. `nexora_list_marketplace_mappings`
Obtiene la matriz de equivalencias y precios específicos para cada canal (Mercado Libre, Shopify, Falabella, Ripley, Facebook, Dropi, etc.).
- **Parámetros:**
  - `sku_or_id` (string, obligatorio): SKU maestro o UUID.
- **Respuesta:** Lista de asignaciones activas con plataforma, código externo, precio en CLP y fecha de vinculación.

### 4. `nexora_set_marketplace_mapping`
Asocia o actualiza el código y precio de venta para un marketplace específico.
- **Parámetros:**
  - `variant_id` (string, obligatorio): UUID de la variante.
  - `platform` (string, obligatorio): Nombre del canal (`Mercado Libre`, `Shopify`, `Falabella`, `Ripley`, `Facebook Marketplace`, `Dropi`, `Dropea`, `Evolut`, `Jumpseller`).
  - `code` (string, obligatorio): Código o identificador externo.
  - `price` (number, obligatorio): Precio en CLP para ese canal.
  - `origin` (string, opcional): Nota de trazabilidad.

### 5. `nexora_get_stock_alerts`
Detecta quiebres de inventario o productos que requieren reposición inmediata.
- **Parámetros:**
  - `threshold` (number, opcional): Umbral de alerta (por defecto `15`).
- **Respuesta:** Conteo y lista detallada de productos agotados (`out_of_stock`) y con existencias bajas (`low_stock`).

### 6. `nexora_adjust_stock`
Registra un movimiento auditable en bodega con trazabilidad de usuario y timestamp.
- **Parámetros:**
  - `variant_id` (string, obligatorio): UUID de la variante.
  - `type` (string, obligatorio): `'entry'` (entrada), `'exit'` (salida) o `'adjustment'` (recuento total).
  - `quantity` (number, obligatorio): Cantidad de unidades.
  - `reason` (string, obligatorio): Justificación obligatoria para la auditoría.

### 7. `nexora_create_order`
Crea una orden omnicanal desde cualquier marketplace y reserva el inventario de forma atómica.
- **Parámetros:**
  - `platform` (string, obligatorio): Canal de origen (`Mercado Libre`, `Shopify`, `Dropi`, etc.).
  - `external_reference` (string, obligatorio): ID del pedido en la plataforma de origen.
  - `customer_name` (string, opcional): Nombre del comprador.
  - `items` (array, obligatorio): `[{ id: "variant-uuid", qty: 2 }]`.

### 8. `nexora_list_orders`
Lista pedidos en cola de bodega filtrados por estado o plataforma.
- **Parámetros:**
  - `status` (string, opcional): `'open'`, `'pending'`, `'packing'`, `'packed'`, `'cancelled'` o `'all'`.
  - `platform` (string, opcional): Filtrar por marketplace específico.
  - `limit` (number, opcional): Límite de resultados (por defecto `20`).

### 9. `nexora_get_platform_sales_summary`
Reporte consolidado de facturación, pedidos y unidades por canal de venta.
- **Parámetros:**
  - `period` (string, opcional): `'today'` (hoy en huso horario de Chile) o `'all'` (acumulado histórico).

---

## 🔒 4. Garantías de Seguridad & Concurrencia
- **Transacciones Atómicas:** Toda modificación de inventario se ejecuta en transacciones `BEGIN IMMEDIATE` en SQLite, impidiendo la sobreventa o condiciones de carrera entre pedidos concurrentes.
- **Trazabilidad Completa:** Cada movimiento de inventario registra el actor del sistema, stock previo y stock resultante.
- **Aislamiento Multi-Marketplace:** Modificar el precio en Mercado Libre no altera el precio base ni las publicaciones en Shopify o Dropi.
