/**
 * Nexora Facebook Groups Integration Module
 * Bridges Nexora Catalog & Dropi products with Wentix AI Facebook Bot
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const WENTIX_FB_DIR = resolve('F:/Open Code/Wentix AI Facebook');
const DB_PATH = process.env.NEXORA_DB_PATH ?? process.env.MEIBO_DB_PATH ?? '';
const LOCAL_DATA_DIR = DB_PATH ? dirname(DB_PATH) : resolve('data');
const GROUPS_FILE = resolve(LOCAL_DATA_DIR, 'facebook-groups.json');
const LOGS_FILE = resolve(LOCAL_DATA_DIR, 'facebook-logs.json');

const DEFAULT_GROUPS = [
  {
    id: 'grp-nav-1',
    name: '🎄 Feria Navideña Santiago & Regiones',
    url: 'https://www.facebook.com/groups/ventanavidadsantiago',
    category: 'Navidad & Temporada',
    active: true
  },
  {
    id: 'grp-nav-2',
    name: '🎅 Luces y Decoración Navideña Chile',
    url: 'https://www.facebook.com/groups/ferianavidenachile',
    category: 'Navidad & Temporada',
    active: true
  },
  {
    id: 'grp-1',
    name: 'Feria de las Pulgas Santiago & RM',
    url: 'https://www.facebook.com/groups/ventassantiago',
    category: 'General / Variedades',
    active: true
  },
  {
    id: 'grp-2',
    name: 'Herramientas y Maquinaria Chile',
    url: 'https://www.facebook.com/groups/herramientaschile',
    category: 'Ferretería & Industrial',
    active: true
  },
  {
    id: 'grp-3',
    name: 'Compra Venta Gran Santiago',
    url: 'https://www.facebook.com/groups/compraventasantiago',
    category: 'Comercio General',
    active: true
  },
  {
    id: 'grp-4',
    name: 'Herramientas Eléctricas & Inalámbricas RM',
    url: 'https://www.facebook.com/groups/herramientasrm',
    category: 'Ferretería & Herramientas',
    active: true
  },
  {
    id: 'grp-5',
    name: 'Mercado Libre Chile · Venta Directa',
    url: 'https://www.facebook.com/groups/mercadolibrechile',
    category: 'Marketplace',
    active: true
  }
];

let inMemoryLogs = [
  `[${new Date().toLocaleTimeString('es-CL')}] Módulo Wentix Facebook Bot inicializado.`
];

class FacebookIntegrationService {
  constructor() {
    this.ensureDirs();
  }

  ensureDirs() {
    try {
      if (!existsSync(LOCAL_DATA_DIR)) {
        mkdirSync(LOCAL_DATA_DIR, { recursive: true });
      }
      if (!existsSync(GROUPS_FILE)) {
        writeFileSync(GROUPS_FILE, JSON.stringify(DEFAULT_GROUPS, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[FacebookIntegration] Could not initialize groups file:', err.message);
    }
  }

  getGroups() {
    try {
      if (existsSync(GROUPS_FILE)) {
        return JSON.parse(readFileSync(GROUPS_FILE, 'utf-8'));
      }
    } catch (e) {
      // fallback
    }
    return DEFAULT_GROUPS;
  }

  saveGroups(groups) {
    try {
      writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[FacebookIntegration] Failed to save groups to disk:', e.message);
    }
    return groups;
  }

  getCookieStatus() {
    const paths = [
      resolve(WENTIX_FB_DIR, 'fb_cookies.json'),
      resolve(LOCAL_DATA_DIR, 'fb_cookies.json')
    ];

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const cookies = JSON.parse(readFileSync(p, 'utf-8'));
          const hasCUser = cookies.some(c => c.name === 'c_user');
          const hasXs = cookies.some(c => c.name === 'xs');
          const maxExp = Math.max(...cookies.map(c => c.expiry || 0));
          return {
            valid: hasCUser && hasXs,
            count: cookies.length,
            path: p,
            expires_at: maxExp ? new Date(maxExp * 1000).toISOString() : null,
            message: hasCUser && hasXs ? 'Sesión de Facebook Activa con Cookies' : 'Cookies incompletas'
          };
        } catch (e) {
          // ignore
        }
      }
    }

    return {
      valid: false,
      count: 0,
      path: null,
      message: 'No se encontraron cookies de Facebook (fb_cookies.json)'
    };
  }

  saveCookies(jsonString) {
    let parsed;
    try {
      parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!Array.isArray(parsed)) throw new Error('El JSON de cookies debe ser un arreglo de objetos');
    } catch (e) {
      throw new Error('Formato de cookies JSON inválido: ' + e.message);
    }

    const paths = [
      resolve(WENTIX_FB_DIR, 'fb_cookies.json'),
      resolve(LOCAL_DATA_DIR, 'fb_cookies.json')
    ];

    for (const p of paths) {
      try {
        writeFileSync(p, JSON.stringify(parsed, null, 2), 'utf-8');
      } catch (e) {
        // ignore
      }
    }

    return { success: true, count: parsed.length };
  }

  getLogs() {
    return inMemoryLogs.slice(-60);
  }

  addLog(msg) {
    const timestamp = `[${new Date().toLocaleTimeString('es-CL')}]`;
    const entry = `${timestamp} ${msg}`;
    inMemoryLogs.push(entry);
    if (inMemoryLogs.length > 200) inMemoryLogs.shift();
  }

  cleanDescription(raw = '', maxLen = 280) {
    if (!raw) return '';
    const cleaned = String(raw)
      .replace(/<[^>]*>/g, ' ')
      .replace(/^#+\s*(descripci[oó]n|detalles|caracter[ií]sticas)\s*:?/gim, '')
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*|__/g, '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !/^(descripci[oó]n|detalles)\s*:?$/i.test(line))
      .join('\n')
      .replace(/\n{2,}/g, '\n')
      .trim();

    if (cleaned.length <= maxLen) return cleaned;
    const lines = cleaned.split('\n');
    let out = '';
    for (const line of lines) {
      if ((out + (out ? '\n' : '') + line).length <= maxLen) {
        out += (out ? '\n' : '') + line;
      } else {
        break;
      }
    }
    if (out.length >= 60) return out;
    const cut = cleaned.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\-–]+$/, '') + '.';
  }

  generateViralCopy({
    title = '',
    price = '',
    description = '',
    whatsapp = '+56928148946',
    store_url = 'https://nexora.wentixai.cyou/tienda',
    niche = 'general',
    style = 'direct'
  } = {}) {
    const cleanPrice = String(price).replace(/[^0-9]/g, '');
    const formattedPrice = cleanPrice ? `$${Number(cleanPrice).toLocaleString('es-CL')} CLP` : '$19.990 CLP';
    const cleanWa = whatsapp.replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${cleanWa}?text=${encodeURIComponent(`Hola! Quiero pedir "${title}" con pago contra entrega.`)}`;
    const cleanDesc = this.cleanDescription(description, 280);

    if (style === 'direct') {
      const isNavidad = niche === 'navidad' || title.toLowerCase().includes('navid') || title.toLowerCase().includes('luz') || title.toLowerCase().includes('luces') || title.toLowerCase().includes('arbol');
      const intro = isNavidad 
        ? `✨ ${title} ✨\n🎄 Ideal para decorar esta Navidad y darle un toque especial a tu hogar.\n`
        : `✨ ${title} ✨\n`;
      return `${intro}` +
        `💰 Precio: ${formattedPrice} (Pago Contra Entrega en tus manos)\n\n` +
        `${cleanDesc || 'Producto nuevo en caja, garantizado y probado.'}\n\n` +
        `🚚 Envíos a todo Chile vía Starken & Blue Express (24 a 48 hrs).\n\n` +
        `👉 Pídelo directo con envío a tu domicilio aquí:\n` +
        `🛒 ${store_url}\n\n` +
        `📲 O escríbenos a WhatsApp para tomar tus datos:\n` +
        `👉 ${waLink}`;
    }

    if (style === 'seasonal' || niche === 'navidad') {
      return `🎄 ¡ESPECIAL TEMPORADA NAVIDEÑA! 🎅\n\n` +
        `✨ ${title.toUpperCase()}\n` +
        `💰 PRECIO: ${formattedPrice}\n\n` +
        `✅ PAGO CONTRA ENTREGA: Pagas seguro al recibir en tu puerta\n` +
        `🚚 Envíos a todo Chile en 24/48 hrs\n` +
        `⭐ Calidad y luminosidad garantizada\n\n` +
        `📋 DETALLES:\n` +
        `${cleanDesc || 'Decora tu casa, árbol o fachada esta Navidad con la mejor iluminación.'}\n\n` +
        `👉 PÍDELAS AQUÍ:\n` +
        `🛒 ${store_url}\n` +
        `📲 WhatsApp directo: ${waLink}\n\n` +
        `⏳ Stock limitado para fiestas de fin de año.`;
    }

    // Default Flash
    return `🔥 ¡OFERTA LIMITADA! 🔥\n\n` +
      `⚡ ${title.toUpperCase()}\n` +
      `💰 PRECIO: ${formattedPrice}\n\n` +
      `✅ PAGO CONTRA ENTREGA: Pagas al recibir en tus manos\n` +
      `🚚 ENVÍOS A TODO CHILE vía Blue Express & Starken en 24/48 hrs\n\n` +
      `📋 DETALLES:\n` +
      `${cleanDesc || 'Calidad premium garantizada.'}\n\n` +
      `👉 COMPRA O PIDE EN EL LINK:\n` +
      `🛒 ${store_url}\n` +
      `📲 WhatsApp directo: ${waLink}\n\n` +
      `⏳ Unidades limitadas hasta agotar stock en bodega.`;
  }

  async publishToGroup({
    group_url,
    title,
    price,
    description,
    images = '',
    mode = 'bot',
    headless = false
  }) {
    if (!group_url) throw new Error('Se requiere la URL del grupo de Facebook');

    this.addLog(`Iniciando tarea de publicación [Modo: ${mode}]...`);
    this.addLog(`Grupo: ${group_url}`);
    this.addLog(`Producto: ${title} (${price})`);

    if (mode === 'desktop') {
      // Abre el navegador real del usuario en Windows
      const openCmd = process.platform === 'win32' ? `start "" "${group_url}"` : `xdg-open "${group_url}"`;
      spawn(openCmd, { shell: true, detached: true });
      this.addLog(`Pestaña abierta en el navegador predeterminado para pegado asistido.`);
      return {
        status: 'opened_in_browser',
        message: 'Grupo abierto en navegador. El texto del anuncio está listo.'
      };
    }

    // Modo Bot Automatizado con Selenium
    const scriptPath = resolve(WENTIX_FB_DIR, 'publish_cli.py');
    if (!existsSync(scriptPath)) {
      throw new Error(`No se encontró el script de bot en: ${scriptPath}`);
    }

    const args = [
      scriptPath,
      '--group-url', group_url,
      '--title', title,
      '--price', String(price).replace(/[^0-9]/g, ''),
      '--desc', description || ''
    ];

    if (images) {
      args.push('--images', images);
    }
    if (headless) {
      args.push('--headless');
    }

    this.addLog(`Lanzando proceso Python Selenium...`);

    const child = spawn('python', args, {
      cwd: WENTIX_FB_DIR,
      shell: true
    });

    child.stdout.on('data', d => {
      const lines = d.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addLog(line.trim());
      }
    });

    child.stderr.on('data', d => {
      const lines = d.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addLog(`[Error] ${line.trim()}`);
      }
    });

    child.on('close', code => {
      if (code === 0) {
        this.addLog(`✅ Proceso finalizado exitosamente (Código 0).`);
      } else {
        this.addLog(`⚠️ El bot finalizó con código de salida ${code}.`);
      }
    });

    return {
      status: 'bot_running',
      message: 'Bot de Facebook ejecutándose en segundo plano.',
      group_url
    };
  }
}

export const facebookService = new FacebookIntegrationService();
