export async function api(path, options = {}) {
  if(navigator.onLine===false && options.method && options.method!=='GET')throw new Error('Sin conexión. Conéctate antes de confirmar ventas o cambiar stock.');
  let response;
  try { response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'X-Nexora-Request': '1', 'X-Meibo-Request': '1', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }); } catch(error) {
    if(error.name==='TimeoutError'||error.name==='AbortError')throw new Error('El servidor tardó demasiado en responder. Vuelve a intentarlo.');
    throw new Error('No se pudo conectar con el servidor. Vuelve a intentarlo.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no está disponible. Vuelve a intentarlo.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación'); error.status = response.status;
    if (response.status === 401 && path !== '/login') {
      window.dispatchEvent(new Event('nexora-session-expired'));
      window.dispatchEvent(new Event('meibo-session-expired'));
    }
    throw error;
  }
  return data;
}
export const money = value => '$' + Number(value).toLocaleString('es-CL');
export const date = value => new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
export const available = product => product.stock - product.reserved;
export const dayKey = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date(value));
