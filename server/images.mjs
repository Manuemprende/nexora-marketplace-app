import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {uuid,now} from './database.mjs';
import {fail} from './service.mjs';
export const MAX_IMAGE_BYTES=12*1024*1024;
export async function storeImage(db,input,actor){
 if(typeof input.data!=='string'||!input.data.length||input.data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||(input.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)))fail(400,'Imagen inválida o supera 12 MB');
 const source=Buffer.from(input.data,'base64');if(source.length>MAX_IMAGE_BYTES)fail(413,'La imagen supera 12 MB');
 let result;
 try{
  const image=sharp(source,{limitInputPixels:40000000,failOn:'error'}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)fail(400,'Usa una imagen estática PNG, JPG o WebP');
  result=await image.rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:4}).toBuffer({resolveWithObject:true});
 }catch(e){if(e.status)throw e;fail(400,'No se pudo leer la imagen. Usa PNG, JPG o WebP de hasta 40 megapíxeles');}
 const hash=createHash('sha256').update(result.data).digest('hex');
 let row=db.prepare('SELECT id,width,height,original_bytes,stored_bytes FROM product_images WHERE sha256=?').get(hash);
 if(!row){const id=uuid();db.prepare('INSERT INTO product_images VALUES (?,?,?,?,?,?,?,?,?)').run(id,hash,result.data,result.info.width,result.info.height,source.length,result.data.length,actor,now());row={id,width:result.info.width,height:result.info.height,original_bytes:source.length,stored_bytes:result.data.length};}
 return {...row,url:`/api/images/${row.id}.webp`};
}

