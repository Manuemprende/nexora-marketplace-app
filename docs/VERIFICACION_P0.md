# Verificación del MVP funcional

Fecha: 10 de octubre de 2026 (Chile). React 18/Vite y backend Node/SQLite local.

## Comprobaciones automáticas

- 
pm test`: 14 pruebas aprobadas, cero fallos.
- 
pm run build`: compilación aprobada, 1589 módulos; JS 215,31 kB (64,48 kB gzip), CSS 25,06 kB (6,25 kB gzip).
- Roles: empaquetador accede a búsqueda/bandeja/verificación, rechaza catálogo, stock manual, ventas, staging y creación de pedidos.
- SKU único/inmutable, códigos únicos por plataforma, variantes independientes y búsqueda ambigua explícita.
- Inventario atómico, idempotencia, rollback, concurrencia y protección de reservas.
- Staging con filas válidas, duplicados y errores; reimportación conserva SKU y no crea productos reales duplicados.
- Ejemplo Manu: copias DEMO separadas, reserva al crear, verificación parcial sin consumir físico, código incorrecto bloqueado, última línea consume una vez; cancelar libera toda la reserva.
- POS: documento y cliente persistentes, venta descuenta una vez, empaque posterior no duplica el movimiento.
- Reabrir SQLite conserva catálogo, staging, pedidos, actividad, ventas y reservas.

## Recorrido verificado en navegador

1. Importación autorizada visible: ocho filas importadas, imágenes, URL, precio y stock pendiente. SKU MEI-00129 a MEI-00136.
2. Pedido Manu PED-00001: foto grande, referencias de origen MN, cantidades 2/1/1. Introducir un código equivocado mostró error y no guardó verificación. Corregirlo permitió continuar.
3. Las tres confirmaciones completaron 4/4 unidades; hubo tres movimientos de empaque y sus reservas quedaron en cero.
4. POS: búsqueda MEI-00137 + Enter añadió una pesa DEMO. Cliente de reunión, formato boleta DEMO, efectivo y envío a empaque. Venta V-000003, total $1.990, registrada y comprobante con logo visible.
5. Pedido POS PED-00002: confirmó stock ya descontado. Empacar conservó físico 18 (antes de la venta: 19). Movimientos de hoy mostró un solo movimiento de venta -1, sin segundo descuento por ese pedido.
6. Comprobante incluye número, fecha, cliente, productos, cantidades, importes y total; botón de impresión y CSS A4. Se verificó su presentación, no una impresión física. Factura DEMO requiere cliente/RUT/dirección mediante validación del backend.
7. Se comprobó presentación en pantalla estrecha y escritorio 1440×1000. Se restauró el tamaño original del navegador al terminar.
8. Consola de navegador sin errores/warnings en la revisión final; log del backend sin errores.

## Persistencia comprobada en el entorno que se entrega

Antes y después de detener y reiniciar los procesos reales de MEIBO, `scripts/verify-runtime.mjs` comparó los mismos registros:

- 15 variantes: ocho productos reales pendientes de stock, cuatro semillas DEMO anteriores y tres copias DEMO Manu.
- Cuatro pedidos: PED-00001 Manu y PED-00002 POS empaquetados; PED-00003 y PED-00004 Manu pendientes para demostración.
- Tres ventas y 33 movimientos.
- `PRAGMA integrity_check`: ok. `PRAGMA foreign_key_check`: cero errores.
- Login del navegador restaurado tras el reinicio; bandeja y pedidos visibles desde SQLite.

Servidor de desarrollo dejado funcionando en http://127.0.0.1:5173/#scan . API en 127.0.0.1:3001. Procesos locales de MEIBO iniciados con `scripts/dev.mjs` en segundo plano. Respaldo anterior a la migración en `data/backup-before-workflows`.

Evidencia visual: `docs/empaque-funcional.png` y `docs/comprobante-demo.png`.

## Límites explícitos

Manu es un ejemplo local funcional, sin conexión externa. No hay recepción automática de pedidos externos, APIs, MCP, IA ni emisión tributaria SII. Los productos reales no tienen stock inventado; las unidades ficticias existen solo en copias marcadas DEMO. CSV/Excel con mapeo, cámara y administración de cuentas quedan pendientes. Dos vulnerabilidades npm reportadas por la instalación original de Vite 5 están documentadas en README.

