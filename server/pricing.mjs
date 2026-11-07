export function saleTotals(subtotal,discount={}){
 if(!discount||typeof discount!=='object'||Array.isArray(discount))throw new Error('Descuento inválido');
 if(!Number.isSafeInteger(subtotal)||subtotal<0)throw new Error('Subtotal inválido');
 const type=discount.type??'none',value=discount.value??0;
 if(!['none','percent','amount'].includes(type)||typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Descuento inválido');
 let amount=0;
 if(type==='none'){if(value!==0)throw new Error('Descuento sin tipo');}
 if(type==='percent'){const basis=Math.round(value*100);if(value>100||Math.abs(basis-value*100)>0.000001)throw new Error('El porcentaje debe estar entre 0 y 100, con hasta dos decimales');amount=Number((BigInt(subtotal)*BigInt(basis)+5000n)/10000n);}
 if(type==='amount'){if(!Number.isSafeInteger(value)||value>subtotal)throw new Error('El descuento debe ser un monto entero que no supere el subtotal');amount=value;}
 return {subtotal,discount_type:type,discount_value:value,discount_amount:amount,total:subtotal-amount};
}
