# Evaluación y captura autorizada de MEIBO

10 de octubre de 2026. Origen: https://www.meibo.cl/ . El usuario confirmó expresamente autorización de MEIBO para usar productos e imágenes en esta demostración.

- El sitio público presenta productos, categorías, precios CLP, fotos y fichas. El pie indica Jumpseller. No se llamó su API ni el endpoint MCP anunciado en robots.
- Los términos, sección 6, exigen autorización para el contenido; la captura se inició después de la confirmación del usuario.
- robots.txt se recuperó correctamente por HTTP y se guardó en `docs/robots-meibo.txt`. Las rutas de las ocho fichas no estaban prohibidas. Se excluyeron administración, carrito, checkout, cuentas, búsqueda y filtros.
- El script `scripts/capture-catalog.mjs` hizo solicitudes públicas secuenciales con pausa de 1,1 s, identificador de demo y timeout; sin evadir protecciones.
- Se capturaron ocho fichas desde los enlaces públicos del inicio: pesa de cocina, guatero, cabezal de ducha, rallador, dispensador de agua, ventiladores para moscas, plancha y pegatinas para drenaje. Se leyó JSON-LD Product y oferta CLP. Se excluyen fichas con variantes no resueltas.
- Nombre, descripción, precio, imagen pública, categoría y URL de ficha se conservan en `data/catalog-capture.json`. Imágenes por URL con fallback; no se copiaron cantidades de stock.
- Se preparó staging con revisión de ocho filas sin errores y se confirmó la importación. SKU MEI-00129 a MEI-00136. Los registros reales tienen stock pendiente, no cantidades ficticias.
- Manu utiliza tres copias DEMO separadas (MEI-00137 a MEI-00139), 20 unidades ficticias iniciales y movimientos auditados. Los productos reales conservan físico cero hasta que MEIBO confirme su inventario.

Esta es una muestra representativa, no un scraping exhaustivo. Falta exportación CSV/Excel o inventario oficial para confirmar variantes, cantidades físicas y catálogo completo. No hay sincronización externa automática.
