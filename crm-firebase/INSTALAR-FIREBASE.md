# Instalar el CRM Casa Dorada en Firebase

La instalación tiene dos fases. La **fase 1** deja el CRM funcionando hoy, gratis, con todo menos WhatsApp dentro del CRM. La **fase 2** conecta WhatsApp y depende de Meta, que puede tardar días en verificar tu empresa.

| | Fase 1 | Fase 2 |
|---|---|---|
| Hoy, Embudo, Contactos, Cotizaciones, Pedidos, Productos, Plantillas | ✅ | ✅ |
| Usuario y contraseña por trabajador | ✅ (los creas en la consola) | ✅ (desde el CRM) |
| Mensajes de WhatsApp dentro del CRM | Abre tu WhatsApp con el mensaje listo | ✅ Llegan y se envían desde el CRM |
| Costo | Gratis | Plan Blaze de Firebase (pago por uso; con tu volumen, centavos o nada) + lo que cobre Meta por mensajes de plantilla |

---

## Fase 1 · El CRM funcionando (unos 20 minutos)

### 1. Crear el proyecto
1. Entra a **console.firebase.google.com** con tu cuenta de Google y pulsa **Crear un proyecto**. Llámalo, por ejemplo, `crm-casa-dorada`. Puedes desactivar Google Analytics.
2. En el menú, abre **Compilación › Firestore Database › Crear base de datos**:
   - Modo: **producción**.
   - Ubicación: **us-east1 (South Carolina)**. No se puede cambiar después.
3. Abre **Compilación › Authentication › Comenzar** y activa **Correo electrónico/contraseña**.

### 2. Crear tu usuario de administradora
1. En **Authentication › Users**, pulsa **Agregar usuario**, escribe tu correo y una contraseña, y luego copia el **UID** que aparece.
2. En **Firestore Database**, pulsa **Iniciar colección** con el ID `users`.
3. En **ID del documento** pega tu UID y agrega estos campos:
   - `name` (string): tu nombre
   - `email` (string): tu correo
   - `role` (string): `admin`
   - `active` (boolean): `true`

### 3. Registrar la app web
1. Ve a **Configuración del proyecto (engranaje) › Tus apps** y pulsa el ícono **`</>`**. Ponle un nombre y marca **"Configurar Firebase Hosting"**.
2. Copia el bloque `firebaseConfig` que aparece.

### 4. Publicar desde Cloud Shell (sin instalar nada)
1. Abre **shell.cloud.google.com** con la misma cuenta de Google.
2. Pega estos comandos, uno por uno:
   ```bash
   git clone https://github.com/cartagenakarendahiana-creator/CRM-CASA-DORADA-.git
   cd CRM-CASA-DORADA-/crm-firebase
   firebase login --no-localhost
   firebase use --add
   ```
   En `firebase use --add` elige tu proyecto y escribe `default` como alias.
   Si todavía no has unido el pull request #1, antes de `firebase login` ejecuta también `git checkout claude/crm-casa-dorada`.
3. Abre el archivo de configuración:
   ```bash
   nano public/firebase-config.js
   ```
   Reemplaza el bloque `firebaseConfig` por el tuyo y guarda con **Ctrl+O**, **Enter** y **Ctrl+X**.
4. Publica:
   ```bash
   firebase deploy --only hosting,firestore
   ```
5. Al terminar aparece la dirección del CRM, por ejemplo **https://crm-casa-dorada.web.app**. Ese es tu enlace.

### 5. Primeros pasos dentro del CRM
1. Entra con tu correo y contraseña.
2. Ve a **Importar Excel** y carga tu `CasaDorada_CRM.xlsx` (en Drive: Archivo › Descargar › Microsoft Excel).
3. En **Productos**, agrega tu catálogo con precio al detal y al por mayor.
4. En **Plantillas**, pulsa **Crear las plantillas de ejemplo** y ajústalas a tu forma de escribir.
5. Para tu equipo: en la fase 1, crea cada usuario como en el paso 2, pero con `role` = `asesor`. En la fase 2 lo harás desde **Equipo › Agregar persona**.

---

## Fase 2 · WhatsApp dentro del CRM

> **Importante, antes de empezar:** un número de WhatsApp solo puede estar conectado a un proveedor de la API a la vez. Si tu número de ventas está conectado a Minsky, pídele a Minsky que lo libere o que lo migre, o usa un número nuevo dedicado al CRM. Un número conectado a la API, en general, deja de funcionar en la app normal de WhatsApp, salvo que Meta te ofrezca la opción de "coexistencia" al registrarlo.

