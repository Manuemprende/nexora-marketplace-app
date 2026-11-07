(function () {
  'use strict';
  if (window.__nexoraLiveCompras) return;
  window.__nexoraLiveCompras = true;
  var state = { open: false, period: '7d', selected: 'all', data: null, busy: false, view: 'grid', search: '' };
  var page, style, navButton, pollTimer, savedCrumb;

  style = document.createElement('style');
  style.textContent = `
    #nx-live-compras {
      position: fixed;
      z-index: 30;
      overflow-y: auto;
      overflow-x: hidden;
      background: linear-gradient(135deg, #f4f7fb 0%, #eef2f9 100%);
      color: #0f172a;
      font-family: Inter, 'DM Sans', system-ui, -apple-system, sans-serif;
      padding: 24px 28px 40px;
      transition: background 0.2s ease, color 0.2s ease;
    }
    [data-theme="night"] #nx-live-compras {
      background: linear-gradient(180deg, #0b1526 0%, #0f1c31 100%);
      color: #f8fafc;
      color-scheme: dark;
    }
    #nx-live-compras * { box-sizing: border-box; }
    #nx-live-compras [hidden] { display: none !important; }
    #nx-live-compras .nxlc-wrap { max-width: 1480px; margin: 0 auto; width: 100%; }
    #nx-live-compras h1, #nx-live-compras h2, #nx-live-compras h3, #nx-live-compras h4 {
      color: inherit;
      margin: 0;
      font-family: inherit;
    }

    /* Header */
    #nx-live-compras .nxlc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    #nx-live-compras h1 {
      font-size: 26px;
      letter-spacing: -0.03em;
      font-weight: 800;
      line-height: 1.15;
    }
    #nx-live-compras .nxlc-subtitle {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 7px;
      font-size: 13px;
      margin-top: 5px;
      color: #64748b;
      font-weight: 500;
    }
    [data-theme="night"] #nx-live-compras .nxlc-subtitle {
      color: #94a3b8;
    }
    @keyframes nxlcPulse {
      0%, 100% { transform: scale(0.95); opacity: 0.75; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
      50% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
    }
    #nx-live-compras .nxlc-live-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: nxlcPulse 1.6s infinite ease-in-out;
      flex-shrink: 0;
    }

    /* Controls */
    #nx-live-compras .nxlc-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #nx-live-compras .nxlc-select,
    #nx-live-compras .nxlc-search,
    #nx-live-compras .nxlc-button {
      height: 38px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 9px;
      color: #1e293b;
      padding: 0 12px;
      font: inherit;
      font-size: 12.5px;
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
    #nx-live-compras .nxlc-button {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
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
    #nx-live-compras button:focus-visible,
    #nx-live-compras input:focus-visible,
    #nx-live-compras select:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    /* Top KPI Banner */
    #nx-live-compras .nxlc-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 26px;
    }
    #nx-live-compras .nxlc-kpi {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 13px;
      background: #ffffff;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
      padding: 16px 18px;
      min-width: 0;
    }
    [data-theme="night"] #nx-live-compras .nxlc-kpi {
      background: #16263e;
      border-color: #2b3d57;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
    }
    #nx-live-compras .nxlc-kpi-left {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    #nx-live-compras .nxlc-kpi-icon {
      width: 38px;
      height: 38px;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: #2563eb;
      flex: none;
    }
    [data-theme="night"] #nx-live-compras .nxlc-kpi-icon {
      background: rgba(59, 130, 246, 0.18);
      border-color: rgba(96, 165, 250, 0.3);
      color: #60a5fa;
    }
    #nx-live-compras svg { width: 19px; height: 19px; display: block; }
    #nx-live-compras .nxlc-kpi label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      margin: 0 0 4px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-kpi label {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-kpi strong {
      display: block;
      font-size: 23px;
      letter-spacing: -0.03em;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #0f172a;
    }
    [data-theme="night"] #nx-live-compras .nxlc-kpi strong {
      color: #ffffff;
    }
    #nx-live-compras .nxlc-kpi small {
      font-size: 11px;
      font-weight: 600;
      color: #16a34a;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 5px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-kpi small {
      color: #4ade80;
    }
    #nx-live-compras .nxlc-spark {
      width: 58px;
      height: 28px;
      flex-shrink: 0;
      opacity: 0.85;
    }

    /* Section Header & Toolbar */
    #nx-live-compras .nxlc-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    #nx-live-compras .nxlc-section-head h2 {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #nx-live-compras .nxlc-toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    #nx-live-compras .nxlc-search {
      width: 240px;
    }
    #nx-live-compras .nxlc-toggle {
      display: flex;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      padding: 3px;
      background: #ffffff;
      height: 38px;
      align-items: center;
    }
    [data-theme="night"] #nx-live-compras .nxlc-toggle {
      background: #16263e;
      border-color: #2b3d57;
    }
    #nx-live-compras .nxlc-toggle button {
      border: 0;
      border-radius: 6px;
      padding: 5px 10px;
      height: 30px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font-size: 13px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-toggle button {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-toggle button.active {
      background: #2563eb;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
    }

    /* Landings Grid */
    #nx-live-compras .nxlc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(390px, 1fr));
      gap: 18px;
      align-items: start;
    }
    #nx-live-compras .nxlc-grid.single-item {
      grid-template-columns: minmax(0, 620px);
    }
    #nx-live-compras .nxlc-grid.list {
      grid-template-columns: minmax(0, 720px);
    }

    /* Landing CRM Card */
    #nx-live-compras .nxlc-card {
      border: 1px solid #e2e8f0;
      border-radius: 15px;
      background: #ffffff;
      padding: 18px;
      min-width: 0;
      box-shadow: 0 6px 20px rgba(15, 23, 42, 0.04);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    [data-theme="night"] #nx-live-compras .nxlc-card {
      background: #16263e;
      border-color: #2b3d57;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }
    #nx-live-compras .nxlc-card.is-live-active {
      border-color: #22c55e;
      box-shadow: 0 0 22px rgba(34, 197, 94, 0.18);
    }
    #nx-live-compras .nxlc-card-top {
      display: flex;
      gap: 12px;
      align-items: center;
      min-height: 48px;
      margin-bottom: 15px;
    }
    #nx-live-compras .nxlc-product-icon {
      height: 48px;
      width: 48px;
      border-radius: 10px;
      flex: none;
      overflow: hidden;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #475569;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 16px;
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
      font-size: 15.5px;
      line-height: 1.3;
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
      font-size: 12px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 3px;
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
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      background: rgba(34, 197, 94, 0.14);
      color: #16a34a;
      padding: 5px 10px;
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
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
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

    /* Pair boxes: Total sesiones / Total ordenes */
    #nx-live-compras .nxlc-pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    #nx-live-compras .nxlc-mini {
      border: 1px solid #e2e8f0;
      border-radius: 11px;
      padding: 12px 14px;
      background: #f8fafc;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini {
      background: #102039;
      border-color: #243854;
    }
    #nx-live-compras .nxlc-mini label {
      display: block;
      font-size: 11.5px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 4px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini label {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-mini strong {
      display: block;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
    }
    #nx-live-compras .nxlc-mini small {
      display: block;
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      font-weight: 500;
    }
    [data-theme="night"] #nx-live-compras .nxlc-mini small {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-segbar {
      display: flex;
      gap: 3px;
      height: 5px;
      margin-top: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(148, 163, 184, 0.18);
    }
    #nx-live-compras .nxlc-segbar span {
      display: block;
      height: 100%;
      border-radius: 999px;
    }

    /* Inner Sections */
    #nx-live-compras .nxlc-detail {
      border: 1px solid #e2e8f0;
      border-radius: 11px;
      padding: 13px 14px;
      margin-top: 10px;
      background: #f8fafc;
    }
    [data-theme="night"] #nx-live-compras .nxlc-detail {
      background: #102039;
      border-color: #243854;
    }
    #nx-live-compras .nxlc-detail h4 {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #nx-live-compras .nxlc-bar-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 10px;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      margin-top: 10px;
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
      font-size: 12px;
      color: #475569;
    }
    [data-theme="night"] #nx-live-compras .nxlc-bar-row b {
      color: #cbd5e1;
    }
    #nx-live-compras .nxlc-bar {
      grid-column: 1;
      grid-row: 2;
      height: 7px;
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
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      padding: 4px 0;
    }
    [data-theme="night"] #nx-live-compras .nxlc-empty {
      color: #94a3b8;
    }

    /* Top Productos */
    #nx-live-compras .nxlc-products {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
      font-size: 12.5px;
    }
    #nx-live-compras .nxlc-products img {
      width: 38px;
      height: 38px;
      object-fit: cover;
      border-radius: 8px;
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
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 500;
    }
    [data-theme="night"] #nx-live-compras .nxlc-products small {
      color: #94a3b8;
    }
    #nx-live-compras .nxlc-products strong {
      font-size: 13px;
      white-space: nowrap;
      font-weight: 800;
    }

    /* Comportamiento en tiempo real */
    #nx-live-compras .nxlc-window {
      font-size: 10.5px;
      font-weight: 700;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 999px;
      padding: 3px 9px;
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
      padding: 10px 0 4px;
      text-align: center;
    }
    #nx-live-compras .nxlc-behavior:before {
      content: '';
      position: absolute;
      top: 28px;
      height: 2px;
      background: linear-gradient(90deg, #38bdf8, #a78bfa, #34d399);
      left: 16%;
      right: 16%;
      opacity: 0.55;
    }
    #nx-live-compras .nxlc-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      width: 33%;
      gap: 6px;
    }
    #nx-live-compras .nxlc-orb {
      height: 36px;
      width: 36px;
      border-radius: 50%;
      background: radial-gradient(circle at 34% 29%, #f0f9ff 0, #7dd3fc 32%, #0284c7 70%, #bae6fd 95%);
      box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.14), 0 4px 10px rgba(2, 132, 199, 0.25);
      border: 1px solid #38bdf8;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #nx-live-compras .nxlc-orb.purple {
      background: radial-gradient(circle at 34% 29%, #faf5ff, #c4b5fd 32%, #7c3aed 70%, #ddd6fe 95%);
      border-color: #a78bfa;
      box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.14), 0 4px 10px rgba(124, 58, 237, 0.25);
    }
    #nx-live-compras .nxlc-orb.green {
      background: radial-gradient(circle at 34% 29%, #f0fdf4, #86efac 32%, #16a34a 70%, #bbf7d0 95%);
      border-color: #4ade80;
      box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.14), 0 4px 10px rgba(22, 163, 74, 0.25);
    }
    #nx-live-compras .nxlc-orb.has-value {
      transform: scale(1.14);
      box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.25), 0 6px 14px rgba(2, 132, 199, 0.38);
    }
    #nx-live-compras .nxlc-stage b {
      font-size: 18px;
      font-weight: 800;
      margin-top: 2px;
    }
    #nx-live-compras .nxlc-stage small {
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
      color: #64748b;
    }
    [data-theme="night"] #nx-live-compras .nxlc-stage small {
      color: #94a3b8;
    }

    /* Clean Non-Clickable Status Footer (Zero IP/DB-IP links) */
    #nx-live-compras .nxlc-footer {
      font-size: 11.5px;
      font-weight: 500;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 18px;
    }
    [data-theme="night"] #nx-live-compras .nxlc-footer {
      color: #94a3b8;
    }

    /* Responsive Breakpoints */
    @media (max-width: 1180px) {
      #nx-live-compras .nxlc-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      #nx-live-compras .nxlc-grid {
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      }
    }
    @media (max-width: 768px) {
      #nx-live-compras {
        padding: 16px 12px 32px;
      }
      #nx-live-compras h1 {
        font-size: 21px;
      }
      #nx-live-compras .nxlc-head {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      #nx-live-compras .nxlc-actions {
        width: 100%;
      }
      #nx-live-compras .nxlc-actions .nxlc-select {
        flex: 1;
      }
      #nx-live-compras .nxlc-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 20px;
      }
      #nx-live-compras .nxlc-kpi {
        padding: 12px;
      }
      #nx-live-compras .nxlc-kpi strong {
        font-size: 18px;
      }
      #nx-live-compras .nxlc-spark {
        display: none;
      }
      #nx-live-compras .nxlc-section-head {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }
      #nx-live-compras .nxlc-toolbar {
        width: 100%;
        display: flex;
      }
      #nx-live-compras .nxlc-search {
        flex: 1;
        min-width: 0;
        width: auto;
      }
      #nx-live-compras .nxlc-grid,
      #nx-live-compras .nxlc-grid.single-item,
      #nx-live-compras .nxlc-grid.list {
        grid-template-columns: minmax(0, 1fr);
        gap: 14px;
      }
      #nx-live-compras .nxlc-card {
        padding: 14px;
      }
      #nx-live-compras .nxlc-mini strong {
        font-size: 20px;
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
    return '$' + Number(n || 0).toLocaleString('es-CL') + ' CLP';
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

  function layout() {
    if (!page || !state.open) return;
    var side = document.querySelector('aside.side');
    var header = document.querySelector('main > header');
    var top = header ? header.getBoundingClientRect().bottom : 0;
    var left = 0;
    if (window.innerWidth > 900 && side) {
      left = Math.max(0, side.getBoundingClientRect().right);
    }
    page.style.top = Math.max(0, top) + 'px';
    page.style.left = left + 'px';
    page.style.right = '0';
    page.style.bottom = '0';
  }

  function show() {
    addNav();
    if (!page) {
      page = document.createElement('div');
      page.id = 'nx-live-compras';
      document.body.appendChild(page);
    }
    state.open = true;
    page.hidden = false;
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
    layout();
    render();
    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 6000);
  }

  function hide() {
    if (!state.open) return;
    state.open = false;
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

  window.addEventListener('resize', layout);
  new MutationObserver(function () {
    addNav();
    if (state.open) layout();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-theme'] });

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
      layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>'
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

    var products = (l.top_products || []).slice(0, 3).map(function (x) {
      return '<div class="nxlc-products">' +
        (image ? '<img src="' + esc(image) + '" alt="" loading="lazy">' : '') +
        '<div class="nxlc-product-name">' + esc(x.name) + '<small>' + Number(x.orders || 0) + ' unidades</small></div>' +
        '<strong>' + money(x.revenue) + '</strong></div>';
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
    var customers = l.customers || { new_customers: 0, total: 0 };
    var custPct = customers.total ? Math.min(100, Math.round((Number(customers.new_customers || 0) / customers.total) * 100)) : (Number(l.orders_today || 0) > 0 ? 100 : 0);
    var sessionsCount = Number(l.sessions_today || 0);
    var uniqueCount = Number(l.unique_visitors_today || 0);
    var ordersCount = Number(l.orders_today || 0);

    return '<article class="nxlc-card' + (live > 0 ? ' is-live-active' : '') + '">' +
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
      '<div class="nxlc-pair">' +
        '<div class="nxlc-mini">' +
          '<label>Total sesiones</label>' +
          '<strong>' + sessionsCount.toLocaleString('es-CL') + '</strong>' +
          '<small>' + uniqueCount.toLocaleString('es-CL') + ' visitantes únicos</small>' +
          '<div class="nxlc-segbar"><span style="width:65%;background:#38bdf8"></span><span style="width:25%;background:#3b82f6"></span><span style="width:10%;background:#93c5fd"></span></div>' +
        '</div>' +
        '<div class="nxlc-mini">' +
          '<label>Total órdenes</label>' +
          '<strong>' + ordersCount.toLocaleString('es-CL') + '</strong>' +
          '<small>' + money(l.revenue_today || 0) + '</small>' +
          '<div class="nxlc-segbar"><span style="width:' + (ordersCount > 0 ? 75 : 15) + '%;background:#8b5cf6"></span><span style="width:25%;background:#c4b5fd"></span></div>' +
        '</div>' +
      '</div>' +
      '<section class="nxlc-detail"><h4>Top ubicaciones</h4>' + locations + '</section>' +
      '<section class="nxlc-detail"><h4>Clientes</h4><div class="nxlc-bar-row"><span>Nuevos</span><b>' + Number(customers.new_customers || ordersCount) + '</b><div class="nxlc-bar"><i style="width:' + custPct + '%;background:linear-gradient(90deg,#a78bfa,#7c3aed)"></i></div></div></section>' +
      '<section class="nxlc-detail"><h4>Top productos</h4>' + products + '</section>' +
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
      ['sales', 'Ventas totales', money(t.revenue), '▲ Facturación en el periodo', '#8b5cf6'],
      ['orders', 'Órdenes', t.orders.toLocaleString('es-CL'), '▲ Pedidos COD recibidos', '#3b82f6'],
      ['visitors', 'Visitantes', t.visitors.toLocaleString('es-CL'), '● ' + t.live + ' activos ahora · ' + t.sessions + ' sesiones', '#0ea5e9'],
      ['conversion', 'Conversión', conv.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + '%', '▲ Órdenes / sesiones', '#10b981']
    ];

    var gridClass = 'nxlc-grid' + (state.view === 'list' ? ' list' : (rows.length === 1 ? ' single-item' : ''));

    page.innerHTML =
      '<div class="nxlc-wrap">' +
        '<div class="nxlc-head">' +
          '<div>' +
            '<h1>Live / Compras</h1>' +
            '<div class="nxlc-subtitle"><span class="nxlc-live-dot"></span>Monitorea en tiempo real todas tus landings activas</div>' +
          '</div>' +
          '<div class="nxlc-actions">' +
            '<select class="nxlc-select" data-role="period" aria-label="Periodo">' +
              periods.map(function (p) {
                return '<option value="' + p[0] + '" ' + (p[0] === state.period ? 'selected' : '') + '>' + p[1] + '</option>';
              }).join('') +
            '</select>' +
            '<button class="nxlc-button" data-action="refresh" aria-label="Actualizar métricas">↻ Actualizar</button>' +
          '</div>' +
        '</div>' +
        '<div class="nxlc-kpis">' +
          kpis.map(function (k) {
            return '<div class="nxlc-kpi">' +
              '<div class="nxlc-kpi-left">' +
                '<span class="nxlc-kpi-icon">' + icon(k[0]) + '</span>' +
                '<div style="min-width:0"><label>' + k[1] + '</label><strong>' + k[2] + '</strong><small>' + k[3] + '</small></div>' +
              '</div>' +
              sparkSvg(k[4]) +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="nxlc-section-head">' +
          '<h2>' + icon('layers') + 'Mis Landings Activas (' + rows.length + ')</h2>' +
          '<div class="nxlc-toolbar">' +
            '<input class="nxlc-search" data-role="search" aria-label="Buscar landing" placeholder="Buscar landing…" value="' + esc(state.search) + '">' +
            '<div class="nxlc-toggle">' +
              '<button data-view="grid" class="' + (state.view === 'grid' ? 'active' : '') + '" aria-label="Vista en cuadrícula">▦</button>' +
              '<button data-view="list" class="' + (state.view === 'list' ? 'active' : '') + '" aria-label="Vista en lista">☰</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="' + gridClass + '">' +
          (rows.map(landingCard).join('') || '<div class="nxlc-empty">' + (state.data ? 'No hay campañas activas que coincidan.' : 'Cargando landings activas…') + '</div>') +
        '</div>' +
        '<div class="nxlc-footer"><span class="nxlc-live-dot"></span>Actualizado ' + time(data.refreshed_at) + ' · Sincronización automática cada 6 s</div>' +
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
          page.innerHTML = '<div class="nxlc-wrap"><h1>Live / Compras</h1><p>' + esc(error.message) + ' · Revisa tu sesión y vuelve a actualizar.</p></div>';
        }
      })
      .finally(function () {
        state.busy = false;
      });
  }

  addNav();
})();
