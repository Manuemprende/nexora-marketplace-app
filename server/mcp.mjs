#!/usr/bin/env node
/**
 * Nexora Commerce Orchestration - Model Context Protocol (MCP) Server
 * Protocol: JSON-RPC 2.0 over stdio
 */
import readline from 'node:readline';
import { resolve } from 'node:path';
import { openDatabase } from './database.mjs';
import {
  catalog,
  requireVariant,
  changeStock,
  addCode,
  editPlatformPrice,
  orders,
  createOrder,
  movements,
  sales,
  storeProducts,
  storeCreateOrder
} from './service.mjs';
import { platformTotals } from '../src/services/platformTotals.mjs';
import { dropiClient } from './dropi.mjs';
import { createOrUpdateLiveLanding, listLandings } from './live-landings.mjs';

const defaultDb = process.platform === 'win32' ? resolve('data/nexora.sqlite') : '/var/lib/nexora/nexora.sqlite';
const dbPath = process.env.NEXORA_DB_PATH || defaultDb;
let db;
try {
  db = openDatabase(dbPath);
} catch (err) {
  // Fallback to meibo.sqlite if nexora.sqlite not yet generated
  const fallbackDb = process.platform === 'win32' ? resolve('data/meibo.sqlite') : '/var/lib/nexora/meibo.sqlite';
  db = openDatabase(fallbackDb);
}

// System Actor for MCP Operations
let mcpActor = db.prepare("SELECT id FROM users WHERE email='admin@nexora.io'").get()?.id;
if (!mcpActor) {
  mcpActor = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()?.id || 'mcp-system-actor';
}

const SERVER_NAME = 'nexora-commerce-mcp';
const SERVER_VERSION = '1.0.0';

