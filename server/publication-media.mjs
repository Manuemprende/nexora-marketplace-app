import sharp from 'sharp';
import {uuid,now} from './database.mjs';
import {fail} from './service.mjs';
export function publicationImageUrl(db,path,base,format='webp'){
 if(!['webp','jpg'].includes(format))fail(400,'Formato de imagen no admitido');
 const match=/^\/api\/images\/([a-f0-9-]{36})\.webp$/.exec(path);if(!match)fail(400,'Imagen de producto inválida');
 let origin;try{const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error();origin=url.origin;}catch{fail(409,'Falta configurar el dominio público de las imágenes');}
 if(!db.prepare('SELECT id FROM product_images WHERE id=?').get(match[1]))fail(404,'Imagen no encontrada');
 let media=db.prepare('SELECT id FROM publication_media WHERE image_id=?').get(match[1]);
 if(!media){media={id:uuid()};db.prepare('INSERT INTO publication_media(id,image_id,created_at) VALUES (?,?,?)').run(media.id,match[1],now());}
 return origin+'/api/public-product-images/'+media.id+'.'+format;
}
export function publicProductImage(db,id){return db.prepare('SELECT p.content FROM publication_media m JOIN product_images p ON p.id=m.image_id WHERE m.id=?').get(id);}

export async function publicProductJpeg(db,id){
 const row=db.prepare('SELECT m.jpeg_content,p.content FROM publication_media m JOIN product_images p ON p.id=m.image_id WHERE m.id=?').get(id);if(!row)return null;
 if(row.jpeg_content)return {content:row.jpeg_content};
 const jpeg=await sharp(Buffer.from(row.content)).flatten({background:'#ffffff'}).jpeg({quality:88}).toBuffer();
 db.prepare('UPDATE publication_media SET jpeg_content=? WHERE id=? AND jpeg_content IS NULL').run(jpeg,id);
 return {content:jpeg};
}
