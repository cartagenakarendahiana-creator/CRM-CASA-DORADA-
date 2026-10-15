# CRM Casa Dorada

CRM sencillo en un solo archivo (`index.html`) para digitar y encontrar clientes rápido. No necesita servidor ni instalación.

## Cómo usarlo

1. En Google Drive abre la hoja de cálculo → **Archivo › Descargar › Microsoft Excel (.xlsx)**.
2. Abre `index.html` en el navegador (o publícalo con GitHub Pages).
3. Pulsa **Importar Excel** y elige el archivo. Cada pestaña del Excel se convierte en una hoja del CRM y sus columnas en los campos del formulario.

## Funciones

- **Búsqueda instantánea** en todas las columnas, sin importar tildes ni mayúsculas; varias palabras a la vez (ej. `maria 300`). Busca teléfonos aunque tengan espacios o guiones.
- **Filtros automáticos** para columnas con pocos valores (estado, asesor, ciudad…).
- **Ordenar** haciendo clic en el encabezado de la columna.
- **Formulario** generado desde las columnas, con sugerencias de valores ya usados, calendario en columnas de fecha y teclado numérico en teléfonos.
- **Seguimiento**: notas con fecha y hora en cada registro (también se encuentran con la búsqueda).
- **Exportar a Excel** con todas las hojas y el seguimiento.
- **Copia de seguridad** (.json) y restauración.
- Funciona en el celular (vista de tarjetas).

Atajos: `/` buscar · `N` nuevo registro · `Ctrl+Enter` guardar.

> Los datos se guardan en el navegador de cada equipo. Exporta a Excel o descarga una copia de seguridad con frecuencia.

## Publicar con GitHub Pages

Settings › Pages › Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`. El CRM quedará en `https://<usuario>.github.io/crm-casa-dorada-/`.
