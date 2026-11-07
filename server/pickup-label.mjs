import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {fail} from './service.mjs';
const channelInitials=platform=>({Jumpseller:'JS',Dropi:'DI',Dropea:'DP',Evolut:'EV',Walmart:'WM'})[platform]||'OT';
export async function pickupLabel(order){
 if(order?.external?.shipping_option!=='store_pickup')fail(409,'Este pedido no corresponde a retiro en local');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),pageWidth=100*72/25.4,pageHeight=150*72/25.4,width=pageWidth-32;
 const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');
 function wrap(text,size,face=font,max=width){const result=[];let line='';for(const word of clean(text).split(/\s+/)){if(face.widthOfTextAtSize(word,size)>max){if(line){result.push(line);line='';}let part='';for(const char of word){if(face.widthOfTextAtSize(part+char,size)>max){result.push(part);part='';}part+=char;}line=part;continue;}const next=line?line+' '+word:word;if(face.widthOfTextAtSize(next,size)>max){result.push(line);line=word;}else line=next;}if(line.trim())result.push(line.trim());return result;}
 const data=order.external,a=data.pickup_address??{},sigla=channelInitials(order.platform);let page,y;
 const draw=(text,x,yy,size=9,face=font)=>page.drawText(clean(text),{x,y:yy,size,font:face,color:rgb(0,0,0)});
 function newPage(){page=pdf.addPage([pageWidth,pageHeight]);y=pageHeight-30;draw('MEIBO',16,y,18,bold);const ref=sigla+' '+order.external_reference;draw(ref,pageWidth-16-bold.widthOfTextAtSize(ref,13),y+1,13,bold);y-=19;draw('PED-'+String(order.number).padStart(5,'0'),16,y,8);y-=14;page.drawLine({start:{x:16,y},end:{x:pageWidth-16,y},thickness:.7});page.drawRectangle({x:16,y:16,width,height:42,borderWidth:1.2,borderColor:rgb(0,0,0)});const title='RETIRO EN LOCAL',size=19;draw(title,(pageWidth-bold.widthOfTextAtSize(title,size))/2,31,size,bold);y-=22;}
 function text(text,size=9,face=font){for(const line of wrap(text,size,face)){if(y<82)newPage();draw(line,16,y,size,face);y-=size+4;}}
 newPage();text('CLIENTE',7,bold);y-=3;text(data.customer?.name||order.customer_name,10,bold);if(data.customer?.phone)text(data.customer.phone,9);y-=13;text('PUNTO DE RETIRO',7,bold);y-=3;text(a.pickup_place_name||'Local MEIBO',10,bold);text([a.address,a.street_number,a.complement].filter(Boolean).join(' '),9);text([...new Set([a.municipality,a.city].filter(Boolean))].join(', '),9);y-=10;page.drawLine({start:{x:16,y},end:{x:pageWidth-16,y},thickness:.6});y-=22;
 for(const item of order.items){
  const productName=item.product.name.replace(/\s*,\s*/g,', '),name=wrap(productName,10,bold),codes=wrap(item.product.sku+'  /  '+item.source_code,9,bold,width-45),needed=name.length*14+codes.length*13+30;
  if(y-needed<80)newPage();text(productName,10,bold);y-=8;const codeY=y;for(const code of codes){draw(code,16,y,9,bold);y-=13;}const qty='× '+item.qty;draw(qty,pageWidth-16-bold.widthOfTextAtSize(qty,12),codeY,12,bold);y-=9;page.drawLine({start:{x:16,y:y+3},end:{x:pageWidth-16,y:y+3},thickness:.4});y-=19;
 }
 return Buffer.from(await pdf.save());
}