### 6. Activar el plan Blaze
En Firebase, ve a **Configuración › Uso y facturación** y cambia a **Blaze**. Te pide una tarjeta, pero con tu volumen el costo es de centavos o nada. Te recomiendo crear un **presupuesto con alerta** de, por ejemplo, US$5.

### 7. Crear la app de WhatsApp en Meta
1. En **business.facebook.com**, verifica tu empresa: Configuración del negocio › Centro de seguridad. Puede tardar varios días.
2. En **developers.facebook.com**, ve a **Mis apps › Crear app**, elige el tipo **Empresa** y agrega el producto **WhatsApp**.
3. En **WhatsApp › Configuración de la API**, agrega y verifica tu número. Copia el **Identificador del número de teléfono** (Phone number ID).
4. Crea un token permanente:
   1. Ve a **Configuración del negocio › Usuarios del sistema**, crea uno de tipo administrador y asígnale la app y la cuenta de WhatsApp con control total.
   2. Pulsa **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y cópialo.
5. En **Configuración de la app › Básica**, copia la **Clave secreta de la app**.

### 8. Publicar las funciones
1. En Cloud Shell, dentro de `CRM-CASA-DORADA-/crm-firebase`, guarda las claves. Cada comando te pide pegar el valor:
   ```bash
   firebase functions:secrets:set WA_TOKEN          # el token permanente
   firebase functions:secrets:set WA_APP_SECRET     # la clave secreta de la app
   firebase functions:secrets:set WA_VERIFY_TOKEN   # una palabra que inventes, ej. casadorada2026
   ```
2. Guarda el identificador del número (cambia los números de ejemplo por el tuyo):
   ```bash
   echo "WA_PHONE_ID=123456789012345" > functions/.env
   ```
3. Publica las funciones:
   ```bash
   firebase deploy --only functions
   ```

### 9. Conectar el webhook
1. En Meta, ve a **WhatsApp › Configuración › Webhook › Editar** y llena:
   - **URL de devolución de llamada:** `https://us-east1-crm-casa-dorada.cloudfunctions.net/whatsappWebhook`
   - **Token de verificación:** la palabra que inventaste en WA_VERIFY_TOKEN
2. Pulsa **Verificar y guardar** y suscribe el campo **messages**.
3. Pasa la app a modo **Activo** (Live).

### 10. Activar WhatsApp en el CRM
1. En Cloud Shell:
   ```bash
   nano public/firebase-config.js
   ```
   Cambia `WHATSAPP_ENABLED = false` por `true` y guarda.
2. Publica de nuevo:
   ```bash
   firebase deploy --only hosting
   ```

### 11. Plantillas aprobadas
Cuando un cliente lleva más de 24 horas sin escribirte, WhatsApp solo permite mensajes con plantillas aprobadas.
1. Créalas en **WhatsApp Manager › Plantillas** y espera la aprobación.
2. Copia el nombre exacto de cada una en **Plantillas** dentro del CRM, en "Nombre en Meta", junto con sus variables en orden.

---

## Fase 3 · Asesora virtual con IA (opcional)

La asesora virtual responde los mensajes de WhatsApp las 24 horas con Claude, la IA de Anthropic. Necesita la fase 2 funcionando.

**Qué hace sola**
- Responde preguntas de productos, precios, medidas y disponibilidad. Los precios los toma del Catálogo de Productos.
- Llena la ficha con nombre, ciudad, qué busca, temperatura y producto elegido.
- Prepara cotizaciones en **Borrador**. En Hoy aparecen como "Revisa y envía la cotización".
- Agenda seguimientos.

**Qué pasa a una persona**
- Cerrar pedidos y pagos, negociaciones, descuentos, quejas, y todo lo que no sepa.
- Esos chats aparecen de primeros en **Hoy** con el motivo y un resumen. Ella deja de responder en ese chat hasta que pulses **Devolver a la asesora** o **Reactivar**.

**Cuándo se pausa sola**
- Cuando alguien del equipo escribe en un chat, ella se pausa en ese chat durante las horas que configures (12 por defecto).
- También puedes pausarla a mano en cada conversación.

