// MCP unit_price is the supplier product price. subtotal/total are retained separately.
export function dropiProviderPrice(value){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
 if(typeof value==='string'&&/^\d+(?:\.0+)?$/.test(value.trim())){const n=Number(value);return Number.isSafeInteger(n)?n:null;}
 return null;
}
export function dropiProviderValues(items){
 const lines=items.map(i=>{const unit=dropiProviderPrice(i.source_unit_price),quantity=i.qty;const total=unit!==null&&Number.isSafeInteger(quantity)&&quantity>0&&Number.isSafeInteger(unit*quantity)?unit*quantity:null;return {unit_price:unit,total};});
 const complete=lines.length>0&&lines.every(i=>i.total!==null),sum=complete?lines.reduce((n,i)=>n+i.total,0):null;
 return {lines,total:sum!==null&&Number.isSafeInteger(sum)?sum:null};
}