const TOOLS = [
  {
    name: 'nexora_search_catalog',
    description: 'Busca productos y variantes en el catálogo maestro de Nexora por nombre, categoría, SKU maestro o códigos externos de marketplaces (Mercado Libre, Shopify, Falabella, Dropi, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Término de búsqueda, SKU maestro (ej: NEX-00125) o código de marketplace.'
        },
        limit: {
          type: 'number',
          description: 'Límite de resultados a retornar (por defecto 10).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'nexora_get_stock',
    description: 'Consulta el inventario atómico (stock físico, reservado y disponible real) de un producto o lista de productos en bodega.',
    inputSchema: {
      type: 'object',
      properties: {
        sku_or_id: {
          type: 'string',
          description: 'SKU maestro Nexora (ej: NEX-00125) o UUID de variante.'
        }
      },
      required: ['sku_or_id']
    }
  },
  {
    name: 'nexora_list_marketplace_mappings',
    description: 'Lista todas las equivalencias de códigos y precios asignados por canal de venta (Mercado Libre, Shopify, Falabella, Ripley, Facebook Marketplace, Dropi, etc.) para un SKU o variante.',
    inputSchema: {
      type: 'object',
      properties: {
        sku_or_id: {
          type: 'string',
          description: 'SKU maestro Nexora o UUID de la variante a consultar.'
        }
      },
      required: ['sku_or_id']
    }
  },
  {
    name: 'nexora_set_marketplace_mapping',
    description: 'Asocia o actualiza el código externo y precio de venta en un marketplace específico (ej: Mercado Libre, Shopify, Falabella) para un producto.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_id: {
          type: 'string',
          description: 'UUID de la variante en Nexora.'
        },
        platform: {
          type: 'string',
          description: 'Nombre del marketplace o canal (Mercado Libre, Shopify, Falabella, Ripley, Facebook Marketplace, Dropi, etc.).'
        },
        code: {
          type: 'string',
          description: 'Código o ID asignado en la plataforma externa.'
        },
        price: {
          type: 'number',
          description: 'Precio de venta asignado en esta plataforma en CLP.'
        },
        origin: {
          type: 'string',
          description: 'Nota de origen o trazabilidad (por defecto: Sincronización MCP).'
        }
      },
      required: ['variant_id', 'platform', 'code', 'price']
    }
  },
  {
    name: 'nexora_get_stock_alerts',
    description: 'Retorna alertas de inventario crítico: productos sin stock físico, con stock bajo (<15 unidades disponibles) o con carga pendiente.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: {
          type: 'number',
          description: 'Umbral de unidades para alertar stock bajo (por defecto 15).'
        }
      }
    }
  },
  {
    name: 'nexora_adjust_stock',
    description: 'Registra un movimiento auditable de inventario físico (entrada de reposición, salida o recuento de auditoría) con motivo explícito y trazabilidad.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_id: {
          type: 'string',
          description: 'UUID de la variante en Nexora.'
        },
        type: {
          type: 'string',
          enum: ['entry', 'exit', 'adjustment'],
          description: 'Tipo de movimiento: entry (entrada), exit (salida) o adjustment (ajuste físico total).'
        },
        quantity: {
          type: 'number',
          description: 'Cantidad de unidades (positiva).'
        },
        reason: {
          type: 'string',
          description: 'Motivo obligatorio del movimiento para auditoría.'
        }
      },
      required: ['variant_id', 'type', 'quantity', 'reason']
    }
  },
  {
    name: 'nexora_create_order',
    description: 'Registra un pedido omnicanal proveniente de cualquier marketplace (Mercado Libre, Shopify, Falabella, Dropi, etc.) y reserva el stock atómicamente.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Canal de origen (Mercado Libre, Shopify, Falabella, Ripley, Facebook Marketplace, Dropi, etc.).'
        },
        external_reference: {
          type: 'string',
          description: 'ID o número de orden en el marketplace externo.'
        },
        customer_name: {
          type: 'string',
          description: 'Nombre del comprador o cliente final.'
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'UUID de la variante en Nexora' },
              qty: { type: 'number', description: 'Cantidad de unidades' }
            },
            required: ['id', 'qty']
          },
          description: 'Lista de variantes y cantidades solicitadas.'
        }
      },
      required: ['platform', 'external_reference', 'items']
    }
  },
  {
    name: 'nexora_list_orders',
    description: 'Consulta los pedidos en bodega con filtros por estado (open, pending, packed, cancelled) y por marketplace.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'pending', 'packing', 'packed', 'cancelled', 'all'],
          description: 'Filtro de estado.'
        },
        platform: {
          type: 'string',
          description: 'Filtrar por plataforma específica (opcional).'
        },
        limit: {
          type: 'number',
          description: 'Límite de órdenes a retornar (por defecto 20).'
        }
      }
    }
  },
  {
    name: 'nexora_get_platform_sales_summary',
    description: 'Calcula el balance y volumen de ventas consolidado por marketplace (Mercado Libre, Shopify, Falabella, Dropi, POS, etc.), separando montos confirmados y cancelaciones.',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'all'],
          description: 'Período: "today" (fecha de hoy en Chile) o "all" (histórico acumulado).'
        }
      }
    }
  },
  {
    name: 'dx_get_catalog',
    description: 'Consulta el catálogo oficial de DX Tools (herramientas industriales, inalámbricas 21V/48V brushless, soldadura IGBT, etc.), con precios mayoristas, precios de venta sugeridos, stock y especificaciones.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto de búsqueda por nombre, SKU o especificación.' },
        category: { type: 'string', description: 'Subcategoría (Inalámbricas Pro, Eléctricas, Soldadura, Escaleras, etc.).' },
        limit: { type: 'number', description: 'Cantidad máxima de herramientas a retornar (por defecto 20).' }
      }
    }
  },
  {
    name: 'dx_create_order',
    description: 'Crea un pedido en la tienda DX Tools, reserva el inventario y genera el enlace oficial de WhatsApp con el resumen de la compra preformateado para el cliente y vendedor.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Nombre completo del comprador.' },
        customer_phone: { type: 'string', description: 'Teléfono o WhatsApp del cliente (ej: +56912345678).' },
        customer_address: { type: 'string', description: 'Dirección o comuna de entrega.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku_or_id: { type: 'string', description: 'SKU (ej: NEXO-DX-966727) o UUID de la variante' },
              qty: { type: 'number', description: 'Cantidad de unidades' }
            },
            required: ['sku_or_id', 'qty']
          },
          description: 'Herramientas a ordenar con cantidades.'
        },
        payment_method: { type: 'string', description: 'Método de pago (Contraentrega, Transferencia, Webpay).' },
        notes: { type: 'string', description: 'Instrucciones o notas adicionales.' }
      },
      required: ['customer_name', 'customer_phone', 'items']
    }
  },
  {
    name: 'dx_check_inventory',
    description: 'Verifica el estado de inventario, stock en bodega de RM, costo mayorista y margen de ganancia de una herramienta DX específica.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'SKU de la herramienta (ej: NEXO-DX-966727).' }
      },
      required: ['sku']
    }
  },
  {
    name: 'dropi_search_products',
    description: 'Busca productos en el catálogo mayorista de Dropi Chile (o Colombia/Brasil), retornando costo mayorista dropshipper, precio de venta sugerido, margen neto de ganancia, stock real en bodegas y datos del proveedor importador.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Palabra clave o término de búsqueda (ej: taladro, herramientas, cepillo).' },
        country: { type: 'string', enum: ['CHILE', 'COLOMBIA', 'BRASIL'], description: 'País del marketplace Dropi (por defecto CHILE).' },
        limit: { type: 'number', description: 'Cantidad máxima de productos a retornar (por defecto 20).' },
        user_verified: { type: 'boolean', description: 'Filtrar solo por proveedores verificados (opcional).' }
      }
    }
  },
  {
    name: 'dropi_get_product_detail',
    description: 'Obtiene la ficha técnica completa, imágenes de alta resolución en Amazon S3, stock real por bodega física y variantes de un producto Dropi por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', description: 'ID numérico del producto en Dropi (ej: 22058).' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'dropi_get_orders',
    description: 'Consulta en tiempo real los pedidos de Dropi (seller dropshipper), su estado logístico (GENERADO, PENDIENTE, GUIA GENERADA, ENVIADO, ENTREGADO, CANCELADO), transportadora (Blue Express, Starken), número de guía y datos contraentrega (COD).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Cantidad máxima de pedidos a retornar (por defecto 30).' },
        start: { type: 'number', description: 'Paginación: índice inicial (por defecto 0).' }
      }
    }
  },
  {
    name: 'dropi_get_suppliers',
    description: 'Lista los principales proveedores mayoristas importadores en Dropi Chile (ej: Zaga Importadora, Oferfly, Intra Herramientas, Ventmar), sus bodegas físicas y catálogo.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o filtro de proveedor (opcional).' },
        limit: { type: 'number', description: 'Límite de proveedores a retornar (por defecto 20).' }
      }
    }
  },
  {
    name: 'dropi_import_product',
    description: 'Importa un producto ganador de Dropi Chile directamente al catálogo maestro de Nexora ERP, asignándole SKU maestro, creando la ficha, stock inicial y vinculándolo para sincronización multicanal.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'number', description: 'ID numérico del producto en Dropi a importar.' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'dropi_sync_orders',
    description: 'Sincroniza y descarga los pedidos de Dropi en la base de datos de órdenes de Nexora ERP para empaque, despacho o seguimiento unificado.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'nexora_create_live_landing',
    description: 'Crea o actualiza automáticamente una Live Landing Monoproducto con subdominio Wildcard (ej: taladro.wentixai.digital), video vertical 9:16, chat interactivo con bot IA, píxeles de Meta/TikTok y checkout Contraentrega (COD) con packs 1x, 2x y 3x sincronizado a Nexora ERP.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Subdominio deseado sin espacios (ej: "taladro", "pulidor", "luces-navidad"). Creará https://{slug}.wentixai.digital'
        },
        dropi_id: {
          type: 'number',
          description: 'ID numérico del producto en Dropi Chile (ej: 28121) para extraer título, fotos y stock automáticamente.'
        },
        price: {
          type: 'number',
          description: 'Precio de venta de 1 unidad en CLP (ej: 24990). Los packs 2x y 3x se calculan automáticamente con descuento.'
        },
        video_url: {
          type: 'string',
          description: 'URL del video vertical MP4 o HLS 9:16 para el Live Shopping.'
        },
        meta_pixel_id: {
          type: 'string',
          description: 'ID del Píxel de Meta Ads para trackear ViewContent, InitiateCheckout y Purchase (opcional).'
        },
        tiktok_pixel_id: {
          type: 'string',
          description: 'ID del Píxel de TikTok Ads (opcional).'
        },
        title: {
          type: 'string',
          description: 'Título comercial personalizado del producto (opcional; si se omite usa el de Dropi).'
        }
      },
      required: ['slug', 'price']
    }
  },
  {
    name: 'nexora_list_live_landings',
    description: 'Lista todas las Live Landings (subdominios activos) creadas en Nexora ERP junto con sus pedidos recibidos, ingresos en CLP y enlaces directos.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Helper to execute tool
async function executeTool(name, args) {
  switch (name) {
    case 'dx_get_catalog': {
      const res = storeProducts(db, {
        q: args.query,
        category: args.category,
        onlyTools: true,
        limit: args.limit || 20
      });
      return {
        total: res.total,
        count: res.products.length,
        tools: res.products
      };
    }

    case 'dx_create_order': {
      const all = catalog(db);
      const mappedItems = (args.items || []).map(it => {
        const found = all.find(p => p.sku.toLowerCase() === (it.sku_or_id || '').toLowerCase() || p.id === it.sku_or_id);
        if (!found) throw new Error(`Herramienta no encontrada: ${it.sku_or_id}`);
        return { variant_id: found.id, qty: it.qty };
      });

      return storeCreateOrder(db, {
        customer_name: args.customer_name,
        customer_phone: args.customer_phone,
        customer_address: args.customer_address,
        payment_method: args.payment_method,
        notes: args.notes,
        items: mappedItems
      });
    }

    case 'dx_check_inventory': {
      const sku = (args.sku || '').trim().toLowerCase();
      const all = catalog(db);
      const found = all.find(p => p.sku.toLowerCase() === sku || p.id === sku);
      if (!found) throw new Error(`Herramienta DX no encontrada con SKU: ${sku}`);

      const cost = db.prepare("SELECT price FROM external_codes WHERE variant_id=? AND platform IN ('Dropea','DX Tools')").get(found.id)?.price || Math.round(found.price * 0.65);
      const margin = found.price - cost;
      const marginPercent = Math.round((margin / found.price) * 100);

      return {
        sku: found.sku,
        name: found.name,
        category: found.category,
        retail_price: found.price,
        wholesale_cost: cost,
        profit_margin_clp: margin,
        margin_percent: `${marginPercent}%`,
        physical_stock: found.stock,
        reserved: found.reserved,
        available_stock: found.stock - found.reserved,
        warehouse_status: (found.stock - found.reserved) > 0 ? 'STOCK_DISPONIBLE_RM' : 'AGOTADO'
      };
    }

    case 'nexora_search_catalog': {
      const q = (args.query || '').trim().toLowerCase();
      const limit = Number(args.limit) || 10;
      const all = catalog(db);
      const matches = all.filter(p =>
        p.active &&
        [p.name, p.sku, p.category, p.attributes, ...Object.values(p.codes || {})]
          .join(' ')
          .toLowerCase()
          .includes(q)
      ).slice(0, limit);

      return {
        query: args.query,
        count: matches.length,
        results: matches.map(p => ({
          id: p.id,
          product_id: p.product_id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          attributes: p.attributes,
          price: p.price,
          stock_on_hand: p.stock,
          stock_reserved: p.reserved,
          stock_available: p.stock - p.reserved,
          marketplace_codes: p.codes
        }))
      };
    }

    case 'nexora_get_stock': {
      const term = (args.sku_or_id || '').trim();
      const all = catalog(db);
      const found = all.find(p => p.sku.toLowerCase() === term.toLowerCase() || p.id === term);
      if (!found) throw new Error(`Producto no encontrado con SKU o ID: ${term}`);

      const available = found.stock - found.reserved;
      return {
        id: found.id,
        sku: found.sku,
        name: found.name,
        attributes: found.attributes,
        physical_on_hand: found.stock,
        reserved: found.reserved,
        available: available,
        status: available === 0 ? 'SIN_STOCK' : available < 15 ? 'STOCK_BAJO' : 'DISPONIBLE'
      };
    }

    case 'nexora_list_marketplace_mappings': {
      const term = (args.sku_or_id || '').trim();
      const all = catalog(db);
      const found = all.find(p => p.sku.toLowerCase() === term.toLowerCase() || p.id === term);
      if (!found) throw new Error(`Producto no encontrado: ${term}`);

      return {
        id: found.id,
        sku: found.sku,
        name: found.name,
        base_price: found.price,
        mappings: found.external_codes.map(c => ({
          id: c.id,
          platform: c.platform,
          code: c.code,
          price: c.price,
          created_at: c.created_at,
          origin: c.origin
        }))
      };
    }

    case 'nexora_set_marketplace_mapping': {
      const { variant_id, platform, code, price, origin = 'Sincronización MCP' } = args;
      const v = requireVariant(db, variant_id);
      
      const existing = db.prepare('SELECT id FROM external_codes WHERE variant_id=? AND platform=?').get(variant_id, platform);
      let resultId;
      if (existing) {
        editPlatformPrice(db, existing.id, { price });
        resultId = existing.id;
      } else {
        resultId = addCode(db, variant_id, { platform, code, price, origin });
      }

      return {
        success: true,
        variant_id,
        sku: v.meibo_sku,
        platform,
        code,
        price,
        mapping_id: resultId
      };
    }

    case 'nexora_get_stock_alerts': {
      const threshold = Number(args.threshold) || 15;
      const all = catalog(db);
      const outOfStock = [];
      const lowStock = [];

      for (const p of all) {
        if (!p.active) continue;
        const avail = p.stock - p.reserved;
        if (avail === 0) {
          outOfStock.push({ id: p.id, sku: p.sku, name: p.name, on_hand: p.stock, reserved: p.reserved });
        } else if (avail < threshold) {
          lowStock.push({ id: p.id, sku: p.sku, name: p.name, available: avail, on_hand: p.stock, reserved: p.reserved });
        }
      }

      return {
        threshold,
        total_alerts: outOfStock.length + lowStock.length,
        out_of_stock_count: outOfStock.length,
        low_stock_count: lowStock.length,
        out_of_stock: outOfStock,
        low_stock: lowStock
      };
    }

    case 'nexora_adjust_stock': {
      const { variant_id, type, quantity, reason } = args;
      const res = changeStock(db, variant_id, {
        type,
        quantity,
        reason,
        request_id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      }, mcpActor);

      return {
        success: true,
        variant_id,
        sku: res.sku,
        physical_stock: res.stock,
        available_stock: res.available,
        reason
      };
    }

    case 'nexora_create_order': {
      const { platform, external_reference, customer_name = 'Cliente Marketplace', items } = args;
      const requestId = `mcp-order-${Date.now()}`;
      const res = createOrder(db, {
        platform,
        external_reference,
        customer_name,
        items,
        request_id: requestId
      }, mcpActor);

      return {
        success: true,
        order_id: res.id,
        order_number: res.number,
        platform,
        external_reference,
        stock_reserved: true,
        items_count: items.length
      };
    }

    case 'nexora_list_orders': {
      const { status = 'all', platform = null, limit = 20 } = args;
      let allOrders = orders(db);
      if (platform) {
        allOrders = allOrders.filter(o => o.platform.toLowerCase() === platform.toLowerCase());
      }
      if (status === 'open') {
        allOrders = allOrders.filter(o => ['pending', 'packing'].includes(o.status));
      } else if (status !== 'all') {
        allOrders = allOrders.filter(o => o.status === status);
      }

      return {
        count: allOrders.length,
        orders: allOrders.slice(0, limit).map(o => ({
          id: o.id,
          number: o.number,
          platform: o.platform,
          external_reference: o.external_reference,
          customer_name: o.customer_name,
          status: o.status,
          stock_policy: o.stock_policy,
          created_at: o.created_at,
          items: o.items.map(i => ({
            sku: i.product?.sku,
            name: i.product?.name,
            qty: i.qty
          }))
        }))
      };
    }

    case 'nexora_get_platform_sales_summary': {
      const period = args.period || 'all';
      const allOrders = orders(db);
      const allSales = sales(db);
      const totals = platformTotals(allOrders, allSales, { period, includeDemo: false });

      return {
        period,
        platforms: totals.filter(t => t.orders > 0 || t.amount > 0 || ['Mercado Libre', 'Shopify', 'Falabella', 'Dropi'].includes(t.platform))
      };
    }

    case 'dropi_search_products': {
      const { query = '', country = 'CHILE', limit = 20, user_verified = false } = args;
      const res = await dropiClient.searchProducts({
        keywords: query,
        country,
        pageSize: limit,
        userVerified: user_verified
      });
      return {
        query,
        country,
        total: res.total,
        count: res.products.length,
        products: res.products
      };
    }

    case 'dropi_get_product_detail': {
      const { product_id } = args;
      if (!product_id) throw new Error('Se requiere el product_id');
      const detail = await dropiClient.getProductDetail(product_id);
      return detail;
    }

    case 'dropi_get_orders': {
      const { limit = 30, start = 0 } = args;
      const res = await dropiClient.getOrders({ result_number: limit, start });
      return res;
    }

    case 'dropi_get_suppliers': {
      const { query = '', limit = 20 } = args;
      const suppliers = await dropiClient.getSuppliers({ query, result_number: limit });
      return {
        total: suppliers.length,
        suppliers
      };
    }

    case 'dropi_import_product': {
      const { product_id } = args;
      if (!product_id) throw new Error('Se requiere product_id para importar');
      const result = await dropiClient.importProductToNexora(db, product_id, mcpActor);
      return result;
    }

    case 'dropi_sync_orders': {
      const result = await dropiClient.syncOrdersToNexora(db, mcpActor);
      return result;
    }

    case 'nexora_create_live_landing': {
      const { slug, dropi_id, price, video_url, meta_pixel_id, tiktok_pixel_id, title } = args;
      if (!slug) throw new Error('Se requiere slug (subdominio) para crear la Live Landing');
      const result = await createOrUpdateLiveLanding(db, {
        slug,
        dropi_id,
        price,
        video_url,
        meta_pixel_id,
        tiktok_pixel_id,
        title
      }, mcpActor);
      return {
        success: true,
        message: `Live Landing creada y publicada en ${result.subdomain_url}`,
        slug: result.slug,
        subdomain_url: result.subdomain_url,
        preview_url: `https://nexora.wentixai.cyou${result.preview_url}`,
        api_config_url: `https://nexora.wentixai.cyou${result.api_config_url}`,
        product: {
          sku: result.config.product.sku,
          title: result.config.product.title,
          price_1x: result.config.product.packs[0]?.price,
          price_2x: result.config.product.packs[1]?.price,
          price_3x: result.config.product.packs[2]?.price
        },
        pixels: result.config.pixels
      };
    }

    case 'nexora_list_live_landings': {
      const landings = listLandings(db);
      return {
        total: landings.length,
        landings: landings.map(l => ({
          slug: l.slug,
          subdomain_url: l.subdomain_url,
          title: l.product?.title,
          sku: l.product?.sku,
          price: l.product?.price,
          orders_count: l.orders_count,
          revenue_clp: l.revenue_clp,
          updated_at: l.updated_at
        }))
      };
    }

    default:
      throw new Error(`Herramienta no implementada: ${name}`);
  }
}

// MCP Stdio Transport Listener
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

rl.on('line', async line => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION
            }
          }
        });
        break;
      }

      case 'notifications/initialized': {
        // Handshake acknowledgment
        break;
      }

      case 'ping': {
        send({ jsonrpc: '2.0', id, result: {} });
        break;
      }

      case 'tools/list': {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS
          }
        });
        break;
      }

      case 'tools/call': {
        const { name, arguments: toolArgs = {} } = params || {};
        try {
          const result = await executeTool(name, toolArgs);
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        } catch (toolError) {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Error ejecutando ${name}: ${toolError.message}`
                }
              ]
            }
          });
        }
        break;
      }

      default: {
        if (id !== undefined) {
          send({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Método desconocido: ${method}` }
          });
        }
      }
    }
  } catch (err) {
    if (id !== undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message }
      });
    }
  }
});

process.stderr.write(`[Nexora MCP Server] Escuchando en stdio (DB: ${dbPath})...\n`);
