# Arquitectura local funcional

Frontend React 18/Vite, JSX y CSS con marca azul MEIBO. Entrada `src.jsx`; `src/App.jsx` organiza sesión y rutas. Node 24 HTTP + SQLite incorporado. Backend en `server/index.mjs`; reglas/transacciones en `server/service.mjs`; migraciones en `server/migrations`.

## Identidad

Producto y variante tienen UUID. SKU maestro por variante único e inmutable. Equivalencias por plataforma/código único, un código por plataforma/variante. Buscar un código ambiguo devuelve candidatos. Catálogo real e inventario DEMO se distinguen explícitamente.

## Persistencia

SQLite contiene usuarios, sesiones, productos, variantes, códigos, inventario, movimientos, operaciones idempotentes, ventas y líneas, pedidos y líneas, actividad de empaque, lotes de importación y staging. Migraciones 001 y 002 se aplican una vez; semillas no sobrescriben una BD existente. Precio/nombre/SKU de venta se guardan como snapshot.

## Sesiones y roles

scrypt con sal por contraseña; sesiones aleatorias guardadas como hash SHA-256, cookie HttpOnly/SameSite=Strict, 8 horas. Admin gestiona catálogo/importación/stock/pedidos/POS. Empaquetador consulta códigos, bandeja y confirma líneas; no modifica catálogo ni stock manualmente. Mutaciones exigen JSON, cabecera de app y origen local permitido. Backend en 127.0.0.1; sin CORS abierto.

## Reserva y empaque

Disponible = físico − reservado. Pedido local: reserva en transacción; cada verificación guarda evento y cantidad. Al confirmar la última línea, se consume el físico y se libera la reserva del pedido en una sola transacción. Cancelar un pedido sin terminar libera sus reservas, incluso si había líneas verificadas. No se puede cancelar una venta POS desde empaque.

POS: valida cantidades/disponible y precios del servidor; venta y descuento se guardan juntos. Si se envía a empaque, el pedido usa `stock_policy=deducted`; confirmar productos solo registra preparación, sin segundo descuento. Reservas consumidas están protegidas frente a otras ventas y ajustes.

Movimientos preservan físico y reservado antes/después, usuario, motivo, referencia y fecha. Operaciones con request_id devuelven el resultado original al reintentar el mismo contenido y rechazan reutilizarlo para otro contenido/actor. Transacciones BEGIN IMMEDIATE evitan stock negativo y ventas concurrentes incompatibles.

## Importación y demo

Captura pública autorizada por CLI, sin API externa. Staging valida campos/URLs/precios, registra errores y evita duplicados por URL+variante. Confirmar crea UUID/SKU una vez; reanudar no reasigna SKU. Stock real no se infiere: cero pendiente hasta movimiento explícito. Las copias Manu tienen atributos DEMO, códigos MN y cantidades ficticias auditadas.

Bandeja local consulta cada 5 s. No hay webhook ni recepción desde Dropi u otra plataforma. Los formatos boleta/factura son internos DEMO, sin emisión tributaria ni procesamiento bancario.

## Siguiente etapa

CSV/Excel con mapeo, catálogo completo, inventario oficial, colchón de seguridad, cuentas administrables, APIs externas, MCP/IA, SII y cámara. Producción requiere HTTPS, cuentas reales y revisión de despliegue. PostgreSQL puede conservar UUID/SKU/auditoría; para escala, mover búsquedas y paginación al servidor. El MVP está verificado para una demostración local, no cientos de miles de productos.

## Control de preparación y tiempos
Migración 003: preparation_started_at persistente e inventory_allocated. Si falta alguna línea, un pedido manual se guarda pendiente sin reservas parciales; stock_issues informa SKU, necesarias, asignables, faltantes y motivo. Al iniciar se vuelve a validar el pedido completo, se reservan todas sus líneas en una transacción y se registra evento started. Cada confirmación también revalida todas las líneas. Pedidos POS tienen unidades ya vendidas y asignadas, por lo que no se compara su físico actual con una segunda venta.
Espera = inicio − creación; preparación = listo − inicio; total = listo − creación. El reloj en pantalla deriva de timestamps persistentes, no de segundos acumulados en React. Los promedios incluyen solo pedidos preparados con inicio conocido, filtrados por fecha de preparación en Chile. Históricos sin inicio no se rellenan con tiempos ficticios. No se mide despacho.

