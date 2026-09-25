EduGo — estado actual

EduGo es un prototipo educativo web publicado en edugo.live.

Aplicación principal: index.html.

Almacenamiento: localStorage (edugoState). No existe actualmente una base de datos ni sincronización entre dispositivos.

Likes: el frontend impide repetir un like por usuario local y protege contra doble clic. Esto no sustituye una restricción backend para un sistema multiusuario real.

Seguridad: localStorage no es autenticación segura ni almacenamiento de secretos. No se deben colocar API keys, tokens o contraseñas reales en el frontend.

Estado: index.html usa stateVersion=2, normalización y migración para conservar datos antiguos sin borrarlos deliberadamente.

IA: no se verificó server/server.js ni una integración real con OpenAI en el árbol actual de la rama mai. index2.html contiene una referencia a /api/edugo-ai, pero GitHub Pages no proporciona ese backend por sí solo.

Compatibilidad: CNAME conserva edugo.live. Los archivos EduGo_actualizado.html y EduGo_actualizado-3.html se conservan como artefactos heredados; no se eliminan automáticamente.

Para una versión multiusuario real se necesita backend, autenticación segura, base de datos, control de likes en servidor y una función backend para IA.

SUPABASE / LIKES — actualización 2026-09-25

La aplicación principal (index.html) ahora usa Supabase Auth para identidad permanente mediante UUID.
Supabase es la fuente de verdad para publicaciones y likes.

Tablas EduGo:
- profiles: id = auth.users.id.
- posts: id UUID, author_id, content, privacy, created_at.
- post_likes: user_id + post_id + created_at, con UNIQUE(user_id, post_id).
- comments: comentarios persistentes para publicaciones nuevas.

El botón de Me gusta llama a la función PostgreSQL toggle_post_like(post_id).
La función serializa operaciones por usuario/publicación con un bloqueo transaccional y devuelve el estado y contador reales.
El frontend bloquea el botón durante la solicitud y vuelve a consultar Supabase después de cada operación.

localStorage ya NO determina si un usuario dio like. Los datos locales antiguos se conservan para compatibilidad y migración; no se borran deliberadamente.

Las cuentas locales antiguas no se migran automáticamente porque no existe una contraseña segura que pueda reutilizarse sin inventar credenciales. El usuario debe crear/iniciar una cuenta Supabase.

Seguridad:
- RLS habilitado.
- INSERT/DELETE de post_likes limitado a auth.uid().
- UNIQUE(user_id, post_id) como garantía de base de datos.
- No se usa service_role/secret key en frontend.
- La función de toggle es SECURITY INVOKER.

Migración SQL:
supabase/migrations/20260925_edugo_persistent_likes.sql

Pruebas verificadas:
- toggle 1: liked=true, count=1.
- toggle 2: liked=false, count=0.
- dos llamadas concurrentes al mismo usuario/publicación: se serializaron; una activó y otra desactivó, sin duplicados.
- datos de prueba eliminados.

No se verificó todavía el flujo visual completo desde un navegador real de edugo.live.
