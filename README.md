# CRM Casa Dorada

CRM en un solo archivo (`index.html`) hecho a la medida del libro **CasaDorada_CRM.xlsx**. No necesita servidor ni instalación.

## Hojas incluidas

| Pestaña del Excel | En el CRM |
|---|---|
| Prosp Hoteles | Prospectos Hoteles |
| Hoteles Activos | Hoteles Activos |
| Prosp Dotacion | Prospectos Dotación (con un bloque nuevo: *Seguimiento Casa Dorada*) |
| Prosp Servicio | Prospectos Servicio (Nivel automático según la temperatura) |
| Servicio Activos | Servicio Activos (Nivel y Próx. seguimiento automáticos) |
| Prosp Dist | Prospectos Distribución |
| Dist Activos | Distribuidores Activos (Próx. seguimiento automático) |
| Comercial Team | Equipo Comercial |

Las listas desplegables del Excel (Etapa, Temperatura, Cargo, Responsable, Potencial, Estado, Frecuencia…) son botones de un toque en el formulario.

## Para trabajar en equipo sin cuenta de Claude

Instálalo sobre la hoja de Google siguiendo [INSTALAR-GOOGLE-SHEETS.md](INSTALAR-GOOGLE-SHEETS.md). Los datos se guardan en la hoja y cada trabajador entra con un enlace y un PIN.

## Cómo usarlo (solo en tu navegador)

1. En Google Drive abre la hoja → **Archivo › Descargar › Microsoft Excel (.xlsx)**.
2. Abre `index.html` en el navegador.
3. Pulsa **Importar Excel** y elige el archivo: se cargan todas las pestañas.

## Funciones

- **📅 Seguimientos**: vencidos, para hoy y próximos 7 días, de todas las hojas juntas.
- **Búsqueda instantánea** sin importar tildes ni mayúsculas, con varias palabras a la vez (`medellin gerente`) y por teléfono. Avisa si hay resultados en otras hojas.
- **Filtros** por Nivel, Etapa, Temperatura, Responsable, etc., y orden haciendo clic en una columna.
- **Formulario rápido**: botones para las listas, sugerencias de valores ya usados, fechas rápidas (+3 d, +1 semana, +1 mes) y **✓ Registrar contacto de hoy**.
- **Botón WA** para abrir el chat de WhatsApp (asume +57 si el número tiene 10 dígitos).
- **Aviso de duplicados** por número de WhatsApp.
- **Historial de seguimiento** con fecha y hora en cada registro.
- Filas en rojo o amarillo cuando el último contacto fue hace más de 90 o de 60 días.
- **Exportar Excel** con las mismas pestañas, para volver a subirlo a Drive.
- Copia de seguridad (.json) y restauración.

Atajos: `/` buscar · `N` nuevo · `Ctrl+Enter` guardar.

> Los datos se guardan solo en el navegador de cada equipo; no se suben a ningún servidor. Exporta a Excel o descarga una copia de seguridad con frecuencia.
> Este repositorio es público: no subas aquí el Excel con los contactos (`.gitignore` ya lo evita).
