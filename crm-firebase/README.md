# Casa Dorada CRM (Firebase)

CRM de ventas por WhatsApp para Casa Dorada: dice a quién atender hoy, en qué orden y con qué mensaje.

- **Hoy**: lista "Necesita tu intervención", ordenada por la ventana de 24 h de WhatsApp. Cada cliente muestra qué busca, el producto elegido, el paso para cerrar la venta, un mensaje sugerido y "Ya terminó".
- **Conversaciones**: una sola bandeja para WhatsApp, Instagram, Messenger, Telegram y el chat web, con plantillas aprobadas cuando la ventana está cerrada y notas internas.
- **Automatizaciones**: reglas de tipo "cuando pasa X, haz Y": repartir chats por turnos, seguimientos, etiquetas, mensajes por etapa o por palabra clave, y aviso cuando el cliente no responde.
- **Campañas**: mensajes a un segmento, con plantilla de WhatsApp para quienes tienen la ventana cerrada, y resultados de enviados, respondieron y omitidos.
- **Integraciones**: webhooks firmados hacia Zapier, Make, n8n, tu tienda o tu ERP, y una API con clave (`/api/v1/contacts`, `/notes`, `/orders`, `/products`).
- **Varias líneas de WhatsApp**: cada número con nombre y responsable por defecto, y filtro por línea en Conversaciones.
- **Base de conocimiento**: artículos que la asesora virtual usa para responder.
- **Canales**: se conectan desde el CRM; el chat web se pega en cualquier página con una línea (`widget.js`).
- **Embudos**: tableros por etapas, uno por cada tipo de venta, con etapas personalizadas (siempre terminan en Ganado y Perdido).
- **Formularios de captura**: páginas públicas (`f.html?id=…`) o incrustadas en tu web que crean el contacto, lo ponen en el embudo y le asignan responsable.
- **Contactos**: ficha completa, historial e importación de `CasaDorada_CRM.xlsx`.
- **Cotizaciones** (COT-0001…) con precio al detal y al por mayor, que se convierten en **Pedidos** (PED-0001…).
- **Productos**, **Plantillas** de mensajes por situación y **Equipo** con usuario por persona.
- **Asesora virtual** (IA con Claude): responde WhatsApp 24/7, da precios del catálogo, llena la ficha, prepara cotizaciones en borrador, agenda seguimientos y pasa a una persona los cierres, negociaciones y quejas.

La instalación está en [INSTALAR-FIREBASE.md](INSTALAR-FIREBASE.md).

## Estructura

```
public/                 la aplicación (Firebase Hosting)
  index.html, styles.css, app.js
  fb.js                 acceso a Firebase (Auth, Firestore, Functions)
  firebase-config.js    configuración de tu proyecto
functions/index.js      webhook y envío de WhatsApp, alta de usuarios
functions/asesora.js    asesora virtual (Claude): herramientas y reglas de cuándo responde
functions/automatizaciones.js  reglas automáticas y envío de campañas
functions/formularios.js    formularios de captura públicos (API /api/form)
functions/integraciones.js  webhooks salientes y API entrante con clave
functions/canales.js    Telegram, Messenger, Instagram y chat web: entrada, envío y conexión
public/widget.js        burbuja de chat para pegar en la página web de la empresa
firestore.rules         quién puede leer y escribir
```

## Datos (Firestore)

| Colección | Contenido |
|---|---|
| `users/{uid}` | name, email, role (`admin`/`asesor`), active |
| `contacts/{id}` | ficha; el id es `wa_<número>` cuando hay WhatsApp, para que los mensajes lleguen a la misma ficha |
| `contacts/{id}/messages` | mensajes de WhatsApp (`in`/`out`) y notas (`note`) |
| `quotes`, `orders` | cotizaciones y pedidos, numerados con `counters/` |
| `products`, `templates` | catálogo y plantillas |
| `settings/asesora` | asesora virtual: enabled, name, instructions, pauseHours |
| `settings/channels` | estado público de cada canal (conectado, nombre del bot, colores del chat web) |
| `automations` | reglas: trigger {type, stage, days, keywords, channel}, actions [...], runs |
| `campaigns/{id}/recipients` | campaña (filtro, texto, plantilla, conteos) y el resultado por contacto |
| `settings/pipelines` | embudos: list [{id, name, stages}] ("ventas" es el principal) |
| `forms` | formularios: campos, segmento, embudo, etapa, responsable, etiquetas, conteo |
| `knowledge` | base de conocimiento de la asesora: title, content, on |
| `private/integrations` | webhooks (url, eventos, secreto) y hash de la clave de la API |
| `private/channels` | tokens de Telegram y de la página de Meta; solo los leen las funciones |
