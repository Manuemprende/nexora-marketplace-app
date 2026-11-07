// Draft-only data. This does not enable the unverified Dropi writer.
export function normalizeDropiFields(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ficha Dropi inválida');
 const result={};
 for(const key of ['weight_g','length_cm','width_cm','height_cm','warehouse_id']){
  const raw=value[key];if(raw==null||raw===''){result[key]='';continue;}
  const n=Number(raw);if(!Number.isFinite(n)||n<=0||(key==='warehouse_id'&&!Number.isSafeInteger(n))||(key==='weight_g'&&n>25000))throw Error('Revisa '+({weight_g:'el peso Dropi (máximo 25.000 g)',length_cm:'el largo Dropi',width_cm:'el ancho Dropi',height_cm:'el alto Dropi',warehouse_id:'el identificador de bodega Dropi'}[key]));result[key]=n;
 }
 if(value.images!=null&&!Array.isArray(value.images))throw Error('Imágenes Dropi inválidas');
 result.images=[...new Set((value.images??[]).map(u=>String(u).trim()).filter(Boolean))];
 if(result.images.length>10||result.images.some(u=>u.length>2000||!(/^\/api\/images\/[a-f0-9-]{36}\.webp$/.test(u)||/^https:\/\/[^\s]+$/.test(u))))throw Error('Usa imágenes guardadas en MEIBO o enlaces HTTPS válidos');
 return result;
}
