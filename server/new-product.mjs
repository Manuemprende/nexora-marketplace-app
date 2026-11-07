import {createVariant,operation,fail} from './service.mjs';
import {savePublication,publicationList,publicationChannels} from './publications.mjs';
export function createProductWithPublications(db,input,actor){
 if(!Array.isArray(input.publications)||input.publications.length>publicationChannels.length)fail(400,'Selecciona plataformas válidas');
 if(new Set(input.publications.map(d=>d.platform)).size!==input.publications.length)fail(400,'Plataformas repetidas');
 for(const draft of input.publications){if(!publicationChannels.some(c=>c.name===draft.platform))fail(400,'Plataforma inválida');if(draft.platform==='Jumpseller'&&Number(draft.price)!==Number(input.price))fail(400,'Jumpseller y punto de venta deben tener el mismo precio');}
 return operation(db,actor,input.request_id,{kind:'create-product-publications',input},()=>{
  const product=createVariant(db,input,actor,{inTransaction:true});
  for(const draft of input.publications)savePublication(db,product.id,{...draft,name:input.name,description:input.description??'',image_url:input.image_url??'',stock:draft.stock??0});
  return {...product,publication:publicationList(db,product.id)};
 });
}
