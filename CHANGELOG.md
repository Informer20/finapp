# Changelog

## v4.1.2
- **FIX**: Corregido error `Invalid or unexpected token` en `escapeHtml` (comillas/apóstrofe correctamente escapados).
- **FIX**: Panel **Deudas** restaurado y funcionando (agregar/listar/eliminar).
- **Mejora**: Normalización de fechas al importar CSV (`normalizeDate`), compatible con `dd/mm/yyyy`, `mm/dd/yyyy` y serial de Excel.
- **Mejora**: Cálculo semanal/diario en **zona local** (evita corrimientos por zona horaria).
- **UI**: Gráficas legibles sin librerías (etiquetas visibles) y mejores tamaños en móvil/PC.
- **PWA**: Service Worker con cache busting y aviso de actualización.
