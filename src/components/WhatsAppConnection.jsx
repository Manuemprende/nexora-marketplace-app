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

  usePolling(load, show ? 3000 : 30000);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      setData(await api('/integrations/whatsapp/connect', {
        method: 'POST',
        body: {},
        signal: AbortSignal.timeout(60000)
      }));
      setShow(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('¿Desconectar el número de WhatsApp de Nexora?')) return;
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
      ? 'Pendiente de escanear QR'
      : data?.state === 'connecting' || data?.state === 'reconnecting'
        ? 'Conectando…'
        : 'Sin conectar';

  return (
    <section className={'panel connectionCard whatsappConnection ' + (data?.connected ? 'isConnected' : '')}>
      <div className="connectionCardHead">
        <img src="/platform-logos/whatsapp.svg" alt="WhatsApp" />
        <div>
          <h3>WhatsApp Confirmación COD & POS</h3>
          <span className={'tag ' + (data?.connected ? 'success' : 'neutral')}>{label}</span>
        </div>
      </div>

      <p className="fine">
        Envía automáticamente el mensaje de confirmación de pedidos de Landings COD, recibe la respuesta <b>SÍ / NO</b> del cliente para pasar a <b>Confirmado WhatsApp</b> y envía comprobantes PDF del POS.
      </p>

      {data?.connected && <b>🟢 Número vinculado: +{data.phone}</b>}
      {error && <p className="formError">{error}</p>}
      {data?.message && <p className="fine">{data.message}</p>}

      {!admin ? (
        <p className="fine">Solo un administrador puede conectar el número.</p>
      ) : (
        !readOnly && (
          <div className="toolbar">
            <button className="primary" disabled={busy || !data} onClick={connect}>
              {busy ? 'Generando QR…' : data?.connected ? 'Ver conexión / QR' : 'Conectar WhatsApp QR'}
            </button>
            {data?.phone && (
              <button className="outline" disabled={busy} onClick={disconnect}>
                Desconectar
              </button>
            )}
          </div>
        )
      )}

      <details className="fine">
        <summary>¿Cómo funciona la confirmación automática?</summary>
        <p>
          1. Vincula tu WhatsApp escaneando el código QR (o configura WhatsApp Cloud API en el servidor).<br />
          2. Cuando entra un pedido desde tu Landing (o al hacer clic en solicitar confirmación), Nexora le envía el resumen del pedido y dirección al cliente.<br />
          3. Cuando el cliente responde <b>SÍ</b>, Nexora cambia el pedido a <b>Confirmado WhatsApp</b> automáticamente (y si tienes auto-despacho Dropi activo, crea la orden en Dropi MCP).
        </p>
      </details>

      {show && (
        <Modal title="Vincular WhatsApp a Nexora" onClose={() => setShow(false)}>
          {data?.connected ? (
            <p className="callout">
              ✅ WhatsApp conectado (+{data.phone}). La confirmación automática de pedidos COD y el envío de comprobantes están activos.
            </p>
          ) : (
            <>
              <p>
                En tu teléfono abre <b>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</b> y escanea este código QR:
              </p>
              {data?.qr ? (
                <img className="whatsappQr" src={data.qr} alt="Código QR para vincular WhatsApp de Nexora" />
              ) : (
                <p className="callout">
                  {data?.state === 'error'
                    ? data.message || 'No se pudo conectar. Vuelve a intentarlo.'
                    : 'Preparando el código QR…'}
                </p>
              )}
              <p className="fine">
                Escanea este código desde el número de atención al cliente que usará Nexora para confirmar pedidos.
              </p>
            </>
          )}
          <div className="formActions">
            <button className="outline" onClick={() => setShow(false)}>
              Cerrar
            </button>
            {!data?.connected && (
              <button className="primary" disabled={busy} onClick={connect}>
                Generar nuevo QR
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
