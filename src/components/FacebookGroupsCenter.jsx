import React, { useState, useEffect } from 'react';
import { api, money } from '../services/api';
import { 
  Share2, Play, RefreshCw, CheckCircle2, AlertTriangle, 
  Plus, Trash2, ExternalLink, Copy, Key, Globe, 
  Terminal, ShieldCheck, Sparkles, MessageSquare, Send,
  Layers, Package, Phone, Eye, Check, Clock, Radio,
  Search, Image as ImageIcon, Sparkle, Tag, Gift, Wrench, Home, Heart
} from 'lucide-react';

const NICHES = [
  { id: 'navidad', name: '🎄 Navidad & Temporada', icon: Gift, query: 'navidad', desc: 'Luces solares, árboles, adornos y guirnaldas' },
  { id: 'herramientas', name: '🔧 Ferretería & Herramientas', icon: Wrench, query: 'taladro', desc: 'Inalámbricos, kits de herramientas y maquinaria' },
  { id: 'hogar', name: '🏠 Hogar & Cocina', icon: Home, query: 'hogar', desc: 'Organizadores, dispensadores y tecnología del hogar' },
  { id: 'belleza', name: '💄 Belleza & Cuidado', icon: Heart, query: 'masajeador', desc: 'Cuidado personal, estética y bienestar' },
  { id: 'todos', name: '📦 Todos / Libre', icon: Package, query: '', desc: 'Catálogo completo sin restricciones' }
];

