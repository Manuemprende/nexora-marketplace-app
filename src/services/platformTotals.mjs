const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date(value));
export function platformTotals(orders,sales,{period='today',includeDemo=false,current=new Date()}={}){
 const today=day(current),inPeriod=value=>period==='all'||day(value)===today;
 const defaultPlatforms=['Mercado Libre','Shopify','Falabella','Ripley','Facebook Marketplace','Dropi','Evolut','Dropea','Jumpseller','Manu','Manual','POS'];
 const groups=new Map(defaultPlatforms.map(platform=>[platform,{platform,amount:0,orders:0,units:0,unpriced:0,cancelled:0,packed:0}]));
 for(const order of orders){
  if(order.platform==='POS'||!inPeriod(order.created_at)||(!includeDemo&&order.items.some(i=>i.product?.is_demo)))continue;
  let row=groups.get(order.platform);
  if(!row){row={platform:order.platform,amount:0,orders:0,units:0,unpriced:0,cancelled:0,packed:0};groups.set(order.platform,row);}
  if(order.status==='cancelled'){row.cancelled++;continue;}
  row.orders++;row.units+=order.items.reduce((n,i)=>n+i.qty,0);if(order.status==='packed')row.packed++;
  if(order.items.some(i=>i.unit_price==null))row.unpriced++;else row.amount+=order.items.reduce((n,i)=>n+i.qty*i.unit_price,0);
 }
 const pos=groups.get('POS');
 for(const sale of sales){if(!inPeriod(sale.created_at)||(!includeDemo&&sale.items.some(i=>i.is_demo)))continue;pos.amount+=sale.total;pos.orders++;pos.units+=sale.items.reduce((n,i)=>n+i.qty,0);}
 return [...groups.values()];
}
