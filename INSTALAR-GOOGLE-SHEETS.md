# Instalar el CRM sobre Google Sheets

Con esta instalación el CRM guarda directamente en tu hoja **CasaDorada_CRM** de Google Drive.
Tus trabajadores entran con un enlace y un PIN desde el celular o el computador, sin cuenta de Claude ni de Google.

## Antes de empezar

- Haz una copia de seguridad: en la hoja, **Archivo › Hacer una copia**.
- La hoja debe estar en formato de Google Sheets. Si dice ".XLSX" junto al nombre, ve a **Archivo › Guardar como Hojas de cálculo de Google** y trabaja sobre esa versión.

## 1. Pegar el código

1. Abre la hoja y ve a **Extensiones › Apps Script**.
2. En el archivo `Código.gs`, borra lo que haya y pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Pulsa **+** junto a "Archivos", elige **HTML** y llámalo exactamente `Index`.
4. Borra lo que traiga y pega el contenido de [`apps-script/Index.html`](apps-script/Index.html).
5. Guarda con el ícono del disquete.

## 2. Crear el PIN del equipo

1. En `Código.gs`, busca la línea `var pin = '1234';` y cambia `1234` por tu PIN. Usa al menos 6 cifras.
2. Arriba, en el selector de funciones, elige **configurarPin** y pulsa **Ejecutar**.
3. La primera vez Google pide permisos: **Revisar permisos**, elige tu cuenta, luego **Configuración avanzada › Ir a… (no seguro)** y **Permitir**. Aparece así porque el script es tuyo y no está verificado por Google.
4. Puedes volver a poner `1234` en el código: el PIN real ya quedó guardado.

## 3. Publicar la aplicación

1. Pulsa **Implementar › Nueva implementación**.
2. En el engranaje, elige **Aplicación web**.
3. Configura:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario
4. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

Esa URL más el PIN es lo que compartes con tu equipo. Cada persona escribe su nombre y el PIN la primera vez; el navegador los recuerda.

## Qué hace en la hoja

- Agrega al final de cada pestaña tres columnas: **ID CRM**, **Modificado CRM** (fecha y quién) e **Historial CRM** (las notas).
- En **Prosp Dotacion** agrega Estado contacto, Responsable, Último contacto y Próx. seguimiento.
- En **Comercial Team** agrega Línea y WhatsApp.
- Nunca escribe encima de celdas con fórmula.
- Al eliminar un registro, vacía su fila y conserva el formato, las listas y las fórmulas.
- Los cambios hechos a mano en la hoja aparecen en el CRM en menos de 2 minutos. Los cambios hechos desde el CRM aparecen en unos 15 segundos.
- Si dos personas editan el mismo registro, la segunda recibe un aviso. Solo se guardan los campos que ella cambió.

## Actualizar el código más adelante

Pega el código nuevo, guarda y ve a **Implementar › Gestionar implementaciones**. Pulsa el lápiz, elige **Versión: Nueva versión** e **Implementar**. La URL no cambia.

## Seguridad

Cualquier persona con la URL **y** el PIN puede ver y editar los contactos.
Para quitarle el acceso a alguien, cambia el PIN con `configurarPin` y comparte el nuevo PIN con el resto del equipo.
