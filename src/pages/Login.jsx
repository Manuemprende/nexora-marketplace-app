import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Brand, Field } from '../components/Common';
import { api } from '../services/api';
export default function Login({ onLogin }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onLogin(await api('/login', { method: 'POST', body: { email, password } })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="login"><div className="loginLeft"><Brand big/><div><h1>Todo tu inventario y canales.<br/><em>En un solo lugar.</em></h1><p>Centralización de stock atómico, sincronización multi-marketplace y despacho de alta velocidad.</p></div><small>Nexora · Orquestación de comercio omnicanal · {import.meta.env.VITE_NEXORA_HOSTED==='true'?'Plataforma en línea':'Entorno local'}</small></div><div className="loginRight"><form className="loginCard" onSubmit={submit}><div className="eyebrow">BIENVENIDO A NEXORA</div><h2>Iniciar sesión</h2><p>Ingresa con tu cuenta de administrador o empaque.</p><Field label="Correo electrónico" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/><Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/>{error && <p role="alert" className="formError">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar'}<ChevronRight size={18}/></button></form></div></div>;
}
