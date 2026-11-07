export function receiptTotals(sale){
 const lines=(sale.items??[]).reduce((sum,item)=>sum+Number(item.qty)*Number(item.price),0);
 const subtotal=Number(sale.subtotal)>0?Number(sale.subtotal):lines;
 const total=Number(sale.total??subtotal);
 const discount=Number(sale.discount_amount)>0?Number(sale.discount_amount):Math.max(0,subtotal-total);
 return {subtotal,total,discount};
}