### 12. Crear la clave de la API de Claude
1. Entra a **platform.claude.com**, crea una cuenta para la empresa y agrega un método de pago con créditos. En **Límites**, pon un tope mensual de gasto, por ejemplo US$30.
2. Ve a **API Keys › Create Key** y copia la clave. Empieza con `sk-ant-`.
3. En Cloud Shell, dentro de `CRM-CASA-DORADA-/crm-firebase`:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY   # pega la clave
   firebase deploy --only functions,firestore,hosting
   ```

### 13. Encenderla en el CRM
1. En **Configuración › Asesora virtual**, escribe en "Lo que debe saber del negocio":
   - horarios;
   - envíos y tiempos;
   - formas de pago;
   - medidas;
   - políticas.
2. Marca **Responder automáticamente** y pulsa **Guardar**.
3. Prueba escribiendo desde otro celular al número de WhatsApp de la empresa.

**Costo aproximado:** entre US$0,05 y US$0,15 por cada mensaje que responde. Depende de qué tan larga sea la conversación. 1.000 respuestas al mes cuestan más o menos entre US$50 y US$150.

**Para apagarla:** desmarca **Responder automáticamente** en Configuración › Asesora virtual. Se apaga de inmediato.

---

## Otros canales: chat web, Telegram, Messenger e Instagram

Todos llegan a **Conversaciones** y la asesora virtual responde en todos. Se conectan desde el CRM en **Configuración › Canales**; no hace falta usar Cloud Shell.

Primero, publica una vez las funciones nuevas:
```bash
cd ~/CRM-CASA-DORADA- && git pull
cd crm-firebase && firebase deploy --only functions,firestore,hosting
```

### Chat web (el más rápido)
1. En **Canales › Chat web**, marca **Mostrar el chat en mi página web**, ajusta el título, el saludo y el color, y pulsa **Guardar**.
2. Pulsa **Probar el chat** para verlo funcionando.
3. Copia la línea `<script …>` y pégala en tu página web antes de `</body>`. Si tu página es de Wix, Shopify o WordPress, va en la sección de "código personalizado" o "scripts del pie de página".

### Telegram (5 minutos)
1. En Telegram, abre **@BotFather** y escribe `/newbot`.
2. Ponle el nombre de la empresa y un usuario que termine en `bot`.
3. Copia el token que te da y pégalo en **Canales › Telegram**. Luego pulsa **Conectar**.
4. Comparte el enlace `t.me/tu_bot` con tus clientes.

### Messenger e Instagram
1. Necesitas la misma app de Meta de WhatsApp (fase 2).
2. Agrega los productos **Messenger** e **Instagram**.
3. En cada uno, configura el webhook con la URL de WhatsApp (`…/whatsappWebhook`) y tu palabra de verificación, y suscribe **messages**.
4. Genera un **token de acceso de la página** con los permisos `pages_messaging` e `instagram_manage_messages`. Pégalo en **Canales › Messenger** y pulsa **Conectar**.
5. Para Instagram, la cuenta debe ser profesional y estar vinculada a la página. En la app de Instagram activa **Configuración › Mensajes › Permitir acceso a los mensajes**.

Messenger e Instagram, igual que WhatsApp, solo dejan responder durante las 24 horas siguientes al último mensaje del cliente. Telegram y el chat web no tienen ese límite.

## Automatizaciones y campañas
Funcionan apenas publiques las funciones. Para eso Google activa **Cloud Scheduler**, que revisa cada hora a los clientes que no respondieron.
- **Configuración › Automatizaciones**: elige una idea para empezar o crea tu regla con **Cuando** y **Entonces**. Cada vez que una regla actúa, deja una nota en la conversación.
- **Ventas › Campañas**: elige a quién enviar, escribe el mensaje y, para WhatsApp, elige una plantilla aprobada para quienes llevan más de 24 h sin escribir. Al terminar, verás cuántos se enviaron, cuántos respondieron y cuántos se omitieron.

## Actualizar el CRM más adelante
En Cloud Shell:
```bash
cd CRM-CASA-DORADA-
git pull
cd crm-firebase
firebase deploy
```

## Seguridad
- Solo pueden entrar las personas que tienen usuario **y** están activas en `users`. Las reglas de Firestore (`firestore.rules`) bloquean todo lo demás.
- La configuración de `firebase-config.js` no es secreta. Los tokens de WhatsApp y la clave de Claude sí lo son y viven solo en los secretos de Firebase, nunca en el código.
- Para quitarle el acceso a alguien: **Equipo** › su nombre › **Acceso: Sin acceso**.
