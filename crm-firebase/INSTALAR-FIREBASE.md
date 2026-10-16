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
   - Ubicación: **southamerica-east1 (São Paulo)**. No se puede cambiar después.
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
   - **URL de devolución de llamada:** `https://southamerica-east1-TU-PROYECTO.cloudfunctions.net/whatsappWebhook`
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
- La configuración de `firebase-config.js` no es secreta. Los tokens de WhatsApp sí lo son y viven solo en los secretos de Firebase, nunca en el código.
- Para quitarle el acceso a alguien: **Equipo** › su nombre › **Acceso: Sin acceso**.
