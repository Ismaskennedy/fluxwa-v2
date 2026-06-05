# ⚡ WA Sender Pro

Plataforma de envíos masivos de WhatsApp con gestión de conversaciones (inbox), reportería y multi-línea.

## 🗂️ Estructura del proyecto

```
whatsapp-sender/
├── backend/
│   ├── server.js              # Servidor principal Express + Socket.io
│   ├── models/index.js        # Modelos MongoDB (Usuario, Línea, Plantilla, Contacto, Campaña, Mensaje, Inbox)
│   ├── middleware/auth.js     # JWT middleware
│   ├── routes/
│   │   ├── auth.js            # Login, registro, usuarios
│   │   ├── lines.js           # Gestión de líneas WhatsApp
│   │   ├── templates.js       # Plantillas de mensajes
│   │   ├── contacts.js        # Contactos + subida CSV
│   │   ├── campaigns.js       # Campañas de envío masivo
│   │   ├── messages.js        # Mensajes enviados + reportes
│   │   ├── inbox.js           # Conversaciones entrantes
│   │   └── dashboard.js       # Estadísticas generales
│   └── services/
│       └── whatsapp.js        # Integración OpenWA
├── frontend/
│   ├── index.html             # SPA principal
│   └── assets/js/app.js      # Toda la lógica del frontend
├── .env                       # Variables de entorno
└── package.json
```

---

## ✅ Requisitos previos

- **Node.js** v16 o superior
- **MongoDB** v5+ (local o Atlas)
- **Google Chrome** instalado (OpenWA lo usa para conectar WhatsApp Web)

---

## 🚀 Instalación

### 1. Instalar dependencias

```bash
cd whatsapp-sender
npm install
```

### 2. Configurar variables de entorno

