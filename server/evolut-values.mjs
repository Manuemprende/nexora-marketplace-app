const amount=v=>v!==null&&v!==undefined&&v!==''&&/^\d+(?:\.0+)?$/.test(String(v))&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
export function evolutSupplierValues(order){
 const lines=(order.items??[]).map(item=>{
  const unit=amount(item.supplier_unit_price),reported=amount(item.supplier_subtotal);
  const calculated=unit!==null&&Number.isSafeInteger(item.quantity)&&item.quantity>0&&Number.isSafeInteger(unit*item.quantity)?unit*item.quantity:null;
  return {unit_price:unit,subtotal:reported??calculated};
 });
 const total=amount(order.supplier_total),sum=lines.length&&lines.every(l=>l.subtotal!==null)?lines.reduce((n,l)=>n+l.subtotal,0):null;
 return {lines,total:total??(Number.isSafeInteger(sum)?sum:null)};
}
