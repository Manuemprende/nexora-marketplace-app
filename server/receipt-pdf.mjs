import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {receiptTotals} from './receipt-totals.mjs';
const money=n=>'$'+Number(n??0).toLocaleString('es-CL');
export async function receiptPdf(sale){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),company=JSON.parse(sale.company_json||'{}'),amounts=receiptTotals(sale);
 doc.setTitle('Comprobante MEIBO '+String(sale.number).padStart(6,'0'));doc.setAuthor('MEIBO');doc.setCreationDate(new Date(sale.created_at));doc.setModificationDate(new Date(sale.created_at));
 const clean=value=>[...String(value??'')].map(c=>{try{font.encodeText(c);return c;}catch{return '?';}}).join(''),width=226.77,margin=14,max=width-margin*2,rows=[];
 const line=(value,strong=false,size=9)=>{const words=clean(value).split(/\s+/),f=strong?bold:font;let current='';for(const word of words){for(const piece of (f.widthOfTextAtSize(word,size)>max?[...word]:[word])){const next=current?(f.widthOfTextAtSize(word,size)>max?current+piece:current+' '+piece):piece;if(f.widthOfTextAtSize(next,size)>max&&current){rows.push({text:current,strong,size});current=piece;}else current=next;}}if(current)rows.push({text:current,strong,size});};
 const gap=()=>rows.push({gap:7});
 line(company.legal_name||'MEIBO',true,15);if(company.rut)line('RUT: '+company.rut);if(company.giro)line(company.giro);if(company.address)line([company.address,company.city].filter(Boolean).join(', '));gap();
 line('COMPROBANTE DE COMPRA '+String(sale.number).padStart(6,'0'),true,10);line(new Date(sale.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago'}));gap();
 if(sale.status==='cancelled'){line('VENTA CANCELADA',true,12);line('Motivo: '+sale.cancellation_reason);gap();}
 line('Cliente: '+(sale.customer_name||'Cliente de mostrador'));if(sale.customer_rut)line('RUT: '+sale.customer_rut);if(sale.customer_giro)line('Giro: '+sale.customer_giro);if(sale.customer_address)line([sale.customer_address,sale.customer_city].filter(Boolean).join(', '));line('Pago: '+({cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia'}[sale.payment_method]||sale.payment_method));gap();
 for(const item of sale.items){line(item.name,true);if(item.sku)line(item.sku,false,8);line(item.qty+' x '+money(item.price)+' = '+money(item.qty*item.price));gap();}
 line('Subtotal: '+money(amounts.subtotal));if(amounts.discount>0)line('Descuento'+(sale.discount_type==='percent'?' ('+sale.discount_value+'%)':'')+': -'+money(amounts.discount));line((sale.status==='cancelled'?'Importe cancelado: ':'TOTAL: ')+money(amounts.total),true,12);
 if(sale.cash_received!=null){line('Efectivo recibido: '+money(sale.cash_received));line('Vuelto: '+money(sale.cash_change));}gap();line('Gracias por comprar en MEIBO',true);line('Documento interno sin validez tributaria.',false,8);line('No emitido por el SII.',false,8);
 const height=Math.max(260,rows.reduce((sum,r)=>sum+(r.gap??r.size*1.5),0)+margin*2+48),page=doc.addPage([width,height]);let y=height-margin;
 try{const logo=await doc.embedPng(await readFile(new URL('./assets/meibo-logo.png',import.meta.url)));page.drawImage(logo,{x:margin,y:y-34,width:34,height:34});y-=44;}catch{}
 for(const row of rows){if(row.gap){y-=row.gap;continue;}y-=row.size*1.5;page.drawText(row.text,{x:margin,y,size:row.size,font:row.strong?bold:font,color:rgb(.08,.14,.23)});}
 return Buffer.from(await doc.save());
}