## Ampliación: bloqueo y tiempos de preparación (10-10-2026)
17 pruebas aprobadas. Una línea faltante bloquea el pedido completo y evita verificaciones parciales; reposición habilita reserva completa e inicio. Cancelar sin reserva no consume reservas de otros pedidos. POS que vendió su última unidad se prepara con el stock ya asignado, sin exigir nuevamente físico ni duplicar descuento.
La migración 003 conserva preparation_started_at e inventory_allocated. Pedido PED-00003 iniciado explícitamente y recargado: reloj conservado; terminó preparado tras 17 segundos de trabajo, con espera 2 h 51 min 12 s y total 2 h 51 min 29 s. Promedios mostrados con una medición completa. PED-00005 quedó bloqueado por MEI-00142, cero unidades de una requerida, con todos los controles de preparación deshabilitados. Los tres pedidos preparados anteriores sin medición no generan tiempos inventados. Evidencia: tiempo-preparacion.png y pedido-bloqueado.png. Respaldo previo: data/backup-before-preparation.


## Empaque simplificado

La pantalla operativa muestra solo lista de pendientes/listos, búsqueda, cliente, fotos, SKU discreto y cantidades. Una acción Pedido preparado confirma el pedido completo. Sin confirmaciones por producto, reloj manual ni tarjetas de métricas en bodega. El reloj se registra automáticamente al abrir un pedido con inventario completo. Cancelación en Más opciones; controles de demo en Opciones demo (administrador).

POST /orders/:id/complete valida las líneas/cantidades que se revisaron y completa todo en una transacción. Revalida stock de todas las líneas, registra verificaciones y descuenta una sola vez; idempotencia y POS sin segundo descuento conservados. Metrics: pantalla Resumen del administrador.

19 pruebas aprobadas y build correcto. Prueba manual: PED-00006 preparado en un clic; PED-00005 con faltante bloqueó el mismo botón. Resumen mostró dos mediciones completas. La base conserva inicio, fin, actividad y movimientos. Vista final: docs/empaque-simple.png.

## Vista de empaque restaurada
Se recuperó la distribución anterior con bandeja de pedidos, ver producto, preparación por producto, reloj y actividad. Se mantienen las validaciones de inventario y los datos existentes. Compilación verificada. La versión simplificada queda respaldada en Packing-simplificado.jsx.bak.


## Ajuste por paquete y cantidades diarias
Se conserva la distribución anterior. Se eliminan los minutos, promedios y la actividad repetida de la interfaz. Empaque y Resumen muestran llegados, preparados y cancelados hoy (zona America/Santiago), más pendientes y bloqueados actuales, incluidos pedidos anteriores. Las fechas de llegada, inicio y finalización permanecen en el detalle.
La acción principal inicia la preparación y luego confirma el paquete entero; no hay botones de preparación por producto. Ver producto abre la imagen y cantidades. Stock insuficiente bloquea el paquete completo y se valida nuevamente en el servidor. Cancelar pedido conserva el comportamiento actual de reservas pendiente de definición comercial.
Validación: 20 pruebas aprobadas, compilación correcta y vista en localhost comprobada.

## Catálogo público completo y precios de plataforma
Extracción autorizada del sitemap de https://www.meibo.cl: 1160 fichas recorridas y 1253 variantes/presentaciones capturadas, sin errores pendientes. Archivo: data/catalog-full.json. Importación local en 63 bloques, conservando las 8 variantes existentes y agrupando las presentaciones nuevas bajo el mismo producto de origen. Resultado persistido: 1160 productos reales y 1253 variantes reales, además de 10 variantes de demostración. Stock físico sin inferir: pendiente de confirmación para todas las variantes reales. Informe: data/catalog-import-report.json.
Cada asignación de plataforma admite un precio CLP independiente, editable sin alterar el precio general ni las otras plataformas. Precios existentes desconocidos permanecen NULL (Precio pendiente). Migración 004_platform_prices.sql y endpoints POST /variants/:id/codes, PUT /codes/:id con control administrativo. El SKU maestro se pagina en grupos de 20 para el catálogo completo.
Validación: 21 pruebas aprobadas, compilación correcta, lectura independiente de SQLite confirma cantidades persistidas; navegador verifica catálogo y campo de precios. Evidencia: docs/precios-plataforma.png.

