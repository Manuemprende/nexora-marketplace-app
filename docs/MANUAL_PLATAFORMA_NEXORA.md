# Manual Maestro de la Plataforma Nexora
### Nexora — Commerce Orchestration Platform
*Documentación técnica, funcional y operativa completa del sistema.*

---

## 📑 Tabla de Contenidos
1. [Visión & Modelo de Negocio](#1-visión--modelo-de-negocio)
2. [Arquitectura Técnica & Pila Tecnológica](#2-arquitectura-técnica--pila-tecnológica)
3. [Seguridad, Cuentas de Acceso & Roles](#3-seguridad-cuentas-de-acceso--roles)
4. [Módulos & Aplicaciones de la Plataforma](#4-módulos--aplicaciones-de-la-plataforma)
   - 4.1 [Punto de Venta (POS)](#41-punto-de-venta-pos)
   - 4.2 [Zona de Empaque & Fulfillment](#42-zona-de-empaque--fulfillment)
   - 4.3 [Catálogo Central & Variantes](#43-catálogo-central--variantes)
   - 4.4 [SKU Maestro & Mapeo de Marketplaces](#44-sku-maestro--mapeo-de-marketplaces)
   - 4.5 [Importación de Catálogos](#45-importación-de-catálogos)
   - 4.6 [Historial de Movimientos (Kardex)](#46-historial-de-movimientos-kardex)
   - 4.7 [Dashboard & Analítica de Rendimiento](#47-dashboard--analítica-de-rendimiento)
5. [Ecosistema de Integraciones Omnicanal](#5-ecosistema-de-integraciones-omnicanal)
6. [Servidor Model Context Protocol (MCP)](#6-servidor-model-context-protocol-mcp)
7. [Guía de Comandos, Pruebas & Operación](#7-guía-de-comandos-pruebas--operación)

---

## 1. Visión & Modelo de Negocio

**Nexora** es una plataforma central de **orquestación de comercio omnicanal (Commerce Orchestration)** diseñada para unificar el catálogo, inventario físico, despacho y ventas entre múltiples fuentes de demanda y canales de distribución.

```
       ┌────────────────────────────────────────────────────────┐
       │             BODEGA CENTRAL / PROVEEDORES              │
       │              (Stock Físico Centralizado)               │
       └──────────────────────────┬─────────────────────────────┘
                                  │
                       [ NEXORA CORE ENGINE ]
          (Inventario Atómico · SKU Maestro · Lógica Antidoble Descuento)
                                  │
    ┌─────────────┬───────────────┼───────────────┬─────────────┐
    ▼             ▼               ▼               ▼             ▼
[Mercado Libre] [Shopify]    [Falabella]     [Dropi/Dropea]   [POS Local]
(Marketplace)   (Tienda D2C)  (Retail Seller) (Dropshipping)  (Mostrador)
```

### Modelos de Negocio Soportados:
1. **Comercio Propio Centralizado:** El negocio cuenta con bodega física propia y necesita que una venta en cualquier canal (Mercado Libre, Falabella, Shopify, etc.) descuente el inventario atómicamente en todos los demás canales para evitar quiebres y multas por sobreventa.
2. **Revendedor & Arbitraje de Catálogo (B2B Partner Network):** Permite acuerdos con proveedores aliados que ya cuentan con miles de productos. Nexora importa su catálogo autorizado, le asigna SKUs maestros, permite definir márgenes de reventa por canal y sincroniza las publicaciones hacia los marketplaces sin necesidad de comprar el stock por adelantado.
3. **Distribución y Contenido Masivo:** La plataforma almacena imágenes optimizadas WebP y fichas técnicas normalizadas listas para alimentar automatizaciones de contenido viral en TikTok, Instagram Reels y Meta Commerce.

---

## 2. Arquitectura Técnica & Pila Tecnológica

| Componente | Tecnología | Características Clave |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite 5 | SPA reactiva, interfaz táctil/escritorio, modo Noche/Día (`data-theme`), Lucide Icons. |
| **Backend API** | Node.js 24 nativo | Sin frameworks pesados (`node:http`, `node:sqlite`, `node:crypto`). Latencia mínima (<5ms). |
| **Base de Datos** | SQLite 3 integrado | Modo WAL (`journal_mode = WAL`), isolation level `BEGIN IMMEDIATE` para concurrencia estricta. |
| **Motor de Imágenes** | Sharp 0.35 | Conversión automática de fotos a WebP, compresión sin pérdida y almacenamiento en disco. |
| **IA / Agentes** | MCP (Model Context Protocol) | Servidor JSON-RPC 2.0 sobre `stdio` con 9 herramientas operativas conectables a LLMs. |

### Principio de Consistencia de Inventario:
$$\text{Stock Disponible} = \text{Stock Físico (On Hand)} - \text{Stock Reservado}$$
- Un pedido entrante **reserva** unidades.
- La confirmación en empaque **consume físico** y libera la reserva en un solo paso atómico.
- Las ventas en el POS descuentan físico en el momento del cobro.
- Ningún pedido cancelado altera el físico; libera automáticamente las reservas.

---

## 3. Seguridad, Cuentas de Acceso & Roles

### 3.1 Criptografía y Sesiones
- **Hashing de Contraseñas:** Algoritmo `scrypt` derivado mediante `node:crypto` con salt aleatorio criptográfico de 16 bytes.
- **Validación:** Comparación de tiempo constante (`timingSafeEqual`) para prevenir ataques de temporización (*timing attacks*).
- **Protección contra Fuerza Bruta:** Bloqueo temporal por IP tras 10 intentos fallidos (15 minutos).
- **Cabeceras de Seguridad:** Verificación de origen estricta y cabecera obligatoria `X-Nexora-Request: 1`.

### 3.2 Cuentas Preconfiguradas (Entorno Nexora)

| Usuario | Contraseña | Rol | Alcance de Permisos |
| :--- | :--- | :--- | :--- |
| `admin@nexora.io` | `NexoraAdmin2026!` | **Administrador** | Acceso irrestricto: catálogo, precios, stock, auditoría, usuarios, POS, empaque e integraciones. |
| `empaque@nexora.io` | `NexoraEmpaque2026!` | **Operador** | Exclusivo para Zona de Empaque y escaneo por lector de código de barras. Endpoints de catálogo bloqueados. |

*(Cuentas de compatibilidad anteriores disponibles: `admin@meibo.local` / `MeiboAdmin2026!`)*

---

## 4. Módulos & Aplicaciones de la Plataforma

### 4.1 Punto de Venta (POS) — `#/pos`
Diseñado para mostrador físico o ventas directas por WhatsApp/teléfono.
- **Catálogo Visual & Búsqueda:** Filtros por categoría, búsqueda reactiva y escaneo por tecla Enter.
- **Control de Carrito:** Ajuste de unidades en tiempo real con validación inmediata contra el stock disponible.
- **Medios de Pago:** Efectivo, Tarjeta y Transferencia.
- **Emisión de Comprobantes:** Generación de recibo interno con numeración correlativa (`PED-XXXXX`), datos de cliente y botón de impresión directa adaptado para impresoras térmicas o formato carta/A4.
- **Opción «Enviar a empaque»:** Permite que una venta cobrada en caja pase automáticamente a la cola de preparación en bodega.

### 4.2 Zona de Empaque & Fulfillment — `#/scan`
Pantalla operativa optimizada para operadores con lectores de código de barras USB o teclado.
- **Bandeja de Pedidos:** Clasificación en tiempo real entre *Pendientes*, *En preparación*, *Listos* y *Cancelados*.
- **Prevención de Quiebres:** Si un pedido contiene un producto sin stock suficiente, la orden se bloquea completamente impidiendo preparaciones parciales erróneas.
- **Cronómetro de Eficiencia:** Medición del tiempo de preparación desde que se abre el pedido hasta que se presiona *Pedido preparado*.
- **Descuento Único:** Un solo clic confirma todas las líneas atómicamente, consume el stock físico y actualiza el estado a `packed`.

### 4.3 Catálogo Central & Variantes — `#/products`
Gestión de productos maestros y variantes comerciales.
- **Estructura:** Un producto maestro (ej. *Camiseta Térmica*) agrupa múltiples variantes vendibles con SKU propio (ej. *Negro / Talla M*).
- **Control de Stock Explícito:** Modificaciones auditadas con tipos: Entrada, Salida o Ajuste de inventario físico.
- **Imágenes:** Carga de fotos con conversión instantánea a WebP (`/api/images/...`).
- **Estado de Stock:** Etiquetas dinámicas automáticas (*Disponible*, *Stock bajo <15*, *Sin stock*, *Pendiente de confirmación*).

### 4.4 SKU Maestro & Mapeo de Marketplaces — `#/mapping`
Módulo de equivalencias y precios específicos por canal.
- **SKU Maestro:** Identificador inmutable con formato `NEX-XXXXX`.
- **Mapeo Multi-Canal:** Permite asociar a un solo SKU maestro los identificadores de:
  - Mercado Libre (`MELI-XXXXX`)
  - Shopify (`SHOP-XXXXX`)
  - Falabella (`FAL-XXXXX`)
  - Ripley (`RIP-XXXXX`)
  - Facebook Marketplace (`FB-XXXXX`)
  - Dropi (`DR-XXXXX`)
  - Dropea (`DP-XXXXX`)
  - Evolut (`EV-XXXXX`)
  - Jumpseller (`JS-XXXXX`)
- **Precios Diferenciados:** Cada canal puede tener su propio precio de venta en CLP sin alterar el precio base del catálogo.

### 4.5 Importación de Catálogos — `#/imports`
Motor de ingesta masiva de productos desde archivos JSON normalizados.
- **Staging Seguro:** Los datos se procesan primero en la tabla `catalog_import_rows` para revisión previa.
- **Prevención de Duplicados:** Si una URL o producto ya existe, se conserva su SKU maestro y no se crean filas redundantes.
- **Stock Auditado:** El catálogo importado queda con stock pendiente hasta que se registra una carga explícita de inventario físico.

### 4.6 Historial de Movimientos (Kardex) — `#/movements`
Auditoría completa de trazabilidad.
- Registra cada alteración de stock: fecha, hora chilena, actor (correo del usuario), producto, SKU, tipo de movimiento (`initial`, `entry`, `exit`, `adjustment`, `sale`, `reserve`, `release`, `packing`), delta numérico, stock antes/después y motivo justificado.

### 4.7 Dashboard & Analítica de Rendimiento — `#/dashboard`
Panel directivo de toma de decisiones.
- **Tarjetas de Impacto:** SKUs activos, unidades físicas totales disponibles, productos críticos por revisar y ventas acumuladas.
- **Cohortes Diarias:** Seguimiento de pedidos ingresados hoy vs. preparados hoy, con cálculo de porcentaje de cumplimiento en tiempo real.
- **Ventas por Plataforma:** Tabla comparativa de ingresos brutos, número de órdenes y cancelaciones desglosadas por canal.

---

## 5. Ecosistema de Integraciones Omnicanal

En la sección **Integraciones (`#/integrations`)**, Nexora presenta la matriz de salidas de negocio clasificadas por tipología:

| Plataforma | Categoría | Tipo de Conexión | Capacidades |
| :--- | :--- | :--- | :--- |
| **Mercado Libre** | Marketplace Retail | API Oficial / OAuth | Publicación de catálogo, sincronización de stock Full/Flex y descarga de órdenes. |
| **Falabella** | Marketplace Retail | Seller Center API | Control de inventario sincronizado y recepción de compras de Falabella/Sodimac/Tottus. |
| **Ripley** | Marketplace Retail | Mirakl API | Integración de catálogo y gestión de ventas de la red Ripley. |
| **Shopify** | Ecommerce D2C | GraphQL / Webhooks | Tienda web de marca, checkout directo y sincronización automática de existencias. |
| **Facebook Marketplace** | Social Commerce | Meta Commerce Catalog | Catálogo de productos para tiendas de Facebook e Instagram Shopping. |
| **Dropi** | Red Dropshipping | Dropi API | Red de afiliados con pago contra entrega en Chile y Latam. |
| **Dropea** | Red Dropshipping | Dropea Connect | Gestión de pedidos para revendedores afiliados y contra reembolso. |
| **Evolut** | Mayorista / B2B | Evolut Cloud | Canales de abastecimiento y distribución mayorista. |
| **Jumpseller** | Ecommerce Web | REST API | Tienda online nacional con pasarelas de pago chilenas. |
| **Manu (Local)** | Bodega / POS | Base de Datos Local | Pedidos manuales de mostrador y ventas locales inmediatas. |

---

## 6. Servidor Model Context Protocol (MCP)

Nexora cuenta con un servidor oficial **MCP** (`server/mcp.mjs`) que expone el estado y las operaciones de la plataforma directamente a agentes y modelos de lenguaje vía JSON-RPC 2.0 sobre `stdio`.

### 6.1 Cómo Iniciar el Servidor MCP
```powershell
npm run start:mcp
```

### 6.2 Configuración para Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "nexora-commerce": {
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

### 6.3 Configuración para Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "nexora": {
      "command": "node",
      "args": [
        "F:\\Open Code\\Wentix AI MarketPlace\\meibo-mvp\\server\\mcp.mjs"
      ]
    }
  }
}
```

### 6.4 Catálogo de Herramientas MCP
1. `nexora_search_catalog`: Búsqueda por nombre, categoría, SKU maestro o código de marketplace.
2. `nexora_get_stock`: Consulta de stock físico, reservado y disponible.
3. `nexora_list_marketplace_mappings`: Matriz de precios y códigos en Mercado Libre, Shopify, Dropi, etc.
4. `nexora_set_marketplace_mapping`: Asignación o actualización de precio y código por canal.
5. `nexora_get_stock_alerts`: Detección de productos agotados o con existencias bajas (<15).
6. `nexora_adjust_stock`: Registro auditado de movimientos de inventario en bodega.
7. `nexora_create_order`: Creación de órdenes omnicanal con reserva atómica instantánea.
8. `nexora_list_orders`: Cola de pedidos por estado o canal.
9. `nexora_get_platform_sales_summary`: Reporte de facturación y unidades por marketplace.

*(Documentación técnica detallada disponible en [`docs/MCP_NEXORA.md`](file:///F:/Open%20Code/Wentix%20AI%20MarketPlace/meibo-mvp/docs/MCP_NEXORA.md)).*

---

## 7. Guía de Comandos, Pruebas & Operación

### Comandos de Consola (PowerShell)

```powershell
# 1. Instalar dependencias del proyecto
npm install

# 2. Iniciar plataforma de desarrollo (Frontend en :5173 y Backend en :3001)
npm run dev

# 3. Ejecutar suite completa de 27 pruebas automáticas (incluye MCP)
npm test

# 4. Compilar aplicación para producción
npm run build

# 5. Iniciar exclusivamente la API de backend
npm run start:api

# 6. Iniciar exclusivamente el servidor MCP
npm run start:mcp
```

### Respaldo de Base de Datos
Para crear una copia de seguridad íntegra de la base de datos:
1. Asegúrate de detener temporalmente el servidor o copiar junto con los archivos auxiliares.
2. Copiar `data/nexora.sqlite`, `data/nexora.sqlite-wal` y `data/nexora.sqlite-shm`.
