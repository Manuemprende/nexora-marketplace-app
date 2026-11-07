# Integración de Nexora con Mercado Libre, Shopify y Meta

Investigación del 12 de octubre de 2026. Especificación propuesta, no conectores implementados.

## Estado comprobado

Nexora arrancó en http://127.0.0.1:5173/ con API en :3001. Inicio de sesión, dashboard, POS e Integraciones accesibles. Las 27 pruebas existentes pasaron: reservas, concurrencia, venta y empaque sin doble descuento, permisos, imágenes, importaciones y MCP.

El POS muestra 1263 entradas de catálogo, incluidas DEMO; el dashboard excluye demo y muestra cero productos reales y ventas. No se hicieron ventas ni publicaciones externas durante la revisión.

`src/pages/OtherPages.jsx` indica Conector previsto para Mercado Libre y Shopify y Catálogo previsto para Facebook. `server/index.mjs` solo ofrece operaciones locales; no implementa OAuth, tokens comerciales ni callbacks de estos canales. El MCP opera Nexora y no sustituye esas conexiones.

## Mercado Libre Chile

1. Crear aplicación y configurar redirect URI y notificaciones. Autorizar cada vendedor mediante OAuth; intercambiar el código en el backend y renovar tokens. Asociar conexión a seller/site; Chile usa MLC.
2. Preparar producto: categoría y atributos exigidos, título, condición, moneda/precio, imágenes, variantes, tipo de publicación y logística. Consultar requisitos actuales por categoría y cuenta; evitar un payload fijo para todos los productos.
3. Validar con `/items/validate` y publicar mediante `/items`. Guardar identificadores reales de publicación y variación junto al SKU Nexora. Enviar descripción mediante el recurso `/items/{id}/description`, según el modelo aplicable.
4. Actualizar precios, estado y stock con los recursos admitidos por el modelo de publicación de la cuenta. El stock distribuido y User Products requieren tratamiento específico.
5. Suscribirse a `orders_v2`, `items` y eventos logísticos necesarios. Recibir POST en HTTPS público, guardar el evento y responder rápido. Consultar `/orders/{id}` con el token del vendedor para conocer el estado autorizado, sus líneas y envío.
6. Traducir publicación/variación a SKU, ingresar o actualizar el pedido una sola vez y reservar inventario según política. Cancelaciones liberan reservas; devoluciones requieren recepción física antes de reponer. Seguimiento, etiquetas, reclamos y facturación constituyen flujos adicionales.

**Full:** representa unidades almacenadas en centros de Mercado Libre. Debe tener ubicación y disponibilidad separadas; una venta Full no debe consumir la bodega local. Flex y coexistencia Full/Flex necesitan selección de ubicación y reglas logísticas.

