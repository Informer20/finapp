# Changelog

## [v4.1.1] - 2025-08-13
### Added
- Modo de tema **Auto / Oscuro / Claro** con persistencia.
- **Edición en línea** de movimientos (Editar → Guardar/Cancelar).
- **Gráficas** sin librerías:
  - Ingresos vs Gastos (mes)
  - Gasto por categoría (mes)

### Improved
- Gráficas con **etiquetas de valor** y nitidez según devicePixelRatio.
- Layout responsivo (altura 320px desktop / 260px móvil).
- Mejor legibilidad en **tema claro/oscuro**.

### Fixed
- Error crítico `Invalid or unexpected token` en `app.js` (función `escapeHtml`).
  - Se reemplazó por una versión **segura** sin comillas problemáticas.
- Limpieza de caché PWA: bump de `CACHE_NAME` a `finapp-pwa-v9`.

### Notes
- La app funciona 100% **offline** y mantiene datos en **LocalStorage**.
- Para forzar actualización del SW visitar: `?pwa=v411-ui`.
