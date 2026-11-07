import {catalog,fail,text,requireVariant} from './service.mjs';
import {transaction,uuid,now} from './database.mjs';
import {normalizeName} from './dropi.mjs';

const words=name=>new Set(normalizeName(name).split(' ').filter(w=>w.length>1&&!['de','del','la','el','los','las','para','con','en'].includes(w)));
function withReferenceImages(listings){
 const dropi=new Map(listings.filter(l=>l.platform==='Dropi'&&l.can_associate&&l.image_url).map(l=>[l.product_ref,l]));
 return listings.map(row=>{if(row.image_url||row.platform!=='Dropea'||row.attributes!=='Presentación simple')return row;const reference=/^SUP_2924_(\d+)$/.exec(row.external_sku),source=reference?dropi.get(reference[1]):null;if(!source||normalizeName(source.name)!==normalizeName(row.name))return row;return {...row,image_url:source.image_url,image_source:'Referencia de origen Dropi '+source.product_ref};});
}
export function listingCandidates(row,products){
 const exact=products.filter(p=>p.active&&!p.is_demo&&normalizeName(p.name)===normalizeName(row.name));
 if(exact.length)return exact.slice(0,5).map(p=>({id:p.id,sku:p.sku,name:p.name,attributes:p.attributes,image_url:p.image_url,price:p.price,match:'Nombre exacto · revisar presentación'}));
 const tokens=words(row.name);
 return products.filter(p=>p.active&&!p.is_demo).map(p=>{const other=words(p.name),shared=[...tokens].filter(w=>other.has(w)).length;return {p,score:tokens.size+other.size?2*shared/(tokens.size+other.size):0};}).filter(x=>x.score>=0.65).sort((a,b)=>b.score-a.score).slice(0,3).map(({p})=>({id:p.id,sku:p.sku,name:p.name,attributes:p.attributes,image_url:p.image_url,price:p.price,match:'Nombre parecido · revisar variante'}));
}
export function channelCatalog(db,query){
 if(query.get('view')==='unified')return unifiedCatalog(db,query);
 const platform=query.get('platform')??'',status=query.get('status')??'',search=(query.get('q')??'').slice(0,200),page=Math.max(1,Math.min(10000,Number(query.get('page'))||1)),limit=12;
 const where=[],args=[];
 if(platform){if(!['Dropi','Dropea','Evolut','Jumpseller','Walmart'].includes(platform))fail(400,'Plataforma inválida');where.push('c.platform=?');args.push(platform);}
 if(status==='linked')where.push('c.variant_id IS NOT NULL');else if(status==='pending')where.push('c.variant_id IS NULL');else if(status==='variants')where.push('c.can_associate=0');
 if(search){where.push('(c.name LIKE ? OR c.external_sku LIKE ? OR c.product_ref LIKE ? OR v.meibo_sku LIKE ?)');args.push(...Array(4).fill('%'+search+'%'));}
 const clause=where.length?' WHERE '+where.join(' AND '):'',join=' FROM channel_listings c LEFT JOIN variants v ON v.id=c.variant_id';
 const total=db.prepare('SELECT COUNT(*) n'+join+clause).get(...args).n;
 let rows=db.prepare('SELECT c.*,v.meibo_sku master_sku'+join+clause+" ORDER BY (c.variant_id IS NOT NULL) DESC,c.name,c.id LIMIT ? OFFSET ?").all(...args,limit,(page-1)*limit);
 const referenced=new Map(withReferenceImages(db.prepare('SELECT * FROM channel_listings').all()).map(row=>[row.id,row]));rows=rows.map(row=>({...row,image_url:referenced.get(row.id)?.image_url??row.image_url,image_source:referenced.get(row.id)?.image_source}));
 const products=catalog(db);for(const row of rows)row.candidates=row.variant_id?[]:listingCandidates(row,products);
 const channels=db.prepare('SELECT platform,COUNT(DISTINCT product_ref) products,COUNT(*) listings,SUM(variant_id IS NOT NULL) linked,SUM(can_associate=0) incomplete,MAX(captured_at) captured_at FROM channel_listings GROUP BY platform').all();
 return {rows,total,page,pages:Math.max(1,Math.ceil(total/limit)),channels,web_variants:products.filter(p=>!p.is_demo&&p.source_url.includes('meibo.cl')).length};
}
export function unifiedCatalog(db,query){
 const products=catalog(db).filter(p=>p.active&&!p.is_demo),listings=withReferenceImages(db.prepare('SELECT * FROM channel_listings ORDER BY name,id').all());
 const linkedPlatforms=new Set(listings.filter(l=>l.variant_id).map(l=>l.variant_id+':'+l.platform));
 const grouped=new Map(products.map(p=>[p.id,{id:p.id,master_id:p.id,master_sku:p.sku,name:p.name,attributes:p.attributes,image_url:p.image_url,channels:{},pending:false,product_id:p.product_id}]));
 for(const p of products){const row=grouped.get(p.id);
  if(p.source_url.includes('meibo.cl')&&!linkedPlatforms.has(p.id+':Jumpseller'))row.channels.Jumpseller=[{name:p.name,price:p.price,currency:'CLP',source_url:p.source_url,source:'web',product_ref:'',variant_ref:'',image_url:p.image_url}];
  for(const c of p.external_codes){if(!['Dropi','Dropea','Evolut','Jumpseller','Walmart'].includes(c.platform))continue;if(linkedPlatforms.has(p.id+':'+c.platform))continue;if(c.platform==='Jumpseller'&&row.channels.Jumpseller){row.channels.Jumpseller[0].product_ref=c.code;continue;}row.channels[c.platform]=[{name:p.name,price:c.price,currency:'CLP',product_ref:c.code,variant_ref:'',source:'code',image_url:p.image_url}];}
 }
 const unlinked=[];
 for(const listing of listings){if(listing.variant_id&&grouped.has(listing.variant_id)){const row=grouped.get(listing.variant_id);(row.channels[listing.platform]??=[]).push(listing);if(!row.image_url&&listing.image_url)row.image_url=listing.image_url;}else if(!listing.variant_id){unlinked.push({id:listing.id,master_id:null,master_sku:null,name:listing.name,attributes:listing.attributes,image_url:listing.image_url,image_source:listing.image_source,channels:{[listing.platform]:[listing]},pending:true,listing_id:listing.id,can_associate:listing.can_associate});}}
 for(const row of grouped.values()){row.pending=Object.keys(row.channels).length<2;row.incomplete=Object.values(row.channels).flat().some(l=>l.can_associate===0);}
 let rows=[...grouped.values(),...unlinked];
 const platform=query.get('platform')??'',status=query.get('status')??'',search=normalizeName((query.get('q')??'').slice(0,200));
 if(platform&&!['Dropi','Dropea','Evolut','Jumpseller','Walmart'].includes(platform))fail(400,'Plataforma inválida');
 if(platform)rows=rows.filter(row=>row.channels[platform]?.length);
 if(status==='linked')rows=rows.filter(row=>row.master_id&&Object.keys(row.channels).length>1);
 if(status==='pending')rows=rows.filter(row=>row.pending);
 if(status==='variants')rows=rows.filter(row=>row.incomplete||(!row.master_id&&!row.can_associate));
 if(query.get('exclude'))rows=rows.filter(row=>row.id!==query.get('exclude'));
 if(query.get('similar')||query.get('compare')){const tokens=words(query.get('similar')||query.get('compare'));rows=rows.map(row=>{const other=words(row.name),shared=[...tokens].filter(w=>other.has(w)).length;return {...row,similarity:tokens.size+other.size?2*shared/(tokens.size+other.size):0};}).filter(row=>!query.get('similar')||row.similarity>=0.25);}
 if(search)rows=rows.filter(row=>normalizeName([row.name,row.master_sku,row.attributes,...Object.values(row.channels).flat().flatMap(c=>[c.external_sku,c.product_ref,c.variant_ref])].join(' ')).includes(search));
 rows.sort((a,b)=>(b.similarity??0)-(a.similarity??0)||Number(!!b.master_id)-Number(!!a.master_id)||Number(Object.keys(b.channels).length>1)-Number(Object.keys(a.channels).length>1)||a.name.localeCompare(b.name,'es'));
 const total=rows.length,requested=query.get('limit'),limit=requested==='all'?Math.max(1,total):Math.min(10000,Math.max(1,Math.floor(Number(requested)||12))),pages=Math.max(1,Math.ceil(total/limit)),page=Math.min(pages,Math.max(1,Math.floor(Number(query.get('page'))||1)));
 const selected=rows.slice((page-1)*limit,page*limit);
 for(const row of selected)if(row.pending&&!row.master_id){const listing=listings.find(l=>l.id===row.listing_id);const candidates=listingCandidates(listing,products);row.candidates=candidates;/* Use a confirmed master's image only for that same association. */}
 const channels=db.prepare('SELECT platform,COUNT(DISTINCT product_ref) products,COUNT(*) listings,SUM(variant_id IS NOT NULL) linked,SUM(can_associate=0) incomplete,MAX(captured_at) captured_at FROM channel_listings GROUP BY platform').all();
 return {rows:selected,total,page,pages,channels,web_variants:products.filter(p=>p.source_url.includes('meibo.cl')).length};
}
export function associateListing(db,id,input,actor){
 const evidence=text(input.evidence,'Validación de la asociación',1000,true);if(evidence.length<20)fail(400,'Indica cómo verificaste producto y presentación');
 return transaction(db,()=>{
  const row=db.prepare('SELECT * FROM channel_listings WHERE id=?').get(id);if(!row)fail(404,'Publicación no encontrada');
  if(!row.can_associate)fail(409,'Faltan los atributos de la variante en origen');
  if(row.currency!=='CLP'||!Number.isSafeInteger(row.price)||row.price<0)fail(409,'Revisar moneda y precio antes de asociar');
  const target=requireVariant(db,input.variant_id);if(!target.active)fail(409,'SKU inactivo');
  if(row.variant_id){if(row.variant_id===target.id)return {ok:true,idempotent:true};fail(409,'Esta publicación ya está asociada a otro SKU');}
  const code=row.variant_ref||row.product_ref;
  const existing=db.prepare('SELECT * FROM external_codes WHERE platform=? AND code=?').get(row.platform,code);
  if(existing&&existing.variant_id!==target.id)fail(409,'El código ya está asociado a otro SKU');
  // Multiple remote publications may point to a single physical variant.
  if(!existing&&!db.prepare('SELECT id FROM external_codes WHERE variant_id=? AND platform=?').get(target.id,row.platform))db.prepare('INSERT INTO external_codes(id,variant_id,platform,code,origin,created_at,price) VALUES (?,?,?,?,?,?,?)').run(uuid(),target.id,row.platform,code,'Conciliación catálogo autenticado',now(),row.price);
  db.prepare('UPDATE channel_listings SET variant_id=?,linked_at=?,linked_by=?,evidence=? WHERE id=?').run(target.id,now(),actor,evidence,id);
  db.prepare('INSERT INTO channel_link_events VALUES (?,?,?,?,?,?)').run(uuid(),id,target.id,actor,evidence,now());
  return {ok:true};
 });
}
