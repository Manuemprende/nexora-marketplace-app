const origin='https://evolut.cl';
export class EvolutClient{
 constructor({token,fetchImpl=fetch,delayMs=350}){if(!token)throw new Error('Falta token Evolut');this.fetch=fetchImpl;this.delayMs=delayMs;this.headers={Accept:'application/json',Authorization:'Bearer '+token};}
 async get(path){const url=new URL(path,origin);if(url.origin!==origin||!url.pathname.startsWith('/api/supplier/'))throw new Error('Ruta fuera del catálogo autorizado Evolut');const r=await this.fetch(url,{headers:this.headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Evolut HTTP '+r.status);return r.json();}
 async pages(path,onPage=()=>{}){
  const rows=[],ids=new Set(),visited=new Set();let url=path;
  for(let page=1;page<=1000;page++){
   const parsed=new URL(url,origin);if(parsed.pathname!==path||visited.has(parsed.href))throw new Error('Paginación Evolut repetida o fuera del recurso');visited.add(parsed.href);
   const result=await this.get(parsed.href);if(!Array.isArray(result.data))throw new Error('Evolut: listado inválido');
   for(const row of result.data){if(!row.id||ids.has(row.id))throw new Error('Evolut: producto repetido o sin identificador');ids.add(row.id);rows.push(row);}
   await onPage({resource:path,page,rows:result.data.length,captured:rows.length});
   const next=result.links?.next;
   if(!next){if(result.meta?.next_cursor)throw new Error('Evolut: falta enlace al cursor siguiente');return rows;}
   if(!result.data.length)throw new Error('Evolut: página vacía con cursor pendiente');url=next;
   await new Promise(resolve=>setTimeout(resolve,this.delayMs));
  }
  throw new Error('Evolut: límite de páginas, captura incompleta');
 }
 async catalog(onPage){
  const me=await this.get('/api/supplier/me');if(!me.data?.is_supplier||!/^meibo$/i.test(me.data.name?.trim()))throw new Error('Evolut: el token no corresponde al proveedor MEIBO');
  const products=await this.pages('/api/supplier/catalog/products',onPage),inventory=await this.pages('/api/supplier/inventory',onPage);
  const byId=new Map(inventory.map(p=>[p.id,p])),productIds=new Set(products.map(p=>p.id)),recovered=[],inventoryRecovered=[];
  // The inventory may expose items omitted by the catalogue cursor. Recover only
  // those exact supplier-owned IDs through the documented detail resource.
  for(const row of inventory.filter(p=>!productIds.has(p.id))){const detail=await this.get('/api/supplier/catalog/products/'+encodeURIComponent(row.id));if(detail.data?.id!==row.id)throw new Error('Evolut: ficha faltante no recuperable');products.push(detail.data);recovered.push(row.id);await new Promise(resolve=>setTimeout(resolve,this.delayMs));}
  for(const row of products.filter(p=>!byId.has(p.id))){const detail=await this.get('/api/supplier/inventory/'+encodeURIComponent(row.id));if(detail.data?.id!==row.id)throw new Error('Evolut: stock faltante no recuperable');inventory.push(detail.data);byId.set(row.id,detail.data);inventoryRecovered.push(row.id);await new Promise(resolve=>setTimeout(resolve,this.delayMs));}
  if(products.length!==inventory.length)throw new Error('Evolut: catálogo e inventario no conciliados');
  for(const p of products){if(!Number.isSafeInteger(Number(p.price))||Number(p.price)<0||p.stock==null||!Number.isSafeInteger(Number(byId.get(p.id).stock))||Number(byId.get(p.id).stock)<0)throw new Error('Evolut: precio o stock inválido');}
  return {captured_at:new Date().toISOString(),complete:true,expected:products.length,supplier_id:me.data.id,recovered_catalog_ids:recovered,recovered_inventory_ids:inventoryRecovered,products:products.map(p=>({...p,stock:Number(byId.get(p.id).stock),price:Number(p.price)})),inventory};
 }
}
