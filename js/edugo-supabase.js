/* EduGo Supabase integration: Auth + persistent posts/likes/comments. */
(() => {
  const SUPABASE_URL = "https://ajrgcnclpziovihjsjym.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_M3B27WhOsIADiOXGJqsk-w_VRO8Vnay";
  if (!window.supabase?.createClient) {
    const el = document.getElementById("authMsg");
    if (el) el.textContent = "El servicio de autenticación no terminó de cargar. Recarga la página.";
    return;
  }
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  window.edugoSupabase = db;

  const loginButton = document.getElementById("loginButton");
  if (loginButton) {
    loginButton.disabled = false;
    loginButton.textContent = "Continuar";
    loginButton.setAttribute("aria-busy", "false");
  }

  let currentUser = null;
  let likeBusy = new Set();

  function msg(text) {
    const el = document.getElementById("authMsg");
    if (el) el.textContent = text;
  }

  async function applySession(user) {
    currentUser = user || null;
    if (!currentUser) {
      document.getElementById("loginScreen")?.classList.remove("hidden");
      document.getElementById("app")?.classList.add("hidden");
      return;
    }

    const displayName =
      (currentUser.user_metadata?.display_name || currentUser.user_metadata?.name || "Usuario")
        .trim().slice(0, 80) || "Usuario";

    const { data: profile, error: profileError } = await db.from("profiles")
      .select("id,nombre,avatar_url,rol")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      document.getElementById("loginScreen")?.classList.remove("hidden");
      document.getElementById("app")?.classList.add("hidden");
      const retry = document.getElementById("retryProfileButton");
      if (retry) retry.classList.remove("hidden");
      msg("Tu identidad está autenticada, pero falta el perfil vinculado. Tu sesión se conserva; reintenta o solicita revisión de tu cuenta.");
      return;
    }

    const roleAliases = {
      usuario: "usuario", user: "usuario", general: "usuario",
      estudiante: "estudiante", student: "estudiante",
      profesor: "profesor", profesor: "profesor", teacher: "profesor",
      coordinador: "coordinador", coordinator: "coordinador"
    };
    const rawRole = String(profile.rol || "").trim().toLocaleLowerCase("es");
    const role = roleAliases[rawRole];
    if (!role) {
      document.getElementById("loginScreen")?.classList.remove("hidden");
      document.getElementById("app")?.classList.add("hidden");
      const retry = document.getElementById("retryProfileButton");
      if (retry) retry.classList.remove("hidden");
      msg("Tu perfil no tiene un rol válido. Se conserva tu sesión, pero no se concede acceso hasta corregir el perfil.");
      return;
    }

    const profileName = (profile.nombre || displayName).trim().slice(0, 80) || "Usuario";
    state.user = { name: profileName, role, authUserId: currentUser.id };
    save();
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("app")?.classList.remove("hidden");
    document.getElementById("userLabel").textContent = profileName + " · " + role;
    document.getElementById("userAvatar").textContent = profileName[0]?.toUpperCase() || "E";
    const retry = document.getElementById("retryProfileButton");
    if (retry) retry.classList.add("hidden");
    showPage(state.page || "home");
  }

  function setAuthBusy(busy, message) {
    for (const id of ["loginButton", "registerButton"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = busy;
    }
    const loginBtn = document.getElementById("loginButton");
    if (loginBtn) {
      loginBtn.textContent = busy ? message : "Iniciar sesión";
      loginBtn.setAttribute("aria-busy", String(busy));
    }
  }

  function authInputs(requireName) {
    const name = document.getElementById("loginName")?.value.trim().slice(0, 80) || "";
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase() || "";
    const password = document.getElementById("loginPassword")?.value || "";
    if (requireName && !name) throw new Error("Escribe tu nombre para crear la cuenta.");
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error("Escribe un correo electrónico válido.");
    if (password.length < 8 || password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
    return { name, email, password };
  }

  async function login() {
    let credentials;
    try { credentials = authInputs(false); }
    catch (error) { msg(error.message); return; }

    setAuthBusy(true, "Iniciando sesión…");
    msg("Verificando tus credenciales…");
    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });
      if (error) throw error;
      if (!data?.user || !data?.session) throw new Error("No se recibió una sesión válida.");
      currentUser = data.user;
      await applySession(currentUser);
    } catch (error) {
      console.error("EduGo login:", error);
      msg(error?.message || "No se pudo iniciar sesión. Comprueba el correo y la contraseña.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function register() {
    let credentials;
    try { credentials = authInputs(true); }
    catch (error) { msg(error.message); return; }

    setAuthBusy(true, "Creando cuenta…");
    msg("Creando tu cuenta de forma segura…");
    try {
      const { data, error } = await db.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: { data: { display_name: credentials.name, nombre: credentials.name } }
      });
      if (error) throw error;
      if (data?.session && data?.user) {
        currentUser = data.user;
        await applySession(currentUser);
      } else {
        msg("Cuenta creada. Revisa tu correo para confirmar la dirección y luego inicia sesión.");
      }
    } catch (error) {
      console.error("EduGo register:", error);
      msg(error?.message || "No se pudo crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function retryProfile() {
    try {
      const { data: { user }, error } = await db.auth.getUser();
      if (error) throw error;
      if (!user) {
        msg("Tu sesión terminó. Inicia sesión nuevamente.");
        return;
      }
      await applySession(user);
    } catch (error) {
      console.error("EduGo profile retry:", error);
      msg("No se pudo recuperar el perfil. Inténtalo de nuevo más tarde.");
    }
  }

  async function logout() {
    const { error } = await db.auth.signOut();
    if (error) {
      console.error(error);
      return alert("No se pudo cerrar sesión. Inténtalo nuevamente.");
    }
    currentUser = null;
    state.user = null;
    save();
    location.reload();
  }

  async function loadForumData() {
    const { data: posts, error: pe } = await db
      .from("posts")
      .select("id,user_id,content,privacy,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (pe) throw pe;
    const ids = (posts || []).map(p => p.id);
    if (!ids.length) return [];

    const authorIds = [...new Set((posts || []).map(p => p.user_id).filter(Boolean))];
    const [{ data: likes, error: le }, { data: comments, error: ce }, { data: profiles, error: pre }] = await Promise.all([
      db.from("post_likes").select("post_id,user_id").in("post_id", ids),
      db.from("comments").select("id,post_id,user_id,content,created_at").in("post_id", ids).order("created_at", { ascending: true }),
      authorIds.length ? db.from("profiles").select("id,nombre,avatar_url").in("id", authorIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (le) throw le;
    if (ce) throw ce;
    if (pre) throw pre;

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const myId = currentUser.id;
    const counts = new Map();
    const mine = new Set();
    for (const l of likes || []) {
      counts.set(l.post_id, (counts.get(l.post_id) || 0) + 1);
      if (l.user_id === myId) mine.add(l.post_id);
    }

    const grouped = new Map();
    for (const c of comments || []) {
      if (!grouped.has(c.post_id)) grouped.set(c.post_id, []);
      grouped.get(c.post_id).push(c);
    }

    return (posts || []).map(p => ({
      ...p,
      authorName: profileMap.get(p.user_id)?.nombre || "Usuario",
      likeCount: counts.get(p.id) || 0,
      likedByMe: mine.has(p.id),
      comments: (grouped.get(p.id) || []).map(c => ({
        ...c,
        authorName: profileMap.get(c.user_id)?.nombre || "Usuario"
      }))
    }));
  }

  window.renderPosts = async function renderPosts() {
    const el = document.getElementById("posts");
    if (!el || !currentUser) return;
    el.innerHTML = '<div class="empty">Cargando publicaciones…</div>';

    try {
      const rows = await loadForumData();
      el.innerHTML = rows.length ? rows.map(p => {
        const name = String(p.authorName || "Usuario");
        const safeName = esc(name);
        const commentHtml = (p.comments || []).map(c => {
          const cn = c.authorName || "Usuario";
          return '<div class="comment"><b>' + esc(cn) + '</b><br>' + esc(c.content) +
            (c.user_id === currentUser.id ? '<div class="row" style="margin-top:6px"><button class="action" data-comment-id="' + c.id + '" onclick="editComment(this.dataset.commentId)">✏️ Editar</button><button class="action" data-comment-id="' + c.id + '" onclick="deleteComment(this.dataset.commentId)">🗑️ Eliminar</button></div>' : '') +
            '</div>';
        }).join("");
        const likeText = p.likedByMe ? "❤️ Te gusta" : "♡ Me gusta";
        return '<article class="card post" data-post-id="' + p.id + '">' +
          '<div class="post-head"><div class="avatar">' + esc(name[0] || "U") + '</div><div><div class="post-name">' + safeName +
          ' <span class="badge">Comunidad</span> <span class="badge ' + (p.privacy === "private" ? "private" : "public") + '">' +
          (p.privacy === "private" ? "🔒 Privada" : "🌐 Pública") + '</span></div><div class="post-meta">' +
          new Date(p.created_at).toLocaleString("es-CO") + '</div></div></div>' +
          '<div class="post-body">' + esc(p.content) + '</div>' +
          '<div class="actions"><button class="action like-button" aria-pressed="' + (p.likedByMe ? "true" : "false") +
          '" onclick="likePost(\'' + p.id + '\',this)">' + likeText + ' · ' + p.likeCount + '</button>' +
          '<button class="action" onclick="toggleComments(\'' + p.id + '\')">💬 ' + (p.comments || []).length + '</button>' +
          '<button class="action" data-name="' + safeName + '" onclick="sendTo(this.dataset.name)">✉️ Mensaje</button>' +
          (p.user_id === currentUser.id ? '<button class="action" data-post-id="' + p.id + '" onclick="editPost(this.dataset.postId)">✏️ Editar</button><button class="action" data-post-id="' + p.id + '" onclick="deletePost(this.dataset.postId)">🗑️ Eliminar</button>' : '') +
          '</div>' +
          '<div id="comments-' + p.id + '" class="hidden"><div style="margin-top:10px">' + commentHtml + '</div>' +
          '<div class="row" style="margin-top:10px"><input id="comment-' + p.id + '" maxlength="' + MAX.comment +
          '" class="input" placeholder="Escribe un comentario"><button class="btn" onclick="commentPost(\'' + p.id + '\')">Comentar</button></div></div></article>';
      }).join("") : '<div class="empty">No hay publicaciones todavía.</div>';
    } catch (error) {
      console.error("EduGo forum load:", error);
      el.innerHTML = '<div class="empty">No se pudieron cargar las publicaciones. Inténtalo nuevamente.</div>';
    }
  };

  window.addPost = async function addPost() {
    const input = document.getElementById("postText");
    const text = cleanText(input?.value, "", MAX.post);
    const privacy = document.getElementById("postPrivacy")?.value === "private" ? "private" : "public";
    if (!text) return alert("Escribe algo antes de publicar.");
    if (!currentUser) return alert("Debes iniciar sesión con una cuenta segura.");

    const button = document.querySelector('#postText + .row .btn');
    if (button) button.disabled = true;
    try {
      const { error } = await db.from("posts").insert({
        content: text,
        privacy
      });
      if (error) throw error;
      showPage("forum");
    } catch (error) {
      console.error("EduGo add post:", error);
      alert("No se pudo publicar. Inténtalo nuevamente.");
    } finally {
      if (button) button.disabled = false;
    }
  };

  window.likePost = async function likePost(postId, button) {
    if (!currentUser || likeBusy.has(postId)) return;
    likeBusy.add(postId);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    try {
      const { data, error } = await db.rpc("toggle_post_like", { p_post_id: postId });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error("Respuesta inválida del servidor.");

      if (button) {
        button.textContent = (result.liked ? "❤️ Te gusta" : "♡ Me gusta") + " · " + Number(result.like_count || 0);
        button.setAttribute("aria-pressed", result.liked ? "true" : "false");
      }
    } catch (error) {
      console.error("EduGo like:", error);
      alert(error?.message === "AUTH_REQUIRED" ? "Tu sesión expiró. Inicia sesión nuevamente." : "No se pudo actualizar el Me gusta. Inténtalo nuevamente.");
    } finally {
      likeBusy.delete(postId);
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      // Reconcile with the database after every operation; localStorage never decides the result.
      if (document.getElementById("posts")) await window.renderPosts();
    }
  };

  window.toggleComments = function(id) {
    document.getElementById("comments-" + id)?.classList.toggle("hidden");
  };

  window.editPost = async function(id) {
    if (!currentUser) return;
    const { data: post, error: readError } = await db.from("posts").select("id,content").eq("id", id).maybeSingle();
    if (readError || !post) return alert("No se pudo cargar la publicación.");
    const next = prompt("Edita tu publicación:", post.content);
    if (next === null) return;
    const content = cleanText(next, "", MAX.post);
    if (!content) return alert("La publicación no puede quedar vacía.");
    const { error } = await db.from("posts").update({ content }).eq("id", id);
    if (error) return alert("No se pudo editar la publicación.");
    await window.renderPosts();
  };

  window.deletePost = async function(id) {
    if (!currentUser || !confirm("¿Eliminar tu publicación?")) return;
    const { error } = await db.from("posts").delete().eq("id", id);
    if (error) return alert("No se pudo eliminar la publicación.");
    await window.renderPosts();
  };

  window.editComment = async function(id) {
    if (!currentUser) return;
    const { data: comment, error: readError } = await db.from("comments").select("id,content").eq("id", id).maybeSingle();
    if (readError || !comment) return alert("No se pudo cargar el comentario.");
    const next = prompt("Edita tu comentario:", comment.content);
    if (next === null) return;
    const content = cleanText(next, "", MAX.comment);
    if (!content) return alert("El comentario no puede quedar vacío.");
    const { error } = await db.from("comments").update({ content }).eq("id", id);
    if (error) return alert("No se pudo editar el comentario.");
    await window.renderPosts();
  };

  window.deleteComment = async function(id) {
    if (!currentUser || !confirm("¿Eliminar tu comentario?")) return;
    const { error } = await db.from("comments").delete().eq("id", id);
    if (error) return alert("No se pudo eliminar el comentario.");
    await window.renderPosts();
  };

  window.commentPost = async function(id) {
    const input = document.getElementById("comment-" + id);
    const content = cleanText(input?.value, "", MAX.comment);
    if (!content || !currentUser) return;
    const { error } = await db.from("comments").insert({ post_id: id, content });
    if (error) {
      console.error(error);
      return alert("No se pudo publicar el comentario.");
    }
    await window.renderPosts();
    setTimeout(() => document.getElementById("comments-" + id)?.classList.remove("hidden"), 0);
  };

  window.login = login;
  window.register = register;
  window.retryProfile = retryProfile;
  window.logout = logout;

  // localStorage is not a data source for authentication, posts, comments, or likes.
  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      document.getElementById("loginScreen")?.classList.remove("hidden");
      document.getElementById("app")?.classList.add("hidden");
    } else if (session?.user) {
      setTimeout(() => applySession(session.user), 0);
    }
  });

  (async () => {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) {
      console.error("EduGo session:", error);
      msg(error.message || "No se pudo restaurar la sesión.");
      await applySession(null);
      return;
    }
    try {
      await applySession(session?.user || null);
    } catch (error) {
      console.error("EduGo session/profile:", error);
      msg(error?.message || "No se pudo cargar tu perfil.");
      // Keep the authenticated session so a transient profile/RLS failure can be retried.
    }
  })();
})();
