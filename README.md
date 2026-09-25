# EduGo\n\nEduGo — “Organiza, aprende y avanza.” es un prototipo educativo web para organizar tareas y eventos y ofrecer una comunidad escolar básica.\n\nSitio publicado: edugo.live\n\n## Estado actual

La aplicación principal de GitHub Pages es index.html.
- La autenticación nueva usa Supabase Auth con UUID permanente por usuario.
- Los perfiles de EduGo están en public.profiles.
- Las publicaciones nuevas están en public.posts y tienen UUID permanente.
- Los likes están en public.post_likes y Supabase es la fuente de verdad.
- localStorage conserva tareas/eventos/mensajes y datos heredados para compatibilidad, pero NO decide el estado de un like.
- El toggle de likes se ejecuta en PostgreSQL con una restricción UNIQUE(user_id, post_id) y un bloqueo transaccional por usuario/publicación.
- stateVersion se conserva para no romper el estado local existente.
- Las cuentas locales antiguas no se convierten automáticamente porque no existe una contraseña segura asociada a ellas. Se conservan; para usar autenticación real deben registrarse/iniciar sesión con Supabase Auth.
- No se eliminaron deliberadamente datos de la aplicación existente.

## Funciones actuales\n- Inicio y cierre de sesión local.\n- Inicio con próximas tareas y eventos.\n- Foro con publicaciones públicas/privadas.\n- Likes con protección contra duplicados.\n- Comentarios.\n- Mensajes locales.\n- Tareas con estado completada/pendiente.\n- Calendario de eventos.\n- Zona de estudio.\n- Materias.\n- Diseño responsive para PC y móvil.\n\n## Estructura relevante\n- index.html — aplicación principal desplegada en GitHub Pages.\n- index2.html — prototipo alternativo/legado con otro flujo de cuentas e integración preparada para /api/edugo-ai; no es la aplicación principal actual.\n- EduGo_actualizado.html y EduGo_actualizado-3.html — copias/artefactos heredados conservados para compatibilidad. No se eliminan automáticamente porque pueden ser utilizados por el flujo de APK.\n- CNAME — mantiene el dominio edugo.live.\n- .github/workflows/build-apk.yml — genera un APK bajo demanda con Capacitor.\n- .github/workflows/jekyll-docker.yml — workflow heredado de construcción Jekyll.\n- .github/workflows/build.gradle.kts — archivo Gradle heredado dentro de workflows; no es un workflow de GitHub Actions porque su extensión no es .yml/.yaml.\n\n## Almacenamiento y compatibilidad\nindex.html carga el estado con loadState(), lo normaliza con normalizeState() y lo guarda con save().\n\nLa versión actual del estado es 2. Los datos antiguos sin stateVersion se normalizan automáticamente. La migración no elimina deliberadamente usuarios, publicaciones, comentarios, tareas, eventos ni mensajes.\n\nSi localStorage contiene JSON corrupto o una estructura inesperada, EduGo usa valores seguros para evitar que la aplicación quede inutilizable.\n\n## Likes

El sistema de likes ya no usa likedPosts, el nombre del usuario ni post.likes como autoridad.

Flujo:
1. El usuario inicia sesión con Supabase Auth y obtiene user.id (UUID).
2. Cada publicación nueva recibe posts.id (UUID).
3. Al pulsar Me gusta, el frontend llama a toggle_post_like(post_id).
4. PostgreSQL bloquea la pareja usuario/publicación durante la transacción.
5. Si existe (user_id, post_id), se elimina; si no existe, se inserta.
6. La restricción UNIQUE(user_id, post_id) impide duplicados incluso si llegan solicitudes simultáneas.
7. El contador se calcula desde post_likes y la interfaz se vuelve a reconciliar con Supabase.

localStorage puede contener likedPosts antiguos por compatibilidad, pero el frontend nuevo no lo consulta para decidir si existe un like.

## Seguridad\nEl frontend escapa datos de usuario antes de mostrarlos y limita longitudes de entradas. No se deben colocar API keys, tokens o contraseñas reales en HTML, JavaScript, localStorage ni en este repositorio público.\n\nlocalStorage puede ser modificado por el usuario y no debe utilizarse como almacenamiento de secretos.\n\n## IA\nLa documentación anterior del proyecto hacía referencia a server/server.js y OpenAI, pero esos archivos no forman parte del árbol actual de mai. Por tanto, la aplicación principal no tiene actualmente una integración real con OpenAI verificable en este repositorio.\n\nindex2.html contiene una referencia a /api/edugo-ai, pero GitHub Pages por sí solo no proporciona esa ruta backend. Para una IA real se necesita un servidor o función backend que mantenga la API key fuera del navegador.\n\n## GitHub Pages\nEl repositorio conserva CNAME con edugo.live. Las rutas de la aplicación principal son compatibles con un sitio estático porque no dependen de localhost ni de server/server.js.\n\n## APK\nbuild-apk.yml genera el APK bajo demanda con Capacitor. El flujo debe tomar index.html como fuente principal y usar los archivos heredados solamente como respaldo.\n\nEl APK generado es un artefacto de compilación; no convierte localStorage en una base de datos compartida.\n\n## Desarrollo local\nComo es una aplicación estática, puede abrirse mediante cualquier servidor HTTP estático. No se necesita Node.js para ejecutar la versión principal de index.html.\n\n## Supabase

Proyecto: xdszveoxdrdnwwzzvkav
Tablas nuevas/reutilizadas para EduGo:
- public.profiles — perfil vinculado 1:1 con auth.users.
- public.posts — publicaciones con UUID; author_id es nullable únicamente para permitir migración no destructiva de publicaciones locales antiguas.
- public.post_likes — relación usuario/publicación con UNIQUE(user_id, post_id).
- public.comments — comentarios persistentes para las publicaciones nuevas.

RLS está habilitado en las tablas nuevas. INSERT/DELETE de likes exige que user_id coincida con auth.uid(). No se expone ninguna service_role/secret key al frontend; el navegador usa la publishable key.

La migración SQL versionada está en:
supabase/migrations/20260925_edugo_persistent_likes.sql

## Migración de datos

No se borran los datos locales. Al iniciar sesión con una cuenta Supabase, EduGo intenta migrar de forma idempotente las publicaciones locales cuyo autor coincide con el nombre de la cuenta actual. Usa posts.legacy_id para evitar duplicados. No inventa credenciales ni asigna publicaciones de otros usuarios a la cuenta actual.

## Verificación realizada

- Esquema inspeccionado antes de crear tablas: no existían tablas públicas específicas para posts, likes o comentarios de EduGo.
- Se verificó UNIQUE(user_id, post_id).
- Se verificaron las políticas RLS de profiles, posts, post_likes y comments.
- Se probó el toggle en una transacción: primera llamada => liked=true, 1 like; segunda => liked=false, 0 likes.
- Se probaron dos llamadas concurrentes al mismo usuario/publicación: una terminó en liked=true/1 y la otra en liked=false/0, dejando 0 filas al final, demostrando serialización del toggle.
- Las filas de prueba fueron eliminadas y se comprobó que no quedó ninguna publicación de prueba.
- No se verificó todavía el flujo visual completo en un navegador real de edugo.live desde esta sesión.

## Próxima evolución recomendada
1. Completar la migración de cuentas locales que necesiten autenticación real, mediante registro/inicio de sesión voluntario.
2. Migrar de forma controlada publicaciones históricas de todos los usuarios cuando cada usuario pueda identificarse de forma segura.
3. Persistir también tareas, eventos y mensajes si se desea sincronización multi-dispositivo.
4. Añadir pruebas RLS automatizadas con pgTAP para CI.
