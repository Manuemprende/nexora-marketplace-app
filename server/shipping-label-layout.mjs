import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {fail} from './service.mjs';

// Coordinates verified against the actual JS manual Bluexpress 4x6 label.
// No scaling, translation or covering of the carrier's original content.
export async function labelWithReferences(original,{platform,reference,items,fulfillment}){
 const pdf=await PDFDocument.load(original),pages=pdf.getPages();
 const page=pages[0],size=page.getSize();
 if(platform!=='Jumpseller'||fulfillment?.type!=='manual'||fulfillment?.tracking_company!=='bluexpress'||pages.length!==1||page.getRotation().angle!==0||Math.abs(size.width-288)>.1||Math.abs(size.height-432)>.1)
  fail(409,'Este formato de etiqueta todavía requiere validar el espacio para los SKU. La etiqueta original sigue disponible.');
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),width=270;
 const printable=value=>String(value??'').normalize('NFC').replace(/[\r\n\t]/g,' ').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');
 const wrap=(text,max)=>{const words=printable(text).split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,7)>max){if(line)lines.push(line);line=word;if(font.widthOfTextAtSize(word,7)>max)fail(409,'Un identificador es demasiado largo para esta etiqueta. Requiere otro formato de impresión.');}else line=next;}if(line)lines.push(line);return lines;};
 const rows=items.map(item=>({master:wrap(item.master_sku,88),source:wrap(item.source_code,140),qty:String(item.qty)}));
 const rowHeight=row=>Math.max(row.master.length,row.source.length)*9;
 if(!rows.length||rows.reduce((n,r)=>n+rowHeight(r),0)>27)fail(409,'Los SKU de este pedido no caben en el espacio libre de esta etiqueta. Requiere un formato ampliado.');
 const draw=(text,x,y,fontSize=7,face=font)=>page.drawText(printable(text),{x,y,size:fontSize,font:face,color:rgb(0,0,0)});
 page.drawLine({start:{x:9,y:67},end:{x:9+width,y:67},thickness:.5,color:rgb(0,0,0)});
 draw('MEIBO  /  JS '+reference,10,56,8,bold);
 let y=42;for(const row of rows){row.master.forEach((text,i)=>draw(text,10,y-i*9,7,bold));row.source.forEach((text,i)=>draw(text,103,y-i*9));draw('×'+row.qty,253,y,7,bold);y-=rowHeight(row);}
 return Buffer.from(await pdf.save());
}
