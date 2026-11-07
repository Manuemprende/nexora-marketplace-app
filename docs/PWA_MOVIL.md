# Nexora en celular y tablet

La plataforma incluye manifest PWA, iconos 192/512, acceso desde pantalla de inicio, botón Instalar e instrucciones para Safari iOS/iPadOS. URL: https://nexora.wentixai.cyou/

En Android: Chrome → menú → Instalar aplicación / Añadir a pantalla de inicio.
En iPhone/iPad: Safari → Compartir → Añadir a pantalla de inicio.

Las operaciones requieren internet. El service worker no almacena respuestas de API ni páginas autenticadas. Sin conexión muestra una pantalla de reintento; las escrituras no se ponen en cola y se bloquean cuando el navegador detecta desconexión.

Validación: compilación correcta, manifest y service worker servidos por HTTPS; Dashboard, Resumen, POS y Empaque revisados a 390×844 y 768×1024, sin desbordamiento horizontal de la página. Las tablas mantienen desplazamiento interno. Falta confirmar instalación física en dispositivos Android/iOS y realizar una venta real con lector y la impresora elegida. Las notificaciones actuales son dentro de la app; Web Push no está implementado.
