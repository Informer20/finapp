# FinApp (GitHub Pages Fix)

- Service Worker actualizado a `finapp-cache-v4` y estrategia **network-first** para HTML.
- `manifest.webmanifest` ajustado con `start_url` y `scope` `/finapp/` (ruta de GitHub Pages).

## Publicación
Sube **todos** estos archivos a la raíz del repo (branch `main`). Luego activa GitHub Pages en Settings → Pages (Deploy from a branch → main / (root)).

## Si sigues viendo la versión vieja
- En Chrome: DevTools → Application → Clear storage → **Clear site data**. Luego recarga.
- O abre: https://TU_USUARIO.github.io/finapp/?v=4 (parámetro para romper caché).
- O usa una ventana de incógnito.