export default function FacebookGroupsCenter({ products = [], toast = () => {} }) {
  const [tab, setTab] = useState('poster'); // 'poster' | 'dropi_catalog' | 'groups' | 'logs' | 'cookies'
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  
  // Data
  const [groups, setGroups] = useState([]);
  const [cookieStatus, setCookieStatus] = useState({ valid: false, count: 0 });
  const [logs, setLogs] = useState([]);

  // Niche & Style Selection
  const [currentNiche, setCurrentNiche] = useState('navidad');
  const [copyStyle, setCopyStyle] = useState('direct'); // 'direct' | 'seasonal' | 'flash'
  
  // Post Creator State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [whatsapp, setWhatsapp] = useState('+56928148946');
  const [storeUrl, setStoreUrl] = useState('https://nexora.wentixai.cyou/tienda');
  const [customPrice, setCustomPrice] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [postCopy, setPostCopy] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [publishMode, setPublishMode] = useState('bot'); // 'bot' | 'desktop'
  
  // Dropi Live Search inside Poster
  const [dropiSearchQuery, setDropiSearchQuery] = useState('navidad');
  const [dropiResults, setDropiResults] = useState([]);
  const [dropiSearching, setDropiSearching] = useState(false);

  // New Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');
  const [newGroupCat, setNewGroupCat] = useState('Navidad & Temporada');

  // Cookies Modal
  const [cookiesInput, setCookiesInput] = useState('');

  const loadData = async () => {
    try {
      const [grps, cStatus, lgs] = await Promise.all([
        api('/facebook/groups'),
        api('/facebook/cookies-status'),
        api('/facebook/logs')
      ]);
      setGroups(grps || []);
      if (grps && grps.length > 0 && !selectedGroupId) {
        setSelectedGroupId(grps[0].id);
      }
      setCookieStatus(cStatus || { valid: false, count: 0 });
      setLogs(lgs?.logs || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const res = await api('/facebook/logs');
        if (res?.logs) setLogs(res.logs);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Listen for incoming Dropi product from DropiControlCenter
  useEffect(() => {
    const checkIncoming = () => {
      try {
        const saved = sessionStorage.getItem('fb_selected_product');
        if (saved) {
          const prod = JSON.parse(saved);
          sessionStorage.removeItem('fb_selected_product');
          applySelectedProduct(prod);
        }
      } catch (e) {
        console.error(e);
      }
    };

    checkIncoming();
    window.addEventListener('hashchange', checkIncoming);
    return () => window.removeEventListener('hashchange', checkIncoming);
  }, []);

  // Initialize with first available product if none selected
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      applySelectedProduct(products[0]);
    }
  }, [products]);

  // When changing niche, auto-search Dropi if needed
  const handleSelectNiche = (nicheId) => {
    setCurrentNiche(nicheId);
    const n = NICHES.find(x => x.id === nicheId);
    if (n && n.query) {
      setDropiSearchQuery(n.query);
      searchDropi(n.query);
    }
  };

  const searchDropi = async (queryToSearch) => {
    const q = queryToSearch !== undefined ? queryToSearch : dropiSearchQuery;
    setDropiSearching(true);
    try {
      const res = await api(`/dropi/products?q=${encodeURIComponent(q)}&country=CHILE&limit=8`);
      setDropiResults(res?.products || []);
    } catch (e) {
      toast('Error buscando en Dropi: ' + e.message);
    } finally {
      setDropiSearching(false);
    }
  };

  const applySelectedProduct = (p) => {
    setSelectedProduct(p);
    setCustomTitle(p.name || '');
    setCustomPrice(p.suggested_price || p.price || '');
    
    // Extract gallery or single image
    let imgs = [];
    if (Array.isArray(p.gallery) && p.gallery.length > 0) {
      imgs = p.gallery;
    } else if (Array.isArray(p.images) && p.images.length > 0) {
      imgs = p.images;
    } else if (p.image_url) {
      imgs = [p.image_url];
    }
    setProductImages(imgs);
  };

  // Update copy when product, title, price, niche or style changes
  useEffect(() => {
    if (customTitle || selectedProduct) {
      const title = customTitle || selectedProduct?.name || 'Producto Destacado';
      const priceVal = customPrice || selectedProduct?.suggested_price || selectedProduct?.price || 19990;
      const desc = selectedProduct?.description || '';

      api('/facebook/generate-copy', {
        method: 'POST',
        body: {
          title,
          price: priceVal,
          description: desc,
          whatsapp,
          store_url: storeUrl,
          niche: currentNiche,
          style: copyStyle
        }
      }).then(res => {
        if (res?.copy) setPostCopy(res.copy);
      }).catch(() => {});
    }
  }, [selectedProduct, customTitle, customPrice, whatsapp, storeUrl, currentNiche, copyStyle]);

  const handleAddImage = (e) => {
    e.preventDefault();
    if (!newImageUrl) return;
    setProductImages(prev => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
    toast('Foto agregada a la galería de publicación');
  };

  const handleRemoveImage = (index) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupUrl) return;
    const newGroup = {
      id: `grp-${Date.now()}`,
      name: newGroupName || 'Grupo de Facebook',
      url: newGroupUrl,
      category: newGroupCat,
      active: true
    };
    const updated = [...groups, newGroup];
    setGroups(updated);
    setNewGroupName('');
    setNewGroupUrl('');
    try {
      await api('/facebook/groups', { method: 'POST', body: updated });
      toast('Grupo guardado exitosamente.');
    } catch (e) {
      toast('Error al guardar grupo: ' + e.message);
    }
  };

  const handleDeleteGroup = async (id) => {
    const updated = groups.filter(g => g.id !== id);
    setGroups(updated);
    try {
      await api('/facebook/groups', { method: 'POST', body: updated });
      toast('Grupo eliminado.');
    } catch (e) {
      toast('Error al eliminar grupo: ' + e.message);
    }
  };

  const handleSaveCookies = async () => {
    try {
      const res = await api('/facebook/cookies', {
        method: 'POST',
        body: { cookies: cookiesInput }
      });
      toast(`¡Cookies actualizadas! ${res.count} cookies activas.`);
      setCookiesInput('');
      setTab('poster');
      await loadData();
    } catch (e) {
      toast('Error al guardar cookies: ' + e.message);
    }
  };

  const handlePublish = async (singleGroupId = null) => {
    const targetGroupId = singleGroupId || selectedGroupId;
    const targetGroup = groups.find(g => g.id === targetGroupId) || groups[0];
    if (!targetGroup) {
      toast('Por favor selecciona un grupo de Facebook');
      return;
    }
    const title = customTitle || selectedProduct?.name;
    if (!title) {
      toast('Selecciona un producto a publicar');
      return;
    }

    setPublishing(true);
    try {
      const res = await api('/facebook/publish', {
        method: 'POST',
        body: {
          group_url: targetGroup.url,
          title: title,
          price: customPrice || selectedProduct?.suggested_price || selectedProduct?.price || '',
          description: postCopy,
          images: productImages.join(','),
          mode: publishMode,
          headless: false
        }
      });

      if (publishMode === 'desktop') {
        toast('¡Grupo abierto en el navegador! Anuncio copiado al portapapeles.');
        navigator.clipboard?.writeText(postCopy);
      } else {
        toast('Bot Selenium iniciado. Revisa la consola de logs en vivo.');
        setTab('logs');
      }
    } catch (e) {
      toast('Error al publicar: ' + e.message);
    } finally {
      setPublishing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(postCopy);
    toast('¡Texto del anuncio copiado al portapapeles!');
  };

  // Filter groups according to active niche
  const filteredGroups = groups.filter(g => {
    if (currentNiche === 'navidad') {
      return g.category?.toLowerCase().includes('navid') || g.category?.toLowerCase().includes('general') || g.category?.toLowerCase().includes('comercio');
    }
    if (currentNiche === 'herramientas') {
      return g.category?.toLowerCase().includes('ferreter') || g.category?.toLowerCase().includes('herramienta') || g.category?.toLowerCase().includes('industrial');
    }
    return true;
  });

  return (
    <div className="section" style={{ maxWidth: '1600px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1877f2 0%, #0c4a6e 100%)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '16px',
        padding: '24px',
        color: '#ffffff',
        marginBottom: '24px',
        boxShadow: '0 10px 25px -5px rgba(24, 119, 242, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ 
                background: '#ffffff', 
                color: '#1877f2', 
                padding: '4px 10px', 
                borderRadius: '8px', 
                fontSize: '11px', 
                fontWeight: '800', 
                letterSpacing: '0.05em' 
              }}>
                WENTIX FACEBOOK BOT
              </span>
              <span style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '12px', 
                color: '#fff', 
                background: cookieStatus.valid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)', 
                padding: '3px 8px', 
                borderRadius: '6px' 
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cookieStatus.valid ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                {cookieStatus.valid ? `Sesión Activa (${cookieStatus.count} cookies)` : 'Cookies pendientes de carga'}
              </span>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
              Publicador por Nichos en Grupos de Facebook
            </h2>
            <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.85)', fontSize: '13px' }}>
              Elige tu nicho (ej: <b>Navidad</b>, <b>Herramientas</b> o <b>Hogar</b>), selecciona el producto con sus fotos reales y publícalo con su enlace de pedido y pago contra entrega.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="outline" 
              onClick={() => setTab('cookies')}
              style={{ background: 'rgba(255, 255, 255, 0.15)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '10px', padding: '10px 16px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Key size={16} /> Configurar Cookies
            </button>
            <button 
              className="primary" 
              onClick={() => handlePublish()}
              disabled={publishing}
              style={{ background: '#ffffff', color: '#1877f2', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}
            >
              <Send size={16} className={publishing ? 'spin' : ''} />
              {publishing ? 'Lanzando...' : 'Publicar Anuncio Ahora'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px', paddingBottom: '2px' }}>
        <button 
          onClick={() => setTab('poster')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'poster' ? '700' : '500',
            color: tab === 'poster' ? '#1877f2' : '#64748b',
            borderBottom: tab === 'poster' ? '2px solid #1877f2' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <Share2 size={17} /> Creador de Anuncio por Nicho
        </button>

        <button 
          onClick={() => setTab('groups')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'groups' ? '700' : '500',
            color: tab === 'groups' ? '#1877f2' : '#64748b',
            borderBottom: tab === 'groups' ? '2px solid #1877f2' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <Globe size={17} /> Mis Grupos de Facebook ({groups.length})
        </button>

        <button 
          onClick={() => setTab('logs')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'logs' ? '700' : '500',
            color: tab === 'logs' ? '#1877f2' : '#64748b',
            borderBottom: tab === 'logs' ? '2px solid #1877f2' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <Terminal size={17} /> Consola de Logs en Vivo
        </button>

        <button 
          onClick={() => setTab('cookies')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'cookies' ? '700' : '500',
            color: tab === 'cookies' ? '#1877f2' : '#64748b',
            borderBottom: tab === 'cookies' ? '2px solid #1877f2' : '2px solid transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <Key size={17} /> Sesión / Cookies
        </button>
      </div>

      {/* TAB 1: POSTER BY NICHE */}
      {tab === 'poster' && (
        <div>
          {/* STEP 1: NICHE SELECTOR PILLS */}
          <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={16} style={{ color: '#1877f2' }} /> 1. Elige el Nicho o Campaña Temática:
              </span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Segmenta productos y grupos afines para máxima conversión
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {NICHES.map(niche => {
                const Icon = niche.icon;
                const isSelected = currentNiche === niche.id;
                return (
                  <button
                    key={niche.id}
                    onClick={() => handleSelectNiche(niche.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #1877f2' : '1px solid #cbd5e1',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontWeight: '700', fontSize: '13px', color: isSelected ? '#1877f2' : '#1e293b', marginBottom: '3px' }}>
                      {niche.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.3' }}>
                      {niche.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Left Column: Product Selection, Dropi Search & Photos */}
            <div className="card" style={{ padding: '20px' }}>
              
              {/* Product Explorer (Dropi & Local) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={17} style={{ color: '#1877f2' }} /> 2. Producto del Nicho
                </h3>
                <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1d4ed8', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                  {currentNiche.toUpperCase()}
                </span>
              </div>

              {/* Fast Dropi Search Box */}
              <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '11px', color: '#94a3b8' }} />
                    <input 
                      type="text"
                      value={dropiSearchQuery}
                      onChange={e => setDropiSearchQuery(e.target.value)}
                      placeholder="Buscar en Dropi (ej: luces navidad, arbol, taladro)..."
                      style={{ width: '100%', paddingLeft: '32px', fontSize: '13px', borderRadius: '8px' }}
                      onKeyDown={e => e.key === 'Enter' && searchDropi()}
                    />
                  </div>
                  <button 
                    className="primary" 
                    onClick={() => searchDropi()} 
                    disabled={dropiSearching}
                    style={{ fontSize: '12px', padding: '8px 14px', borderRadius: '8px' }}
                  >
                    {dropiSearching ? 'Buscando...' : 'Buscar Dropi'}
                  </button>
                </div>

                {/* Dropi Search Results Cards */}
                {dropiResults.length > 0 && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
                      Productos disponibles en Dropi Chile ({dropiResults.length}):
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', maxHeight: '210px', overflowY: 'auto' }}>
                      {dropiResults.map(dp => (
                        <div 
                          key={dp.id}
                          onClick={() => applySelectedProduct(dp)}
                          style={{
                            background: selectedProduct?.id === dp.id ? '#dbeafe' : '#fff',
                            border: selectedProduct?.id === dp.id ? '2px solid #1877f2' : '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div style={{ width: '100%', height: '70px', background: '#f8fafc', borderRadius: '6px', overflow: 'hidden' }}>
                            {dp.image_url ? (
                              <img src={dp.image_url} alt={dp.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>Sin Foto</div>
                            )}
                          </div>
                          <b style={{ color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dp.name}</b>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: '700' }}>
                            <span>${(dp.suggested_price || dp.cost_price || 0).toLocaleString('es-CL')}</span>
                            <span style={{ color: '#64748b', fontSize: '10px' }}>Stk: {dp.stock ?? 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Title & Price Fields */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Título del Anuncio:
                </label>
                <input 
                  type="text" 
                  value={customTitle} 
                  onChange={e => setCustomTitle(e.target.value)}
                  placeholder="Ej: Luces Navideñas LED Solares 10 Metros"
                  style={{ width: '100%', padding: '9px', fontWeight: '600' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Precio de Venta (CLP):
                  </label>
                  <input 
                    type="number" 
                    value={customPrice} 
                    onChange={e => setCustomPrice(e.target.value)}
                    placeholder="Ej: 14990"
                    style={{ width: '100%', padding: '9px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    WhatsApp de Contacto:
                  </label>
                  <input 
                    type="text" 
                    value={whatsapp} 
                    onChange={e => setWhatsapp(e.target.value)}
                    placeholder="+56928148946"
                    style={{ width: '100%', padding: '9px' }}
                  />
                </div>
              </div>

              {/* Multiple Images Gallery */}
              <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ImageIcon size={15} style={{ color: '#1877f2' }} /> Galería de Fotos del Anuncio ({productImages.length}):
                  </b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>El bot subirá todas las fotos juntas</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {productImages.map((img, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                      <img src={img} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button 
                        onClick={() => handleRemoveImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '10px'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {productImages.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px' }}>
                      No hay fotos adjuntas. Selecciona un producto de Dropi o agrega una URL abajo.
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddImage} style={{ display: 'flex', gap: '6px' }}>
                  <input 
                    type="url" 
                    value={newImageUrl} 
                    onChange={e => setNewImageUrl(e.target.value)}
                    placeholder="Agregar URL de foto adicional (https://...)"
                    style={{ flex: 1, padding: '7px 10px', fontSize: '12px' }}
                  />
                  <button type="submit" className="outline" style={{ fontSize: '12px', padding: '7px 12px' }}>
                    <Plus size={14} /> Agregar
                  </button>
                </form>
              </div>

              {/* Group & Execution Mode */}
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: '16px 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={17} style={{ color: '#1877f2' }} /> 3. Grupo Objetivo & Ejecución
              </h3>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                  Grupo de Facebook (Filtrado para {currentNiche}):
                </label>
                <select 
                  value={selectedGroupId} 
                  onChange={e => setSelectedGroupId(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px' }}
                >
                  {filteredGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} · [{g.category}]
                    </option>
                  ))}
                  {filteredGroups.length === 0 && (
                    <option value="">No hay grupos en esta categoría</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div 
                  onClick={() => setPublishMode('bot')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: publishMode === 'bot' ? '2px solid #1877f2' : '1px solid #cbd5e1',
                    background: publishMode === 'bot' ? '#eff6ff' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <b style={{ color: '#1877f2', display: 'block', fontSize: '12px' }}>🤖 Bot Selenium Automático</b>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Sube fotos, coloca el texto y publica de forma autónoma.
                  </span>
                </div>

                <div 
                  onClick={() => setPublishMode('desktop')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: publishMode === 'desktop' ? '2px solid #1877f2' : '1px solid #cbd5e1',
                    background: publishMode === 'desktop' ? '#eff6ff' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <b style={{ color: '#1877f2', display: 'block', fontSize: '12px' }}>⚡ Asistente 1-Click</b>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    Abre el grupo en navegador y copia el texto con 1 clic.
                  </span>
                </div>
              </div>

              <button 
                className="primary" 
                onClick={() => handlePublish()}
                disabled={publishing}
                style={{ width: '100%', padding: '12px', fontSize: '15px', fontWeight: '700', background: '#1877f2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Send size={18} className={publishing ? 'spin' : ''} />
                {publishing ? 'Lanzando publicación...' : 'Lanzar Publicación en Grupo'}
              </button>
            </div>

            {/* Right Column: Live Copy Preview & Text Style */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={17} style={{ color: '#f59e0b' }} /> Formato & Texto del Anuncio
                </h3>
                <button 
                  className="outline" 
                  onClick={copyToClipboard}
                  style={{ fontSize: '12px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={13} /> Copiar Texto
                </button>
              </div>

              {/* Style Selector Tabs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setCopyStyle('direct')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: copyStyle === 'direct' ? '700' : '500',
                    border: copyStyle === 'direct' ? '2px solid #1877f2' : '1px solid #cbd5e1',
                    background: copyStyle === 'direct' ? '#eff6ff' : '#fff',
                    color: copyStyle === 'direct' ? '#1877f2' : '#475569',
                    cursor: 'pointer'
                  }}
                >
                  📝 Directo & Breve (Recomendado)
                </button>

                <button
                  type="button"
                  onClick={() => setCopyStyle('seasonal')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: copyStyle === 'seasonal' ? '700' : '500',
                    border: copyStyle === 'seasonal' ? '2px solid #1877f2' : '1px solid #cbd5e1',
                    background: copyStyle === 'seasonal' ? '#eff6ff' : '#fff',
                    color: copyStyle === 'seasonal' ? '#1877f2' : '#475569',
                    cursor: 'pointer'
                  }}
                >
                  🎄 Estilo Navideño
                </button>

                <button
                  type="button"
                  onClick={() => setCopyStyle('flash')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: copyStyle === 'flash' ? '700' : '500',
                    border: copyStyle === 'flash' ? '2px solid #1877f2' : '1px solid #cbd5e1',
                    background: copyStyle === 'flash' ? '#eff6ff' : '#fff',
                    color: copyStyle === 'flash' ? '#1877f2' : '#475569',
                    cursor: 'pointer'
                  }}
                >
                  🔥 Oferta Flash
                </button>
              </div>

              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px 0' }}>
                Este texto se escribirá en la publicación del grupo. Puedes editarlo o agregar tus detalles:
              </p>

              <textarea 
                rows={16} 
                value={postCopy} 
                onChange={e => setPostCopy(e.target.value)}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#1e293b',
                  resize: 'vertical'
                }}
              />

              {/* WhatsApp Community Note */}
              <div style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px' }}>
                <b style={{ color: '#166534', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <MessageSquare size={14} /> Módulo WhatsApp para Grupos:
                </b>
                <span style={{ fontSize: '11px', color: '#15803d', lineHeight: '1.4', display: 'block' }}>
                  Estrategia lista: Cada post de Facebook incluye enlace directo para abrir conversación en WhatsApp (`wa.me`). La integración de scraping y auto-unión a grupos masivos de WhatsApp se activará cuando definas tu número dedicado.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GROUPS MANAGEMENT */}
      {tab === 'groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} style={{ color: '#1877f2' }} /> Agregar Nuevo Grupo
            </h3>
            <form onSubmit={handleAddGroup}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Nombre del Grupo:
                </label>
                <input 
                  type="text" 
                  value={newGroupName} 
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Ej: Feria Navideña Santiago"
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  URL de Facebook del Grupo:
                </label>
                <input 
                  type="url" 
                  value={newGroupUrl} 
                  onChange={e => setNewGroupUrl(e.target.value)}
                  placeholder="https://www.facebook.com/groups/..."
                  required
                  style={{ width: '100%', padding: '10px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                  Nicho / Categoría:
                </label>
                <select 
                  value={newGroupCat} 
                  onChange={e => setNewGroupCat(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px' }}
                >
                  <option value="Navidad & Temporada">Navidad & Temporada</option>
                  <option value="Ferretería & Herramientas">Ferretería & Herramientas</option>
                  <option value="Hogar & Cocina">Hogar & Cocina</option>
                  <option value="General / Variedades">General / Variedades</option>
                  <option value="Marketplace">Marketplace</option>
                </select>
              </div>

              <button className="primary" style={{ width: '100%', padding: '10px', fontWeight: '700' }}>
                Guardar Grupo
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} style={{ color: '#1877f2' }} /> Grupos Registrados ({groups.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {groups.map(g => (
                <div 
                  key={g.id} 
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#fff'
                  }}
                >
                  <div>
                    <b style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>{g.name}</b>
                    <span style={{ fontSize: '12px', color: '#1877f2' }}>{g.url}</span>
                    <span style={{ display: 'inline-block', marginLeft: '10px', fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>
                      {g.category}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a 
                      href={g.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="outline" 
                      style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button 
                      onClick={() => handlePublish(g.id)}
                      disabled={publishing}
                      style={{ background: '#1877f2', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Send size={13} /> Publicar Aquí
                    </button>
                    <button 
                      onClick={() => handleDeleteGroup(g.id)}
                      style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE LOGS */}
      {tab === 'logs' && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} style={{ color: '#1877f2' }} /> Consola de Logs en Tiempo Real
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Actualización automática cada 4s</span>
          </div>

          <div style={{
            background: '#0f172a',
            color: '#38bdf8',
            fontFamily: 'Consolas, monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            padding: '16px',
            borderRadius: '10px',
            height: '420px',
            overflowY: 'auto'
          }}>
            {logs.length === 0 ? (
              <span style={{ color: '#64748b' }}>Esperando eventos del bot...</span>
            ) : (
              logs.map((l, idx) => (
                <div key={idx} style={{ 
                  color: l.includes('Error') || l.includes('Falló') ? '#f87171' : l.includes('✅') || l.includes('exitosamente') ? '#4ade80' : '#e2e8f0' 
                }}>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: COOKIES */}
      {tab === 'cookies' && (
        <div className="card" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={20} style={{ color: '#1877f2' }} /> Configuración de Sesión & Cookies de Facebook
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', marginBottom: '20px' }}>
            El bot utiliza cookies de sesión seguras (`c_user`, `xs`, `fr`, `datr`) extraídas de tu navegador para poder ingresar a Facebook sin contraseñas ni validaciones de 2FA.
          </p>

          <div style={{
            background: cookieStatus.valid ? '#f0fdf4' : '#fef2f2',
            border: cookieStatus.valid ? '1px solid #bbf7d0' : '1px solid #fecaca',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <b style={{ color: cookieStatus.valid ? '#166534' : '#991b1b', display: 'block', marginBottom: '4px' }}>
              Estado Actual: {cookieStatus.message}
            </b>
            <span style={{ fontSize: '12px', color: '#475569' }}>
              {cookieStatus.valid ? `Total de cookies activas: ${cookieStatus.count}. Expiración estimada: ${cookieStatus.expires_at ? new Date(cookieStatus.expires_at).toLocaleDateString() : 'Vigente'}` : 'Sin cookies válidas. Pega tu archivo fb_cookies.json abajo.'}
            </span>
          </div>

          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
            Pegar JSON de Cookies (`fb_cookies.json`):
          </label>
          <textarea 
            rows={8}
            value={cookiesInput}
            onChange={e => setCookiesInput(e.target.value)}
            placeholder='[ { "name": "c_user", "value": "..." }, { "name": "xs", "value": "..." } ]'
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px' }}
          />

          <button 
            className="primary" 
            onClick={handleSaveCookies}
            disabled={!cookiesInput}
            style={{ padding: '10px 20px', fontWeight: '700' }}
          >
            Guardar & Activar Cookies
          </button>
        </div>
      )}
    </div>
  );
}
