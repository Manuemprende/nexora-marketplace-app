import React, { useEffect, useState } from 'react';
import { PackageCheck, CheckCircle2, ArrowRight, Eye, ScanBarcode, Package } from 'lucide-react';
import { Heading, ProductImage, Modal, Field, SearchBox } from '../components/Common';
import { PreparationStatus, PreparationMetrics } from '../components/Preparation';
import { api, date } from '../services/api';
import ProductLookup from './Scan';

export default function Packing({role,refreshInventory,toast}) {
  const [orders,setOrders]=useState([]),[selectedId,setSelectedId]=useState(null),[filter,setFilter]=useState('open'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[photo,setPhoto]=useState(null),[newOrder,setNewOrder]=useState(false),[lookup,setLookup]=useState(false);
  async function load(){const rows=await api('/orders');setOrders(rows);return rows;}
  useEffect(()=>{load().catch(e=>setError(e.message));const timer=setInterval(()=>load().catch(()=>{}),5000);return()=>clearInterval(timer);},[]);
  const selected=orders.find(o=>o.id===selectedId);
  const visible=orders.filter(o=>(filter==='all'||(filter==='open'?['pending','packing'].includes(o.status):o.status===filter))&&`${o.number} ${o.customer_name} ${o.platform} ${o.external_reference}`.toLowerCase().includes(query.toLowerCase()));
  const label=o=>({pending:'Por preparar',packing:'En preparación',packed:'Listo para entregar',cancelled:'Cancelado'}[o.status]);
  function open(o){setSelectedId(o.id);setError('');}
  async function mutate(path,body,message){setBusy(true);setError('');try{await api(path,{method:'POST',body:{...body,request_id:crypto.randomUUID()}});await load();await refreshInventory();if(message)toast(message);}catch(e){setError(e.message);await load().catch(()=>{});}finally{setBusy(false);}}
  function prepare(){return mutate(`/orders/${selected.id}/complete`,{items:selected.items.map(i=>({id:i.id,qty:i.qty}))},'Pedido preparado · Listo para entregar');}
  function cancel(){if(confirm('¿Cancelar este pedido?'))mutate(`/orders/${selected.id}/cancel`,{},'Pedido cancelado');}
  const blocked=!!selected?.stock_issues?.length,active=selected&&['pending','packing'].includes(selected.status);
  const total=selected?.items.reduce((n,i)=>n+i.qty,0)||0;
  return <><Heading eyebrow="BODEGA" title="Empaque" subtitle="Pedidos, preparación y verificación de productos."><div className="headingActions"><button className="outline" onClick={()=>setLookup(true)}><ScanBarcode size={16}/>Buscar código</button>{role==='admin'&&<><button className="primary" onClick={()=>setNewOrder(true)}>Nuevo pedido</button></>}</div></Heading>
  {role==='admin'&&<PreparationMetrics orders={orders}/>}
  <div className="callout"><Package size={20}/><p>Los pedidos del POS aparecen aquí al elegir «Enviar a empaque». No hay recepción automática desde plataformas externas.</p></div>
  <div className="packingWorkspace"><aside className="panel orderQueue"><div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar pedido, cliente u origen"/><select aria-label="Estado de pedidos" value={filter} onChange={e=>setFilter(e.target.value)}><option value="open">Pendientes y en preparación</option><option value="packed">Listos para entregar</option><option value="cancelled">Cancelados</option><option value="all">Todos los pedidos</option></select></div>
  {visible.map(o=><button key={o.id} disabled={busy} className={'orderCard '+(o.id===selectedId?'selected':'')} onClick={()=>open(o)}><div className="orderCardTop"><b>PED-{String(o.number).padStart(5,'0')}</b><span className={'tag '+(o.status==='packed'?'success':o.stock_issues?.length?'danger':'neutral')}>{o.stock_issues?.length?'Falta stock':label(o)}</span></div><div className="orderPreview"><ProductImage product={o.items[0].product}/><div><strong>{o.customer_name}</strong><small>{o.items.length} productos · {o.items.reduce((n,i)=>n+i.qty,0)} unidades</small></div><ArrowRight size={17}/></div><div className="orderCardBottom"><span className="sourceBadge">{o.platform}</span><small>{o.external_reference}</small></div></button>)}{!visible.length&&<p className="empty">Sin pedidos para este filtro.</p>}</aside>
  <section className="panel orderDetail">{selected?<><div className="panelTitle"><div><span className="eyebrow">{selected.platform} · {selected.external_reference}</span><h2>PED-{String(selected.number).padStart(5,'0')}</h2></div><span className={'tag '+(selected.status==='packed'?'success':'warning')}>{label(selected)}</span></div><p className="muted">{selected.customer_name}</p>
  <PreparationStatus order={selected}/>
  <div className="packingProgress"><span>Contenido del paquete</span><strong>{selected.items.length} productos · {total} unidades</strong></div>
  {selected.items.map(i=><div className="packingLine" key={i.id}><ProductImage product={i.product}/><div className="grow"><b>{i.product.name}</b><small>SKU MEIBO: {i.product.sku}{i.product.attributes?` · ${i.product.attributes}`:''}</small><small>Origen: {selected.platform==='POS'?'Punto de venta (POS)':selected.platform}{i.source_code&&i.source_code.toLowerCase()!==i.product.sku.toLowerCase()?` · Código externo: ${i.source_code}`:''}</small></div><div className="lineQuantity"><b>× {i.qty}</b><div className="headingActions"><button className="outline viewPackingProduct" onClick={()=>setPhoto(i)}><Eye size={17}/>Ver producto</button></div></div></div>)}
  {selected.status==='packed'?<div className="packingComplete"><CheckCircle2 size={24}/><div><b>Pedido preparado · Listo para entregar</b><small>Preparación guardada y stock actualizado.</small></div></div>:active&&<div className="packageAction"><p>{selected.preparation_started_at?'Confirma cuando todo el paquete esté preparado.':'Inicia la preparación del paquete completo.'}</p><button className="primary" disabled={busy||blocked} onClick={()=>selected.preparation_started_at?prepare():mutate(`/orders/${selected.id}/start`,{},'Preparación iniciada')}><PackageCheck size={18}/>{busy?'Guardando…':selected.preparation_started_at?'Pedido preparado':'Iniciar preparación'}</button></div>}
  {error&&<p className="formError" role="alert">{error}</p>}{role==='admin'&&active&&selected.stock_policy==='reserved'&&<button className="link cancelOrder" disabled={busy} onClick={cancel}>Cancelar pedido</button>}</>:<div className="packingIntro"><PackageCheck size={48}/><h2>Selecciona un pedido</h2><p>Revisa sus productos y prepara las unidades indicadas.</p></div>}</section></div>
  {!selected&&error&&<p className="formError" role="alert">{error}</p>}{photo&&<Modal title="Revisar producto" onClose={()=>setPhoto(null)}><div className="reviewProduct"><ProductImage product={photo.product} large/><div><span className="masterSku">{photo.product.sku}</span><h2>{photo.product.name}</h2><p>{photo.product.attributes}</p><b className="quantityTarget">Cantidad del paquete: {photo.qty} unidades</b></div></div><div className="formActions"><button className="outline" onClick={()=>setPhoto(null)}>Volver al pedido</button></div></Modal>}{lookup&&<Modal title="Buscar producto por código" onClose={()=>setLookup(false)}><ProductLookup/></Modal>}{newOrder&&<OrderForm close={()=>setNewOrder(false)} saved={async id=>{await load();await refreshInventory();setFilter('open');setSelectedId(id);}}/>}</>;
}
function OrderForm({close,saved}) {
  const [products,setProducts]=useState([]),[lines,setLines]=useState([]),[customer,setCustomer]=useState(''),[reference,setReference]=useState(''),[platform,setPlatform]=useState('Manual'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[requestId]=useState(()=>crypto.randomUUID());
  useEffect(()=>{api('/catalog').then(setProducts).catch(e=>setError(e.message));},[]);
  async function submit(e){e.preventDefault();setBusy(true);try{const result=await api('/orders',{method:'POST',body:{platform,external_reference:reference,customer_name:customer,items:lines,request_id:requestId}});await saved(result.id);close();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="Nuevo pedido local" onClose={close}><p>Registro de pedidos manuales. Si hay stock para todas las líneas, se reserva completo. Si falta algún producto, el pedido queda bloqueado hasta reponerlo.</p><form onSubmit={submit}><div className="formGrid"><Field label="Cliente" required value={customer} onChange={e=>setCustomer(e.target.value)}/><Field label="Referencia de pedido" required value={reference} onChange={e=>setReference(e.target.value)}/><label className="field">Origen<select value={platform} onChange={e=>setPlatform(e.target.value)}>{['Manu','Manual','Dropi','Dropea','Evolut','Jumpseller'].map(p=><option key={p}>{p}</option>)}</select></label><label className="field">Agregar producto<select value="" onChange={e=>{const id=e.target.value;if(id&&!lines.some(i=>i.id===id))setLines([...lines,{id,qty:1}]);}}><option value="">Selecciona un producto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label></div>{lines.map(line=><div className="item" key={line.id}><div className="grow"><b>{products.find(p=>p.id===line.id)?.name}</b></div><input aria-label={'Unidades '+line.id} className="qtyInput" type="number" min="1" required value={line.qty} onChange={e=>setLines(lines.map(i=>i.id===line.id?{...i,qty:Number(e.target.value)}:i))}/><button type="button" className="iconButton" aria-label="Quitar línea" onClick={()=>setLines(lines.filter(i=>i.id!==line.id))}>×</button></div>)}{error&&<p className="formError" role="alert">{error}</p>}<div className="formActions"><button className="primary" disabled={busy||!lines.length}>{busy?'Creando…':'Guardar pedido y revisar stock'}</button></div></form></Modal>;
}













