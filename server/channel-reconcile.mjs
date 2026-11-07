import {normalizeName} from './dropi.mjs';
const simple=r=>r.can_associate&&['Presentación simple','Presentación publicada','Presentación catálogo Evolut'].includes(r.attributes);
const sku=r=>(r.external_sku??'').trim().toUpperCase();
const canonical=name=>normalizeName(name.replace(/^(?:Q|M|S|L|C|F|X|W|TG|JP|GR|GRX|SN|SÑ)\s*[-–.:]+\s*/i,''));
const meaningful=(code,name)=>code&&canonical(code)!==canonical(name)&&! /^(?:0+|\d{1,2}|N\/?A|SIN SKU|UNICO|SKU|NULL(?:[-_].*)?|UNDEFINED(?:[-_].*)?|-\d(?:_.*)?)$/.test(code);
const asset=url=>{try{return decodeURIComponent(new URL(url).pathname.split('/').pop()).toLowerCase();}catch{return '';}};
export function qualifiedCatalogPairs(rows){
 const groups=new Map(),skuCounts=new Map();
 for(const r of rows){const n=normalizeName(r.name);if(!groups.has(n))groups.set(n,[]);groups.get(n).push(r);const k=r.platform+':'+sku(r);skuCounts.set(k,(skuCounts.get(k)??0)+1);}
 const pairs=[];
 for(const [name,group] of groups){
  const eligible=group.filter(simple).filter(r=>group.filter(x=>x.platform===r.platform).length===1);
  for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
   const a=eligible[i],b=eligible[j];if(a.platform===b.platform)continue;let rule='';const code=sku(a);
   if(code===sku(b)&&meaningful(code,a.name)&&skuCounts.get(a.platform+':'+code)===1&&skuCounts.get(b.platform+':'+code)===1)rule='same_sku';
   const d=[a,b].find(r=>r.platform==='Dropi'),dp=[a,b].find(r=>r.platform==='Dropea');
   if(!rule&&d&&dp&&dp.external_sku==='SUP_2924_'+d.product_ref)rule='explicit_reference';
   const file=asset(a.image_url);if(!rule&&file.length>=16&&!/placeholder|default|logo|no.image/.test(file)&&file===asset(b.image_url))rule='same_asset';
   if(rule)pairs.push({a:a.id,b:b.id,a_name:a.name,b_name:b.name,rule,evidence:`Nombre normalizado idéntico y presentación simple única por canal. Evidencia adicional ${rule}: ${rule==='same_sku'?code:rule==='explicit_reference'?dp.external_sku:file}.`});
  }
 }
 // An exact unique origin code disambiguates publications with repeated names.
 // Match those records one by one; never collapse all namesakes together.
 const byCode=new Map(),dropiById=new Map();
 for(const row of rows.filter(simple)){
  const code=sku(row);if(meaningful(code,row.name)){if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(row);}
  if(row.platform==='Dropi')dropiById.set(row.product_ref,row);
 }
 for(const [code,group] of byCode)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
  const a=group[i],b=group[j];
  if(a.platform===b.platform||skuCounts.get(a.platform+':'+code)!==1||skuCounts.get(b.platform+':'+code)!==1||canonical(a.name)!==canonical(b.name))continue;
  pairs.push({a:a.id,b:b.id,a_name:a.name,b_name:b.name,rule:'unique_code_disambiguation',evidence:`Código de origen único e idéntico ${code}, presentación simple y nombre idéntico salvo prefijo de proveedor. Los nombres repetidos se resuelven por código, sin unir otras publicaciones homónimas.`});
 }
 for(const dp of rows.filter(r=>r.platform==='Dropea'&&simple(r))){
  const match=/^SUP_2924_(\d+)$/.exec(dp.external_sku),d=match?dropiById.get(match[1]):null;
  if(!d||skuCounts.get('Dropea:'+sku(dp))!==1||canonical(d.name)!==canonical(dp.name))continue;
  pairs.push({a:d.id,b:dp.id,a_name:d.name,b_name:dp.name,rule:'exact_product_reference_disambiguation',evidence:`Referencia explícita y única de proveedor ${dp.external_sku} al ID Dropi ${d.product_ref}, nombres compatibles y presentación simple. Asociación de estos ID concretos; otras publicaciones de igual nombre quedan independientes.`});
 }
 const seen=new Set();return pairs.filter(p=>{const key=[p.a,p.b].sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
