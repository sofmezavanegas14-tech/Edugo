# EduGo\n\nEduGo — “Organiza, aprende y avanza.” es un prototipo educativo web para organizar tareas y eventos y ofrecer una comunidad escolar básica.\n\nSitio publicado: edugo.live\n\n## Estado actual

La aplicación principal de GitHub Pages es index.html.
- La autenticación nueva usa Supabase Auth con UUID permanente por usuario.
- Los perfiles de EduGo están en public.profiles.
- Las publicaciones nuevas están en public.posts y tienen UUID permanente.
- Los likes están en public.post_likes y Supabase es la fuente de verdad.
- localStorage conserva únicamente tareas/eventos/mensajes estrictamente locales; nunca decide autenticación, publicaciones, comentarios ni likes.
- El toggle de likes se ejecuta en PostgreSQL con una restricción UNIQUE(user_id, post_id) y un bloqueo transaccional por usuario/publicación.
- stateVersion se conserva para no romper el estado local existente.
- Las cuentas locales antiguas no se convierten automáticamente porque no existe una contraseña segura asociada a ellas. Se conservan; para usar autenticación real deben registrarse/iniciar sesión con Supabase Auth.
- No se eliminaron deliberadamente datos de la aplicación existente.

## Funciones actuales\n- Inicio y cierre de sesión mediante Supabase Auth.\n- Inicio con próximas tareas y eventos.\n- Foro con publicaciones públicas/privadas.\n- Likes con protección contra duplicados.\n- Comentarios.\n- Mensajes locales.\n- Tareas con estado completada/pendiente.\n- Calendario de eventos.\n- Zona de estudio.\n- Materias.\n- Diseño responsive para PC y móvil.\n\n## Estructura relevante\n- index.html — aplicación principal desplegada en GitHub Pages.\n- index2.html — redirección de compatibilidad hacia la aplicación principal; no contiene un sistema alternativo de autenticación.\n- EduGo_actualizado.html y EduGo_actualizado-3.html — copias/artefactos heredados conservados para compatibilidad. No se eliminan automáticamente porque pueden ser utilizados por el flujo de APK.\n- CNAME — mantiene el dominio edugo.live.\n- .github/workflows/build-apk.yml — genera un APK bajo demanda con Capacitor.\n- .github/workflows/jekyll-docker.yml — workflow heredado de construcción Jekyll.\n- .github/workflows/build.gradle.kts — archivo Gradle heredado dentro de workflows; no es un workflow de GitHub Actions porque su extensión no es .yml/.yaml.\n\n## Almacenamiento y compatibilidad\nindex.html conserva únicamente preferencias/datos estrictamente locales; la sesión y los datos multiusuario provienen de Supabase.\n\nLa versión actual del estado es 2. Los datos antiguos sin stateVersion se normalizan automáticamente. La migración no elimina deliberadamente usuarios, publicaciones, comentarios, tareas, eventos ni mensajes.\n\nSi localStorage contiene JSON corrupto o una estructura inesperada, EduGo usa valores seguros para evitar que la aplicación quede inutilizable.\n\n## Likes

El sistema de likes ya no usa likedPosts, el nombre del usuario ni post.likes como autoridad.

Flujo:
1. El usuario inicia sesión con Supabase Auth y obtiene user.id (UUID).
2. Cada publicación nueva recibe posts.id (UUID).
3. Al pulsar Me gusta, el frontend llama a toggle_post_like(post_id).
4. PostgreSQL bloquea la pareja usuario/publicación durante la transacción.
5. Si existe (user_id, post_id), se elimina; si no existe, se inserta.
6. La restricción UNIQUE(user_id, post_id) impide duplicados incluso si llegan solicitudes simultáneas.
7. El contador se calcula desde post_likes y la interfaz se vuelve a reconciliar con Supabase.

Las referencias heredadas a likedPosts se eliminan del estado cargado y nunca participan en el flujo actual.

## Seguridad\nEl frontend escapa datos de usuario antes de mostrarlos y limita longitudes de entradas. No se deben colocar API keys, tokens o contraseñas reales en HTML, JavaScript, localStorage ni en este repositorio público.\n\nlocalStorage puede ser modificado por el usuario y no debe utilizarse como almacenamiento de secretos.\n\n## IA\nLa documentación anterior del proyecto hacía referencia a server/server.js y OpenAI, pero esos archivos no forman parte del árbol actual de mai. Por tanto, la aplicación principal no tiene actualmente una integración real con OpenAI verificable en este repositorio.\n\nindex2.html contiene una referencia a /api/edugo-ai, pero GitHub Pages por sí solo no proporciona esa ruta backend. Para una IA real se necesita un servidor o función backend que mantenga la API key fuera del navegador.\n\n## GitHub Pages\nEl repositorio conserva CNAME con edugo.live. Las rutas de la aplicación principal son compatibles con un sitio estático porque no dependen de localhost ni de server/server.js.\n\n## APK\nbuild-apk.yml genera el APK bajo demanda con Capacitor. El flujo debe tomar index.html como fuente principal y usar los archivos heredados solamente como respaldo.\n\nEl APK generado es un artefacto de compilación; no convierte localStorage en una base de datos compartida.\n\n## Desarrollo local\nComo es una aplicación estática, puede abrirse mediante cualquier servidor HTTP estático. No se necesita Node.js para ejecutar la versión principal de index.html.\n\n## Supabase

Proyecto: ajrgcnclpziovihjsjym
Tablas nuevas/reutilizadas para EduGo:
- public.profiles — perfil vinculado 1:1 con auth.users.
- public.posts — publicaciones con UUID.
- public.post_likes — relación usuario/publicación con UNIQUE(user_id, post_id).
- public.comments — comentarios persistentes para las publicaciones nuevas.

RLS está habilitado en las tablas nuevas. INSERT/DELETE de likes exige que user_id coincida con auth.uid(). No se expone ninguna service_role/secret key al frontend; el navegador usa la publishable key.

Las migraciones SQL versionadas están en:
supabase/migrations/20260925_edugo_persistent_likes.sql
supabase/migrations/20260925232107_edugo_like_security_hardening.sql

## Migración de datos

No existe migración automática de posts locales a Supabase. Las publicaciones multiusuario se crean y leen exclusivamente en public.posts.

## Verificación realizada

- Esquema inspeccionado antes de crear tablas: no existían tablas públicas específicas para posts, likes o comentarios de EduGo.
- Se verificó la estructura del proyecto correcto antes de modificarla: public.profiles, public.posts, public.post_likes y public.comments ya existían y estaban vacías.
- public.posts fue alineada a UUID para que cada publicación tenga un identificador permanente.
- post_likes tiene unicidad por (user_id, post_id) y RLS exige que user_id sea auth.uid().
- toggle_post_like es SECURITY INVOKER y usa bloqueo transaccional por pareja usuario/publicación.
- No se crearon usuarios, publicaciones, comentarios ni likes de prueba permanentes.
- El flujo visual completo en edugo.live todavía debe validarse en navegador real con una cuenta de Supabase.

## Próxima evolución recomendada
1. Completar la migración de cuentas locales que necesiten autenticación real, mediante registro/inicio de sesión voluntario.
2. Migrar de forma controlada publicaciones históricas de todos los usuarios cuando cada usuario pueda identificarse de forma segura.
3. Persistir también tareas, eventos y mensajes si se desea sincronización multi-dispositivo.
4. Añadir pruebas RLS automatizadas con pgTAP para CI.
