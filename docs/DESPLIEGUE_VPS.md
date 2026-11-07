# Nexora en VPS

Dominio: https://nexora.wentixai.cyou. VPS Ubuntu 24.04 en 161.97.160.76.

## Componentes

- Frontend compilado en `/opt/nexora/dist`; Nginx sirve la SPA y proxy de `/api/`.
- Node 24 aislado en `/opt/nexora-runtime`, sin reemplazar el Node usado por otros servicios.
- API en `127.0.0.1:3107`, gestionada por `nexora.service`, con usuario sin login `nexora`, reinicio automático y límite de 256 MB.
- Base SQLite persistente en `/var/lib/nexora/nexora.sqlite`.
- Variables privadas en `/etc/nexora/nexora.env`, con origen público permitido y cookies Secure en producción.
- Accesos iniciales en `/etc/nexora/access.txt`, legible solo por root. No guardar contraseñas en documentación ni en Git.

La copia inicial de datos fue autorizada explícitamente. El proceso de preparación invalida sesiones, cambia contraseñas de admin y empaque y desactiva otras cuentas de la copia. Conserva catálogo, pedidos, ventas, imágenes y movimientos. La base local se conserva.

## Operación

```sh
systemctl status nexora
journalctl -u nexora -n 100 --no-pager
curl http://127.0.0.1:3107/api/health
nginx -t
```

Antes de cada actualización crear respaldo consistente mediante SQLite, subir código/compilación sin sobrescribir datos y reiniciar solamente Nexora. No usar `npm run dev` ni abrir el puerto de API públicamente.

`scripts/backup-hosted.mjs` usa VACUUM INTO para crear un respaldo consistente en `/var/backups/nexora`. Los respaldos locales en el VPS no cubren pérdida completa del servidor; añadir almacenamiento externo antes de depender de este servicio para ventas reales.

El timer `nexora-backup.timer` está configurado a diario a las 06:00 UTC, con hasta cinco minutos de demora aleatoria. Se generó y verificó un primer respaldo. Certbot tiene renovación programada y un hook recarga Nginx al renovar.

Verificación del despliegue: HTTPS y `/api/health` accesibles desde el exterior, inicio de sesión sin claves demo visibles, servicio y timer activos. En la primera medición, el servicio de API utilizó unos 22 MB de memoria.

## Alcance

El despliegue no implementa conectores Mercado Libre, Shopify o Meta. Consultar `INTEGRACIONES_COMERCIALES.md` para el trabajo pendiente. Los ejemplos de catálogo conservan su condición DEMO y no deben interpretarse como stock real confirmado.

La inspección inicial mostró poca memoria disponible y varios servicios activos. Revisar capacidad antes de aumentar tráfico o añadir procesos. No se cambiaron los runtimes ni configuraciones de los otros sitios.