## Ventas por plataforma, independientes del empaque
Resumen e Integraciones muestran montos de pedidos por origen, unidades, cantidad de pedidos, preparados, cancelados y precios pendientes; filtro Hoy/Todos en zona Chile. POS usa ventas cobradas y no vuelve a sumar pedidos de empaque. Datos demo se conservan y se excluyen por defecto, con opción explícita de incluirlos.
Migración 005_order_prices: precio de plataforma capturado en order_items.unit_price al crear un pedido. Cambiar la asignación después no revaloriza ventas anteriores. Históricos de plataforma sin precio quedan pendientes; los históricos POS se reconstruyen desde sale_items. No se infieren pagos de los pedidos externos ni hay sincronización activa. Próxima integración deberá resolver código y guardar precio real recibido, origen y referencia única.
Validación: 22 pruebas aprobadas y compilación correcta; precio histórico, cancelados, empaque sin duplicación, demo y POS comprobados.

## POS acotado y usuarios por sección
Punto de venta: dos filas de tarjetas por página, ajustando cantidad a las columnas disponibles. Búsqueda por nombre/SKU/código y categoría reinicia a página 1. Categorías en selector compacto. Registro de ventas paginado de 10 en 10; comprobantes y carrito conservan sus acciones. Verificación del navegador: 6 tarjetas, 3 columnas y 2 filas; navegación 1→2→1, búsqueda MEI-00130 devuelve el producto correcto. Evidencia: docs/pos-paginado.png.
Usuarios: el administrador crea cuentas con contraseña inicial protegida por scrypt; perfil administrador u operador, accesos por sección y estado activo. Atajos Solo empaque/Solo ventas. Secciones visibles dependen de permisos persistidos en user_permissions. API valida cada solicitud usando permisos actuales; editar permisos revoca acceso inmediatamente en backend y la interfaz actualiza su sesión periódicamente. Desactivar elimina sesiones. Solo administradores gestionan usuarios y no pueden quitarse su propio acceso. Crear/cancelar pedidos sigue reservado al administrador; los operadores de empaque pueden preparar. La asignación Productos y stock permite gestionar inventario; POS permite consultar catálogo y registrar ventas sin modificar inventario manualmente.
Validación: 23 pruebas aprobadas, compilación correcta. Test por API verifica venta autorizada, inventario/usuarios/empaque denegados al vendedor, revocación, protección del administrador y persistencia tras reiniciar SQLite. La vista de usuarios fue comprobada sin agregar cuentas ficticias al entorno del usuario. Evidencia: docs/usuarios-permisos.png.

## Categorías, variantes y actualización incremental
Migración 007: categoría numérica 543638 corregida a Ferreteria tras verificar BreadcrumbList del adaptador de sierra eléctrica en su ficha pública. Categorías persistidas en tabla categories, reutilizables sin duplicar diferencias de mayúsculas. Formulario permite seleccionar categoría o agregar una nueva al guardar. Descripción opcional; URL de imagen y origen agrupadas en detalles opcionales.
Variantes estructuradas con color, talla y presentación opcionales, precio y stock por variante, SKU único e inmutable. Datos existentes conservados; no se infieren opciones desde las descripciones importadas. Se impide duplicar la misma combinación de color/talla/presentación dentro del producto. El botón de agregar variante abre los campos directamente. Productos nuevos reales por defecto; demo explícito opcional.
Automatización diaria a las 08:00 hora Chile creada en Codex: actualizar-cat-logo-meibo. Consulta sitemap y captura únicamente fichas nuevas, importa únicamente presentaciones nuevas; preserva stock, reservas, precios existentes, precios de plataformas y datos manuales. Usa trazabilidad de importaciones para reconocer variantes editadas. Requiere API local disponible; notifica novedades o impedimentos. No borra productos ni realiza reseteos.
Validación: 24 pruebas aprobadas, compilación correcta, formulario verificado en navegador. Corrida incremental sin nuevos productos: 0 bloques importados, 1253 variantes reales y 0 faltantes. Evidencia: docs/producto-categorias-variantes.png.

