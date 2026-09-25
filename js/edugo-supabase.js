/* EduGo Supabase integration: Auth + persistent posts/likes/comments. */
(() => {
  const SUPABASE_URL = "https://xdszveoxdrdnwwzzvkav.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xwUE0aN1g0rb7aOLyXPAsA_kOAX9bOA";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.edugoSupabase = db;

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
      (currentUser.user_metadata?.display_name || currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "Estudiante")
        .trim().slice(0, 80) || "Estudiante";

    state.user = { name: displayName, role: "Estudiante", authUserId: currentUser.id };
    save();
    await ensureProfile(displayName);
    await migrateOwnLegacyPosts();
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("app")?.classList.remove("hidden");
    document.getElementById("userLabel").textContent = displayName + " · Cuenta segura";
    document.getElementById("userAvatar").textContent = displayName[0]?.toUpperCase() || "E";
    showPage(state.page || "home");
  }

  async function ensureProfile(displayName) {
    const baseUsername = (currentUser.email || "usuario").split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 48) || "usuario";
    const username = baseUsername + "-" + currentUser.id.replace(/-/g, "").slice(0, 8);
    const { error } = await db.from("profiles").upsert({
      id: currentUser.id,
      username,
      display_name: displayName
    }, { onConflict: "id" });
    if (error) console.warn("EduGo profile:", error.message);
  }

  async function register() {
    const name = document.getElementById("loginName")?.value.trim().slice(0, 80);
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("loginPassword")?.value || "";
    if (!name || !email || !password) return msg("Completa nombre, correo y contraseña.");
    if (password.length < 8) return msg("La contraseña debe tener al menos 8 caracteres.");

    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { display_name: name } }
    });
    if (error) return msg(error.message || "No se pudo crear la cuenta.");
    if (!data.session) {
      msg("Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      return;
    }
    await applySession(data.user);
  }

  async function login() {
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("loginPassword")?.value || "";
    if (!email || !password) return msg("Introduce correo y contraseña.");

    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return msg("Correo o contraseña incorrectos.");
    await applySession(data.user);
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

  async function migrateOwnLegacyPosts() {
    if (!currentUser || !Array.isArray(state.posts)) return;
    const localName = String(state.user?.name || "").trim().toLowerCase();
    const mine = state.posts.filter(p => String(p?.name || "").trim().toLowerCase() === localName && p?.text);
    if (!mine.length) return;

    for (const p of mine) {
      const legacyId = "local:" + localName + ":" + String(p.id);
      const payload = {
        legacy_id: legacyId,
        author_id: currentUser.id,
        content: String(p.text).slice(0, 3000),
        privacy: p.privacy === "private" ? "private" : "public"
      };
      const { data: post, error } = await db.from("posts").upsert(payload, { onConflict: "legacy_id" }).select("id").single();
      if (error || !post) {
        console.warn("EduGo legacy post migration:", error?.message || "unknown error");
        continue;
      }

      const comments = Array.isArray(p.comments) ? p.comments : [];
      for (const c of comments) {
        if (String(c?.name || "").trim().toLowerCase() !== localName || !c?.text) continue;
        const { error: ce } = await db.from("comments").insert({
          post_id: post.id,
          author_id: currentUser.id,
          content: String(c.text).slice(0, 1000)
        });
        if (ce && !/duplicate/i.test(ce.message || "")) console.warn("EduGo legacy comment:", ce.message);
      }
    }
  }

  async function loadForumData() {
    const { data: posts, error: pe } = await db
      .from("posts")
      .select("id,author_id,content,privacy,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (pe) throw pe;
    const ids = (posts || []).map(p => p.id);
    if (!ids.length) return [];

    const authorIds = [...new Set((posts || []).map(p => p.author_id).filter(Boolean))];
    const [{ data: likes, error: le }, { data: comments, error: ce }, { data: profiles, error: pre }] = await Promise.all([
      db.from("post_likes").select("post_id,user_id").in("post_id", ids),
      db.from("comments").select("id,post_id,author_id,content,created_at").in("post_id", ids).order("created_at", { ascending: true }),
      authorIds.length ? db.from("profiles").select("id,display_name,username").in("id", authorIds) : Promise.resolve({ data: [], error: null })
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
      authorName: profileMap.get(p.author_id)?.display_name || profileMap.get(p.author_id)?.username || "Usuario",
      likeCount: counts.get(p.id) || 0,
      likedByMe: mine.has(p.id),
      comments: (grouped.get(p.id) || []).map(c => ({
        ...c,
        authorName: profileMap.get(c.author_id)?.display_name || profileMap.get(c.author_id)?.username || "Usuario"
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
          return '<div class="comment"><b>' + esc(cn) + '</b><br>' + esc(c.content) + '</div>';
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
          '<button class="action" data-name="' + safeName + '" onclick="sendTo(this.dataset.name)">✉️ Mensaje</button></div>' +
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
        author_id: currentUser.id,
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

  window.commentPost = async function(id) {
    const input = document.getElementById("comment-" + id);
    const content = cleanText(input?.value, "", MAX.comment);
    if (!content || !currentUser) return;
    const { error } = await db.from("comments").insert({ post_id: id, author_id: currentUser.id, content });
    if (error) {
      console.error(error);
      return alert("No se pudo publicar el comentario.");
    }
    await window.renderPosts();
    setTimeout(() => document.getElementById("comments-" + id)?.classList.remove("hidden"), 0);
  };

  window.login = login;
  window.register = register;
  window.logout = logout;

  // The local state is retained for tasks/events/messages and for rollback/migration,
  // but it is not consulted for authentication or likes.
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
    const { data: { user } } = await db.auth.getUser();
    await applySession(user);
  })();
})();
