# Casa Dorada CRM (Firebase)

CRM de ventas por WhatsApp para Casa Dorada: dice a quién atender hoy, en qué orden y con qué mensaje.

- **Hoy**: lista "Necesita tu intervención", ordenada por la ventana de 24 h de WhatsApp. Cada cliente muestra qué busca, el producto elegido, el paso para cerrar la venta, un mensaje sugerido y "Ya terminó".
- **Conversaciones**: chats de WhatsApp en tiempo real, con plantillas aprobadas cuando la ventana está cerrada y notas internas.
- **Embudo**: tablero por etapas, en el que se arrastran las tarjetas.
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
