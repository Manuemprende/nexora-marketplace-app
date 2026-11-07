import {readFileSync} from 'node:fs';
import {fail} from './service.mjs';
const schema=JSON.parse(readFileSync(new URL('./schemas/walmart-cl-4.46.json',import.meta.url),'utf8'));
const item=schema.properties.MPItem.items,orderable=item.properties.Orderable,visible=item.properties.Visible;
const mapped=new Set(['sku','productName','price','mainImageUrl','shortDescription']);
export const walmartCategories=()=>Object.keys(visible.properties).map(name=>({id:name,name}));
export function walmartFields(category){
 const s=visible.properties[category];
 return {version:'4.46',orderable:{...orderable,properties:Object.fromEntries(Object.entries(orderable.properties).filter(([k])=>orderable.required.includes(k)&&!mapped.has(k))),required:orderable.required.filter(k=>!mapped.has(k))},visible:s?{...s,properties:Object.fromEntries(Object.entries(s.properties).filter(([k])=>s.required?.includes(k)))}:null};
}
function validate(s,v,path,errors){
 if(v===undefined||v===null||v===''){errors.push(path+': obligatorio');return;}
 const type=s.type;
 if(type==='object'){
  if(typeof v!=='object'||Array.isArray(v)){errors.push(path+': formato inválido');return;}
  for(const k of s.required??[])if(v[k]===undefined)errors.push(path+'.'+(s.properties?.[k]?.title||k)+': obligatorio');
  for(const [k,x] of Object.entries(v)){if(!s.properties?.[k]){if(s.additionalProperties===false)errors.push(path+'.'+k+': campo no permitido');}else validate(s.properties[k],x,path+'.'+(s.properties[k].title||k),errors);}
  if(s.oneOf&&s.oneOf.filter(x=>(x.required??[]).every(k=>v[k]!==undefined)).length!==1)errors.push(path+': selecciona una categoría');
 }else if(type==='array'){
  if(!Array.isArray(v)){errors.push(path+': requiere una lista');return;}
  if(v.length<(s.minItems??0))errors.push(path+': agrega al menos '+s.minItems+' valor(es)');
  v.forEach((x,i)=>validate(s.items,x,path+' ['+(i+1)+']',errors));
 }else if(type==='number'||type==='integer'){
  if(typeof v!=='number'||!Number.isFinite(v)||type==='integer'&&!Number.isInteger(v))errors.push(path+': número inválido');
  else if(v<(s.minimum??-Infinity)||v>(s.maximum??Infinity)||s.multipleOf&&Math.abs(v/s.multipleOf-Math.round(v/s.multipleOf))>1e-5)errors.push(path+': fuera del rango o precisión permitidos');
 }else if(type==='string'){
  if(typeof v!=='string'||v.length<(s.minLength??0)||v.length>(s.maxLength??Infinity))errors.push(path+': texto inválido');
  if(s.format==='uri'){try{const u=new URL(v);if(!['https:','http:'].includes(u.protocol))throw Error();}catch{errors.push(path+': URL inválida');}}
 }
 if(s.enum&&!s.enum.includes(v))errors.push(path+': elige una opción válida');
}
export function buildWalmartFeed(p,d){
 if(!visible.properties[d.category_id])fail(400,'Selecciona una categoría de Walmart Chile');
 const w=d.walmart??{},data={MPItemFeedHeader:{sellingChannel:'marketplace',processMode:'MERGE',subset:'EXTERNAL',locale:'es',version:'4.46',mart:'WALMART_CHILE'},MPItem:[{Orderable:{...(w.orderable??{}),sku:p.sku,productName:d.name,price:d.price,mainImageUrl:d.image_url,shortDescription:d.description},Visible:{[d.category_id]:w.visible??{}}}]};
 const errors=[];validate(schema,data,'Walmart',errors);
 const ids=data.MPItem[0].Orderable.productIdentifiers;
 if(ids&&['EAN','UPC','GTIN'].includes(ids.productIdType)){
  const length={EAN:13,UPC:12,GTIN:14}[ids.productIdType],n=ids.productId??'';
  if(!new RegExp('^\\d{'+length+'}$').test(n))errors.push('Código '+ids.productIdType+': requiere '+length+' dígitos');
  else{let sum=0;for(let i=n.length-2,j=0;i>=0;i--,j++)sum+=Number(n[i])*(j%2===0?3:1);if((10-sum%10)%10!==Number(n.at(-1)))errors.push('Código de barras: dígito verificador incorrecto');}
 }
 if(errors.length)fail(400,errors.slice(0,12).join('; ')+(errors.length>12?`; faltan revisar ${errors.length-12} campos más`:''));
 return data;
}