Edita el archivo `.env`:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/whatsapp_sender
JWT_SECRET=pon_aqui_tu_secreto_seguro
```

Si usas **MongoDB Atlas**, reemplaza `MONGO_URI` con tu string de conexión:
```
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/whatsapp_sender
```

### 3. Iniciar la aplicación

```bash
npm start
# o en modo desarrollo:
npm run dev
```

Abre tu navegador en: **http://localhost:3000**

---

## 👤 Primer inicio de sesión

1. Ve a http://localhost:3000
2. Haz clic en **"Crear cuenta"**
3. El **primer usuario registrado** automáticamente se convierte en **Administrador**
4. Los siguientes usuarios serán Agentes por defecto

---

## 📱 Conectar una línea de WhatsApp

1. Ve al menú **Líneas** en el sidebar
2. Clic en **"+ Nueva línea"** → escribe un nombre → **Crear**
3. Clic en **"Conectar"** en la línea creada
4. Espera unos segundos — aparecerá un **código QR**
5. Abre WhatsApp en tu teléfono → **Dispositivos vinculados** → **Vincular dispositivo**
6. Escanea el QR
7. La línea cambiará a estado **"Conectada"** ✅

> ⚠️ **Importante**: Cada línea requiere un número de WhatsApp diferente. Si el mismo número ya está abierto en otro navegador/dispositivo, la sesión se cerrará.

---

## 📤 Enviar una campaña masiva

### Paso 1 — Subir contactos CSV
- Ve a **Contactos** → **Subir CSV**
- El CSV debe tener columna `telefono` (o `phone`, `tel`, `celular`)
- Columnas opcionales: `nombre`, `empresa`, `email` + cualquier campo extra que uses en plantillas
- Los números de 10 dígitos se convierten automáticamente a formato internacional (`52XXXXXXXXXX`)

### Paso 2 — Crear plantillas
- Ve a **Plantillas** → **Nueva plantilla**
- Usa variables dinámicas: `{{nombre}}`, `{{empresa}}`, `{{email}}`, o cualquier columna de tu CSV
- Crea varias plantillas para rotar entre envíos y reducir bloqueos

### Paso 3 — Crear y ejecutar campaña
- Ve a **Campañas** → **Nueva campaña**
- Selecciona una o más **plantillas** (se rotarán automáticamente)
- Selecciona una o más **líneas** conectadas (también se rotarán)
- Configura los **delays**: mínimo 3 seg, máximo 8 seg recomendado
- Clic en **Crear campaña** → luego **▶ Iniciar**
- Monitorea el progreso en tiempo real con la barra de avance

---

## 💬 Gestión del Inbox

- Todas las respuestas de clientes aparecen en **Inbox**
- Un agente puede **"Tomar"** una conversación — quedará **bloqueada únicamente para él**
- Otros agentes NO pueden responder conversaciones asignadas a otro
- El agente puede **Liberar** la conversación para que otro la tome
- Una vez resuelta, se puede **Cerrar**
- Tiempo real: los mensajes nuevos aparecen al instante vía Socket.io

---

## 📊 Reportes

- Ve a **Reportes** → selecciona una campaña
- Ver estadísticas: enviados, entregados, leídos, fallidos
- **Exportar CSV** con el detalle completo de cada mensaje

---

## ⚙️ Recomendaciones anti-bloqueo

| Configuración | Valor recomendado |
|---|---|
| Delay mínimo | 5 segundos |
| Delay máximo | 12 segundos |
| Mensajes por línea/día | Máximo 200-300 |
| Plantillas diferentes | Mínimo 3-5 |
| Líneas simultáneas | 2-3 para campañas grandes |
| Números nuevos | Calentar 1-2 semanas antes |

---

## 🗄️ Modelos de base de datos (MongoDB)

| Colección | Descripción |
|---|---|
| `users` | Usuarios (admin/agente) con JWT |
| `lines` | Líneas de WhatsApp y su estado |
| `templates` | Plantillas con variables dinámicas |
| `contacts` | Base de datos de contactos |
| `campaigns` | Campañas con configuración |
| `messages` | Registro de cada mensaje enviado |
| `conversations` | Conversaciones del inbox |
| `inboxmessages` | Mensajes individuales del inbox |

---

## 🔌 API REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Registro |
| GET | `/api/lines` | Listar líneas |
| POST | `/api/lines/:id/connect` | Conectar línea (lanza OpenWA) |
| GET | `/api/templates` | Listar plantillas |
| POST | `/api/contacts/upload-csv` | Subir CSV |
| GET | `/api/campaigns` | Listar campañas |
| POST | `/api/campaigns/:id/start` | Iniciar campaña |
| GET | `/api/messages/campaign/:id` | Reporte de campaña |
| GET | `/api/messages/campaign/:id/export` | Exportar CSV |
| GET | `/api/inbox/conversations` | Listar conversaciones |
| POST | `/api/inbox/conversations/:id/take` | Tomar conversación |
| POST | `/api/inbox/conversations/:id/send` | Enviar mensaje |
| GET | `/api/dashboard` | Estadísticas del dashboard |

---

## 🛠️ Solución de problemas

**Error: Chrome no encontrado**
```bash
# Instalar Chromium
sudo apt-get install -y chromium-browser
# o
brew install --cask chromium
```

**Error de permisos en sesiones**
```bash
mkdir -p sessions && chmod 755 sessions
```

**MongoDB no conecta**
```bash
# Iniciar MongoDB local
sudo systemctl start mongod
# o con Docker:
docker run -d -p 27017:27017 mongo:latest
```

**La línea se desconecta sola**
- WhatsApp cierra sesiones si el teléfono está sin batería o sin internet
- Configura el teléfono para que no cierre sesiones en segundo plano

---

## 📦 Dependencias principales

- `@open-wa/wa-automate` — Conexión con WhatsApp Web
- `express` — Servidor HTTP
- `mongoose` — ODM para MongoDB
- `socket.io` — Tiempo real (QR, progreso, mensajes)
- `multer` + `csv-parser` — Procesamiento de archivos CSV
- `jsonwebtoken` + `bcryptjs` — Autenticación segura
