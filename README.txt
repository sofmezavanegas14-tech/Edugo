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