Fuentes oficiales: [OAuth](https://developers.mercadolibre.cl/es_ar/autenticacion-y-autorizacion), [publicación](https://developers.mercadolibre.cl/es_cl/publica-productos), [notificaciones](https://developers.mercadolibre.cl/es_ar/publica-productos/productos-recibe-notificaciones), [órdenes](https://developers.mercadolibre.cl/es_ar/atributos-y-variaciones/gestiona-ventas), [Full](https://developers.mercadolibre.cl/en_us/manage-project-apps/fulfillment), [stock distribuido](https://developers.mercadolibre.cl/en_us/about-our-api/distributed-stock). Algunas páginas rechazaron la apertura directa con 403; se consultaron sus resultados indexados oficiales. Validar payloads y permisos en la cuenta antes de implementar.

## Shopify

1. Crear e instalar una app para la tienda; elegir distribución adecuada a tienda propia o múltiples comerciantes. Solicitar permisos mínimos para productos, inventario, ubicaciones, pedidos y fulfillment que realmente se vayan a usar.
2. Usar GraphQL Admin API con versión estable fijada, no `latest` en producción. `productSet` permite sincronizar catálogo externo; sus campos de lista pueden eliminar entradas omitidas, por lo que se debe enviar una representación completa o usar mutaciones específicas de variantes.
3. Guardar productId, variantId, inventoryItemId y locationId. Crear imágenes y publicar al canal correspondiente; producto creado no equivale automáticamente a producto visible en cada canal.
4. Como fuente de verdad, Nexora puede usar `inventorySetQuantities` con control de concurrencia y cantidades por ubicación. Separar inventario central de stock de proveedor confirmado.
5. Recibir `orders/create`, actualizaciones, cancelaciones y eventos de fulfillment/reembolso según alcance. Verificar `X-Shopify-Hmac-Sha256` sobre el cuerpo crudo, deduplicar y procesar en cola. Un reembolso financiero no implica reposición física automática.
6. Conservar identificador de pedido Shopify y resolver líneas por variantId. La preparación local y confirmación de envío Shopify son hitos diferentes; agregar tracking mediante el flujo de Fulfillment Orders y permisos correspondientes.

Fuentes: [GraphQL Admin](https://shopify.dev/docs/api/admin-graphql/latest), [productSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet), [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities), [webhooks](https://shopify.dev/docs/api/webhooks/latest).

## Meta, Facebook e Instagram

Un catálogo comercial, una Shop y publicaciones personales de Marketplace tienen capacidades distintas. No se confirmó una API general que permita publicar cualquier producto en Marketplace personal y descargar todos sus pedidos para esta cuenta en Chile.

Ruta propuesta: Nexora → Shopify → canal oficial Facebook & Instagram by Meta. Este canal sincroniza productos elegibles y muestra errores de publicación. Disponibilidad de Shops, etiquetado y checkout depende de país, cuenta y aprobación; confirmar en Commerce Manager antes de ofrecer funciones.

Si el checkout termina en Shopify, el pedido entra por el conector Shopify y se conserva atribución social; no debe crearse otra reserva por Facebook. Ventas acordadas por mensajes necesitan un flujo manual o un checkout trazable.

Alternativa directa a estudiar: catálogo Meta mediante feed o Catalog API, permisos y catálogo del negocio. La documentación directa de Meta no estuvo accesible en esta revisión; no se validaron permisos ni endpoints para esta cuenta. Tampoco se validó disponibilidad actual de checkout propio Meta en Chile.

Fuentes oficiales: [sincronización y requisitos](https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/publishing-products), [Instagram Shopping y checkout](https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/instagram), [canal oficial](https://apps.shopify.com/facebook), [Catalog API, pendiente de lectura directa](https://developers.facebook.com/docs/marketing-api/catalog/).

## Arquitectura que falta en Nexora

Propuesta de implementación:

- Conexiones por vendedor/tienda, tokens cifrados y renovación, estados y permisos reales.
- Fichas por canal con validación, borrador, publicación, errores e IDs externos por variante y ubicación.
- Entrada persistente de eventos y cola de tareas, reintentos, límites de API y registro de errores visibles.
- Unicidad por conexión + ID externo de pedido; deduplicación de eventos y conciliación periódica para recuperar notificaciones perdidas.
- Transacción local de reserva + tarea de salida persistente para propagar disponibilidad. Procesar pedidos pendientes antes de sobrescribir stock remoto para evitar reponer accidentalmente unidades que el canal acaba de vender.
- Ubicaciones separadas para bodega, Full y proveedores; stock proveedor solo confirmado, sin cantidades ficticias.
- Imágenes públicas específicas para productos. Actualmente `/api/images/...` exige sesión; los canales no pueden descargar esas imágenes protegidas. No exponer la base ni la API administrativa completa.
- HTTPS público para callbacks específicos con verificación propia del canal; no exigir la cookie de sesión ni la cabecera de solicitudes del navegador a los webhooks.

Las transacciones SQLite protegen Nexora, pero no vuelven atómicas las ventas entre servicios externos. Para reducir sobreventas se necesitan propagación, conciliación, buffers o cupos por canal y manejo explícito de excepciones.

## Secuencia de entrega propuesta

1. Infraestructura común, conexiones y recepción segura de eventos.
2. Mercado Libre: autorización → enlazar publicaciones existentes → pedidos/cancelaciones → stock → publicar borradores validados → logística.
3. Shopify: catálogo/variantes → ubicación e inventario → pedidos/cancelaciones → fulfillment.
4. Meta mediante el canal Shopify; integración directa solo si la cuenta y la API permiten el alcance requerido.

Para probar conexiones reales hacen falta una aplicación y vendedor autorizado Mercado Libre, una tienda Shopify de prueba y activos comerciales Meta. Guardar secretos localmente, fuera de documentación y del repositorio.

Criterios de aceptación: evento repetido no duplica pedido; cancelación no libera reserva ajena; última unidad y caída de API generan un estado visible; reintento no publica dos veces; Full no descuenta bodega; cambio de precio queda aislado por canal; reembolso no repone sin recepción; pedido social vía Shopify no se ingresa dos veces.

### Receptor de notificaciones Mercado Libre (12 octubre 2026)
URL HTTPS de notificaciones: https://nexora.wentixai.cyou/api/integrations/mercadolibre/notifications
URL de retorno OAuth que debe estar autorizada en la aplicación de Mercado Libre: https://nexora.wentixai.cyou/api/integrations/mercadolibre/callback
Recibe POST JSON y confirma HTTP 200; almacena avisos para la aplicación configurada y vendedores conectados, elimina reintentos duplicados y limita la cola pendiente. Los avisos son datos no verificados: todavía no existe un trabajador que consulte cada recurso en la API, importe pedidos o cambie stock. No se debe considerar la recepción como sincronización operativa. El callback OAuth es una URL distinta terminada en /callback.
Referencia oficial: https://developers.mercadolibre.com.ar/productos-recibe-notificaciones/
