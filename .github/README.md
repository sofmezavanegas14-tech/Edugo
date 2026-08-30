# EduGo con IA

EduGo es una plataforma educativa web con un asistente de IA integrado.

## Estructura

- `index.html`: aplicación EduGo y chat del asistente.
- `server/server.js`: servidor Express que conecta el chat con la API de OpenAI.
- `package.json`: dependencias y comando de inicio.
- `.env.example`: plantilla de variables de entorno.
- `.gitignore`: evita publicar secretos y dependencias.

## Ejecutar localmente

1. Instala Node.js 18 o superior.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env`.
4. Coloca tu clave en `OPENAI_API_KEY`.
5. Ejecuta `npm start`.
6. Abre `http://localhost:3000`.

## Seguridad

No subas `.env` a GitHub. La clave de OpenAI debe existir solamente como variable de entorno del servidor o del servicio donde despliegues EduGo.

## Modelo

El valor predeterminado es `gpt-5.6-luna`. Puedes cambiarlo con `OPENAI_MODEL` sin modificar el código.
