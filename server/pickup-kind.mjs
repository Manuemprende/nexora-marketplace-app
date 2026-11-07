export function isLocalPickup(order){const d=order.external;return d?d.shipping_option==='store_pickup'&&!d.label_attachments?.length&&!d.envios_urbanos:order.packing_delivery_type==='pickup';}
