import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart, 
  CreditCard, Banknote, Building2, Layers, User, UserPlus, 
  CheckCircle2, Printer, X, Sparkles, AlertCircle, Clock, ShieldCheck
} from 'lucide-react';
import { api, available, money } from '../../services/api';
import Receipt from '../../components/Receipt';
import CustomerPicker from './CustomerPicker';

export default function NewSale({ products = [], sales = [], refresh, toast, onNavigateTab, catalogLoading }) {
  // Filter & Search states
  const [query, setQuery] = useState('');
  const [catalogPage,setCatalogPage]=useState(1);

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  useEffect(()=>setCatalogPage(1),[query,selectedCategory]);
  const [currentTime, setCurrentTime] = useState('');
  
  // Cart & Transaction states
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState('');
  const [selectedCustomer,setSelectedCustomer]=useState(null);
  const [customerRut, setCustomerRut] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'transfer' | 'mixed'
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  
  // UI & Processing states
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successSale, setSuccessSale] = useState(null);
  const [receiptModal, setReceiptModal] = useState(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  
  const searchInputRef = useRef(null);
  const requestId = useRef(crypto.randomUUID());

  // Real-time clock for POS header
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  const [catalog,setCatalog]=useState({items:[],total:0,pages:1,categories:[]});
  const [pageLoading,setPageLoading]=useState(true),[pageError,setPageError]=useState('');
  const pageCache=useRef(new Map()),productLookup=useRef(new Map());
  useEffect(()=>{let alive=true;const controller=new AbortController();const key=JSON.stringify([query,selectedCategory,catalogPage]);const cached=pageCache.current.get(key);if(cached)setCatalog(cached);setPageLoading(!cached);setPageError('');const timer=setTimeout(async()=>{const params=new URLSearchParams({page:String(catalogPage),q:query,category:selectedCategory==='Todos'?'':selectedCategory});try{const result=await api('/pos/catalog?'+params,{signal:controller.signal});if(!alive)return;result.items.forEach(p=>productLookup.current.set(p.id,p));pageCache.current.set(key,result);setCatalog(result);setPageLoading(false);if(catalogPage<result.pages){params.set('page',String(catalogPage+1));api('/pos/catalog?'+params,{signal:controller.signal}).then(next=>{if(alive){next.items.forEach(p=>productLookup.current.set(p.id,p));pageCache.current.set(JSON.stringify([query,selectedCategory,catalogPage+1]),next);}}).catch(()=>{});}}catch(e){if(alive&&!controller.signal.aborted){setPageError(e.message);setPageLoading(false);}}},query?180:0);return()=>{alive=false;clearTimeout(timer);controller.abort();};},[query,selectedCategory,catalogPage]);
  const activeProducts=[...productLookup.current.values()];
  const dynamicCategories=['Todos',...catalog.categories];
  const catalogPages=catalog.pages;
  const visibleProducts=catalog.items;
  const filteredProducts={length:catalog.total};

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const total = Math.max(0, subtotal - discount);

  // Auto-fill mixed payment when total changes
  useEffect(() => {
    if (paymentMethod === 'mixed') {
      const cashVal = Number(mixedCash) || Math.round(total / 2);
      setMixedCash(cashVal);
      setMixedCard(Math.max(0, total - cashVal));
    }
  }, [paymentMethod, total]);

  // Cart operations
  const addToCart = (product) => {
    const stock = available(product);
    if (stock < 1) {
      toast?.('Producto sin stock disponible');
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.qty >= stock) {
        toast?.(`Stock máximo alcanzado (${stock} unidades)`);
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
    setError('');
  };

  const updateQty = (id, newQty) => {
    const p = activeProducts.find(x => x.id === id);
    const stock = p ? available(p) : 999;
    
    if (newQty <= 0) {
      setCart(cart.filter(item => item.id !== id));
      return;
    }
    if (newQty > stock) {
      toast?.(`Solo hay ${stock} unidades disponibles`);
      return;
    }
    setCart(cart.map(item => item.id === id ? { ...item, qty: newQty } : item));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('¿Deseas vaciar la venta actual?')) {
      setCart([]);
      setDiscount(0);
      setCustomer('');
      setCustomerRut('');
      setError('');
    }
  };

  // Barcode scanner handler on Enter
  const handleBarcodeKey = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = query.trim().toLowerCase();
      if (!code) return;

      const result=await api('/pos/catalog?'+new URLSearchParams({q:code,page:'1'})).catch(()=>null);
      const exact = (result?.items||activeProducts).find(p => 
        p.sku?.toLowerCase() === code || 
        Object.values(p.codes || {}).some(c => String(c).toLowerCase() === code)
      );

      if (exact) {
        addToCart(exact);
        setQuery('');
        toast?.(`Agregado: ${exact.name}`);
      } else {
        toast?.('No se encontró producto con ese código');
      }
    }
  };

  // Submit sale to Nexora backend
  const handleCheckout = async () => {
    if (cart.length === 0 || busy) return;
    if(!selectedCustomer){setError('Selecciona o registra un cliente antes de cobrar');return;}
    if(discount>0||paymentMethod==='mixed'){setError('Descuentos y pago mixto requieren soporte del servidor. Selecciona un medio de pago simple.');return;}
    setBusy(true);
    setError('');

    try {
      // Backend expects 'cash', 'card', 'transfer'
      const mappedPayment = paymentMethod === 'mixed' ? 'cash' : paymentMethod;
      const notes = paymentMethod === 'mixed' ? `Pago Mixto: Efectivo $${mixedCash} / Tarjeta $${mixedCard}` : '';

      const payload = {
        request_id: requestId.current,
        customer_id:selectedCustomer.id,
        items: cart.map(i => ({ id: i.id, qty: i.qty })),
        customer_name: selectedCustomer.name,
        customer_rut: selectedCustomer.rut,
        customer_address: notes,
        payment_method: mappedPayment,
        document_type: 'receipt',
        needs_packing: false
      };

      const result = await api('/sales', {
        method: 'POST',
        body: payload
      });

      // Prepare success data
      setSuccessSale({
        ...(result.sale||result),
        items: result.items,
        customer:selectedCustomer.name,
        customer_name:selectedCustomer.name,
        customer_rut:selectedCustomer.rut,
        document_type:'receipt',
        payment_method:paymentMethod,
        rut: customerRut,
        total: (result.sale||result).total,
        paymentMethod
      });

      // Reset state for next sale
      setCart([]);
      setDiscount(0);
      setCustomer('');
      setCustomerRut('');
      setSelectedCustomer(null);
      pageCache.current.clear();
      requestId.current = crypto.randomUUID();
      
      api('/pos/catalog?'+new URLSearchParams({page:String(catalogPage),q:query,category:selectedCategory==='Todos'?'':selectedCategory})).then(setCatalog).catch(()=>{});
      refresh?.().catch(()=>{});
      toast?.('¡Venta registrada con éxito!');
    } catch (err) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos-pro-container">
      {/* ================= TOP HEADER BAR ================= */}
      <div className="pos-pro-header">
        <div className="pos-header-left">
          <div className="pos-icon-badge">
            <ShoppingCart size={22} className="text-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="pos-main-title">Nueva venta</h1>
              <span className="pos-status-badge">
                <span className="pos-status-dot"></span>
                Venta de mostrador
              </span>
              <span className="pos-clock-badge">
                <Clock size={12} />
                {currentTime}
              </span>
            </div>
            <p className="pos-subtitle">Nexora · POS</p>
          </div>
        </div>

        <div className="pos-header-right">
          <button 
            className="pos-quick-btn"
            onClick={() => onNavigateTab?.('shifts')}
            title="Ver estado de caja y turnos"
          >
            <ShieldCheck size={16} />
            <span>Caja y turnos</span>
          </button>
        </div>
      </div>

      {/* ================= MAIN 2-COLUMN WORKSPACE ================= */}
      <div className="pos-workspace-grid">
        
        {/* ================= LEFT COLUMN: CATALOG & SEARCH (68%) ================= */}
        <div className="pos-catalog-section">
          
          {/* Search & Barcode Row */}
          <div className="pos-search-card">
            <div className="pos-search-input-wrap">
              <Search size={18} className="pos-search-icon" />
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="Buscar producto por nombre, SKU o código de barras..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleBarcodeKey}
                className="pos-search-input"
              />
              {query && (
                <button className="pos-clear-search" onClick={() => setQuery('')}>
                  <X size={15} />
                </button>
              )}
            </div>

            <button 
              className="pos-barcode-btn" 
              title="Escanear código de barras (Enter)"
              onClick={() => searchInputRef.current?.focus()}
            >
              <Barcode size={20} />
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="pos-categories-pills">
            {dynamicCategories.map(cat => (
              <button 
                key={cat}
                className={`pos-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'Todos' && <Sparkles size={13} className="mr-1 inline" />}
                {cat}
              </button>
            ))}
          </div>

<div className="pos-catalog-pagination"><span>{pageLoading?'Cargando página…':`${filteredProducts.length} productos`}</span><button disabled={catalogPage<=1} onClick={()=>setCatalogPage(p=>p-1)}>Anterior</button><b>{Math.min(catalogPage,catalogPages)} de {catalogPages}</b><button disabled={catalogPage>=catalogPages} onClick={()=>setCatalogPage(p=>p+1)}>Siguiente</button></div>{pageLoading&&<div className="pos-loading" role="status">Cargando esta página de productos…</div>}{pageError&&<p className="formError" role="alert">{pageError}</p>}          {/* Product Cards Grid */}
          <div className="pos-products-grid">
            {visibleProducts.map(p => {
              const stock = available(p);
              const inStock = stock > 0;
              const cartItem = cart.find(i => i.id === p.id);

              return (
                <div 
                  key={p.id}
                  className={`pos-card ${!inStock ? 'out-of-stock' : ''}`}
                  onClick={() => inStock && addToCart(p)}
                >
                  {/* Product Image */}
                  <div className="pos-card-img-wrap">
                    {p.image_url ? (
                      <img loading="lazy" decoding="async" src={p.image_url} alt={p.name} className="pos-card-img" />
                    ) : (
                      <div className="pos-card-placeholder">
                        <ShoppingCart size={28} className="text-gray-300" />
                      </div>
                    )}
                    {cartItem && (
                      <span className="pos-in-cart-badge">
                        {cartItem.qty} en carrito
                      </span>
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="pos-card-body">
                    <h3 className="pos-card-title" title={p.name}>{p.name}</h3>
                    <div className="pos-card-price">{money(p.price)}</div>
                    
                    <div className="pos-card-footer">
                      <span className={`pos-stock-tag ${inStock ? 'available' : 'empty'}`}>
                        {inStock ? `${stock} disponibles` : 'Agotado'}
                      </span>

                      <button 
                        className="pos-add-btn"
                        disabled={!inStock}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p);
                        }}
                        title="Agregar al carrito"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredProducts.length === 0 && !pageLoading && (
              <div className="pos-empty-catalog">
                <AlertCircle size={36} className="text-gray-400 mb-2" />
                <p className="font-bold text-gray-700 dark:text-gray-300">No se encontraron productos</p>
                <small className="text-gray-500">Prueba ajustando el término de búsqueda o la categoría</small>
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: CURRENT CART & CHECKOUT (32%) ================= */}
        <div className="pos-cart-panel">
          
          {/* Cart Header */}
          <div className="pos-cart-header">
            <div className="flex items-center gap-2">
              <h2 className="pos-cart-title">Venta actual</h2>
              <span className="pos-cart-count">({cart.reduce((a, b) => a + b.qty, 0)} ítems)</span>
            </div>
            {cart.length > 0 && (
              <button className="pos-clear-cart-btn" onClick={clearCart}>
                <Trash2 size={14} />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className={cart.length?"pos-cart-items-scroll":"pos-cart-items-scroll is-empty"}>
            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <div className="pos-empty-icon-wrap">
                  <ShoppingCart size={32} className="text-gray-400" />
                </div>
                <h4 className="font-bold text-gray-700 dark:text-gray-200">Carrito vacío</h4>
                <p className="text-xs text-gray-500 max-w-[200px]">
                  Toca cualquier producto del catálogo para agregarlo a la venta.
                </p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="pos-cart-row">
                  {/* Item Image */}
                  <div className="pos-row-img-wrap">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="pos-row-img" />
                    ) : (
                      <div className="pos-row-placeholder">
                        <ShoppingCart size={14} />
                      </div>
                    )}
                  </div>

                  {/* Title & Unit Price */}
                  <div className="pos-row-info">
                    <h4 className="pos-row-title" title={item.name}>{item.name}</h4>
                    <span className="pos-row-unit-price">{money(item.price)} c/u</span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="pos-stepper">
                    <button 
                      className="pos-step-btn" 
                      onClick={() => updateQty(item.id, item.qty - 1)}
                    >
                      <Minus size={12} />
                    </button>
                    <span className="pos-step-val">{item.qty}</span>
                    <button 
                      className="pos-step-btn" 
                      onClick={() => updateQty(item.id, item.qty + 1)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="pos-row-total">
                    {money(item.price * item.qty)}
                  </div>

                  {/* Delete Item */}
                  <button 
                    className="pos-row-delete" 
                    onClick={() => updateQty(item.id, 0)}
                    title="Eliminar ítem"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Summary Breakdown */}
          <div className="pos-summary-box">
            <div className="pos-summary-line">
              <span>Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>

            <div className="pos-summary-line discount">
              <span className="flex items-center gap-1">
                Descuento
                <button 
                  className="pos-discount-tag"
                  disabled title="Pendiente de soporte en el servidor"
                  onClick={() => setShowDiscountModal(true)}
                >
                  {discount > 0 ? `-${money(discount)}` : '+ Aplicar'}
                </button>
              </span>
              <span className="text-emerald-500 font-bold">-{money(discount)}</span>
            </div>

            <div className="pos-total-line">
              <span className="pos-total-label">Total a pagar</span>
              <span className="pos-total-amount">{money(total)}</span>
            </div>
          </div>

          <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} disabled={busy}/>
          {/* Payment Methods Grid (2x2) */}
          <div className="pos-payment-section">
            <span className="pos-payment-label">Método de pago</span>
            
            <div className="pos-payment-grid">
              <button 
                className={`pos-pay-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('cash')}
              >
                <Banknote size={17} />
                <span>Efectivo</span>
              </button>

              <button 
                className={`pos-pay-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                <CreditCard size={17} />
                <span>Tarjeta</span>
              </button>

              <button 
                className={`pos-pay-btn ${paymentMethod === 'transfer' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('transfer')}
              >
                <Building2 size={17} />
                <span>Transferencia</span>
              </button>

              <button 
                className={`pos-pay-btn ${paymentMethod === 'mixed' ? 'active' : ''}`}
                disabled title="Pendiente de soporte en el servidor" onClick={() => setPaymentMethod('mixed')}
              >
                <Layers size={17} />
                <span>Pago mixto</span>
              </button>
            </div>

            {/* Mixed Payment Details */}
            {paymentMethod === 'mixed' && (
              <div className="pos-mixed-inputs">
                <div>
                  <label className="text-[11px] font-bold text-gray-500">💵 Efectivo</label>
                  <input 
                    type="number"
                    value={mixedCash}
                    onChange={e => {
                      const v = Number(e.target.value) || 0;
                      setMixedCash(v);
                      setMixedCard(Math.max(0, total - v));
                    }}
                    className="pos-sub-input"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500">💳 Tarjeta</label>
                  <input 
                    type="number"
                    value={mixedCard}
                    onChange={e => {
                      const v = Number(e.target.value) || 0;
                      setMixedCard(v);
                      setMixedCash(Math.max(0, total - v));
                    }}
                    className="pos-sub-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error notice */}
          {error && (
            <div className="pos-error-callout">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Big Green Checkout Button */}
          <button 
            className="pos-checkout-btn"
            disabled={cart.length === 0 || busy || !selectedCustomer}
            onClick={handleCheckout}
          >
            <CreditCard size={18} />
            <span>{busy ? 'Procesando pago...' : `Cobrar ${money(total)}`}</span>
          </button>
        </div>
      </div>

      {successSale&&<div className="pos-modal-overlay"><section className="pos-sale-success" role="dialog" aria-modal="true" aria-labelledby="sale-complete-title"><div className="pos-success-icon-wrap"><CheckCircle2 size={32}/></div><h2 id="sale-complete-title">Venta registrada</h2><p>Comprobante <b>V-{String(successSale.number).padStart(6,'0')}</b></p><strong className="pos-success-total">{money(successSale.total)}</strong><dl><div><dt>Cliente</dt><dd>{successSale.customer_name}</dd></div><div><dt>RUT</dt><dd>{successSale.customer_rut}</dd></div><div><dt>Medio de pago</dt><dd>{{cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia'}[successSale.payment_method]}</dd></div><div><dt>Unidades</dt><dd>{successSale.items.reduce((n,i)=>n+i.qty,0)}</dd></div></dl><div className="pos-success-actions"><button className="outline" onClick={()=>{setReceiptModal(successSale);setSuccessSale(null);}}><Printer size={16}/>Ver e imprimir ticket</button><button className="primary" onClick={()=>{setSuccessSale(null);searchInputRef.current?.focus();}}>Nueva venta</button></div><small>Registro interno de pago. No procesa tarjetas ni emite documentos tributarios.</small></section></div>}

      {/* ================= MODAL: DISCOUNT ================= */}
      {showDiscountModal && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-base text-gray-900 dark:text-white">Aplicar Descuento</h3>
              <button onClick={() => setShowDiscountModal(false)}><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600">Monto de Descuento ($ CLP)</label>
                <input 
                  type="number"
                  defaultValue={discount || ''}
                  id="discountInputAmount"
                  placeholder="Ej: 5000"
                  className="pos-modal-input"
                />
              </div>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(pct => (
                  <button 
                    key={pct}
                    className="flex-1 py-1.5 rounded-lg border text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    onClick={() => {
                      const calculated = Math.round(subtotal * (pct / 100));
                      setDiscount(calculated);
                      setShowDiscountModal(false);
                    }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button 
                className="pos-btn-outline flex-1"
                onClick={() => {
                  setDiscount(0);
                  setShowDiscountModal(false);
                }}
              >
                Quitar Descuento
              </button>
              <button 
                className="pos-btn-primary flex-1"
                onClick={() => {
                  const val = Number(document.getElementById('discountInputAmount')?.value) || 0;
                  setDiscount(val);
                  setShowDiscountModal(false);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= RECEIPT VIEW ================= */}
      {receiptModal && (
        <Receipt sale={receiptModal} close={() => setReceiptModal(null)} />
      )}
    </div>
  );
}