## Carga de imágenes WebP
Formulario de producto: Subir/Cambiar imagen, vista previa, tamaño optimizado y Quitar imagen. Se conserva la URL externa opcional. Acepta PNG, JPG y WebP hasta 12 MB; servidor valida el contenido con Sharp, rechaza SVG/animaciones/archivos ilegibles y limita resolución de entrada a 40 MP. Corrige orientación, conserva proporción y transparencia, reduce a máximo 1400×1400 sin ampliar imágenes pequeñas y codifica WebP calidad 80.
Migración 008_product_images: bytes WebP, dimensiones, tamaños, hash de contenido, usuario y fecha persistidos en SQLite. Producto guarda referencia /api/images/:uuid.webp. Repetir imagen idéntica reutiliza el recurso. Subir requiere permiso Productos y stock; leer imagen requiere sesión. Guardar producto se bloquea mientras se sube la imagen. Quitar solo desvincula al guardar; no elimina recursos compartidos.
Validación: 25 pruebas aprobadas y compilación correcta. API probado con PNG 3200×2200: redimensionado a 1400 px, transparencia conservada y menor tamaño; deduplicación, persistencia después de reiniciar, enlace en producto y rechazos de acceso/archivo comprobados. Servidor local activo. Verificación visual de la carga pendiente: revisión automática de la herramienta de navegador no pudo completarse por límite de uso, no por rechazo de seguridad.

Actualización diaria 2026-10-11: captura completa de 1160 fichas/1253 presentaciones; importación incremental con 0 nuevos bloques y 0 faltantes. Sin nuevos productos.

## Verificación visual de imagen completada
Carga desde el formulario mediante selector de archivo: PNG del logo MEIBO convertido a WebP de 17 KB, 640×641. Vista previa cargada desde /api/images y estado WebP guardada comprobados. Formulario cancelado para no crear productos de prueba. Evidencia: docs/imagen-webp-verificada.png. La limitación anterior de la herramienta ya no impidió esta verificación.


## Resumen compacto
Dashboard limitado a indicadores generales, paquetes con comparación Hoy/Ayer y ventas por plataforma. Atención de inventario resumida por cantidad con enlace; listados, plataformas conectables y movimientos permanecen en sus secciones dedicadas. Porcentaje de llegados hoy ya preparados usa cohorte del día, sin mezclar preparados de días anteriores ni inferir despachos. Menú: Resumen, Empaque, Punto de venta, Productos, Importación y demás. 26 pruebas aprobadas y compilación verificada.


## Menú contraíble y diseño responsivo
Pulsar logo alterna menú completo y rail de iconos (78 px), conserva selección y estado tras recargar. Nombres accesibles y ayudas al pasar cursor sobre iconos. Tablet/celular usan menú superpuesto con botón superior, cierre al navegar, fondo para cerrar y tecla Escape; menú cerrado no permite acceder por teclado a controles fuera de pantalla.
Pruebas manuales en navegador: escritorio 1440 px, celular 390×844 (Resumen, POS 4 tarjetas/2 filas, Empaque de pedido), tablet 820×1180 (catálogo y formulario de 680 px dentro del ancho disponible). Ningún desborde horizontal del documento en móvil; tablas desplazables dentro de su contenedor. Override de tamaño restablecido al finalizar. Compilación validada. Evidencias: docs/menu-contraido.png, docs/pos-celular.png y docs/empaque-celular.png.

## Modo día y noche
- Selector accesible sol/luna junto al avatar del encabezado; preferencia local `meibo-theme` conservada al recargar.
- Día conserva la paleta existente. Noche usa fondos azul oscuro, superficies suaves, textos claros y estados diferenciados; imágenes y comprobantes mantienen fondo blanco.
- Compilación y revisión visual de Resumen, POS y empaque verificadas.
