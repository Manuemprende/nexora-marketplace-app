import {readApiView, api} from '../services/api';
import React, {useState} from 'react';
import {Modal} from './Common';
import {usePolling} from '../services/usePolling';
import '../whatsapp.css';

export default function WhatsAppConnection({readOnly = false}) {
  const [data, setData] = useState(() => readApiView('/integrations/whatsapp/status'));
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState(true);

  async function load() {
    try {
      setData(await api('/integrations/whatsapp/status'));
      setError('');
    } catch (e) {
      if (e.status === 403) setAdmin(false);
      else setError(e.message);
    }
  }

  usePolling(load, show ? 2500 : 25000);

  async function connect() {
    setBusy(true);
    setError('');
    setShow(true);
    try {
      setData(await api('/integrations/whatsapp/connect', {
        method: 'POST',
        body: {},
        signal: AbortSignal.timeout(60000)
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetAndNewQr() {
    setBusy(true);
    setError('');
    setShow(true);
    try {
      await api('/integrations/whatsapp/disconnect', { method: 'POST', body: {} }).catch(() => {});
      setData(await api('/integrations/whatsapp/connect', {
        method: 'POST',
        body: {},
        signal: AbortSignal.timeout(60000)
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('¿Desvincular el número actual de WhatsApp de Nexora?')) return;
    setBusy(true);
    try {
      setData(await api('/integrations/whatsapp/disconnect', { method: 'POST', body: {} }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const label = data?.connected
    ? 'Conectado · Activo'
    : data?.state === 'qr'
      ? 'QR listo para escanear'
      : data?.state === 'connecting' || data?.state === 'reconnecting'
        ? 'Conectando…'
        : 'Listo para vincular';

  return (
    <section className={'panel connectionCard whatsappConnection ' + (data?.connected ? 'isConnected' : '')}>
      <div className="connectionCardHead">
        <img src="/platform-logos/whatsapp.svg" alt="WhatsApp" />
        <div>
          <h3>WhatsApp Nexora (Confirmación COD & POS)</h3>
          <span className={'tag ' + (data?.connected ? 'success' : 'neutral')}>{label}</span>
        </div>
      </div>

      <p className="fine">
        Vincula el número exclusivo de <b>Nexora</b> para confirmar pedidos contra entrega de Landings COD automáticamente (respuestas <b>SÍ / NO</b>) y enviar comprobantes PDF.
      </p>

      {data?.connected && <b>🟢 Número vinculado a Nexora: +{data.phone}</b>}
      {error && <p className="formError">{error}</p>}
      {data?.message && <p className="fine">{data.message}</p>}

      {!admin ? (
        <p className="fine">Solo un administrador puede conectar el número.</p>
      ) : (
        !readOnly && (
          <div className="toolbar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="primary" disabled={busy} onClick={connect}>
              {busy ? 'Generando QR…' : data?.connected ? 'Ver estado / QR' : 'Conectar WhatsApp QR'}
            </button>
            <button className="outline" disabled={busy} onClick={resetAndNewQr}>
              {data?.connected ? 'Cambiar Número' : 'Nuevo QR Limpio'}
            </button>
            {data?.connected && (
              <button className="outline" disabled={busy} onClick={disconnect}>
                Desconectar
              </button>
            )}
          </div>
        )
      )}

      <details className="fine">
        <summary>¿Cómo funciona la confirmación automática en Nexora?</summary>
        <p>
          1. Escanea el QR con el WhatsApp que usarás en esta plataforma.<br />
          2. Cuando entra un pedido COD desde tus landings, Nexora envía el mensaje de confirmación al cliente.<br />
          3. Si el cliente responde <b>SÍ</b>, el pedido pasa automáticamente a <b>Confirmado WhatsApp</b>.
        </p>
      </details>

      {show && (
        <Modal title="Vincular WhatsApp a Nexora" onClose={() => setShow(false)}>
          {data?.connected ? (
            <p className="callout">
              ✅ WhatsApp vinculado a Nexora: <b>+{data.phone}</b>. Ya está activo para confirmar pedidos COD de tus landings y enviar comprobantes.
            </p>
          ) : (
            <>
              <p>
                En el teléfono que usarás para <b>Nexora</b>, abre <b>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</b> y escanea este código QR:
              </p>
              {data?.qr ? (
                <img className="whatsappQr" src={data.qr} alt="Código QR para vincular WhatsApp de Nexora" />
              ) : (
                <p className="callout">
                  {busy
                    ? 'Generando código QR de WhatsApp para Nexora… (toma ~2 segundos)'
                    : data?.state === 'error'
                      ? data.message || 'No se pudo generar el QR. Haz clic en "Generar nuevo QR".'
                      : 'Preparando el código QR…'}
                </p>
              )}
              <p className="fine">
                Este QR vincula el número directamente a tu servidor Nexora (`nexora.wentixai.pro`).
              </p>
            </>
          )}
          <div className="formActions">
            <button className="outline" onClick={() => setShow(false)}>
              Cerrar
            </button>
            <button className="primary" disabled={busy} onClick={resetAndNewQr}>
              {busy ? 'Generando…' : data?.connected ? 'Vincular otro número' : 'Generar nuevo QR'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
