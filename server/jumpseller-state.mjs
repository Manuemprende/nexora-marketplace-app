const normal=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
export function jumpsellerShipmentState(source={}){
 const value=normal(source.shipment_status_enum??source.shipment_status);
 return ({retiro_disponible:'pickup_available',disponible_para_retiro:'pickup_available',disponible_para_retirar:'pickup_available',listo_para_retirar:'pickup_available',entregado:'delivered',en_preparacion:'in_preparation',en_transito:'in_transit'})[value]??value;
}
export function jumpsellerPickupAvailable(source={}){
 const paid=source.status??source.source_status;
 return (!paid||paid==='Paid')&&source.shipping_option==='store_pickup'&&!source.label_attachments?.length&&!source.envios_urbanos&&jumpsellerShipmentState(source)==='pickup_available';
}
