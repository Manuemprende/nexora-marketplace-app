(function () {
  'use strict';
  if (window.__nexoraLiveCompras) return;
  window.__nexoraLiveCompras = true;
  var state = { open: false, period: '7d', selected: 'all', data: null, busy: false, view: 'grid', search: '', slideIndex: 0 };
  var page, style, navButton, pollTimer, savedCrumb;

  style = document.createElement('style');
  style.textContent = `
    body.nxlc-open .content {
      display: none !important;
    }
    #nx-live-compras {
      width: 100%;
      min-height: calc(100dvh - 58px);
      background: transparent;
      color: #0f172a;
      font-family: Inter, 'DM Sans', system-ui, -apple-system, sans-serif;
      padding: 12px 18px 20px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    [data-theme="night"] #nx-live-compras {
      color: #f8fafc;
      color-scheme: dark;
    }
    #nx-live-compras * { box-sizing: border-box; }
    #nx-live-compras [hidden] { display: none !important; }
    #nx-live-compras .nxlc-wrap {
      max-width: 100%;
      margin: 0;
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    #nx-live-compras h1, #nx-live-compras h2, #nx-live-compras h3, #nx-live-compras h4 {
      color: inherit;
      margin: 0;
      font-family: inherit;
    }

    @keyframes nxlcPulse {
      0%, 100% { transform: scale(0.95); opacity: 0.75; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
      50% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 0 5px rgba(34, 197, 94, 0); }
    }
    #nx-live-compras .nxlc-live-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #22c55e;
      animation: nxlcPulse 1.6s infinite ease-in-out;
      flex-shrink: 0;
    }

    /* Unified Single-Line Section Header & Filter Toolbar */
    #nx-live-compras .nxlc-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    #nx-live-compras .nxlc-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    #nx-live-compras .nxlc-section-head h2 {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    #nx-live-compras .nxlc-sync-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid rgba(148, 163, 184, 0.2);
      padding: 3px 9px;
      border-radius: 999px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-sync-pill {
      color: #94a3b8;
      background: #16263e;
      border-color: #2b3d57;
    }
    #nx-live-compras .nxlc-toolbar {
      display: flex;
      gap: 7px;
      align-items: center;
      flex-wrap: wrap;
    }
    #nx-live-compras .nxlc-select,
    #nx-live-compras .nxlc-search,
    #nx-live-compras .nxlc-button {
      height: 33px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 7px;
      color: #1e293b;
      padding: 0 10px;
      font: inherit;
      font-size: 11.5px;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    [data-theme="night"] #nx-live-compras .nxlc-select,
    [data-theme="night"] #nx-live-compras .nxlc-search,
    [data-theme="night"] #nx-live-compras .nxlc-button {
      background: #16263e;
      border-color: #2b3d57;
      color: #f1f5f9;
    }
    #nx-live-compras .nxlc-search {
      width: 200px;
    }
    #nx-live-compras .nxlc-button {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    #nx-live-compras .nxlc-button:hover {
      border-color: #3b82f6;
      color: #2563eb;
    }
    [data-theme="night"] #nx-live-compras .nxlc-button:hover {
      border-color: #60a5fa;
      color: #60a5fa;
      background: #1c304f;
    }
    #nx-live-compras .nxlc-toggle {
      display: flex;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 2px;
      background: #ffffff;
      height: 33px;
      align-items: center;
    }
    [data-theme="night"] #nx-live-compras .nxlc-toggle {
      background: #16263e;
      border-color: #2b3d57;
    }
    #nx-live-compras .nxlc-toggle button {
      border: 0;
      border-radius: 5px;
      padding: 3px 8px;
      height: 27px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font-size: 12px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-toggle button {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-toggle button.active {
      background: #2563eb;
      color: #ffffff;
    }

    /* Landings Grid (Tall cards on desktop, Horizontal Slide Carousel on mobile) */
    #nx-live-compras .nxlc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 430px));
      gap: 16px;
      align-items: stretch;
      justify-content: start;
      flex: 1;
    }
    #nx-live-compras .nxlc-grid.list {
      grid-template-columns: minmax(0, 560px);
    }

    /* Mobile Slide Indicator Bar */
    #nx-live-compras .nxlc-slide-nav {
      display: none;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      padding: 6px 10px;
      border-radius: 9px;
      background: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.2);
      font-size: 11.5px;
      font-weight: 700;
      color: #3b82f6;
    }
    [data-theme="night"] #nx-live-compras .nxlc-slide-nav {
      background: #16263e;
      border-color: #2b3d57;
      color: #93c5fd;
    }
    #nx-live-compras .nxlc-slide-dots {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #nx-live-compras .nxlc-slide-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.45);
      border: 0;
      padding: 0;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    #nx-live-compras .nxlc-slide-dot.active {
      width: 22px;
      background: #3b82f6;
    }

    /* Shopify-Style Full-Height Landing CRM Card */
    #nx-live-compras .nxlc-card {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
      padding: 16px 16px 18px;
      min-width: 0;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: calc(100dvh - 210px);
    }
    [data-theme="night"] #nx-live-compras .nxlc-card {
      background: #16263e;
      border-color: #2b3d57;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    }
    #nx-live-compras .nxlc-card.is-live-active {
      border-color: #22c55e;
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.18);
    }
    #nx-live-compras .nxlc-card-top {
      display: flex;
      gap: 11px;
      align-items: center;
      margin-bottom: 10px;
    }
    #nx-live-compras .nxlc-product-icon {
      height: 44px;
      width: 44px;
      border-radius: 10px;
      flex: none;
      overflow: hidden;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #475569;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 15px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-product-icon {
      background: #102039;
      border-color: #2b3d57;
      color: #93c5fd;
    }
    #nx-live-compras .nxlc-product-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #fff;
    }
    #nx-live-compras .nxlc-card-title {
      min-width: 0;
      flex: 1;
    }
    #nx-live-compras .nxlc-card-title h3 {
      font-size: 15px;
      line-height: 1.25;
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #nx-live-compras .nxlc-card-title a {
      display: inline-block;
      max-width: 100%;
      color: #2563eb;
      text-decoration: none;
      font-size: 11.5px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 2px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-card-title a {
      color: #60a5fa;
    }
    #nx-live-compras .nxlc-card-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    #nx-live-compras .nxlc-status {
      font-size: 10.5px;
      font-weight: 700;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.14);
      color: #16a34a;
      padding: 4px 9px;
      white-space: nowrap;
      border: 1px solid rgba(34, 197, 94, 0.35);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-status {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
      border-color: rgba(74, 222, 128, 0.35);
    }
    #nx-live-compras .nxlc-reset-btn {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      border: 1px solid #e2e8f0;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    [data-theme="night"] #nx-live-compras .nxlc-reset-btn {
      border-color: #2b3d57;
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-reset-btn:hover {
      border-color: #3b82f6;
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }

    /* Legend: Orders / Visitors right now (Shopify style) */
    #nx-live-compras .nxlc-legend {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-legend {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-legend span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    #nx-live-compras .nxlc-dot-purple {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #8b5cf6;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
    }
    #nx-live-compras .nxlc-dot-blue {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0ea5e9;
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
    }

    /* 2x2 Quad Grid: Visitantes ahora | Total de ventas / Total de sesiones | Total de órdenes */
    #nx-live-compras .nxlc-quad {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-bottom: 10px;
    }
    #nx-live-compras .nxlc-mini {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 11px 12px;
      background: #f8fafc;
      position: relative;
      min-width: 0;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini {
      background: #102039;
      border-color: #243854;
    }
    #nx-live-compras .nxlc-mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      margin-bottom: 4px;
    }
    #nx-live-compras .nxlc-mini label {
      display: block;
      font-size: 11.5px;
      font-weight: 600;
      color: #64748b;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini label {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-mini-badge {
      color: #94a3b8;
      opacity: 0.7;
    }
    #nx-live-compras .nxlc-mini-badge svg {
      width: 13px;
      height: 13px;
    }
    #nx-live-compras .nxlc-mini strong {
      display: block;
      font-size: 21px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #nx-live-compras .nxlc-mini small {
      display: block;
      font-size: 10.5px;
      color: #64748b;
      margin-top: 3px;
      font-weight: 500;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini small {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-segbar {
      display: flex;
      gap: 2px;
      height: 4.5px;
      margin-top: 7px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(148, 163, 184, 0.18);
    }
    #nx-live-compras .nxlc-segbar span {
      display: block;
      height: 100%;
      border-radius: 999px;
    }

    /* Inner Sections (Stretched vertically to fill the card nicely) */
    #nx-live-compras .nxlc-detail {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 11px 13px;
      margin-top: 9px;
      background: #f8fafc;
    }
    [data-theme="night"] #nx-live-compras .nxlc-detail {
      background: #102039;
      border-color: #243854;
    }
    #nx-live-compras .nxlc-detail h4 {
      font-size: 12.5px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #nx-live-compras .nxlc-bar-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 10px;
      align-items: center;
      font-size: 11.5px;
      font-weight: 600;
      margin-top: 8px;
    }
    #nx-live-compras .nxlc-bar-row span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #nx-live-compras .nxlc-bar-row b {
      font-weight: 700;
      grid-column: 2;
      grid-row: 2;
      font-size: 11.5px;
      color: #475569;
    }
    [data-theme="night"] #nx-live-compras .nxlc-bar-row b {
      color: #cbd5e1;
    }
    #nx-live-compras .nxlc-bar {
      grid-column: 1;
      grid-row: 2;
      height: 6px;
      background: rgba(148, 163, 184, 0.2);
      border-radius: 999px;
      overflow: hidden;
    }
    #nx-live-compras .nxlc-bar i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #38bdf8, #2563eb);
      border-radius: 999px;
    }
    #nx-live-compras .nxlc-empty {
      font-size: 11.5px;
      line-height: 1.45;
      color: #64748b;
      padding: 3px 0;
    }
    [data-theme="night"] #nx-live-compras .nxlc-empty {
      color: #94a3b8;
    }

    /* Top Productos */
    #nx-live-compras .nxlc-products {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 7px;
      font-size: 12px;
    }
    #nx-live-compras .nxlc-products img {
      width: 34px;
      height: 34px;
      object-fit: cover;
      border-radius: 7px;
      border: 1px solid #e2e8f0;
    }
    [data-theme="night"] #nx-live-compras .nxlc-products img {
      border-color: #2b3d57;
    }
    #nx-live-compras .nxlc-products .nxlc-product-name {
      flex: 1;
      min-width: 0;
      color: #2563eb;
      font-weight: 700;
    }
    [data-theme="night"] #nx-live-compras .nxlc-products .nxlc-product-name {
      color: #60a5fa;
    }
    #nx-live-compras .nxlc-products small {
      display: block;
      font-size: 10.5px;
      color: #64748b;
      margin-top: 2px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-products small {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-products strong {
      font-size: 12px;
      white-space: nowrap;
      font-weight: 800;
    }

    /* Comportamiento en tiempo real */
    #nx-live-compras .nxlc-window {
      font-size: 10px;
      font-weight: 700;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 999px;
      padding: 2px 8px;
      color: #2563eb;
    }
    [data-theme="night"] #nx-live-compras .nxlc-window {
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(96, 165, 250, 0.35);
      color: #93c5fd;
    }
    #nx-live-compras .nxlc-behavior {
      display: flex;
      justify-content: space-around;
      position: relative;
      padding: 8px 0 3px;
      text-align: center;
    }
    #nx-live-compras .nxlc-behavior:before {
      content: '';
      position: absolute;
      top: 24px;
      height: 2px;
      background: linear-gradient(90deg, #38bdf8, #a78bfa, #34d399);
      left: 17%;
      right: 17%;
      opacity: 0.55;
    }
    #nx-live-compras .nxlc-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      width: 33%;
      gap: 4px;
    }
    #nx-live-compras .nxlc-orb {
      height: 32px;
      width: 32px;
      border-radius: 50%;
      background: radial-gradient(circle at 34% 29%, #f0f9ff 0, #7dd3fc 32%, #0284c7 70%, #bae6fd 95%);
      box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.14), 0 4px 9px rgba(2, 132, 199, 0.24);
      border: 1px solid #38bdf8;
    }
    #nx-live-compras .nxlc-orb.purple {
      background: radial-gradient(circle at 34% 29%, #faf5ff, #c4b5fd 32%, #7c3aed 70%, #ddd6fe 95%);
      border-color: #a78bfa;
      box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.14), 0 4px 9px rgba(124, 58, 237, 0.24);
    }
    #nx-live-compras .nxlc-orb.green {
      background: radial-gradient(circle at 34% 29%, #f0fdf4, #86efac 32%, #16a34a 70%, #bbf7d0 95%);
      border-color: #4ade80;
      box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.14), 0 4px 9px rgba(22, 163, 74, 0.24);
    }
    #nx-live-compras .nxlc-orb.has-value {
      transform: scale(1.14);
    }
    #nx-live-compras .nxlc-stage b {
      font-size: 16px;
      font-weight: 800;
      margin-top: 2px;
      line-height: 1.1;
    }
    #nx-live-compras .nxlc-stage small {
      font-size: 10.5px;
      font-weight: 600;
      line-height: 1.25;
      color: #64748b;
    }
    [data-theme="night"] #nx-live-compras .nxlc-stage small {
      color: #94a3b8;
    }

    /* Responsive Breakpoints & Mobile Horizontal Slide Carousel */
    @media (max-width: 1100px) {
      #nx-live-compras .nxlc-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 768px) {
      #nx-live-compras {
        padding: 10px 10px 24px;
        min-height: auto;
      }
      #nx-live-compras .nxlc-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }
      #nx-live-compras .nxlc-kpi {
        padding: 10px;
      }
      #nx-live-compras .nxlc-kpi strong {
        font-size: 16px;
      }
      #nx-live-compras .nxlc-spark {
        display: none;
      }
      #nx-live-compras .nxlc-section-head {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      #nx-live-compras .nxlc-toolbar {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px;
      }
      #nx-live-compras .nxlc-search {
        grid-column: 1 / -1;
        width: 100%;
      }
      #nx-live-compras .nxlc-select {
        width: 100%;
      }
      #nx-live-compras .nxlc-toggle {
        display: none;
      }
      #nx-live-compras .nxlc-slide-nav {
        display: flex;
      }
      /* Mobile Slide-by-Slide Horizontal Carousel */
      #nx-live-compras .nxlc-grid,
      #nx-live-compras .nxlc-grid.list {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        gap: 12px;
        padding-bottom: 8px;
        scrollbar-width: none;
      }
      #nx-live-compras .nxlc-grid::-webkit-scrollbar {
        display: none;
      }
      #nx-live-compras .nxlc-card {
        flex: 0 0 100%;
        width: 100%;
        max-width: 100%;
        scroll-snap-align: center;
        scroll-snap-stop: always;
        min-height: auto;
        padding: 14px;
      }
      #nx-live-compras .nxlc-mini strong {
        font-size: 19px;
      }
    }
  `;
  document.head.appendChild(style);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    return '$' + Number(n || 0).toLocaleString('es-CL');
  }
  function safeHref(value) {
    try {
      var u = new URL(String(value || ''), location.origin);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (_) {
      return '';
    }
  }
  function time(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  function place(item) {
    return [item.city, item.country].filter(Boolean).join(' · ') || item.name || 'Chile';
  }

  function addNav() {
    var nav = document.querySelector('aside.side nav');
    if (!nav) return;
    var canSeeLandings = Array.from(nav.querySelectorAll('button.nav')).some(function (b) {
      return (b.getAttribute('aria-label') || b.textContent).includes('Landing Pages');
    });
    if (!canSeeLandings) return;
    navButton = nav.querySelector('.nx-live-compras-nav');
    if (!navButton) {
      navButton = document.createElement('button');
      navButton.className = 'nav nx-live-compras-nav';
      navButton.type = 'button';
      navButton.setAttribute('aria-label', 'Live / Compras');
      navButton.innerHTML = '<span class="nxlc-nav-icon" style="font-size:18px;width:18px;text-align:center;flex:none;color:#22c55e">◉</span><span class="navLabel">Live / Compras</span>';
      var landings = Array.from(nav.querySelectorAll('button.nav')).find(function (b) {
        return (b.getAttribute('aria-label') || b.textContent).includes('Landing Pages');
      });
      nav.insertBefore(navButton, landings || null);
      navButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        show();
      });
    }
  }

  function mountInsideMain() {
    var main = document.querySelector('main.main') || document.querySelector('main');
    if (!main) return;
    if (!page) {
      page = document.createElement('div');
      page.id = 'nx-live-compras';
    }
    if (page.parentNode !== main) {
      main.appendChild(page);
    }
  }

  function show() {
    addNav();
    mountInsideMain();
    state.open = true;
    document.body.classList.add('nxlc-open');
    if (page) page.hidden = false;
    document.querySelectorAll('aside.side nav button.nav').forEach(function (b) {
      b.classList.toggle('active', b === navButton);
    });
    var side = document.querySelector('aside.side');
    if (window.innerWidth <= 900 && side && side.classList.contains('open')) {
      side.classList.remove('open');
    }
    var crumb = document.querySelector('main > header .crumb');
    if (crumb) {
      if (savedCrumb == null) savedCrumb = crumb.innerHTML;
      crumb.textContent = 'Nexora  ›  Live / Compras';
    }
    render();
    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 6000);
  }

  function hide() {
    if (!state.open) return;
    state.open = false;
    document.body.classList.remove('nxlc-open');
    if (page) page.hidden = true;
    if (navButton) navButton.classList.remove('active');
    var crumb = document.querySelector('main > header .crumb');
    if (crumb && savedCrumb != null) crumb.innerHTML = savedCrumb;
    clearInterval(pollTimer);
  }

  document.addEventListener('click', function (event) {
    var nav = event.target.closest && event.target.closest('aside.side nav button.nav');
    if (nav && !nav.classList.contains('nx-live-compras-nav')) hide();
    var subNav = event.target.closest && event.target.closest('.pos-subnav-item');
    if (subNav) hide();
    var logout = event.target.closest && event.target.closest('button[aria-label="Cerrar sesión"]');
    if (logout) hide();
  }, true);

  new MutationObserver(function () {
    addNav();
    if (state.open) mountInsideMain();
  }).observe(document.body, { childList: true, subtree: true });

  function filteredLandings() {
    var rows = (state.data && state.data.landings) || [];
    if (state.selected !== 'all') rows = rows.filter(function (l) { return l.id === state.selected; });
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function (l) {
        return (l.name + ' ' + l.id + ' ' + (l.url || '')).toLowerCase().includes(q);
      });
    }
    return rows;
  }

  function icon(name) {
    var paths = {
      sales: '<path d="M3 3h2l2 11h10l3-8H6M9 20h.01M17 20h.01"/>',
      orders: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M9 3v5m6-5v5M8 12h8m-8 4h5"/>',
      visitors: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m5 10v-3a6 6 0 0 0-4-5"/>',
      conversion: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 8-8"/>',
      layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
      report: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 15V9m4 6V7m4 8v-4"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.layers) + '</svg>';
  }

  function sparkSvg(color) {
    return '<svg class="nxlc-spark" viewBox="0 0 64 28" fill="none" aria-hidden="true"><path d="M2 22 C14 20, 18 11, 28 14 C38 17, 46 6, 62 4" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round"/></svg>';
  }

  function landingCard(l) {
    var link = safeHref(l.url);
    var image = safeHref(l.product_image);
    var live = Number(l.active_now || 0);
    var maxLocation = Math.max(1, ...(l.locations || []).map(function (x) { return Number(x.sessions || 0); }));
    var locations = (l.locations || []).slice(0, 3).map(function (x) {
      var count = Number(x.sessions || 0);
      var pct = Math.min(100, Math.round((count / maxLocation) * 100));
      return '<div class="nxlc-bar-row"><span>' + esc(place(x)) + '</span><b>' + count + '</b><div class="nxlc-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') || '<div class="nxlc-empty">Sin ubicaciones registradas en este periodo.</div>';

    var products = (l.top_products || []).slice(0, 2).map(function (x) {
      return '<div class="nxlc-products">' +
        (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '') +
        '<div class="nxlc-product-name">' + esc(x.name) + '<small>' + Number(x.orders || 0) + ' unidades</small></div>' +
        '<strong>' + money(x.revenue) + ' CLP</strong></div>';
    }).join('') || '<div class="nxlc-empty">Sin productos vendidos en este periodo.</div>';

    var behavior = l.behavior || {};
    var liveInLanding = Number(behavior.active_carts || 0);
    var liveCheckout = Number(behavior.checking_out || 0);
    var livePurchases = Number(behavior.purchased || l.orders_today || 0);
    var stages = [
      [liveInLanding, '', 'En landing'],
      [liveCheckout, 'purple', 'En checkout'],
      [livePurchases, 'green', 'Compras']
    ];
    var customers = l.customers || { new_customers: 0, recurring_customers: 0, total: 0 };
    var newCust = Number(customers.new_customers != null ? customers.new_customers : (l.orders_today || 0));
    var retCust = Number(customers.recurring_customers != null ? customers.recurring_customers : Math.max(0, Number(customers.total || 0) - newCust));
    var totalCust = Math.max(1, newCust + retCust);
    var custPct = Math.min(100, Math.round((newCust / totalCust) * 100));
    var retPct = Math.min(100, Math.round((retCust / totalCust) * 100));

    var sessionsCount = Number(l.sessions_today || 0);
    var uniqueCount = Number(l.unique_visitors_today || 0);
    var ordersCount = Number(l.orders_today || 0);
    var revenueAmount = Number(l.revenue_today || 0);

    return '<article class="nxlc-card' + (live > 0 ? ' is-live-active' : '') + '">' +
      '<div>' +
        '<div class="nxlc-card-top">' +
          '<div class="nxlc-product-icon">' + (image ? '<img src="' + esc(image) + '" alt="">' : esc((l.name || '?').slice(0, 1).toUpperCase())) + '</div>' +
          '<div class="nxlc-card-title"><h3>' + esc(l.name) + '</h3>' +
            (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc((l.url || '').replace(/^https?:\/\//, '')) + ' ↗</a>' : '') +
          '</div>' +
          '<div class="nxlc-card-badges">' +
            '<span class="nxlc-status"><span class="nxlc-live-dot"></span>' + (live > 0 ? live + ' en vivo' : 'Activa') + '</span>' +
            '<button type="button" class="nxlc-reset-btn" data-reset-landing="' + esc(l.id) + '" data-reset-name="' + esc(l.name) + '" title="Reiniciar contador de sesiones de prueba a 0">↺</button>' +
          '</div>' +
        '</div>' +
        '<div class="nxlc-legend">' +
          '<span><i class="nxlc-dot-purple"></i> Órdenes</span>' +
          '<span><i class="nxlc-dot-blue"></i> Visitantes ahora</span>' +
        '</div>' +
        '<div class="nxlc-quad">' +
          '<div class="nxlc-mini">' +
            '<div class="nxlc-mini-head"><label>Visitantes ahora</label><span class="nxlc-live-dot"></span></div>' +
            '<strong>' + live.toLocaleString('es-CL') + '</strong>' +
            '<small>Activos en la landing</small>' +
            '<div class="nxlc-segbar"><span style="width:' + (live > 0 ? 70 : 12) + '%;background:#0ea5e9"></span><span style="width:30%;background:#7dd3fc"></span></div>' +
          '</div>' +
          '<div class="nxlc-mini">' +
            '<div class="nxlc-mini-head"><label>Total de ventas</label><span class="nxlc-mini-badge">' + icon('report') + '</span></div>' +
            '<strong>' + money(revenueAmount) + '</strong>' +
            '<small>CLP en el periodo</small>' +
            '<div class="nxlc-segbar"><span style="width:' + (revenueAmount > 0 ? 75 : 18) + '%;background:#8b5cf6"></span><span style="width:25%;background:#c4b5fd"></span></div>' +
          '</div>' +
          '<div class="nxlc-mini">' +
            '<div class="nxlc-mini-head"><label>Total de sesiones</label><span class="nxlc-mini-badge">' + icon('report') + '</span></div>' +
            '<strong>' + sessionsCount.toLocaleString('es-CL') + '</strong>' +
            '<small>' + uniqueCount.toLocaleString('es-CL') + ' visitantes únicos</small>' +
            '<div class="nxlc-segbar"><span style="width:65%;background:#38bdf8"></span><span style="width:25%;background:#0284c7"></span><span style="width:10%;background:#93c5fd"></span></div>' +
          '</div>' +
          '<div class="nxlc-mini">' +
            '<div class="nxlc-mini-head"><label>Total de órdenes</label><span class="nxlc-mini-badge">' + icon('report') + '</span></div>' +
            '<strong>' + ordersCount.toLocaleString('es-CL') + '</strong>' +
            '<small>' + (sessionsCount ? ((ordersCount / sessionsCount) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 }) : 0) + '% conversión</small>' +
            '<div class="nxlc-segbar"><span style="width:' + (ordersCount > 0 ? 75 : 18) + '%;background:#8b5cf6"></span><span style="width:25%;background:#c4b5fd"></span></div>' +
          '</div>' +
        '</div>' +
        '<section class="nxlc-detail"><h4>Top ubicaciones</h4>' + locations + '</section>' +
        '<section class="nxlc-detail"><h4>Clientes</h4>' +
          '<div class="nxlc-bar-row"><span>Nuevos</span><b>' + newCust + '</b><div class="nxlc-bar"><i style="width:' + custPct + '%;background:linear-gradient(90deg,#a78bfa,#7c3aed)"></i></div></div>' +
          '<div class="nxlc-bar-row"><span>Recurrentes</span><b>' + retCust + '</b><div class="nxlc-bar"><i style="width:' + retPct + '%;background:linear-gradient(90deg,#38bdf8,#2563eb)"></i></div></div>' +
        '</section>' +
        '<section class="nxlc-detail"><h4>Top productos</h4>' + products + '</section>' +
      '</div>' +
      '<section class="nxlc-detail"><h4>Comportamiento en vivo <span class="nxlc-window">Tiempo real</span></h4><div class="nxlc-behavior">' +
        stages.map(function (x) {
          return '<div class="nxlc-stage"><div class="nxlc-orb ' + x[1] + (x[0] ? ' has-value' : '') + '"></div><b>' + Number(x[0]) + '</b><small>' + x[2] + '</small></div>';
        }).join('') +
      '</div></section>' +
    '</article>';
  }

  function render() {
    if (!page || !state.open) return;
    var data = state.data || { landings: [], totals: {} };
    var rows = filteredLandings();
    if (state.slideIndex >= rows.length) state.slideIndex = 0;

    var t = rows.reduce(function (acc, l) {
      acc.revenue += Number(l.revenue_today || 0);
      acc.orders += Number(l.orders_today || 0);
      acc.visitors += Number(l.unique_visitors_today || 0);
      acc.sessions += Number(l.sessions_today || 0);
      acc.live += Number(l.active_now || 0);
      return acc;
    }, { revenue: 0, orders: 0, visitors: 0, sessions: 0, live: 0 });

    var periods = [
      ['today', 'Hoy'],
      ['yesterday', 'Ayer'],
      ['7d', 'Últimos 7 días'],
      ['month', 'Este mes'],
      ['all', 'Todo']
    ];
    var conv = t.sessions ? (t.orders / t.sessions) * 100 : 0;
    var kpis = [
      ['sales', 'Ventas totales', money(t.revenue) + ' CLP', '▲ Facturación en el periodo', '#8b5cf6'],
      ['orders', 'Órdenes', t.orders.toLocaleString('es-CL'), '▲ Pedidos COD recibidos', '#3b82f6'],
      ['visitors', 'Visitantes únicos', t.visitors.toLocaleString('es-CL'), '● ' + t.live + ' en vivo · ' + t.sessions + ' sesiones', '#0ea5e9'],
      ['conversion', 'Conversión', conv.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + '%', '▲ Órdenes / sesiones', '#10b981']
    ];

    var gridClass = 'nxlc-grid' + (state.view === 'list' ? ' list' : '');
    var slideNavHtml = rows.length > 0 ? (
      '<div class="nxlc-slide-nav">' +
        '<span>Tienda ' + (state.slideIndex + 1) + ' de ' + rows.length + ' · Desliza ⇆</span>' +
        '<div class="nxlc-slide-dots">' +
          rows.map(function (_, idx) {
            return '<button type="button" class="nxlc-slide-dot' + (idx === state.slideIndex ? ' active' : '') + '" data-slide-to="' + idx + '" aria-label="Ir a tienda ' + (idx + 1) + '"></button>';
          }).join('') +
        '</div>' +
      '</div>'
    ) : '';

    page.innerHTML =
      '<div class="nxlc-wrap">' +
        '<div class="nxlc-section-head">' +
          '<div class="nxlc-title-group">' +
            '<h2>' + icon('layers') + 'Mis Landings Activas (' + rows.length + ')</h2>' +
            '<span class="nxlc-sync-pill"><span class="nxlc-live-dot"></span>Actualizado ' + time(data.refreshed_at) + '</span>' +
          '</div>' +
          '<div class="nxlc-toolbar">' +
            '<input class="nxlc-search" data-role="search" aria-label="Buscar landing" placeholder="Buscar landing…" value="' + esc(state.search) + '">' +
            '<select class="nxlc-select" data-role="period" aria-label="Periodo">' +
              periods.map(function (p) {
                return '<option value="' + p[0] + '" ' + (p[0] === state.period ? 'selected' : '') + '>' + p[1] + '</option>';
              }).join('') +
            '</select>' +
            '<button class="nxlc-button" data-action="refresh" aria-label="Actualizar métricas">↻ Actualizar</button>' +
            '<div class="nxlc-toggle">' +
              '<button data-view="grid" class="' + (state.view === 'grid' ? 'active' : '') + '" aria-label="Vista en cuadrícula">▦</button>' +
              '<button data-view="list" class="' + (state.view === 'list' ? 'active' : '') + '" aria-label="Vista en lista">☰</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        slideNavHtml +
        '<div class="' + gridClass + '" data-role="carousel">' +
          (rows.map(landingCard).join('') || '<div class="nxlc-empty">' + (state.data ? 'No hay campañas activas que coincidan.' : 'Cargando landings activas…') + '</div>') +
        '</div>' +
      '</div>';

    page.querySelector('[data-role="period"]').addEventListener('change', function (e) {
      state.period = e.target.value;
      refresh();
    });
    page.querySelector('[data-role="search"]').addEventListener('input', function (e) {
      state.search = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var input = page.querySelector('[data-role="search"]');
      if (input) {
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });
    page.querySelector('[data-action="refresh"]').addEventListener('click', refresh);
    page.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.view = b.dataset.view;
        render();
      });
    });

    var carousel = page.querySelector('[data-role="carousel"]');
    if (carousel) {
      carousel.addEventListener('scroll', function () {
        if (window.innerWidth > 768) return;
        var w = carousel.clientWidth || 1;
        var idx = Math.round(carousel.scrollLeft / w);
        if (idx !== state.slideIndex && idx >= 0 && idx < rows.length) {
          state.slideIndex = idx;
          page.querySelectorAll('.nxlc-slide-dot').forEach(function (d, i) {
            d.classList.toggle('active', i === idx);
          });
          var label = page.querySelector('.nxlc-slide-nav > span');
          if (label) label.textContent = 'Tienda ' + (idx + 1) + ' de ' + rows.length + ' · Desliza ⇆';
        }
      }, { passive: true });
    }

    page.querySelectorAll('[data-slide-to]').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var idx = Number(dot.getAttribute('data-slide-to') || 0);
        state.slideIndex = idx;
        if (carousel) {
          var cards = carousel.querySelectorAll('.nxlc-card');
          if (cards[idx]) cards[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
    });

    page.querySelectorAll('[data-reset-landing]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-reset-landing');
        var name = btn.getAttribute('data-reset-name') || id;
        if (!window.confirm('¿Reiniciar a 0 las sesiones y visitas acumuladas de "' + name + '"?')) return;
        fetch('/api/landings/campaign/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ campaign_active: true, reset_visits: true })
        }).then(function () { refresh(); });
      });
    });
  }

  function refresh() {
    if (state.busy || !state.open) return;
    state.busy = true;
    fetch('/api/landings/live-dashboard?period=' + encodeURIComponent(state.period), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('No se pudo cargar Live / Compras');
        return r.json();
      })
      .then(function (data) {
        state.data = data;
        if (!document.activeElement || !document.activeElement.matches('[data-role="search"]')) {
          render();
        }
      })
      .catch(function (error) {
        if (page && state.open && !state.data) {
          page.innerHTML = '<div class="nxlc-wrap"><p>' + esc(error.message) + ' · Revisa tu sesión y vuelve a actualizar.</p></div>';
        }
      })
      .finally(function () {
        state.busy = false;
      });
  }

  addNav();
})();
