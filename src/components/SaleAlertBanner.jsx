import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { api, money } from '../services/api';
import { SHOPIFY_CHING_DATA_URI, NEXORA_BADGE_DATA_URI } from '../assets/shopifyChingSound';

export function playSaleSound(force = false) {
  if (!force && localStorage.getItem('nexora-sales-alerts') === 'off') return;
  try {
    const audio = new Audio(SHOPIFY_CHING_DATA_URI);
    audio.volume = 1.0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  } catch (e) {
    // Ignore audio error
  }
}

export async function triggerShopifyTestAlert() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('nexora-test-shopify-alert'));
}

const SEEN_STORAGE_KEY = 'nexora_seen_landing_order_ids_v2';

function loadSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : null;
  } catch {
    return null;
  }
}

function saveSeenIds(setObj) {
  try {
    const arr = Array.from(setObj).slice(-200);
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage error
  }
}

export default function SaleAlertBanner() {
  const [alerts, setAlerts] = useState([]);
  const seenIdsRef = useRef(loadSeenIds());

  const checkRecentOrders = async () => {
    try {
      const res = await api('/landings/all-orders?limit=6');
      if (!res || !res.orders) return;

      const currentOrders = res.orders;

      // First ever initialization in this browser
      if (!seenIdsRef.current) {
        const initialSet = new Set();
        const now = Date.now();
        const freshOrders = [];

        for (const o of currentOrders) {
          const ageMs = now - new Date(o.created_at).getTime();
          if (ageMs >= 0 && ageMs < 45000) {
            freshOrders.push(o);
          }
          initialSet.add(o.id);
        }

        seenIdsRef.current = initialSet;
        saveSeenIds(initialSet);

        if (freshOrders.length > 0) {
          triggerOrderAlerts(freshOrders);
        }
        return;
      }

      const newOrders = currentOrders.filter(o => !seenIdsRef.current.has(o.id));

      if (newOrders.length > 0) {
        newOrders.forEach(o => seenIdsRef.current.add(o.id));
        saveSeenIds(seenIdsRef.current);
        triggerOrderAlerts(newOrders);
      }
    } catch (e) {
      // Background poll silently ignore
    }
  };

  const triggerOrderAlerts = (newOrders) => {
    // Play Shopify Ka-Ching for each new order (overlapping if multiple arrive)
    newOrders.forEach((_, idx) => {
      setTimeout(() => playSaleSound(true), idx * 350);
    });

    const newAlertItems = newOrders.map(o => ({
      key: o.id,
      id: o.id,
      number: o.order_number,
      product_name: o.product_name,
      pack_selected: o.pack_selected,
      total_price: o.total_price,
      customer_name: o.customer_name,
      customer_commune: o.customer_commune,
      created_at: o.created_at
    }));

    setAlerts(prev => {
      const existingKeys = new Set(prev.map(p => p.key));
      const uniqueNew = newAlertItems.filter(item => !existingKeys.has(item.key));
      return [...uniqueNew, ...prev].slice(0, 4);
    });

    newOrders.forEach(o => {
      if (!o._isTest) {
        window.dispatchEvent(new CustomEvent('nexora-order-created', { detail: o }));
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const orderNum = o.order_number || o.number || '1';
          const packText = o.pack_selected || '1 artículo';
          const prodText = o.product_name || 'Landing COD';
          const customerText = o.customer_name
            ? `${o.customer_name}${o.customer_commune ? ` (${o.customer_commune})` : ''}`
            : 'Form (via Landing)';
          new Notification(`💰 Nuevo Pedido #${orderNum} · ${money(o.total_price)}`, {
            body: `${packText} de ${prodText}\n${customerText} · NEXORA`,
            icon: '/pwa-192.png',
            badge: '/pwa-192.png'
          });
        } catch (err) {
          // Ignore
        }
      }
    });
  };

  useEffect(() => {
    checkRecentOrders();
    const interval = setInterval(checkRecentOrders, 2500);
    const onVisible = () => checkRecentOrders();
    const onTestAlert = () => {
      triggerOrderAlerts([{
        _isTest: true,
        id: 'test-' + Date.now(),
        order_number: '101',
        product_name: 'Pedido Contra Entrega (Prueba)',
        pack_selected: 'Pack 2 Unidades',
        total_price: 29990,
        customer_name: 'Notificación Nativa Activa',
        customer_commune: 'Santiago',
        created_at: new Date().toISOString()
      }]);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('nexora-test-shopify-alert', onTestAlert);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('nexora-test-shopify-alert', onTestAlert);
    };
  }, []);

  // Auto-dismiss alerts after 12 seconds
  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = setTimeout(() => {
      setAlerts(prev => prev.slice(0, -1));
    }, 12000);
    return () => clearTimeout(timer);
  }, [alerts]);

  const dismissAlert = (key) => {
    setAlerts(prev => prev.filter(a => a.key !== key));
  };

  if (alerts.length === 0) return null;

  return (
    <aside className="nx-sales-alert-stack" aria-live="polite">
      <style>{`
        .nx-sales-alert-stack {
          position: fixed !important;
          bottom: 24px !important;
          right: 24px !important;
          left: auto !important;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          z-index: 99999;
          pointer-events: auto;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
        }
        .nx-ios-notif-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 13px;
          width: 368px;
          max-width: calc(100vw - 32px);
          background: rgba(24, 28, 42, 0.88) !important;
          backdrop-filter: blur(22px) saturate(180%);
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
          border-radius: 18px;
          padding: 13px 16px;
          animation: nxIosPopIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }
        .nx-ios-notif-card:hover {
          transform: translateY(-2px);
        }
        .nx-ios-app-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: #ffffff;
          flex-shrink: 0;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nx-ios-app-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .nx-ios-notif-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .nx-ios-notif-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }
        .nx-ios-notif-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff !important;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }
        .nx-ios-notif-time {
          font-size: 12px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.55) !important;
          white-space: nowrap;
        }
        .nx-ios-notif-line1 {
          font-size: 13.2px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.94) !important;
          line-height: 1.32;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nx-ios-notif-line2 {
          font-size: 13px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.85) !important;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nx-ios-notif-close {
          position: absolute;
          top: 7px;
          right: 8px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          border: none;
          color: rgba(255, 255, 255, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.15s ease;
          cursor: pointer;
          padding: 0;
        }
        .nx-ios-notif-card:hover .nx-ios-notif-close {
          opacity: 1;
        }
        @keyframes nxIosPopIn {
          from {
            transform: translateY(14px) scale(0.96);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>

      {alerts.map(order => {
        const orderNum = order.number || order.order_number || '1';
        const packText = order.pack_selected || '1 artículo';
        const prodText = order.product_name || 'Releasit COD';
        const customerText = order.customer_name
          ? `${order.customer_name}${order.customer_commune ? ` (${order.customer_commune})` : ''}`
          : 'Form (via Landing)';

        return (
          <div
            className="nx-ios-notif-card"
            key={order.key}
            onClick={() => dismissAlert(order.key)}
            title="Clic para cerrar notificación"
          >
            <div className="nx-ios-app-icon">
              <img src={NEXORA_BADGE_DATA_URI} alt="Nexora" />
            </div>

            <div className="nx-ios-notif-body">
              <div className="nx-ios-notif-top">
                <span className="nx-ios-notif-title">Pedido #{orderNum}</span>
                <span className="nx-ios-notif-time">Ahora</span>
              </div>

              <div className="nx-ios-notif-line1">
                {money(order.total_price)}, {packText} de {prodText}
              </div>

              <div className="nx-ios-notif-line2">
                {customerText} · NEXORA
              </div>
            </div>

            <button
              className="nx-ios-notif-close"
              onClick={(e) => {
                e.stopPropagation();
                dismissAlert(order.key);
              }}
              aria-label="Cerrar aviso"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
